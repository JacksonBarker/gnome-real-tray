import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type {IndicatorViewModel} from '../model/indicator.js';
import {toGIcon} from '../icons/iconResolver.js';
import type {ItemRegistry} from '../registry/itemRegistry.js';
import {DBusMenuClient} from '../protocol/dbusMenu.js';
import {populateIndicatorMenu} from './indicatorMenu.js';
import {applyPanelSpacing} from './panelSpacing.js';
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
            if (open)
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
        this.#rebuild();
    }

    #rebuild(): void {
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
        addIndicatorClicks(entry, (button, x, y) => this.#click(item, button, x, y));
        this.#addScrollController(entry, item);
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
        button.connect('clicked', () => {
            const [x, y] = button.get_transformed_position();
            this.#click(item, 1, Math.round(x), Math.round(y));
        });
        addIndicatorClicks(button, (number, x, y) => this.#click(item, number, x, y), false);
        this.#addScrollController(button, item);
        return button;
    }

    #click(item: IndicatorViewModel, button: number, x = 0, y = 0): void {
        const client = this.registry.getClient(item.registrationKey);
        if (!client)
            return;
        if (button === 3 || (button === 1 && item.itemIsMenu)) {
            this.#showContextMenu(item, x, y);
        } else {
            this.#menu.close();
            client.call(button === 2 ? 'SecondaryActivate' : 'Activate', x, y);
        }
    }

    #addScrollController(actor: Clutter.Actor, item: IndicatorViewModel): void {
        const scroll = new Clutter.ScrollController({
            flags: Clutter.ScrollControllerFlags.SCROLL_HORIZONTAL |
                Clutter.ScrollControllerFlags.SCROLL_VERTICAL,
        });
        scroll.connect('scroll', (_controller, _sprite, _source, dx, dy) => {
            this.#handleScroll(item, dx, dy);
        });
        actor.add_action(scroll);
    }

    #handleScroll(item: IndicatorViewModel, dx: number, dy: number): void {
        const client = this.registry.getClient(item.registrationKey);
        if (Math.abs(dy) >= Math.abs(dx))
            client?.scroll(Math.round(dy * 120), 'vertical');
        else
            client?.scroll(Math.round(dx * 120), 'horizontal');
    }

    #showContextMenu(item: IndicatorViewModel, x: number, y: number): void {
        const client = this.registry.getClient(item.registrationKey);
        if (!client)
            return;
        if (!item.menuPath) {
            this.#menu.close();
            client.call('ContextMenu', x, y);
            return;
        }
        const menuClient = new DBusMenuClient(client.connection, item.busName, item.menuPath);
        void populateIndicatorMenu(this.#menu, menuClient).then(() => {
            const back = new PopupMenu.PopupMenuItem('‹ Back');
            back.connect('activate', () => this.#rebuild());
            this.#menu.addMenuItem(back, 0);
        });
    }

    destroy(): void {
        this.#menu.disconnect(this.#menuSignal);
        this.actor.destroy();
    }
}
