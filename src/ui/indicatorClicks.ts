import Clutter from 'gi://Clutter';
import type St from 'gi://St';

// Grid St.Buttons already provide primary and keyboard activation via `clicked`.
export function addIndicatorClicks(
    actor: St.Widget,
    click: (button: number, x: number, y: number) => void,
    primary = true,
): void {
    for (const button of primary ? [1, 2, 3] : [2, 3]) {
        const gesture = new Clutter.ClickGesture({
            required_button: button,
            recognize_on_press: button !== 1,
        });
        gesture.connect('recognize', () => {
            const [x, y] = Clutter.get_current_event().get_coords();
            click(button, Math.round(x), Math.round(y));
        });
        actor.add_action(gesture);
    }
    const keys = new Clutter.KeyController();
    keys.connect('key-press', () => {
        const [, symbol, state] = keys.get_key();
        const context = symbol === Clutter.KEY_Menu ||
            (symbol === Clutter.KEY_F10 && (state & Clutter.ModifierType.SHIFT_MASK) !== 0);
        if (!context && (!primary || (symbol !== Clutter.KEY_Return && symbol !== Clutter.KEY_space)))
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = actor.get_transformed_position();
        click(context ? 3 : 1, Math.round(x), Math.round(y));
        return Clutter.EVENT_STOP;
    });
    actor.add_action(keys);
}
