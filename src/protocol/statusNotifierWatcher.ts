import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Observable} from '../util/events.js';
import {DEFAULT_ITEM_PATH, WATCHER_BUS_NAME, WATCHER_OBJECT_PATH, WATCHER_XML} from './interfaces.js';
import {parseDiscoveryOutput} from './discovery.js';
import '../util/promisify.js';

export interface Registration {
    key: string;
    busName: string;
    objectPath: string;
}

interface WatcherImplementation {
    RegisteredStatusNotifierItems: string[];
    IsStatusNotifierHostRegistered: boolean;
    ProtocolVersion: number;
    RegisterStatusNotifierItemAsync(parameters: [string], invocation: Gio.DBusMethodInvocation): void;
    RegisterStatusNotifierHostAsync(parameters: [string], invocation: Gio.DBusMethodInvocation): void;
}

export class StatusNotifierWatcherService {
    readonly registered = new Observable<Registration>();
    readonly unregistered = new Observable<string>();
    readonly conflict = new Observable<void>();
    readonly #registrations = new Map<string, Registration>();
    readonly #watches = new Map<string, number>();
    #ownerId = 0;
    #exported: Gio.DBusExportedObject | null = null;
    #connection: Gio.DBusConnection | null = null;
    #implementation: WatcherImplementation | null = null;
    #acquired = false;
    #scannerPath: string | null = null;
    #scanTimer = 0;
    #scanner: Gio.Subprocess | null = null;
    #scanCancellable = new Gio.Cancellable();

    start(scannerPath: string): void {
        this.#scannerPath = scannerPath;
        this.#ownerId = Gio.bus_own_name(
            Gio.BusType.SESSION, WATCHER_BUS_NAME, Gio.BusNameOwnerFlags.NONE,
            connection => this.#onBusAcquired(connection),
            () => {
                this.#acquired = true;
                this.#scheduleDiscovery();
            },
            () => { if (!this.#acquired) this.conflict.emit(); },
        );
    }

    #scheduleDiscovery(): void {
        if (!this.#scannerPath || this.#scanTimer)
            return;
        this.#scanTimer = GLib.timeout_add(GLib.PRIORITY_LOW, 2000, () => {
            this.#scanTimer = 0;
            void this.#discoverExistingItems();
            return GLib.SOURCE_REMOVE;
        });
    }

    async #discoverExistingItems(): Promise<void> {
        if (!this.#scannerPath || this.#scanCancellable.is_cancelled())
            return;
        try {
            this.#scanner = Gio.Subprocess.new(
                ['gjs', '-m', this.#scannerPath],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            );
            const [stdout, stderr] = await this.#scanner.communicate_utf8_async(null, this.#scanCancellable);
            if (!this.#scanner.get_successful()) {
                console.warn(`Real Tray: indicator discovery failed: ${stderr.trim()}`);
                return;
            }
            for (const discovery of parseDiscoveryOutput(stdout))
                this.#register(discovery.objectPath, discovery.busName);
        } catch (error) {
            if (!this.#scanCancellable.is_cancelled())
                console.warn(`Real Tray: indicator discovery failed: ${String(error)}`);
        } finally {
            this.#scanner = null;
        }
    }

    #onBusAcquired(connection: Gio.DBusConnection): void {
        this.#connection = connection;
        const implementation: WatcherImplementation = {
            RegisteredStatusNotifierItems: [], IsStatusNotifierHostRegistered: true, ProtocolVersion: 0,
            RegisterStatusNotifierItemAsync: (parameters, invocation) => {
                const [service] = parameters;
                this.#register(service, invocation.get_sender() ?? '');
                invocation.return_value(null);
            },
            RegisterStatusNotifierHostAsync: (_parameters, invocation) => invocation.return_value(null),
        };
        this.#implementation = implementation;
        this.#exported = Gio.DBusExportedObject.wrapJSObject(WATCHER_XML, implementation);
        this.#exported.export(connection, WATCHER_OBJECT_PATH);
    }

    #register(service: string, sender: string): void {
        const isPath = service.startsWith('/');
        const busName = isPath ? sender : service;
        const objectPath = isPath ? service : DEFAULT_ITEM_PATH;
        const key = `${busName}${objectPath}`;
        if (this.#registrations.has(key))
            return;
        const registration = {key, busName, objectPath};
        this.#registrations.set(key, registration);
        const watch = Gio.bus_watch_name_on_connection(
            this.#connection!, busName, Gio.BusNameWatcherFlags.NONE,
            () => undefined, () => this.#remove(key),
        );
        this.#watches.set(key, watch);
        this.#syncProperties();
        this.#exported?.emit_signal('StatusNotifierItemRegistered', new GLib.Variant('(s)', [key]));
        this.registered.emit(registration);
    }

    #remove(key: string): void {
        if (!this.#registrations.delete(key))
            return;
        const watch = this.#watches.get(key);
        if (watch)
            Gio.bus_unwatch_name(watch);
        this.#watches.delete(key);
        this.#syncProperties();
        this.#exported?.emit_signal('StatusNotifierItemUnregistered', new GLib.Variant('(s)', [key]));
        this.unregistered.emit(key);
    }

    #syncProperties(): void {
        const items = [...this.#registrations.keys()];
        if (this.#implementation)
            this.#implementation.RegisteredStatusNotifierItems = items;
        this.#exported?.emit_property_changed('RegisteredStatusNotifierItems', new GLib.Variant('as', items));
    }

    destroy(): void {
        if (this.#scanTimer)
            GLib.source_remove(this.#scanTimer);
        this.#scanTimer = 0;
        this.#scanCancellable.cancel();
        this.#scanner?.force_exit();
        this.#scanner = null;
        for (const watch of this.#watches.values())
            Gio.bus_unwatch_name(watch);
        this.#watches.clear();
        this.#registrations.clear();
        this.#exported?.unexport();
        this.#exported = null;
        this.#implementation = null;
        if (this.#ownerId)
            Gio.bus_unown_name(this.#ownerId);
        this.#ownerId = 0;
        this.#scannerPath = null;
        this.registered.clear();
        this.unregistered.clear();
        this.conflict.clear();
    }
}
