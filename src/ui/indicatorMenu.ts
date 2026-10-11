// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Popup from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type {MenuNode} from '../model/menu.js';
import {DBusMenuClient} from '../protocol/dbusMenu.js';

type Container = PopupMenu.PopupMenu | PopupMenu.PopupSubMenu;
type Row = {
    id: number;
    kind: 'separator' | 'submenu' | 'action';
    actor: PopupMenu.PopupBaseMenuItem;
    children: Row[];
    placeholder: PopupMenu.PopupMenuItem | null;
};

export class IndicatorMenu {
    #rows: Row[] = [];
    #placeholder: PopupMenu.PopupMenuItem | null = null;
    #menuSignal: number;
    #disconnect: () => void;
    #refreshing = false;
    #pending = new Set<number>();
    #prepared = new Set<number>();
    #back: PopupMenu.PopupMenuItem | null = null;

    constructor(readonly menu: PopupMenu.PopupMenu, readonly client: DBusMenuClient, back?: () => void) {
        menu.removeAll();
        if (back) {
            this.#back = new Popup.PopupMenuItem('‹ Back');
            this.#back.connect('activate', back);
            menu.addMenuItem(this.#back);
        }
        this.#showPlaceholder('Loading…');
        this.#disconnect = client.changed.connect(() => {
            if (menu.isOpen)
                this.#requestRefresh();
        });
        this.#menuSignal = menu.connect('open-state-changed', (_menu, open) => {
            client.event(0, open ? 'opened' : 'closed');
            if (open)
                this.#requestRefresh(0);
        });
        this.#requestRefresh(0);
    }

    #showPlaceholder(label: string): void {
        this.#placeholder?.destroy();
        this.#placeholder = new Popup.PopupMenuItem(label);
        this.#placeholder.setSensitive(false);
        this.menu.addMenuItem(this.#placeholder);
    }

    #requestRefresh(prepareId?: number): void {
        if (this.client.cancellable.is_cancelled())
            return;
        this.#pending.add(prepareId ?? -1);
        if (!this.#refreshing)
            void this.#refresh();
    }

    async #refresh(): Promise<void> {
        this.#refreshing = true;
        try {
            while (this.#pending.size > 0 && !this.client.cancellable.is_cancelled()) {
                const pending = [...this.#pending];
                this.#pending.clear();
                for (const id of pending) {
                    if (id >= 0) {
                        try {
                            await this.client.aboutToShow(id);
                        } catch (error) {
                            if (!this.client.cancellable.is_cancelled())
                                console.warn(`Real Tray: AboutToShow failed: ${String(error)}`);
                        }
                        this.#prepared.add(id);
                    }
                }
                if (this.client.cancellable.is_cancelled())
                    return;
                const nodes = await this.client.getLayout();
                if (this.client.cancellable.is_cancelled())
                    return;
                this.#placeholder?.destroy();
                this.#placeholder = null;
                this.#rows = this.#reconcile(this.menu, this.#rows, nodes, this.#back ? 1 : 0);
                if (this.#rows.length === 0)
                    this.#showPlaceholder('No actions');
            }
        } catch (error) {
            if (!this.client.cancellable.is_cancelled()) {
                console.warn(`Real Tray: unable to load DBusMenu: ${String(error)}`);
                if (this.#rows.length === 0)
                    this.#showPlaceholder('Menu unavailable');
            }
        } finally {
            this.#refreshing = false;
            if (this.#pending.size > 0 && !this.client.cancellable.is_cancelled())
                void this.#refresh();
        }
    }

    #reconcile(container: Container, rows: Row[], nodes: MenuNode[], offset = 0): Row[] {
        const remaining = new Map(rows.map(row => [row.id, row]));
        const result: Row[] = [];
        for (const node of nodes.filter(node => node.visible)) {
            const kind = node.type === 'separator' ? 'separator' : node.submenu || node.children.length > 0 ? 'submenu' : 'action';
            let row = remaining.get(node.id);
            remaining.delete(node.id);
            if (row && row.kind !== kind) {
                row.actor.destroy();
                row = undefined;
            }
            if (!row) {
                const actor = kind === 'separator' ? new Popup.PopupSeparatorMenuItem()
                    : kind === 'submenu' ? new Popup.PopupSubMenuMenuItem(node.label || 'Menu')
                    : new Popup.PopupMenuItem(node.label || ' ');
                row = {id: node.id, kind, actor, children: [], placeholder: null};
                if (actor instanceof Popup.PopupSubMenuMenuItem) {
                    actor.menu.connect('open-state-changed', (_menu, open) => {
                        this.client.event(node.id, open ? 'opened' : 'closed');
                        if (open)
                            this.#requestRefresh(node.id);
                    });
                } else if (kind === 'action') {
                    actor.connect('activate', () => this.client.event(node.id, 'clicked'));
                }
                container.addMenuItem(actor, result.length + offset);
            } else {
                container.moveMenuItem(row.actor, result.length + offset);
            }
            row.actor.setSensitive(node.enabled);
            if (row.actor instanceof Popup.PopupMenuItem || row.actor instanceof Popup.PopupSubMenuMenuItem) {
                row.actor.label.text = node.label || ' ';
                row.actor.setOrnament(node.toggleState === 1
                    ? node.toggleType === 'radio' ? Popup.Ornament.DOT : Popup.Ornament.CHECK
                    : Popup.Ornament.NONE);
            }
            if (row.actor instanceof Popup.PopupSubMenuMenuItem) {
                container.box.set_child_above_sibling(row.actor.menu.actor, row.actor);
                row.placeholder?.destroy();
                row.placeholder = null;
                row.children = this.#reconcile(row.actor.menu, row.children, node.children);
                if (row.children.length === 0) {
                    row.placeholder = new Popup.PopupMenuItem(this.#prepared.has(node.id) ? 'No actions' : 'Loading…');
                    row.placeholder.setSensitive(false);
                    row.actor.menu.addMenuItem(row.placeholder);
                }
            }
            result.push(row);
        }
        for (const row of remaining.values())
            row.actor.destroy();
        return result;
    }

    destroy(): void {
        this.#pending.clear();
        this.#prepared.clear();
        this.menu.disconnect(this.#menuSignal);
        this.#disconnect();
        this.client.destroy();
        this.#rows = [];
        this.#placeholder = null;
        this.#back = null;
    }
}
