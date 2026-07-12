export interface DiscoveredIndicator {
    busName: string;
    objectPath: string;
}

const UNIQUE_BUS_NAME = /^:[0-9]+\.[0-9]+$/;
const OBJECT_PATH = /^\/(?:[A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*)?$/;

export function parseDiscoveryOutput(output: string): DiscoveredIndicator[] {
    const seen = new Set<string>();
    const discoveries: DiscoveredIndicator[] = [];
    for (const line of output.split('\n')) {
        if (!line.trim())
            continue;
        try {
            const value: unknown = JSON.parse(line);
            if (!value || typeof value !== 'object')
                continue;
            const candidate = value as Record<string, unknown>;
            if (typeof candidate.busName !== 'string' || !UNIQUE_BUS_NAME.test(candidate.busName))
                continue;
            if (typeof candidate.objectPath !== 'string' || !OBJECT_PATH.test(candidate.objectPath))
                continue;
            const key = `${candidate.busName}${candidate.objectPath}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            discoveries.push({busName: candidate.busName, objectPath: candidate.objectPath});
        } catch {
            // A broken service or scanner diagnostic must not abort other results.
        }
    }
    return discoveries;
}
