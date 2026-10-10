import Gio from 'gi://Gio';
import type {IndicatorViewModel} from '../model/indicator.js';
import type {RulesDocument} from '../model/rules.js';
import {resolveRule} from '../model/rules.js';
import {Observable} from '../util/events.js';
import {StatusNotifierItemClient} from '../protocol/statusNotifierItem.js';
import {validOverrideFile} from '../icons/iconResolver.js';
import type {Registration} from '../protocol/statusNotifierWatcher.js';

export interface RegistrySnapshot {
    clients: readonly StatusNotifierItemClient[];
    views: readonly IndicatorViewModel[];
}

export class ItemRegistry {
    readonly changed = new Observable<RegistrySnapshot>();
    readonly #clients = new Map<string, StatusNotifierItemClient>();
    readonly #clientDisconnectors = new Map<string, Array<() => void>>();
    #rules: RulesDocument;

    constructor(readonly connection: Gio.DBusConnection, rules: RulesDocument) {
        this.#rules = rules;
    }

    async add(registration: Registration): Promise<void> {
        if (this.#clients.has(registration.key))
            return;
        const client = new StatusNotifierItemClient(
            this.connection, registration.busName, registration.objectPath, registration.key,
        );
        this.#clients.set(registration.key, client);
        this.#clientDisconnectors.set(registration.key, [
            client.changed.connect(() => this.#emit()),
            client.removed.connect(() => this.remove(registration.key)),
        ]);
        try {
            await client.initialize();
            this.#emit();
        } catch (error) {
            console.warn(`Real Tray: could not initialize ${registration.key}: ${String(error)}`);
            this.remove(registration.key);
        }
    }

    remove(key: string): void {
        const client = this.#clients.get(key);
        if (!client)
            return;
        this.#disconnectClient(key);
        client.destroy();
        this.#clients.delete(key);
        this.#emit();
    }

    setRules(rules: RulesDocument): void {
        this.#rules = rules;
        this.#emit();
    }

    snapshot(): RegistrySnapshot {
        const clients = [...this.#clients.values()];
        return {clients, views: clients.map(client => this.#toView(client))};
    }

    getClient(key: string): StatusNotifierItemClient | null {
        return this.#clients.get(key) ?? null;
    }

    #toView(client: StatusNotifierItemClient): IndicatorViewModel {
        const model = client.model;
        const resolution = resolveRule(this.#rules, model.identity);
        const rule = resolution.rule;
        const fallbackName = model.title ?? model.identity.desktopEntry ?? model.identity.sniId ?? 'Indicator';
        return {
            ...model,
            hidden: rule?.hidden ?? false,
            pinned: rule?.pinned ?? false,
            displayName: rule?.nameOverride ?? fallbackName,
            displayIcon: rule?.iconOverride?.kind === 'file' && !validOverrideFile(rule.iconOverride.path)
                ? (model.status === 'NeedsAttention' ? model.attentionIcon ?? model.icon : model.icon)
                : rule?.iconOverride ??
                (model.status === 'NeedsAttention' ? model.attentionIcon ?? model.icon : model.icon),
            ruleConflict: resolution.conflict,
        };
    }

    #emit(): void {
        this.changed.emit(this.snapshot());
    }

    #disconnectClient(key: string): void {
        for (const disconnect of this.#clientDisconnectors.get(key) ?? [])
            disconnect();
        this.#clientDisconnectors.delete(key);
    }

    destroy(): void {
        for (const [key, client] of this.#clients) {
            this.#disconnectClient(key);
            client.destroy();
        }
        this.#clients.clear();
        this.changed.clear();
    }
}
