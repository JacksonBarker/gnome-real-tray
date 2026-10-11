import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const {Variant, Cancellable, timers, watches} = vi.hoisted(() => {
    class Variant {
        constructor(readonly signature: string, readonly value: unknown) {}
        deepUnpack(): unknown { return this.value; }
    }
    class Cancellable {
        cancelled = false;
        cancel(): void { this.cancelled = true; }
        is_cancelled(): boolean { return this.cancelled; }
    }
    return {Variant, Cancellable, timers: new Map<number, () => void>(), watches: new Map<number, () => void>()};
});
vi.mock('gi://Gio', () => ({default: {
    Cancellable, DBusError: {UNKNOWN_METHOD: 1}, DBusCallFlags: {NONE: 0}, DBusSignalFlags: {NONE: 0}, BusNameWatcherFlags: {NONE: 0},
    bus_watch_name_on_connection: vi.fn((_connection, _bus, _flags, _appeared, vanished) => {
        const id = watches.size + 1;
        watches.set(id, vanished);
        return id;
    }),
    bus_unwatch_name: (id: number) => watches.delete(id),
}}));
vi.mock('gi://GLib', () => ({default: {
    Variant, VariantType: Variant, PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false,
    timeout_add: (_priority: number, _delay: number, callback: () => void) => {
        const id = Math.max(0, ...timers.keys()) + 1;
        timers.set(id, () => { timers.delete(id); callback(); });
        return id;
    },
    source_remove: (id: number) => timers.delete(id),
}}));
vi.mock('../../src/util/promisify.js', () => ({}));
vi.mock('../../src/icons/iconResolver.js', () => ({validOverrideFile: () => true}));

import type Gio from 'gi://Gio';
import {StatusNotifierItemClient} from '../../src/protocol/statusNotifierItem.js';
import {ItemRegistry} from '../../src/registry/itemRegistry.js';
import {EMPTY_RULES} from '../../src/model/rules.js';
import {StatusNotifierRegistrationIndex} from '../../src/protocol/statusNotifierRegistration.js';

function setup() {
    let ready = false;
    const subscriptions = new Map<number, {interface: string; callback: (...args: unknown[]) => void}>();
    const connection = {
        call: vi.fn(() => ready
            ? Promise.resolve(new Variant('', [{Id: new Variant('s', 'test'), Title: new Variant('s', 'Ready'),
                Status: new Variant('s', 'Active'), Menu: new Variant('o', '/NO_DBUSMENU')}]))
            : Promise.reject(new Error('Object not exported yet'))),
        signal_subscribe: vi.fn((_bus, iface, _signal, _path, _arg, _flags, callback) => {
            const id = subscriptions.size + 1;
            subscriptions.set(id, {interface: iface, callback});
            return id;
        }),
        signal_unsubscribe: (id: number) => subscriptions.delete(id),
    };
    const registry = new ItemRegistry(connection as unknown as Gio.DBusConnection, EMPTY_RULES);
    const registration = {key: ':1.42/StatusNotifierItem', busName: ':1.42', objectPath: '/StatusNotifierItem'};
    return {registry, registration, connection, subscriptions, ready: () => { ready = true; }};
}
async function tick() {
    const next = timers.values().next().value;
    next?.();
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { timers.clear(); watches.clear(); vi.restoreAllMocks(); });

describe('item initialization recovery', () => {
    it('retains the client and recovers automatically from a failed first property load', async () => {
        const test = setup();
        await test.registry.add(test.registration);
        const client = test.registry.getClient(test.registration.key);
        expect(client).not.toBeNull();
        expect(client!.model.status).toBe('Passive');
        expect(timers.size).toBe(1);
        test.ready();
        await tick();
        expect(test.registry.getClient(test.registration.key)).toBe(client);
        expect(test.registry.snapshot().views[0]!.displayName).toBe('Ready');
        expect(client!.model.menuPath).toBeNull();
        test.registry.destroy();
    });

    it('bounds retries but allows re-registration to recover without duplicating subscriptions', async () => {
        const test = setup();
        const index = new StatusNotifierRegistrationIndex();
        const registration = await index.add('/StatusNotifierItem', ':1.42', () => Promise.resolve(':1.42'));
        await test.registry.add(registration!);
        for (let i = 0; i < 4; i++) await tick();
        expect(test.connection.call).toHaveBeenCalledTimes(5);
        expect(timers.size).toBe(0);
        test.ready();
        const repeated = await index.add('/StatusNotifierItem', ':1.42', () => Promise.resolve(':1.42'), existing => {
            void test.registry.add(existing);
        });
        await tick();
        expect(repeated).toBeNull();
        expect(index.keys()).toHaveLength(1);
        expect(test.registry.snapshot().views[0]!.status).toBe('Active');
        expect(test.connection.signal_subscribe).toHaveBeenCalledTimes(2);
        test.registry.destroy();
    });

    it('can recover from a later item signal after retries are exhausted', async () => {
        const test = setup();
        await test.registry.add(test.registration);
        for (let i = 0; i < 4; i++) await tick();
        test.ready();
        test.subscriptions.get(2)!.callback();
        await tick();
        expect(test.registry.snapshot().views[0]!.status).toBe('Active');
        test.registry.destroy();
    });

    it('removes retries and subscriptions when the bus owner disappears', async () => {
        const test = setup();
        await test.registry.add(test.registration);
        watches.get(1)!();
        expect(timers.size).toBe(0);
        expect(test.subscriptions.size).toBe(0);
        expect(test.registry.snapshot().clients).toHaveLength(0);
        test.registry.destroy();
    });
});


describe('activation fallback', () => {
    function clientSetup() {
        const test = setup();
        const client = new StatusNotifierItemClient(test.connection as unknown as Gio.DBusConnection,
            test.registration.busName, test.registration.objectPath, test.registration.key);
        return {...test, client};
    }

    it('uses the menu fallback on UnknownMethod and remembers that activation is unavailable', async () => {
        const test = clientSetup();
        test.connection.call.mockRejectedValueOnce({matches: (_domain: unknown, code: number) => code === 1});
        const fallback = vi.fn();
        test.client.call('Activate', 12, 34, fallback);
        await tick();
        expect(fallback).toHaveBeenCalledOnce();
        test.client.call('Activate', 12, 34, fallback);
        expect(fallback).toHaveBeenCalledTimes(2);
        expect(test.connection.call).toHaveBeenCalledOnce();
        test.client.destroy();
    });

    it('does not replace working activation or unrelated failures with a menu', async () => {
        const test = clientSetup();
        const fallback = vi.fn();
        test.connection.call.mockResolvedValueOnce(new Variant('', []));
        test.client.call('Activate', 12, 34, fallback);
        await tick();
        test.connection.call.mockRejectedValueOnce({matches: () => false});
        test.client.call('Activate', 12, 34, fallback);
        await tick();
        expect(fallback).not.toHaveBeenCalled();
        expect(test.connection.call).toHaveBeenCalledTimes(2);
        test.client.destroy();
    });

    it('does not open a fallback menu after the indicator is destroyed', async () => {
        const test = clientSetup();
        const fallback = vi.fn();
        test.connection.call.mockRejectedValueOnce({matches: () => true});
        test.client.call('Activate', 12, 34, fallback);
        test.client.destroy();
        await tick();
        expect(fallback).not.toHaveBeenCalled();
        test.client.call('Activate', 12, 34, fallback);
        expect(test.connection.call).toHaveBeenCalledOnce();
    });
});
