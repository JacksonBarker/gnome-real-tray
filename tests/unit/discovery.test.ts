import {describe, expect, it} from 'vitest';
import {parseDiscoveryOutput} from '../../src/protocol/discovery.js';

describe('discovery output', () => {
    it('validates, parses, and deduplicates scanner records', () => {
        const valid = '{"busName":":1.42","objectPath":"/StatusNotifierItem"}';
        expect(parseDiscoveryOutput(`${valid}\nnoise\n${valid}\n`)).toEqual([
            {busName: ':1.42', objectPath: '/StatusNotifierItem'},
        ]);
    });

    it('rejects well-known names and invalid paths from scanner output', () => {
        expect(parseDiscoveryOutput([
            '{"busName":"org.example.App","objectPath":"/StatusNotifierItem"}',
            '{"busName":":1.2","objectPath":"not/a/path"}',
        ].join('\n'))).toEqual([]);
    });
});
