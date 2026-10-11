import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type {IndicatorStatus, IconSource, StatusNotifierItemModel} from '../model/indicator.js';
import {normalizeIdentity} from '../identity/indicatorIdentity.js';
import {Observable} from '../util/events.js';
import {PROPERTIES_INTERFACE, SNI_INTERFACE} from './interfaces.js';
import '../util/promisify.js';
import {usableMenuPath} from '../model/menu.js';
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

function namedIcon(properties: PropertyMap, key: string, iconThemePath: string | null): IconSource | null {
    const name = unpackString(properties, key);
    return iconNameSource(name, iconThemePath);
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

function resolvedIcon(
    properties: PropertyMap,
    nameKey: string,
    pixmapKey: string,
    iconThemePath: string | null,
): IconSource | null {
    return namedIcon(properties, nameKey, iconThemePath) ?? pixmapIcon(properties, pixmapKey);
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
    #failures = 0;
    #loaded = false;
    #activationUnavailable = false;
    readonly #cancellable = new Gio.Cancellable();
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
        await this.refresh();
    }

    async refresh(): Promise<void> {
        if (this.#cancellable.is_cancelled())
            return;
        try {
            await this.#refreshProperties();
        } catch (error) {
            if (this.#cancellable.is_cancelled())
                return;
            console.warn(`Real Tray: item refresh failed: ${String(error)}`);
            if (++this.#failures <= 4)
                this.#scheduleRefresh(250 * 2 ** (this.#failures - 1));
        }
    }

    async #refreshProperties(): Promise<void> {
        if (this.#refreshing) {
            this.#refreshAgain = true;
            return;
        }
        this.#refreshing = true;
        try {
            const parameters = new GLib.Variant('(s)', [SNI_INTERFACE]);
            const replyType = new GLib.VariantType('(a{sv})');
            const result = await this.connection.call(
                this.busName, this.objectPath, PROPERTIES_INTERFACE, 'GetAll',
                parameters, replyType, Gio.DBusCallFlags.NONE, 5000, this.#cancellable,
            );
            const unpacked = result.deepUnpack() as [PropertyMap];
            if (this.#cancellable.is_cancelled())
                return;
            this.#failures = 0;
            this.#loaded = true;
            this.#properties = unpacked[0];
            this.#updateModel();
            this.changed.emit(this);
        } finally {
            this.#refreshing = false;
            if (this.#refreshAgain && !this.#cancellable.is_cancelled()) {
                this.#refreshAgain = false;
                this.#scheduleRefresh();
            }
        }
    }

    #subscribe(): void {
        const onPropertiesChanged = (
            _connection: Gio.DBusConnection, _sender: string | null,
            _path: string, _iface: string, _signal: string, parameters: GLib.Variant,
        ): void => {
            const [iface, changed, invalidated] = parameters.deepUnpack() as [string, PropertyMap, string[]];
            if (iface !== SNI_INTERFACE)
                return;
            Object.assign(this.#properties, changed);
            if (!this.#loaded || invalidated.length > 0) {
                this.#scheduleRefresh();
                return;
            }
            this.#updateModel();
            this.changed.emit(this);
        };
        this.#propertySignal = this.connection.signal_subscribe(
            this.busName, PROPERTIES_INTERFACE, 'PropertiesChanged', this.objectPath,
            SNI_INTERFACE, Gio.DBusSignalFlags.NONE, onPropertiesChanged,
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

    #scheduleRefresh(delay = 75): void {
        if (this.#cancellable.is_cancelled() || this.#refreshTimer)
            return;
        // Ayatana implementations can emit NewIcon immediately before replacing
        // their temporary icon file. Debouncing also folds signal bursts into one
        // GetAll call.
        this.#refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this.#refreshTimer = 0;
            void this.refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    #updateModel(): void {
        const iconThemePath = unpackString(this.#properties, 'IconThemePath');
        const attention = resolvedIcon(
            this.#properties, 'AttentionIconName', 'AttentionIconPixmap', iconThemePath);
        this.model = {
            ...this.model,
            identity: normalizeIdentity(
                unpackString(this.#properties, 'DesktopEntry'), unpackString(this.#properties, 'Id')),
            title: unpackString(this.#properties, 'Title'),
            status: status(unpackString(this.#properties, 'Status')),
            menuPath: usableMenuPath(unpackString(this.#properties, 'Menu')),
            itemIsMenu: unpackBoolean(this.#properties, 'ItemIsMenu'),
            icon: resolvedIcon(this.#properties, 'IconName', 'IconPixmap', iconThemePath),
            attentionIcon: attention,
            overlayIcon: resolvedIcon(
                this.#properties, 'OverlayIconName', 'OverlayIconPixmap', iconThemePath),
        };
    }

    call(method: 'Activate' | 'SecondaryActivate' | 'ContextMenu', x = 0, y = 0, unavailable?: () => void): void {
        if (this.#cancellable.is_cancelled())
            return;
        if (method === 'Activate' && this.#activationUnavailable) {
            unavailable?.();
            return;
        }
        void this.connection.call(
            this.busName, this.objectPath, SNI_INTERFACE, method,
            new GLib.Variant('(ii)', [x, y]), null,
            Gio.DBusCallFlags.NONE, 3000, this.#cancellable,
        ).catch((error: GLib.Error) => {
            if (this.#cancellable.is_cancelled())
                return;
            if (method === 'Activate' && error.matches(Gio.DBusError, Gio.DBusError.UNKNOWN_METHOD)) {
                this.#activationUnavailable = true;
                unavailable?.();
            } else {
                console.warn(`Real Tray: ${method} failed: ${String(error)}`);
            }
        });
    }

    scroll(delta: number, orientation: 'horizontal' | 'vertical'): void {
        const parameters = new GLib.Variant('(is)', [Math.trunc(delta), orientation]);
        void this.connection.call(
            this.busName, this.objectPath, SNI_INTERFACE, 'Scroll',
            parameters, null, Gio.DBusCallFlags.NONE, 3000, this.#cancellable,
        ).catch(error => {
            if (!this.#cancellable.is_cancelled())
                console.warn(`Real Tray: Scroll failed: ${String(error)}`);
        });
    }

    destroy(): void {
        if (this.#refreshTimer)
            GLib.source_remove(this.#refreshTimer);
        this.#refreshTimer = 0;
        this.#cancellable.cancel();
        if (this.#propertySignal)
            this.connection.signal_unsubscribe(this.#propertySignal);
        this.#propertySignal = 0;
        if (this.#sniSignal)
            this.connection.signal_unsubscribe(this.#sniSignal);
        this.#sniSignal = 0;
        if (this.#nameWatch)
            Gio.bus_unwatch_name(this.#nameWatch);
        this.#nameWatch = 0;
        this.changed.clear();
        this.removed.clear();
    }
}
