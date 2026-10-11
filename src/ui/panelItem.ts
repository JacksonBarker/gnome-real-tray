import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type {IndicatorViewModel} from '../model/indicator.js';
import {toGIcon} from '../icons/iconResolver.js';
import type {StatusNotifierItemClient} from '../protocol/statusNotifierItem.js';
import {DBusMenuClient} from '../protocol/dbusMenu.js';
import {IndicatorMenu} from './indicatorMenu.js';
import {applyPanelSpacing} from './panelSpacing.js';
import {createIndicatorActions} from './indicatorActions.js';
import {addIndicatorScroll} from './indicatorScroll.js';
import {addIndicatorClicks} from './indicatorClicks.js';

export class PanelItem {
    readonly actor: PanelMenu.Button;
    readonly icon: St.Icon;
    #indicatorMenu: IndicatorMenu | null = null;
    readonly #menu: PopupMenu.PopupMenu;

    constructor(
        public view: IndicatorViewModel,
        readonly client: StatusNotifierItemClient,
        iconSize: number,
        compact: boolean,
    ) {
        this.actor = new PanelMenu.Button(0.5, view.displayName);
        applyPanelSpacing(this.actor, compact);
        this.#menu = this.actor.menu as PopupMenu.PopupMenu;
        this.icon = new St.Icon({gicon: toGIcon(view.displayIcon), icon_size: iconSize, style_class: 'system-status-icon'});
        this.actor.add_child(this.icon);
        // Replace the panel button's default menu toggle with the item's actions.
        this.actor._clickGesture.set_enabled(false);
        addIndicatorClicks(this.actor, createIndicatorActions(
            () => ({view: this.view, client: this.client}),
            () => this.#menu.close(),
            (target, path) => this.#showMenu(target.client, target.view, path),
        ));
        addIndicatorScroll(this.actor, () => this.client);
    }

    #showMenu(client: StatusNotifierItemClient, view: IndicatorViewModel, path: string): void {
        if (!this.#indicatorMenu) {
            const menuClient = new DBusMenuClient(client.connection, view.busName, path);
            this.#indicatorMenu = new IndicatorMenu(this.#menu, menuClient);
        }
        this.#menu.toggle();
    }

    update(view: IndicatorViewModel, iconSize: number, compact: boolean): void {
        if (view.menuPath !== this.view.menuPath) {
            this.#indicatorMenu?.destroy();
            this.#indicatorMenu = null;
            this.#menu.close();
            this.#menu.removeAll();
        }
        this.view = view;
        this.actor.accessible_name = view.displayName;
        this.icon.gicon = toGIcon(view.displayIcon);
        this.icon.icon_size = iconSize;
        applyPanelSpacing(this.actor, compact);
    }

    destroy(): void {
        this.#indicatorMenu?.destroy();
        this.#indicatorMenu = null;
        this.actor.destroy();
    }
}
