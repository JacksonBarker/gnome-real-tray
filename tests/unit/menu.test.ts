import {describe, expect, it} from 'vitest';
import {decodeDBusMenuLabel} from '../../src/model/menu.js';

describe('DBusMenu labels', () => {
    it('removes mnemonic markers', () => {
        expect(decodeDBusMenuLabel('_Preferences')).toBe('Preferences');
        expect(decodeDBusMenuLabel('Save _As')).toBe('Save As');
        expect(decodeDBusMenuLabel('Trailing_')).toBe('Trailing');
    });

    it('turns doubled underscores into literal underscores', () => {
        expect(decodeDBusMenuLabel('Open__Recent')).toBe('Open_Recent');
        expect(decodeDBusMenuLabel('___Mixed____Label_')).toBe('_Mixed__Label');
    });

    it('leaves labels without mnemonic syntax unchanged', () => {
        expect(decodeDBusMenuLabel('About Remmina')).toBe('About Remmina');
        expect(decodeDBusMenuLabel('')).toBe('');
    });
});
