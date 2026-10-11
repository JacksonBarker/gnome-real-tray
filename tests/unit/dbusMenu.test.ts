import {describe, expect, it, vi} from 'vitest';

const {Variant, Cancellable, Menu, Item, Submenu, Separator} = vi.hoisted(() => {
    class Variant {
        constructor(readonly signature: string, readonly value: unknown) {}
        deepUnpack(): unknown { return this.value; }
    }
    class Cancellable {
        cancelled = false;
        cancel(): void { this.cancelled = true; }
        is_cancelled(): boolean { return this.cancelled; }
    }
    class Menu {
        items: Item[] = [];
        actor = {};
        box = {set_child_above_sibling: vi.fn()};
        isOpen = true;
        signals = new Map<number, {name: string; callback: (...args: unknown[]) => void}>();
        connect(name: string, callback: (...args: unknown[]) => void): number {
            const id = this.signals.size + 1;
            this.signals.set(id, {name, callback});
            return id;
        }
        disconnect(id: number): void { this.signals.delete(id); }
        open(open = true): void {
            if (open && this.items.length === 0) return;
            this.isOpen = open;
            for (const signal of this.signals.values())
                if (signal.name === 'open-state-changed') signal.callback(this, open);
        }
        removeAll(): void { for (const item of [...this.items]) item.destroy(); }
        addMenuItem(item: Item, index = this.items.length): void {
            item.parent = this;
            this.items.splice(index, 0, item);
        }
        moveMenuItem(item: Item, index: number): void {
            this.items.splice(this.items.indexOf(item), 1);
            this.items.splice(index, 0, item);
        }
    }
    class Item {
        label: {text: string};
        sensitive = true;
        ornament = 0;
        parent?: Menu;
        signals = new Map<string, () => void>();
        constructor(text = '') { this.label = {text}; }
        setSensitive(value: boolean): void { this.sensitive = value; }
        setOrnament(value: number): void { this.ornament = value; }
        connect(name: string, callback: () => void): void { this.signals.set(name, callback); }
        destroy(): void {
            if (this.parent) this.parent.items.splice(this.parent.items.indexOf(this), 1);
            this.signals.clear();
        }
    }
    class Submenu extends Item {
        menu = new Menu();
        constructor(text = '') { super(text); this.menu.isOpen = false; }
    }
    class Separator extends Item {}
    return {Variant, Cancellable, Menu, Item, Submenu, Separator};
});
vi.mock('gi://Gio', () => ({default: {Cancellable, DBusCallFlags: {NONE: 0}, DBusSignalFlags: {NONE: 0}}}));
vi.mock('gi://GLib', () => ({default: {Variant}}));
vi.mock('../../src/util/promisify.js', () => ({}));
vi.mock('resource:///org/gnome/shell/ui/popupMenu.js', () => ({
    PopupMenuItem: Item, PopupSubMenuMenuItem: Submenu, PopupSeparatorMenuItem: Separator,
    Ornament: {NONE: 0, DOT: 1, CHECK: 2},
}));

import type Gio from 'gi://Gio';
import type * as Popup from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {DBusMenuClient} from '../../src/protocol/dbusMenu.js';
import {IndicatorMenu} from '../../src/ui/indicatorMenu.js';

