import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {IndicatorViewModel} from '../../src/model/indicator.js';

const {settings, registry, panel, panels, trays, Item, Tray} = vi.hoisted(() => {
    class Box {
        children: Container[] = [];
        get_children(): Container[] { return this.children; }
        remove_child(child: Container): void { this.children.splice(this.children.indexOf(child), 1); child.parent = null; }
        insert_child_at_index(child: Container, index: number): void { this.children.splice(index, 0, child); child.parent = this; }
        set_child_at_index(child: Container, index: number): void { this.remove_child(child); this.insert_child_at_index(child, index); }
    }
    class Container {
        parent: Box | null = null;
        get_parent(): Box | null { return this.parent; }
    }
    const panels: Item[] = [];
    const trays: Tray[] = [];
    class Item {
        actor = {container: new Container(), menu: {isOpen: true}};
        update = vi.fn();
        destroy = vi.fn(() => this.actor.container.parent?.remove_child(this.actor.container));
        constructor(readonly view: {registrationKey: string}) { panels.push(this); }
    }
    class Tray {
        actor = {container: new Container(), menu: {isOpen: true}};
        update = vi.fn();
        configure = vi.fn();
        destroy = vi.fn(() => this.actor.container.parent?.remove_child(this.actor.container));
        constructor() { trays.push(this); }
    }
    const values: Record<string, string | number | boolean> = {};
    const settings = {
        values,
        get_string: (key: string) => String(values[key] ?? ''),
        set_string: (key: string, value: string) => { values[key] = value; },
        get_enum: (key: string) => Number(values[key] ?? 0),
        get_uint: (key: string) => Number(values[key] ?? 16),
        get_boolean: (key: string) => Boolean(values[key]),
        connect: vi.fn(() => 1), disconnect: vi.fn(),
    };
    const registry = {
        views: [] as IndicatorViewModel[],
        callback: vi.fn<(snapshot: {views: IndicatorViewModel[]}) => void>(),
        changed: {connect: vi.fn((callback: typeof registry.callback) => { registry.callback = callback; return vi.fn(); })},
        snapshot: () => ({views: registry.views}),
        getClient: vi.fn(() => ({})), destroy: vi.fn(),
    };
    const panel = {
        _leftBox: new Box(), _centerBox: new Box(), _rightBox: new Box(),
        addToStatusArea: vi.fn((_role, actor: Item['actor'], index: number, box: string) => {
            const target = box === 'left' ? panel._leftBox : box === 'center' ? panel._centerBox : panel._rightBox;
            target.insert_child_at_index(actor.container, index);
        }),
    };
    return {settings, registry, panel, panels, trays, Item, Tray};
});
vi.mock('gi://Gio', () => ({default: {DBus: {session: {}}}}));
vi.mock('resource:///org/gnome/shell/extensions/extension.js', () => ({Extension: class {
    path = '/test';
    getSettings() { return settings; }
}}));
vi.mock('resource:///org/gnome/shell/ui/main.js', () => ({panel, notify: vi.fn()}));
vi.mock('../../src/icons/iconResolver.js', () => ({clearIconCache: vi.fn()}));
vi.mock('../../src/settings/rulesStore.js', () => ({RulesStore: class { load() { return {version: 1, rules: {}}; } }}));
vi.mock('../../src/registry/itemRegistry.js', () => ({ItemRegistry: function () { return registry; }}));
vi.mock('../../src/protocol/statusNotifierWatcher.js', () => ({StatusNotifierWatcherService: class {
    registered = {connect: () => vi.fn()};
    unregistered = {connect: () => vi.fn()};
    conflict = {connect: () => vi.fn()};
    start = vi.fn(); destroy = vi.fn();
}}));
vi.mock('../../src/ui/panelItem.js', () => ({PanelItem: Item}));
vi.mock('../../src/ui/trayButton.js', () => ({TrayButton: Tray}));
import RealTrayExtension from '../../src/extension.js';

function view(key: string): IndicatorViewModel {
    return {registrationKey: key, busName: ':1.42', objectPath: '/Item', identity: {desktopEntry: null, sniId: key},
        title: key, status: 'Active', menuPath: '/Menu', itemIsMenu: false, icon: null, attentionIcon: null, overlayIcon: null,
        hidden: false, pinned: false, displayName: key, displayIcon: null, ruleConflict: false};
}
function emit(views: IndicatorViewModel[]) { registry.views = views; registry.callback({views}); }
beforeEach(() => {
    vi.clearAllMocks();
    panels.length = 0; trays.length = 0;
    registry.views = [];
    for (const key of Object.keys(settings.values)) Reflect.deleteProperty(settings.values, key);
    Object.assign(settings.values, {mode: 1, 'panel-limit': 1, 'panel-box': 2});
    panel._leftBox.children = []; panel._centerBox.children = []; panel._rightBox.children = [];
});

describe('indicator actor reconciliation', () => {
    it('keeps panel and tray actors and open menus through property updates', () => {
        const extension = new RealTrayExtension({uuid: 'test', name: 'Test', description: 'Test', 'shell-version': ['50']});
        extension.enable();
        emit([view('panel'), view('tray')]);
        const item = panels[0]!;
        const tray = trays[0]!;
        emit([{...view('panel'), title: 'Changed', status: 'NeedsAttention'}, {...view('tray'), displayName: 'Changed'}]);
        expect(panels).toHaveLength(1);
        expect(trays).toHaveLength(1);
        expect(item.update).toHaveBeenCalled();
        expect(item.destroy).not.toHaveBeenCalled();
        expect(tray.destroy).not.toHaveBeenCalled();
        expect(item.actor.menu.isOpen).toBe(true);
        expect(tray.actor.menu.isOpen).toBe(true);
        expect(panel.addToStatusArea).toHaveBeenCalledTimes(2);
        extension.disable();
        expect(item.destroy).toHaveBeenCalledOnce();
        expect(tray.destroy).toHaveBeenCalledOnce();
    });

    it('removes departed items and repositions surviving actors without recreating them', () => {
        settings.values['panel-limit'] = 3;
        const extension = new RealTrayExtension({uuid: 'test', name: 'Test', description: 'Test', 'shell-version': ['50']});
        extension.enable();
        emit([view('a'), view('b')]);
        const [a, b] = panels;
        emit([view('b'), view('a')]);
        expect(panel._rightBox.children).toEqual([b!.actor.container, a!.actor.container]);
        emit([view('b')]);
        expect(a!.destroy).toHaveBeenCalledOnce();
        expect(b!.destroy).not.toHaveBeenCalled();
        settings.values['panel-box'] = 0;
        emit([view('b')]);
        expect(panel._leftBox.children).toEqual([b!.actor.container]);
        expect(panels).toHaveLength(2);
        extension.disable();
    });
});
