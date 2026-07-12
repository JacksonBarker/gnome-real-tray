import Gio from 'gi://Gio';
import type {TrayMode} from '../placement/placementPolicy.js';

export function getMode(settings: Gio.Settings): TrayMode {
    return (['off', 'overflow', 'dropdown-only'][settings.get_enum('mode')] ?? 'overflow') as TrayMode;
}

export function getPanelBox(settings: Gio.Settings): 'left' | 'center' | 'right' {
    return (['left', 'center', 'right'][settings.get_enum('panel-box')] ?? 'right') as 'left' | 'center' | 'right';
}
