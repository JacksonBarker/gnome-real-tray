import type St from 'gi://St';

export function applyPanelSpacing(actor: St.Widget, compact: boolean): void {
    // These are the exact compact/non-compact styles used by the reference
    // AppIndicator extension on GNOME Shell 50.
    actor.set_style(compact ? '-natural-hpadding: 10px' : null);
}
