import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type {IndicatorViewModel} from '../model/indicator.js';
import {toGIcon} from '../icons/iconResolver.js';
import type {ItemRegistry} from '../registry/itemRegistry.js';
import {DBusMenuClient} from '../protocol/dbusMenu.js';
import {IndicatorMenu} from './indicatorMenu.js';
import {applyPanelSpacing} from './panelSpacing.js';
import {createIndicatorActions} from './indicatorActions.js';
import type {StatusNotifierItemClient} from '../protocol/statusNotifierItem.js';
import {addIndicatorScroll} from './indicatorScroll.js';
import {addIndicatorClicks} from './indicatorClicks.js';

export class TrayButton {
    readonly actor: PanelMenu.Button;
    readonly #menu: PopupMenu.PopupMenu;
    readonly #icon: St.Icon;
    readonly #badge: St.Widget;
    #items: readonly IndicatorViewModel[] = [];
    #layout: 'grid' | 'rows' = 'grid';
    #gridColumns = 4;
    #gridIconSize = 32;
    #menuSignal: number;
    #indicatorMenu: IndicatorMenu | null = null;
    #contextKey: string | null = null;
    #contextPath: string | null = null;
    #structure = '';
    #entries = new Map<string, {actor: St.Widget; icon: St.Icon; label?: St.Label}>();

