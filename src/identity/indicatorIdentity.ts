export interface IndicatorIdentity {
    desktopEntry: string | null;
    sniId: string | null;
}

export type IndicatorMatcher = IndicatorIdentity;

export function normalizeDesktopEntry(value: unknown): string | null {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    return trimmed.endsWith('.desktop') ? trimmed.slice(0, -8) : trimmed;
}

export function normalizeSniId(value: unknown): string | null {
    if (typeof value !== 'string')
        return null;
    return value.trim() || null;
}

export function normalizeIdentity(desktopEntry: unknown, sniId: unknown): IndicatorIdentity {
    return {desktopEntry: normalizeDesktopEntry(desktopEntry), sniId: normalizeSniId(sniId)};
}

export function isValidMatcher(matcher: IndicatorMatcher): boolean {
    return matcher.desktopEntry !== null || matcher.sniId !== null;
}

export function defaultMatcher(identity: IndicatorIdentity): IndicatorMatcher {
    return identity.desktopEntry !== null
        ? {desktopEntry: identity.desktopEntry, sniId: null}
        : {desktopEntry: null, sniId: identity.sniId};
}

export function matcherSpecificity(matcher: IndicatorMatcher): number {
    return Number(matcher.desktopEntry !== null) + Number(matcher.sniId !== null);
}

export function matchesIdentity(matcher: IndicatorMatcher, identity: IndicatorIdentity): boolean {
    if (!isValidMatcher(matcher))
        return false;
    return (matcher.desktopEntry === null || matcher.desktopEntry === identity.desktopEntry) &&
        (matcher.sniId === null || matcher.sniId === identity.sniId);
}
