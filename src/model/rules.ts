import type {IndicatorIdentity, IndicatorMatcher} from '../identity/indicatorIdentity.js';
import {isValidMatcher, matcherSpecificity, matchesIdentity, normalizeIdentity} from '../identity/indicatorIdentity.js';

export type IconOverride = {kind: 'theme'; name: string} | {kind: 'file'; path: string};

export interface IndicatorRule {
    matcher: IndicatorMatcher;
    hidden: boolean;
    pinned: boolean;
    nameOverride: string | null;
    iconOverride: IconOverride | null;
}

export interface RulesDocument {
    version: 1;
    rules: Record<string, IndicatorRule>;
}

export interface RuleResolution {
    ruleId: string | null;
    rule: IndicatorRule | null;
    conflict: boolean;
}

export const EMPTY_RULES: RulesDocument = {version: 1, rules: {}};

function parseIcon(value: unknown): IconOverride | null {
    if (!value || typeof value !== 'object')
        return null;
    const candidate = value as Record<string, unknown>;
    if (candidate.kind === 'theme' && typeof candidate.name === 'string' && candidate.name.trim())
        return {kind: 'theme', name: candidate.name.trim()};
    if (candidate.kind === 'file' && typeof candidate.path === 'string' && candidate.path.startsWith('/'))
        return {kind: 'file', path: candidate.path};
    return null;
}

export function parseRules(json: string): RulesDocument {
    try {
        const root: unknown = JSON.parse(json);
        if (!root || typeof root !== 'object')
            return EMPTY_RULES;
        const object = root as Record<string, unknown>;
        if (object.version !== 1 || !object.rules || typeof object.rules !== 'object')
            return EMPTY_RULES;
        const rules: Record<string, IndicatorRule> = {};
        for (const [id, raw] of Object.entries(object.rules as Record<string, unknown>)) {
            if (!raw || typeof raw !== 'object')
                continue;
            const data = raw as Record<string, unknown>;
            const matchData = data.matcher && typeof data.matcher === 'object'
                ? data.matcher as Record<string, unknown> : {};
            const matcher = normalizeIdentity(matchData.desktopEntry, matchData.sniId);
            if (!isValidMatcher(matcher))
                continue;
            rules[id] = {
                matcher,
                hidden: data.hidden === true,
                pinned: data.pinned === true,
                nameOverride: typeof data.nameOverride === 'string' && data.nameOverride.trim()
                    ? data.nameOverride.trim() : null,
                iconOverride: parseIcon(data.iconOverride),
            };
        }
        return {version: 1, rules};
    } catch {
        return EMPTY_RULES;
    }
}

export function serializeRules(document: RulesDocument): string {
    return JSON.stringify(document);
}

export function resolveRule(document: RulesDocument, identity: IndicatorIdentity): RuleResolution {
    const candidates = Object.entries(document.rules)
        .filter(([, rule]) => matchesIdentity(rule.matcher, identity));
    if (candidates.length === 0)
        return {ruleId: null, rule: null, conflict: false};
    const bestSpecificity = Math.max(...candidates.map(([, rule]) => matcherSpecificity(rule.matcher)));
    const best = candidates.filter(([, rule]) => matcherSpecificity(rule.matcher) === bestSpecificity);
    if (best.length !== 1)
        return {ruleId: null, rule: null, conflict: true};
    const selected = best[0];
    if (!selected)
        return {ruleId: null, rule: null, conflict: false};
    return {ruleId: selected[0], rule: selected[1], conflict: false};
}
