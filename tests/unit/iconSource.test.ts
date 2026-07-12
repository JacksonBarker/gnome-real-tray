import {describe, expect, it} from 'vitest';
import {iconNameSource} from '../../src/icons/iconSource.js';

describe('SNI IconName', () => {
    it('recognizes absolute file paths used by Ayatana indicators', () => {
        expect(iconNameSource('/run/user/1000/tray-icon/icon.png')).toEqual({
            kind: 'file', path: '/run/user/1000/tray-icon/icon.png',
        });
    });

    it('keeps ordinary names as icon-theme names', () => {
        expect(iconNameSource('network-vpn-symbolic')).toEqual({
            kind: 'theme', name: 'network-vpn-symbolic',
        });
    });
});
