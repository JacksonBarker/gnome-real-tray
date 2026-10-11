// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.
import type {IndicatorViewModel} from '../model/indicator.js';
import {usableMenuPath} from '../model/menu.js';
import type {StatusNotifierItemClient} from '../protocol/statusNotifierItem.js';

interface IndicatorTarget {
    view: IndicatorViewModel;
    client: StatusNotifierItemClient;
}

export function createIndicatorActions(
    getTarget: () => IndicatorTarget | null,
    closeMenu: () => void,
    showMenu: (target: IndicatorTarget, path: string) => void,
): (button: number, x: number, y: number) => void {
    const contextMenu = (x: number, y: number): void => {
        const target = getTarget();
        if (!target)
            return;
        const path = usableMenuPath(target.view.menuPath);
        if (path) {
            showMenu(target, path);
        } else {
            closeMenu();
            target.client.call('ContextMenu', x, y);
        }
    };
    return (button, x, y) => {
        const target = getTarget();
        if (!target)
            return;
        if (button === 3 || (button === 1 && target.view.itemIsMenu)) {
            contextMenu(x, y);
        } else {
            closeMenu();
            if (button === 2)
                target.client.call('SecondaryActivate', x, y);
            else
                target.client.call('Activate', x, y, () => contextMenu(x, y));
        }
    };
}
