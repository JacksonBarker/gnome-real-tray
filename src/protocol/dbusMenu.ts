import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {decodeDBusMenuLabel, type MenuNode} from '../model/menu.js';
import '../util/promisify.js';
import {Observable} from '../util/events.js';

type RawLayout = [number, Record<string, GLib.Variant>, GLib.Variant[]];

function unpackProperty<T>(properties: Record<string, GLib.Variant>, key: string, fallback: T): T {
    return (properties[key]?.deepUnpack() as T | undefined) ?? fallback;
}

function parseLayout(raw: RawLayout): MenuNode {
    const [id, properties, rawChildren] = raw;
    const toggleState = unpackProperty<number>(properties, 'toggle-state', -1);
    return {
        id,
        label: decodeDBusMenuLabel(unpackProperty(properties, 'label', '')),
        visible: unpackProperty(properties, 'visible', true),
        enabled: unpackProperty(properties, 'enabled', true),
        type: unpackProperty<string>(properties, 'type', '') === 'separator' ? 'separator' : 'standard',
        toggleType: unpackProperty(properties, 'toggle-type', null),
        toggleState: toggleState === 0 || toggleState === 1 ? toggleState : -1,
        iconName: unpackProperty(properties, 'icon-name', null),
        submenu: unpackProperty<string>(properties, 'children-display', '') === 'submenu',
        children: rawChildren.map(child => parseLayout(child.deepUnpack() as RawLayout)),
    };
}

export class DBusMenuClient {
    readonly changed = new Observable<void>();
    readonly cancellable = new Gio.Cancellable();
    #signals: number[] = [];

    constructor(readonly connection: Gio.DBusConnection, readonly busName: string, readonly objectPath: string) {
        for (const signal of ['LayoutUpdated', 'ItemsPropertiesUpdated']) {
            this.#signals.push(connection.signal_subscribe(
                busName, 'com.canonical.dbusmenu', signal, objectPath, null,
                Gio.DBusSignalFlags.NONE, () => this.changed.emit(undefined),
            ));
        }
    }

    async aboutToShow(id: number): Promise<void> {
        await this.connection.call(
            this.busName, this.objectPath, 'com.canonical.dbusmenu', 'AboutToShow',
            new GLib.Variant('(i)', [id]), null, Gio.DBusCallFlags.NONE, 5000, this.cancellable,
        );
    }

    async getLayout(): Promise<MenuNode[]> {
        const parameters = new GLib.Variant('(iias)', [0, -1, []]);
        const result = await this.connection.call(
            this.busName, this.objectPath, 'com.canonical.dbusmenu', 'GetLayout',
            parameters, null, Gio.DBusCallFlags.NONE, 5000, this.cancellable,
        );
        const [, layout] = result.deepUnpack() as [number, RawLayout];
        return parseLayout(layout).children;
    }

    event(id: number, event: 'clicked' | 'hovered' | 'opened' | 'closed'): void {
        const eventData = new GLib.Variant('s', '');
        const parameters = new GLib.Variant('(isvu)', [id, event, eventData, 0]);
        const pending = this.connection.call(
            this.busName, this.objectPath, 'com.canonical.dbusmenu', 'Event',
            parameters, null, Gio.DBusCallFlags.NONE, 3000, this.cancellable,
        );
        void pending.catch(error => {
            if (!this.cancellable.is_cancelled())
                console.warn(`Real Tray: DBusMenu event failed: ${String(error)}`);
        });
    }

    destroy(): void {
        for (const signal of this.#signals)
            this.connection.signal_unsubscribe(signal);
        this.#signals = [];
        this.cancellable.cancel();
        this.changed.clear();
    }
}
