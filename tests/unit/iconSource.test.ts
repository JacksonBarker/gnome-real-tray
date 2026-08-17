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

    it('keeps the item-specific theme path with a named icon', () => {
        expect(iconNameSource('status_icon_0', '/tmp/org.chromium.Chromium.icon')).toEqual({
            kind: 'theme', name: 'status_icon_0', themePath: '/tmp/org.chromium.Chromium.icon',
        });
    });

    it('ignores a non-absolute theme path', () => {
        expect(iconNameSource('network-vpn-symbolic', 'relative/icons')).toEqual({
            kind: 'theme', name: 'network-vpn-symbolic',
        });
    });
});
