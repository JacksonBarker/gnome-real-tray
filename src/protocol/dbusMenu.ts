import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type {MenuNode} from '../model/menu.js';
import '../util/promisify.js';

type RawLayout = [number, Record<string, GLib.Variant>, GLib.Variant[]];

function unpackProperty<T>(properties: Record<string, GLib.Variant>, key: string, fallback: T): T {
    return (properties[key]?.deepUnpack() as T | undefined) ?? fallback;
}

function parseLayout(raw: RawLayout): MenuNode {
    const [id, properties, rawChildren] = raw;
    const toggleState = unpackProperty<number>(properties, 'toggle-state', -1);
    return {
        id,
        label: unpackProperty(properties, 'label', ''),
        visible: unpackProperty(properties, 'visible', true),
        enabled: unpackProperty(properties, 'enabled', true),
        type: unpackProperty<string>(properties, 'type', '') === 'separator' ? 'separator' : 'standard',
        toggleType: unpackProperty(properties, 'toggle-type', null),
        toggleState: toggleState === 0 || toggleState === 1 ? toggleState : -1,
        iconName: unpackProperty(properties, 'icon-name', null),
        children: rawChildren.map(child => parseLayout(child.deepUnpack() as RawLayout)),
    };
}

export class DBusMenuClient {
    constructor(readonly connection: Gio.DBusConnection, readonly busName: string, readonly objectPath: string) {}

    async getLayout(): Promise<MenuNode[]> {
        const result = await this.connection.call(
            this.busName, this.objectPath, 'com.canonical.dbusmenu', 'GetLayout',
            new GLib.Variant('(iias)', [0, -1, []]), null,
            Gio.DBusCallFlags.NONE, 5000, null,
        );
        const [, layout] = result.deepUnpack() as [number, RawLayout];
        return parseLayout(layout).children;
    }

    event(id: number, event: 'clicked' | 'hovered' | 'opened' | 'closed'): void {
        void this.connection.call(
            this.busName, this.objectPath, 'com.canonical.dbusmenu', 'Event',
            new GLib.Variant('(isvu)', [id, event, new GLib.Variant('s', ''), 0]),
            null, Gio.DBusCallFlags.NONE, 3000, null,
        ).catch(error => console.warn(`Real Tray: DBusMenu event failed: ${String(error)}`));
    }
}
