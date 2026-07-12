import {describe, expect, it} from 'vitest';
import {calculatePlacement, type PlaceableIndicator} from '../../src/placement/placementPolicy.js';

const item = (registrationKey: string, pinned = false, status: PlaceableIndicator['status'] = 'Active'): PlaceableIndicator =>
    ({registrationKey, pinned, status, hidden: false});

describe('placement policy', () => {
    it('puts everything on panel in off mode', () => {
        expect(calculatePlacement([item('a'), item('b')], 'off', 0).panel).toHaveLength(2);
    });
    it('keeps pinned items beyond the limit', () => {
        const result = calculatePlacement([item('a', true), item('b', true), item('c')], 'overflow', 1);
        expect(result.panel.map(i => i.registrationKey)).toEqual(['a', 'b']);
        expect(result.tray.map(i => i.registrationKey)).toEqual(['c']);
    });
    it('treats zero as pinned only', () => {
        const result = calculatePlacement([item('a'), item('b', true)], 'overflow', 0);
        expect(result.panel.map(i => i.registrationKey)).toEqual(['b']);
    });
    it('keeps only the button in empty dropdown-only mode', () => {
        expect(calculatePlacement([], 'dropdown-only', 3).showTrayButton).toBe(true);
    });
    it('filters hidden and passive items', () => {
        const hidden = {...item('a'), hidden: true};
        expect(calculatePlacement([hidden, item('b', false, 'Passive')], 'off', 3).panel).toEqual([]);
    });
});
