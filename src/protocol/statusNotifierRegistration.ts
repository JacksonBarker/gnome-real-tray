import {DEFAULT_ITEM_PATH} from './interfaces.js';

export interface Registration {
    key: string;
    busName: string;
    objectPath: string;
}

export type UniqueNameResolver = (busName: string) => Promise<string>;

export class StatusNotifierRegistrationIndex {
    readonly #registrations = new Map<string, Registration>();
    #active = true;

    async add(service: string, sender: string, resolveUniqueName: UniqueNameResolver): Promise<Registration | null> {
        const isPath = service.startsWith('/');
        const requestedName = isPath ? sender : service;
        const busName = requestedName.startsWith(':')
            ? requestedName
            : await resolveUniqueName(requestedName);
        const objectPath = isPath ? service : DEFAULT_ITEM_PATH;
        const key = `${busName}${objectPath}`;

        if (!this.#active || this.#registrations.has(key))
            return null;

        const registration = {key, busName, objectPath};
        this.#registrations.set(key, registration);
        return registration;
    }

    remove(key: string): boolean {
        return this.#registrations.delete(key);
    }

    keys(): string[] {
        return [...this.#registrations.keys()];
    }

    destroy(): void {
        this.#active = false;
        this.#registrations.clear();
    }
}