function raw(id: number, label: string, properties: Record<string, unknown> = {}, children: unknown[] = []) {
    return [id, Object.fromEntries(Object.entries({label, ...properties}).map(([key, value]) => [key, new Variant('', value)])),
        children.map(child => new Variant('', child))];
}
function setup() {
    let layout = [raw(1, 'Lazy', {'children-display': 'submenu'})];
    const signals = new Map<number, {name: string; callback: () => void}>();
    const calls: Array<[string, unknown]> = [];
    const connection = {
        call: vi.fn((_bus, _path, _interface, method, parameters) => {
            calls.push([method, parameters.deepUnpack()]);
            return Promise.resolve(new Variant('', method === 'GetLayout' ? [1, raw(0, '', {}, layout)] : [false]));
        }),
        signal_subscribe: vi.fn((_bus, _interface, name, _path, _arg, _flags, callback) => {
            const id = signals.size + 1;
            signals.set(id, {name, callback});
            return id;
        }),
        signal_unsubscribe: vi.fn((id: number) => signals.delete(id)),
    };
    const client = new DBusMenuClient(connection as unknown as Gio.DBusConnection, ':1.42', '/Menu');
    const menu = new Menu();
    const session = new IndicatorMenu(menu as unknown as Popup.PopupMenu, client);
    return {client, menu, session, calls, connection,
        layout: (nodes: unknown[]) => { layout = nodes as typeof layout; },
        signal: (name: string) => { for (const signal of signals.values()) if (signal.name === name) signal.callback(); },
    };
}
const settled = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe('live DBusMenu', () => {
    it('prepares the root and recognizes empty lazy submenus, then loads them on opening', async () => {
        const test = setup();
        await settled();
        expect(test.calls.slice(0, 2).map(([method]) => method)).toEqual(['AboutToShow', 'GetLayout']);
        const submenu = test.menu.items[0] as InstanceType<typeof Submenu>;
        expect(submenu).toBeInstanceOf(Submenu);
        expect(submenu.menu.items[0]!.sensitive).toBe(false);
        test.layout([raw(1, 'Lazy', {'children-display': 'submenu'}, [raw(2, 'Action')])]);
        submenu.menu.open();
        await settled();
        expect(test.calls).toContainEqual(['AboutToShow', [1]]);
        expect(test.menu.items[0]).toBe(submenu);
        expect(submenu.menu.items[0]!.label.text).toBe('Action');
        submenu.menu.items[0]!.signals.get('activate')!();
        expect(test.calls).toContainEqual(['Event', [2, 'clicked', expect.any(Variant), 0]]);
        test.session.destroy();
    });

    it('updates properties and layouts while preserving an open submenu and its existing actions', async () => {
        const test = setup();
        test.layout([raw(1, 'Menu', {'children-display': 'submenu'}, [raw(2, 'Action')])]);
        await settled();
        const submenu = test.menu.items[0] as InstanceType<typeof Submenu>;
        submenu.menu.open();
        await settled();
        const action = submenu.menu.items[0]!;
        test.layout([raw(1, 'Renamed', {'children-display': 'submenu'}, [raw(2, 'Checked', {enabled: false, 'toggle-state': 1})])]);
        test.signal('ItemsPropertiesUpdated');
        await settled();
        expect(test.menu.items[0]).toBe(submenu);
        expect(submenu.menu.isOpen).toBe(true);
        expect(submenu.label.text).toBe('Renamed');
        expect(submenu.menu.items[0]).toBe(action);
        expect(action.sensitive).toBe(false);
        expect(action.ornament).toBe(2);
        test.layout([raw(1, 'Renamed', {'children-display': 'submenu'}, [raw(3, 'Replacement')])]);
        test.signal('LayoutUpdated');
        await settled();
        expect(submenu.menu.items.map(item => item.label.text)).toEqual(['Replacement']);
        test.session.destroy();
    });

    it('cancels pending loads and unsubscribes when the menu is discarded', async () => {
        const test = setup();
        test.session.destroy();
        await settled();
        expect(test.client.cancellable.is_cancelled()).toBe(true);
        expect(test.connection.signal_unsubscribe).toHaveBeenCalledTimes(2);
        expect(test.menu.items.map(item => item.label.text)).toEqual(['Loading…']);
    });

    it('refreshes on reopening after updates received while closed', async () => {
        const test = setup();
        await settled();
        test.menu.open(false);
        test.layout([raw(2, 'New action')]);
        test.signal('LayoutUpdated');
        await settled();
        expect(test.menu.items[0]).toBeInstanceOf(Submenu);
        test.menu.open();
        await settled();
        expect(test.menu.items[0]!.label.text).toBe('New action');
        test.session.destroy();
    });
});
