// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.
import Clutter from 'gi://Clutter';
import type {StatusNotifierItemClient} from '../protocol/statusNotifierItem.js';

export function addIndicatorScroll(actor: Clutter.Actor, getClient: () => StatusNotifierItemClient | null): void {
    const scroll = new Clutter.ScrollController({
        flags: Clutter.ScrollControllerFlags.SCROLL_HORIZONTAL | Clutter.ScrollControllerFlags.SCROLL_VERTICAL,
    });
    scroll.connect('scroll', (_controller, _sprite, _source, dx, dy) => {
        const vertical = Math.abs(dy) >= Math.abs(dx);
        const delta = Math.round((vertical ? dy : dx) * 120);
        if (delta !== 0)
            getClient()?.scroll(delta, vertical ? 'vertical' : 'horizontal');
    });
    actor.add_action(scroll);
}
