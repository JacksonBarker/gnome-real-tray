import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {SNI_INTERFACE} from '../protocol/interfaces.js';
import '../util/promisify.js';

const MAX_DEPTH = 10;
const MAX_OBJECTS_PER_SERVICE = 256;
const CALL_TIMEOUT_MS = 2500;

async function call(busName: string, path: string, method: string, parameters: GLib.Variant | null, reply: string): Promise<GLib.Variant> {
    return Gio.DBus.session.call(
        busName, path, method === 'ListNames' ? 'org.freedesktop.DBus' : 'org.freedesktop.DBus.Introspectable',
        method, parameters, new GLib.VariantType(reply), Gio.DBusCallFlags.NONE, CALL_TIMEOUT_MS, null,
    );
}

async function listUniqueNames(): Promise<string[]> {
    const result = await call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'ListNames', null, '(as)');
    const [names] = result.deepUnpack() as [string[]];
    return names.filter(name => name.startsWith(':'));
}

async function introspect(busName: string, path: string): Promise<Gio.DBusNodeInfo | null> {
    try {
        const result = await call(busName, path, 'Introspect', null, '(s)');
        const [xml] = result.deepUnpack() as [string];
        return Gio.DBusNodeInfo.new_for_xml(xml);
    } catch {
        return null;
    }
}

async function scanService(busName: string): Promise<string[]> {
    const matches: string[] = [];
    const visited = new Set<string>();
    const queue: Array<{path: string; depth: number}> = [
        {path: '/StatusNotifierItem', depth: 0},
        {path: '/', depth: 0},
    ];
    while (queue.length > 0 && visited.size < MAX_OBJECTS_PER_SERVICE) {
        const next = queue.shift();
        if (!next || visited.has(next.path) || next.depth > MAX_DEPTH)
            continue;
        visited.add(next.path);
        const info = await introspect(busName, next.path);
        if (!info)
            continue;
        if (info.lookup_interface(SNI_INTERFACE))
            matches.push(next.path);
        const base = next.path === '/' ? '' : next.path;
        for (const child of info.nodes) {
            if (child.path && !child.path.includes('/'))
                queue.push({path: `${base}/${child.path}`, depth: next.depth + 1});
        }
    }
    return [...new Set(matches)];
}

async function scan(): Promise<void> {
    const names = await listUniqueNames();
    const settled = await Promise.allSettled(names.map(async busName => ({
        busName,
        paths: await scanService(busName),
    })));
    for (const result of settled) {
        if (result.status !== 'fulfilled')
            continue;
        for (const objectPath of result.value.paths)
            print(JSON.stringify({busName: result.value.busName, objectPath}));
    }
}

const loop = new GLib.MainLoop(null, false);
let exitCode = 0;
void scan().catch(error => {
    console.error(`Real Tray scanner: ${String(error)}`);
    exitCode = 1;
}).finally(() => loop.quit());
loop.run();
imports.system.exit(exitCode);
