import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type {IndicatorViewModel} from '../model/indicator.js';
import {toGIcon} from '../icons/iconResolver.js';
import type {StatusNotifierItemClient} from '../protocol/statusNotifierItem.js';
import {DBusMenuClient} from '../protocol/dbusMenu.js';
import {populateIndicatorMenu} from './indicatorMenu.js';
import {applyPanelSpacing} from './panelSpacing.js';
import {addIndicatorClicks} from './indicatorClicks.js';

export class PanelItem {
    readonly actor: PanelMenu.Button;
    readonly icon: St.Icon;
    readonly #menu: PopupMenu.PopupMenu;

    constructor(
        readonly view: IndicatorViewModel,
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
        addIndicatorClicks(this.actor, (button, x, y) => {
            if (button === 3 || (button === 1 && view.itemIsMenu)) {
                if (view.menuPath) {
                    if (!this.#menu.isOpen) {
                        const menuClient = new DBusMenuClient(client.connection, view.busName, view.menuPath);
                        void populateIndicatorMenu(this.#menu, menuClient);
                    }
                    this.#menu.toggle();
                } else {
                    client.call('ContextMenu', x, y);
                }
            } else {
                this.#menu.close();
                client.call(button === 2 ? 'SecondaryActivate' : 'Activate', x, y);
            }
        });
    }

    destroy(): void {
        this.actor.destroy();
    }
}
