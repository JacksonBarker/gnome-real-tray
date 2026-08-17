import type {IconSource} from '../model/indicator.js';

export function iconNameSource(value: string | null, iconThemePath: string | null = null): IconSource | null {
    if (!value)
        return null;
    if (value.startsWith('/'))
        return {kind: 'file', path: value};
    return iconThemePath?.startsWith('/')
        ? {kind: 'theme', name: value, themePath: iconThemePath}
        : {kind: 'theme', name: value};
}
