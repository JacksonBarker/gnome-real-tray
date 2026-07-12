import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type {IndicatorStatus, IconSource, StatusNotifierItemModel} from '../model/indicator.js';
import {normalizeIdentity} from '../identity/indicatorIdentity.js';
import {Observable} from '../util/events.js';
import {PROPERTIES_INTERFACE, SNI_INTERFACE} from './interfaces.js';
import '../util/promisify.js';
import {iconNameSource} from '../icons/iconSource.js';

type PropertyMap = Record<string, GLib.Variant>;

function unpackString(properties: PropertyMap, key: string): string | null {
    const value = properties[key]?.deepUnpack();
    return typeof value === 'string' && value ? value : null;
}

function unpackBoolean(properties: PropertyMap, key: string): boolean {
    return properties[key]?.deepUnpack() === true;
}

function status(value: string | null): IndicatorStatus {
    return value === 'Passive' || value === 'NeedsAttention' ? value : 'Active';
}

function namedIcon(properties: PropertyMap, key: string): IconSource | null {
    const name = unpackString(properties, key);
    return iconNameSource(name);
}

function pixmapIcon(properties: PropertyMap, key: string): IconSource | null {
    const unpacked = properties[key]?.deepUnpack();
    if (!Array.isArray(unpacked) || unpacked.length === 0)
        return null;
    const candidates = unpacked.flatMap(value => {
        if (!Array.isArray(value) || value.length !== 3)
            return [];
        const [width, height, bytes] = value as [unknown, unknown, unknown];
        if (typeof width !== 'number' || typeof height !== 'number' || !(bytes instanceof Uint8Array))
            return [];
        if (width <= 0 || height <= 0 || bytes.length !== width * height * 4)
            return [];
        return [{kind: 'pixmap' as const, width, height, bytes}];
    });
    candidates.sort((a, b) => Math.abs(a.width - 32) - Math.abs(b.width - 32));
    return candidates[0] ?? null;
}

function resolvedIcon(properties: PropertyMap, nameKey: string, pixmapKey: string): IconSource | null {
    return namedIcon(properties, nameKey) ?? pixmapIcon(properties, pixmapKey);
}

export class StatusNotifierItemClient {
    readonly changed = new Observable<StatusNotifierItemClient>();
    readonly removed = new Observable<StatusNotifierItemClient>();
    #properties: PropertyMap = {};
    #propertySignal = 0;
    #sniSignal = 0;
    #nameWatch = 0;
    #refreshTimer = 0;
    #refreshing = false;
    #refreshAgain = false;
    #destroyed = false;
    model: StatusNotifierItemModel;

    constructor(
        readonly connection: Gio.DBusConnection,
        readonly busName: string,
        readonly objectPath: string,
        readonly registrationKey: string,
    ) {
        this.model = {
            registrationKey, busName, objectPath,
            identity: {desktopEntry: null, sniId: null}, title: null,
            status: 'Passive', menuPath: null, itemIsMenu: false,
            icon: null, attentionIcon: null, overlayIcon: null,
        };
    }

    async initialize(): Promise<void> {
        this.#subscribe();
        await this.#refreshProperties(false);
    }

    async #refreshProperties(emitChange: boolean): Promise<void> {
        if (this.#refreshing) {
            this.#refreshAgain = true;
            return;
        }
        this.#refreshing = true;
        try {
            const result = await this.connection.call(
                this.busName, this.objectPath, PROPERTIES_INTERFACE, 'GetAll',
                new GLib.Variant('(s)', [SNI_INTERFACE]), new GLib.VariantType('(a{sv})'),
                Gio.DBusCallFlags.NONE, 5000, null,
            );
            const unpacked = result.deepUnpack() as [PropertyMap];
            if (this.#destroyed)
                return;
            this.#properties = unpacked[0];
            this.#updateModel();
            if (emitChange)
                this.changed.emit(this);
        } finally {
            this.#refreshing = false;
            if (this.#refreshAgain && !this.#destroyed) {
                this.#refreshAgain = false;
                this.#scheduleRefresh();
            }
        }
    }

