import {describe, expect, it} from 'vitest';
import {parseRules, resolveRule} from '../../src/model/rules.js';

describe('rules', () => {
    it('prefers a two-field match', () => {
        const doc = parseRules(JSON.stringify({version: 1, rules: {
            broad: {matcher: {desktopEntry: 'app', sniId: null}, hidden: true},
            exact: {matcher: {desktopEntry: 'app', sniId: 'tray'}, pinned: true},
        }}));
        expect(resolveRule(doc, {desktopEntry: 'app', sniId: 'tray'}).ruleId).toBe('exact');
    });
    it('reports equal-specificity conflicts', () => {
        const doc = parseRules(JSON.stringify({version: 1, rules: {
            a: {matcher: {desktopEntry: 'app'}}, b: {matcher: {desktopEntry: 'app'}},
        }}));
        expect(resolveRule(doc, {desktopEntry: 'app', sniId: 'tray'}).conflict).toBe(true);
    });
    it('safely rejects invalid documents and empty matchers', () => {
        expect(parseRules('{').rules).toEqual({});
        expect(parseRules('{"version":1,"rules":{"x":{"matcher":{}}}}').rules).toEqual({});
    });
});
