import type {IndicatorIdentity} from '../identity/indicatorIdentity.js';

export type IndicatorStatus = 'Passive' | 'Active' | 'NeedsAttention';
export type IconSource =
    | {kind: 'theme'; name: string}
    | {kind: 'file'; path: string}
    | {kind: 'pixmap'; width: number; height: number; bytes: Uint8Array};

export interface StatusNotifierItemModel {
    registrationKey: string;
    identity: IndicatorIdentity;
    busName: string;
    objectPath: string;
    title: string | null;
    status: IndicatorStatus;
    menuPath: string | null;
    itemIsMenu: boolean;
    icon: IconSource | null;
    attentionIcon: IconSource | null;
    overlayIcon: IconSource | null;
}

export interface IndicatorViewModel extends StatusNotifierItemModel {
    hidden: boolean;
    pinned: boolean;
    displayName: string;
    displayIcon: IconSource | null;
    ruleConflict: boolean;
}