    #subscribe(): void {
        this.#propertySignal = this.connection.signal_subscribe(
            this.busName, PROPERTIES_INTERFACE, 'PropertiesChanged', this.objectPath,
            SNI_INTERFACE, Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _iface, _signal, parameters) => {
                const [iface, changed] = parameters.deepUnpack() as [string, PropertyMap, string[]];
                if (iface !== SNI_INTERFACE)
                    return;
                Object.assign(this.#properties, changed);
                this.#updateModel();
                this.changed.emit(this);
            },
        );
        this.#sniSignal = this.connection.signal_subscribe(
            this.busName, SNI_INTERFACE, null, this.objectPath,
            null, Gio.DBusSignalFlags.NONE,
            () => this.#scheduleRefresh(),
        );
        this.#nameWatch = Gio.bus_watch_name_on_connection(
            this.connection, this.busName, Gio.BusNameWatcherFlags.NONE,
            () => undefined, () => this.removed.emit(this),
        );
    }

    #scheduleRefresh(): void {
        if (this.#destroyed || this.#refreshTimer)
            return;
        // Ayatana implementations can emit NewIcon immediately before replacing
        // their temporary icon file. Debouncing also folds signal bursts into one
        // GetAll call.
        this.#refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 75, () => {
            this.#refreshTimer = 0;
            void this.#refreshProperties(true).catch(error => {
                if (!this.#destroyed)
                    console.warn(`Real Tray: item refresh failed: ${String(error)}`);
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    #updateModel(): void {
        const attention = resolvedIcon(this.#properties, 'AttentionIconName', 'AttentionIconPixmap');
        this.model = {
            ...this.model,
            identity: normalizeIdentity(
                unpackString(this.#properties, 'DesktopEntry'), unpackString(this.#properties, 'Id')),
            title: unpackString(this.#properties, 'Title'),
            status: status(unpackString(this.#properties, 'Status')),
            menuPath: unpackString(this.#properties, 'Menu'),
            itemIsMenu: unpackBoolean(this.#properties, 'ItemIsMenu'),
            icon: resolvedIcon(this.#properties, 'IconName', 'IconPixmap'),
            attentionIcon: attention,
            overlayIcon: resolvedIcon(this.#properties, 'OverlayIconName', 'OverlayIconPixmap'),
        };
    }

    call(method: 'Activate' | 'SecondaryActivate' | 'ContextMenu', x = 0, y = 0): void {
        void this.connection.call(
            this.busName, this.objectPath, SNI_INTERFACE, method,
            new GLib.Variant('(ii)', [x, y]), null, Gio.DBusCallFlags.NONE, 3000, null,
        ).catch(error => console.warn(`Real Tray: ${method} failed: ${String(error)}`));
    }

    scroll(delta: number, orientation: 'horizontal' | 'vertical'): void {
        void this.connection.call(
            this.busName, this.objectPath, SNI_INTERFACE, 'Scroll',
            new GLib.Variant('(is)', [Math.trunc(delta), orientation]), null,
            Gio.DBusCallFlags.NONE, 3000, null,
        ).catch(error => console.warn(`Real Tray: Scroll failed: ${String(error)}`));
    }

    destroy(): void {
        if (this.#destroyed)
            return;
        this.#destroyed = true;
        if (this.#propertySignal)
            this.connection.signal_unsubscribe(this.#propertySignal);
        if (this.#sniSignal)
            this.connection.signal_unsubscribe(this.#sniSignal);
        if (this.#refreshTimer)
            GLib.source_remove(this.#refreshTimer);
        if (this.#nameWatch)
            Gio.bus_unwatch_name(this.#nameWatch);
        this.changed.clear();
        this.removed.clear();
    }
}
