export type Listener<T> = (value: T) => void;

export class Observable<T> {
    readonly #listeners = new Set<Listener<T>>();

    connect(listener: Listener<T>): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    emit(value: T): void {
        for (const listener of this.#listeners)
            listener(value);
    }

    clear(): void {
        this.#listeners.clear();
    }
}
