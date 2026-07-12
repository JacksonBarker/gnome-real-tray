import {describe, expect, it} from 'vitest';
import {defaultMatcher, matchesIdentity, normalizeIdentity} from '../../src/identity/indicatorIdentity.js';

describe('indicator identity', () => {
    it('normalizes DesktopEntry and ID', () => {
        expect(normalizeIdentity(' org.example.App.desktop ', ' tray ')).toEqual({
            desktopEntry: 'org.example.App', sniId: 'tray',
        });
    });
    it('supports either field and ANDs both fields', () => {
        const identity = normalizeIdentity('app.desktop', 'one');
        expect(matchesIdentity({desktopEntry: 'app', sniId: null}, identity)).toBe(true);
        expect(matchesIdentity({desktopEntry: null, sniId: 'one'}, identity)).toBe(true);
        expect(matchesIdentity({desktopEntry: 'app', sniId: 'two'}, identity)).toBe(false);
        expect(matchesIdentity({desktopEntry: null, sniId: null}, identity)).toBe(false);
    });
    it('defaults to DesktopEntry and falls back to SNI ID', () => {
        expect(defaultMatcher({desktopEntry: 'app', sniId: 'tray'})).toEqual({
            desktopEntry: 'app', sniId: null,
        });
        expect(defaultMatcher({desktopEntry: null, sniId: 'tray'})).toEqual({
            desktopEntry: null, sniId: 'tray',
        });
    });
});
