export type TrayMode = 'off' | 'overflow' | 'dropdown-only';

export interface PlaceableIndicator {
    registrationKey: string;
    status: 'Passive' | 'Active' | 'NeedsAttention';
    hidden: boolean;
    pinned: boolean;
}

export interface PlacementResult<T> {
    panel: T[];
    tray: T[];
    showTrayButton: boolean;
}

export function calculatePlacement<T extends PlaceableIndicator>(
    indicators: readonly T[], mode: TrayMode, panelLimit: number,
): PlacementResult<T> {
    const visible = indicators.filter(item => item.status !== 'Passive' && !item.hidden);
    if (mode === 'off')
        return {panel: visible, tray: [], showTrayButton: false};
    if (mode === 'dropdown-only')
        return {panel: [], tray: visible, showTrayButton: true};

    const pinned = visible.filter(item => item.pinned);
    const unpinned = visible.filter(item => !item.pinned);
    const openSlots = Math.max(0, Math.trunc(panelLimit) - pinned.length);
    const fill = unpinned.slice(0, openSlots);
    const panelKeys = new Set([...pinned, ...fill].map(item => item.registrationKey));
    const panel = visible.filter(item => panelKeys.has(item.registrationKey));
    const tray = visible.filter(item => !panelKeys.has(item.registrationKey));
    return {panel, tray, showTrayButton: tray.length > 0};
}