    constructor(readonly registry: ItemRegistry, iconSize: number, compact: boolean, requestedIcon: string) {
        this.actor = new PanelMenu.Button(0.5, 'Real Tray');
        applyPanelSpacing(this.actor, compact);
        this.#menu = this.actor.menu as PopupMenu.PopupMenu;
        const fallbackIcon = 'view-grid-symbolic';
        const iconName = requestedIcon.trim() || fallbackIcon;
        const iconNames = iconName === fallbackIcon ? [fallbackIcon] : [iconName, fallbackIcon];
        this.#icon = new St.Icon({
            gicon: Gio.ThemedIcon.new_from_names(iconNames),
            icon_size: iconSize,
            style_class: 'system-status-icon',
        });
        const box = new St.BoxLayout();
        box.add_child(this.#icon);
        this.#badge = new St.Widget({style_class: 'real-tray-attention-badge'});
        box.add_child(this.#badge);
        this.actor.add_child(box);
        this.#menuSignal = this.#menu.connect('open-state-changed', (_menu, open) => {
            if ((open && !this.#indicatorMenu) || (!open && this.#indicatorMenu))
                this.#rebuild();
        });
    }

    update(items: readonly IndicatorViewModel[], layout: 'grid' | 'rows', columns: number, iconSize: number, attentionBadge = true): void {
        this.#items = items;
        this.#layout = layout;
        this.#gridColumns = Math.max(1, columns);
        this.#gridIconSize = iconSize;
        this.actor.accessible_name = `Real Tray, ${items.length} items`;
        this.#badge.visible = attentionBadge && items.some(item => item.status === 'NeedsAttention');
        if (this.#contextKey) {
            const context = items.find(item => item.registrationKey === this.#contextKey);
            if (context && context.menuPath === this.#contextPath)
                return;
            this.#rebuild();
        } else {
            const structure = JSON.stringify([layout, this.#gridColumns, iconSize, items.map(item => item.registrationKey)]);
            if (structure !== this.#structure) {
                this.#structure = structure;
                this.#rebuild();
            } else {
                for (const item of items) {
                    const entry = this.#entries.get(item.registrationKey)!;
                    entry.icon.gicon = toGIcon(item.displayIcon);
                    entry.actor.accessible_name = item.displayName;
                    if (entry.label)
                        entry.label.text = item.displayName;
                }
            }
        }
    }

    configure(iconSize: number, compact: boolean, requestedIcon: string): void {
        const fallback = 'view-grid-symbolic';
        const name = requestedIcon.trim() || fallback;
        this.#icon.gicon = Gio.ThemedIcon.new_from_names(name === fallback ? [fallback] : [name, fallback]);
        this.#icon.icon_size = iconSize;
        applyPanelSpacing(this.actor, compact);
    }

    #rebuild(): void {
        this.#indicatorMenu?.destroy();
        this.#indicatorMenu = null;
        this.#contextKey = null;
        this.#contextPath = null;
        this.#structure = JSON.stringify([this.#layout, this.#gridColumns, this.#gridIconSize, this.#items.map(item => item.registrationKey)]);
        this.#entries.clear();
        this.#menu.removeAll();
        if (this.#items.length === 0) {
            const empty = new PopupMenu.PopupMenuItem('No active indicators');
            empty.setSensitive(false);
            this.#menu.addMenuItem(empty);
            return;
        }
        if (this.#layout === 'rows') {
            this.#menu.actor.bin.set_width(-1);
            for (const item of this.#items)
                this.#menu.addMenuItem(this.#rowEntry(item));
            return;
        }
        const holder = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'real-tray-grid-holder',
        });
        const vertical = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'real-tray-grid',
        });
        const cellSize = this.#gridIconSize + 16;
        const gridWidth = this.#gridColumns * cellSize + (this.#gridColumns - 1) * 6;
        vertical.set_width(gridWidth);
        this.#menu.actor.bin.set_width(gridWidth + 24);
        let row: St.BoxLayout | null = null;
        this.#items.forEach((item, index) => {
            if (index % this.#gridColumns === 0) {
                row = new St.BoxLayout({style_class: 'real-tray-grid-row'});
                vertical.add_child(row);
            }
            row?.add_child(this.#gridEntry(item, cellSize));
        });
        holder.add_child(vertical);
        this.#menu.addMenuItem(holder);
    }

    #rowEntry(item: IndicatorViewModel): PopupMenu.PopupMenuItem {
        const entry = new PopupMenu.PopupMenuItem(item.displayName, {activate: false});
        const icon = new St.Icon({
            gicon: toGIcon(item.displayIcon),
            icon_size: 16,
            style_class: 'popup-menu-icon',
        });
        entry.insert_child_at_index(icon, 0);
        addIndicatorClicks(entry, this.#actions(item.registrationKey));
        addIndicatorScroll(entry, () => this.registry.getClient(item.registrationKey));
        this.#entries.set(item.registrationKey, {actor: entry, icon, label: entry.label});
        return entry;
    }

    #gridEntry(item: IndicatorViewModel, cellSize: number): St.Button {
        const icon = new St.Icon({gicon: toGIcon(item.displayIcon), icon_size: this.#gridIconSize});
        const button = new St.Button({
            reactive: true,
            can_focus: true,
            accessible_name: item.displayName,
            style_class: 'real-tray-grid-button',
            width: cellSize,
            height: cellSize,
            child: icon,
        });
        const click = this.#actions(item.registrationKey);
        button.connect('clicked', () => {
            const [x, y] = button.get_transformed_position();
            click(1, Math.round(x), Math.round(y));
        });
        addIndicatorClicks(button, click, false);
        addIndicatorScroll(button, () => this.registry.getClient(item.registrationKey));
        this.#entries.set(item.registrationKey, {actor: button, icon});
        return button;
    }

    #actions(key: string): ReturnType<typeof createIndicatorActions> {
        return createIndicatorActions(
            () => {
                const view = this.#items.find(item => item.registrationKey === key);
                const client = this.registry.getClient(key);
                return view && client ? {view, client} : null;
            },
            () => this.#menu.close(),
            (target, path) => this.#showMenu(target.client, target.view, path),
        );
    }

    #showMenu(client: StatusNotifierItemClient, item: IndicatorViewModel, path: string): void {
        this.#indicatorMenu?.destroy();
        this.#indicatorMenu = null;
        this.#entries.clear();
        this.#contextKey = item.registrationKey;
        this.#contextPath = path;
        const menuClient = new DBusMenuClient(client.connection, item.busName, path);
        this.#indicatorMenu = new IndicatorMenu(this.#menu, menuClient, () => this.#rebuild());
        this.#menu.open();
    }

    destroy(): void {
        this.#indicatorMenu?.destroy();
        this.#indicatorMenu = null;
        this.#entries.clear();
        this.#menu.disconnect(this.#menuSignal);
        this.actor.destroy();
    }
}
