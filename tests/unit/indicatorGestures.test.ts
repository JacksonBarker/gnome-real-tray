import {describe, expect, it, vi} from 'vitest';
import type St from 'gi://St';

const {ClickGesture, KeyController} = vi.hoisted(() => {
    class ClickGesture {
        recognize?: () => void;
        constructor(readonly options: {required_button: number; recognize_on_press?: boolean}) {}
        connect(_name: string, callback: () => void): void { this.recognize = callback; }
        press(button: number): void {
            if (this.options.required_button === button && this.options.recognize_on_press)
                this.recognize?.();
        }
        release(button: number): void {
            if (this.options.required_button === button && !this.options.recognize_on_press)
                this.recognize?.();
        }
    }
    class KeyController { connect(): void {} }
    return {ClickGesture, KeyController};
});
vi.mock('gi://Clutter', () => ({default: {
    ClickGesture, KeyController,
    get_current_event: () => ({get_coords: () => [12.4, 34.4]}),
}}));
import {addIndicatorClicks} from '../../src/ui/indicatorClicks.js';

function setup(primary: boolean) {
    const actions: Array<InstanceType<typeof ClickGesture> | InstanceType<typeof KeyController>> = [];
    const actor = {add_action: (action: typeof actions[number]) => actions.push(action)};
    const click = vi.fn();
    addIndicatorClicks(actor as unknown as St.Widget, click, primary);
    const gestures = actions.filter(action => action instanceof ClickGesture);
    return {click, press: (button: number) => gestures.forEach(gesture => gesture.press(button)),
        release: (button: number) => gestures.forEach(gesture => gesture.release(button))};
}

describe.each([true, false])('indicator gestures (primary=%s)', primary => {
    it.each([2, 3])('handles button %s on press without waiting for release', button => {
        const test = setup(primary);
        test.press(button);
        expect(test.click).toHaveBeenCalledExactlyOnceWith(button, 12, 34);
        test.release(button);
        expect(test.click).toHaveBeenCalledTimes(1);
    });
    it('keeps primary activation on release and leaves grid primary activation to St.Button', () => {
        const test = setup(primary);
        test.press(1);
        expect(test.click).not.toHaveBeenCalled();
        test.release(1);
        if (primary)
            expect(test.click).toHaveBeenCalledExactlyOnceWith(1, 12, 34);
        else
            expect(test.click).not.toHaveBeenCalled();
    });
});
