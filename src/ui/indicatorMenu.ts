import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Popup from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type {MenuNode} from '../model/menu.js';
import {DBusMenuClient} from '../protocol/dbusMenu.js';

type MenuContainer = PopupMenu.PopupMenu | PopupMenu.PopupSubMenu;

function addNode(container: MenuContainer, node: MenuNode, client: DBusMenuClient): void {
    if (!node.visible)
        return;
    if (node.type === 'separator') {
        container.addMenuItem(new Popup.PopupSeparatorMenuItem());
        return;
    }
    if (node.children.length > 0) {
        const submenu = new Popup.PopupSubMenuMenuItem(node.label || 'Menu');
        submenu.setSensitive(node.enabled);
        container.addMenuItem(submenu);
        for (const child of node.children)
            addNode(submenu.menu, child, client);
        return;
    }
    const item = new Popup.PopupMenuItem(node.label || ' ');
    item.setSensitive(node.enabled);
    if (node.toggleState === 1)
        item.setOrnament(node.toggleType === 'radio' ? Popup.Ornament.DOT : Popup.Ornament.CHECK);
    item.connect('activate', () => client.event(node.id, 'clicked'));
    container.addMenuItem(item);
}

export async function populateIndicatorMenu(
    menu: PopupMenu.PopupMenu, client: DBusMenuClient | null,
): Promise<void> {
    menu.removeAll();
    if (!client)
        return;
    const loading = new Popup.PopupMenuItem('Loading…');
    loading.setSensitive(false);
    menu.addMenuItem(loading);
    try {
        const nodes = await client.getLayout();
        menu.removeAll();
        for (const node of nodes)
            addNode(menu, node, client);
        if (nodes.length === 0) {
            const empty = new Popup.PopupMenuItem('No actions');
            empty.setSensitive(false);
            menu.addMenuItem(empty);
        }
    } catch (error) {
        menu.removeAll();
        console.warn(`Real Tray: unable to load DBusMenu: ${String(error)}`);
        const failed = new Popup.PopupMenuItem('Menu unavailable');
        failed.setSensitive(false);
        menu.addMenuItem(failed);
    }
}
