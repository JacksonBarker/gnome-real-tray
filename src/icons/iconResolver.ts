import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import St from 'gi://St';
import type {IconSource} from '../model/indicator.js';

const iconThemes = new Map<string, St.IconTheme>();

function bytesIcon(path: string): Gio.BytesIcon | null {
    try {
        const [loaded, contents] = GLib.file_get_contents(path);
        if (loaded && contents.length > 0 && contents.length <= 5 * 1024 * 1024)
            return new Gio.BytesIcon({bytes: new GLib.Bytes(contents)});
    } catch (error) {
        console.warn(`Real Tray: could not load icon file ${path}: ${String(error)}`);
    }
    return null;
}

function iconFromThemePath(name: string, themePath: string): Gio.BytesIcon | null {
    let theme = iconThemes.get(themePath);
    if (!theme) {
        theme = new St.IconTheme();
        theme.set_search_path([themePath]);
        iconThemes.set(themePath, theme);
    }
    const filename = theme.lookup_icon(
        name, 32, St.IconLookupFlags.GENERIC_FALLBACK)?.get_filename();
    return filename ? bytesIcon(filename) : null;
}

export function toGIcon(source: IconSource | null): Gio.Icon {
    if (!source)
        return new Gio.ThemedIcon({name: 'image-missing-symbolic'});
    if (source.kind === 'theme') {
        if (source.themePath) {
            const icon = iconFromThemePath(source.name, source.themePath);
            if (icon)
                return icon;
        }
        return new Gio.ThemedIcon({name: source.name});
    }
    if (source.kind === 'file') {
        return bytesIcon(source.path) ?? new Gio.ThemedIcon({name: 'image-missing-symbolic'});
    }
    const rgba = new Uint8Array(source.bytes.length);
    for (let offset = 0; offset < source.bytes.length; offset += 4) {
        const alpha = source.bytes[offset] ?? 0;
        rgba[offset] = source.bytes[offset + 1] ?? 0;
        rgba[offset + 1] = source.bytes[offset + 2] ?? 0;
        rgba[offset + 2] = source.bytes[offset + 3] ?? 0;
        rgba[offset + 3] = alpha;
    }
    const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(
        new GLib.Bytes(rgba), GdkPixbuf.Colorspace.RGB, true, 8,
        source.width, source.height, source.width * 4,
    );
    const [, png] = pixbuf.save_to_bufferv('png', null, null);
    return new Gio.BytesIcon({bytes: new GLib.Bytes(png)});
}

export function validOverrideFile(path: string): boolean {
    if (!path.startsWith('/') || !/\.(png|svg)$/i.test(path))
        return false;
    return Gio.File.new_for_path(path).query_exists(null);
}
