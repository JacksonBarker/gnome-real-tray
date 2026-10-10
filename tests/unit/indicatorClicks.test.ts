import {describe, expect, it, vi} from 'vitest';
import type {IndicatorViewModel} from '../../src/model/indicator.js';
import type {ItemRegistry} from '../../src/registry/itemRegistry.js';
import type {StatusNotifierItemClient} from '../../src/protocol/statusNotifierItem.js';

const {Actor, populate} = vi.hoisted(() => {
    class Actor {
        children: Actor[] = [];
        signals = new Map<string, (...args: unknown[]) => void>();
        click?: (button: number, x: number, y: number) => void;
        primary = true;
        menu?: Actor;
        actor = {bin: {set_width: vi.fn()}};
        _clickGesture = {set_enabled: vi.fn()};
        close = vi.fn();
        toggle = vi.fn();
        connect(name: string, callback: (...args: unknown[]) => void): number {
            this.signals.set(name, callback);
            return 1;
        }
        add_child(child: Actor): void { this.children.push(child); }
        insert_child_at_index(child: Actor): void { this.children.push(child); }
        addMenuItem(child: Actor): void { this.children.push(child); }
        removeAll(): void { this.children = []; }
        get_transformed_position(): [number, number] { return [12, 34]; }
        add_action(): void {}
        set_width(): void {}
        setSensitive(): void {}
    }
    return {Actor, populate: vi.fn(async () => {})};
});
vi.mock('gi://Clutter', () => ({default: {
    Orientation: {VERTICAL: 1}, ScrollController: Actor,
    ScrollControllerFlags: {SCROLL_HORIZONTAL: 1, SCROLL_VERTICAL: 2},
}}));
vi.mock('gi://Gio', () => ({default: {ThemedIcon: {new_from_names: vi.fn()}}}));
vi.mock('gi://St', () => ({default: {Icon: Actor, Widget: Actor, BoxLayout: Actor, Button: Actor}}));
vi.mock('resource:///org/gnome/shell/ui/panelMenu.js', () => ({
    Button: class extends Actor { override menu = new Actor(); },
}));
vi.mock('resource:///org/gnome/shell/ui/popupMenu.js', () => ({
    PopupMenuItem: Actor, PopupBaseMenuItem: Actor,
}));
vi.mock('../../src/icons/iconResolver.js', () => ({toGIcon: vi.fn()}));
vi.mock('../../src/ui/panelSpacing.js', () => ({applyPanelSpacing: vi.fn()}));
vi.mock('../../src/ui/indicatorMenu.js', () => ({populateIndicatorMenu: populate}));
vi.mock('../../src/protocol/dbusMenu.js', () => ({DBusMenuClient: vi.fn()}));
vi.mock('../../src/ui/indicatorClicks.js', () => ({
    addIndicatorClicks: (actor: InstanceType<typeof Actor>, click: (button: number, x: number, y: number) => void, primary = true) => {
        actor.click = click;
        actor.primary = primary;
    },
}));

import {PanelItem} from '../../src/ui/panelItem.js';
import {TrayButton} from '../../src/ui/trayButton.js';

function setup(surface: 'panel' | 'rows' | 'grid', itemIsMenu = false, menuPath: string | null = '/Menu') {
    const view: IndicatorViewModel = {
        registrationKey: 'test', busName: 'test', objectPath: '/StatusNotifierItem',
        identity: {desktopEntry: null, sniId: 'test'}, title: 'Test', status: 'Active',
        menuPath, itemIsMenu, icon: null, attentionIcon: null, overlayIcon: null,
        hidden: false, pinned: false, displayName: 'Test', displayIcon: null, ruleConflict: false,
    };
    const call = vi.fn();
    const client = {call} as unknown as StatusNotifierItemClient;
    let icon: InstanceType<typeof Actor>;
    let menu: InstanceType<typeof Actor>;
    if (surface === 'panel') {
        const panel = new PanelItem(view, client, 16, false);
        icon = panel.actor as unknown as InstanceType<typeof Actor>;
        menu = icon.menu!;
    } else {
        const registry = {getClient: () => client} as unknown as ItemRegistry;
        const tray = new TrayButton(registry, 16, false, '');
        tray.update([view], surface, 5, 32);
        menu = (tray.actor as unknown as InstanceType<typeof Actor>).menu!;
        icon = surface === 'rows' ? menu.children[0]! : menu.children[0]!.children[0]!.children[0]!.children[0]!;
    }
    return {
        call, menu,
        click: (button: number) => {
            if (surface === 'grid' && button === 1)
                icon.signals.get('clicked')?.();
            else
                icon.click?.(button, 12, 34);
        },
    };
}

describe.each(['panel', 'rows', 'grid'] as const)('%s indicator clicks', surface => {
    it('activates an application even when it exports a menu, closing the tray first', () => {
        const {call, click, menu} = setup(surface);
        populate.mockClear();
        click(1);
        expect(call.mock.calls[0]?.[0]).toBe('Activate');
        expect(menu.close).toHaveBeenCalled();
        expect(menu.close.mock.invocationCallOrder[0]).toBeLessThan(call.mock.invocationCallOrder[0]!);
        expect(populate).not.toHaveBeenCalled();
    });

    it('shows the exported menu on right click without activating', () => {
        const {call, click, menu} = setup(surface);
        populate.mockClear();
        click(3);
        expect(call).not.toHaveBeenCalled();
        if (surface === 'panel')
            expect(menu.toggle).toHaveBeenCalled();
        else
            expect(populate).toHaveBeenCalled();
    });

    it('honors ItemIsMenu on left click', () => {
        const {call, click, menu} = setup(surface, true);
        populate.mockClear();
        click(1);
        expect(call).not.toHaveBeenCalled();
        if (surface === 'panel')
            expect(menu.toggle).toHaveBeenCalled();
        else
            expect(populate).toHaveBeenCalled();
    });

    it('requests the native context menu when no exported menu exists', () => {
        const {call, click} = setup(surface, false, null);
        click(3);
        expect(call).toHaveBeenCalledWith('ContextMenu', 12, 34);
    });

    it('routes middle click only to secondary activation', () => {
        const {call, click} = setup(surface);
        click(2);
        expect(call).toHaveBeenCalledExactlyOnceWith('SecondaryActivate', 12, 34);
    });
});
