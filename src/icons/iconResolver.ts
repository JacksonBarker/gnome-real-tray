import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import type {IconSource} from '../model/indicator.js';

export function toGIcon(source: IconSource | null): Gio.Icon {
    if (!source)
        return new Gio.ThemedIcon({name: 'image-missing-symbolic'});
    if (source.kind === 'theme')
        return new Gio.ThemedIcon({name: source.name});
    if (source.kind === 'file') {
        try {
            const [loaded, contents] = GLib.file_get_contents(source.path);
            if (loaded && contents.length > 0 && contents.length <= 5 * 1024 * 1024)
                return new Gio.BytesIcon({bytes: new GLib.Bytes(contents)});
        } catch (error) {
            console.warn(`Real Tray: could not load icon file ${source.path}: ${String(error)}`);
        }
        return new Gio.ThemedIcon({name: 'image-missing-symbolic'});
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
