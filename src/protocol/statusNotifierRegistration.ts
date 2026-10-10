import {DEFAULT_ITEM_PATH} from './interfaces.js';

export interface Registration {
    key: string;
    busName: string;
    objectPath: string;
}

export type UniqueNameResolver = (busName: string) => Promise<string>;

export class StatusNotifierRegistrationIndex {
    #registrations: Map<string, Registration> | null = new Map();

    async add(service: string, sender: string, resolveUniqueName: UniqueNameResolver): Promise<Registration | null> {
        const isPath = service.startsWith('/');
        const requestedName = isPath ? sender : service;
        const busName = requestedName.startsWith(':')
            ? requestedName
            : await resolveUniqueName(requestedName);
        const objectPath = isPath ? service : DEFAULT_ITEM_PATH;
        const key = `${busName}${objectPath}`;

        if (!this.#registrations || this.#registrations.has(key))
            return null;

        const registration = {key, busName, objectPath};
        this.#registrations.set(key, registration);
        return registration;
    }

    remove(key: string): boolean {
        return this.#registrations?.delete(key) ?? false;
    }

    keys(): string[] {
        return this.#registrations ? [...this.#registrations.keys()] : [];
    }

    destroy(): void {
        this.#registrations?.clear();
        this.#registrations = null;
    }
}
