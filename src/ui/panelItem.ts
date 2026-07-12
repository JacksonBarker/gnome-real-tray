import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type {IndicatorViewModel} from '../model/indicator.js';
import {toGIcon} from '../icons/iconResolver.js';
import type {StatusNotifierItemClient} from '../protocol/statusNotifierItem.js';
import {DBusMenuClient} from '../protocol/dbusMenu.js';
import {populateIndicatorMenu} from './indicatorMenu.js';
import {applyPanelSpacing} from './panelSpacing.js';

export class PanelItem {
    readonly actor: PanelMenu.Button;
    readonly icon: St.Icon;
    readonly #menu: PopupMenu.PopupMenu;
    #menuSignal: number;
    #activationSignal = 0;

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
        if (view.menuPath) {
            const menuClient = new DBusMenuClient(client.connection, view.busName, view.menuPath);
            void populateIndicatorMenu(this.#menu, menuClient);
        } else {
            this.#activationSignal = this.actor._clickGesture.connect('notify::state', gesture => {
                if (gesture.state === Clutter.GestureState.COMPLETED)
                    client.call('Activate');
            });
        }
        this.#menuSignal = this.#menu.connect('open-state-changed', (_menu, open) => {
            if (!open)
                return;
            if (view.menuPath) {
                const menuClient = new DBusMenuClient(client.connection, view.busName, view.menuPath);
                void populateIndicatorMenu(this.#menu, menuClient);
            }
        });
    }

    destroy(): void {
        this.#menu.disconnect(this.#menuSignal);
        if (this.#activationSignal)
            this.actor._clickGesture.disconnect(this.#activationSignal);
        this.actor.destroy();
    }
}
