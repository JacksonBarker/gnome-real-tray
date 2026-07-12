import type {IconSource} from '../model/indicator.js';

export function iconNameSource(value: string | null): IconSource | null {
    if (!value)
        return null;
    return value.startsWith('/') ? {kind: 'file', path: value} : {kind: 'theme', name: value};
}
