import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import type {IndicatorIdentity} from './identity/indicatorIdentity.js';
import {defaultMatcher, isValidMatcher, normalizeIdentity} from './identity/indicatorIdentity.js';
import type {IconOverride, IndicatorRule, RulesDocument} from './model/rules.js';
import {parseRules, resolveRule, serializeRules} from './model/rules.js';

interface ActiveInventoryItem extends IndicatorIdentity {
    title: string | null;
}

const MODES = ['Off', 'Overflow', 'Drop-down only'];
const LAYOUTS = ['Icon grid', 'Named rows'];
const PANEL_BOXES = ['Left', 'Center', 'Right'];
const BUTTON_POSITIONS = ['Before indicators', 'After indicators'];

function stringList(values: string[]): Gtk.StringList {
    return Gtk.StringList.new(values);
}

function parseInventory(value: string): ActiveInventoryItem[] {
    try {
        const raw: unknown = JSON.parse(value);
        if (!Array.isArray(raw))
            return [];
        return raw.flatMap(candidate => {
            if (!candidate || typeof candidate !== 'object')
                return [];
            const data = candidate as Record<string, unknown>;
            const identity = normalizeIdentity(data.desktopEntry, data.sniId);
            if (!isValidMatcher(identity))
                return [];
            return [{...identity, title: typeof data.title === 'string' ? data.title : null}];
        });
    } catch {
        return [];
    }
}

function createCombo(title: string, model: Gtk.StringList): Adw.ComboRow {
    return new Adw.ComboRow({title, model});
}

function bindEnum(settings: Gio.Settings, key: string, row: Adw.ComboRow): void {
    row.selected = settings.get_enum(key);
    row.connect('notify::selected', () => {
        settings.set_enum(key, row.selected);
    });
    settings.connect(`changed::${key}`, () => {
        const selected = settings.get_enum(key);
        if (row.selected !== selected)
            row.selected = selected;
    });
}

export default class RealTrayPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const settings = this.getSettings();
        window.set_default_size(720, 760);
        window.add(this.#behaviorPage(settings));
        window.add(this.#indicatorsPage(settings));
        await Promise.resolve();
    }

    #behaviorPage(settings: Gio.Settings): Adw.PreferencesPage {
        const page = new Adw.PreferencesPage({title: 'Behavior', icon_name: 'preferences-system-symbolic'});
        const tray = new Adw.PreferencesGroup({title: 'Tray behavior'});
        page.add(tray);

        const mode = createCombo('Mode', stringList(MODES));
        const layout = createCombo('Drop-down layout', stringList(LAYOUTS));
        bindEnum(settings, 'mode', mode);
        bindEnum(settings, 'tray-layout', layout);
        tray.add(mode);
        tray.add(layout);
        tray.add(this.#spin(settings, 'panel-limit', 'Panel item limit', 0, 100, 1));
        tray.add(this.#spin(settings, 'grid-columns', 'Grid columns', 5, 12, 1));
        tray.add(this.#spin(settings, 'grid-icon-size', 'Grid icon size', 16, 128, 1));
        const badge = new Adw.SwitchRow({title: 'Attention badge'});
        settings.bind('attention-badge', badge, 'active', Gio.SettingsBindFlags.DEFAULT);
        tray.add(badge);

        const panel = new Adw.PreferencesGroup({title: 'Panel'});
        page.add(panel);
        const box = createCombo('Panel section', stringList(PANEL_BOXES));
        const buttonPosition = createCombo('Tray button position', stringList(BUTTON_POSITIONS));
        bindEnum(settings, 'panel-box', box);
        bindEnum(settings, 'tray-button-position', buttonPosition);
        panel.add(box);
        panel.add(buttonPosition);
        const compact = new Adw.SwitchRow({
            title: 'Compact panel spacing',
            subtitle: 'Match AppIndicator compact spacing between panel icons',
        });
        settings.bind('compact-mode', compact, 'active', Gio.SettingsBindFlags.DEFAULT);
        panel.add(compact);
        panel.add(this.#spin(settings, 'icon-size', 'Panel icon size', 12, 96, 1));
        panel.add(this.#spin(settings, 'tray-icon-size', 'Tray button size', 12, 96, 1));
        const trayIcon = new Adw.EntryRow({
            title: 'Tray button icon',
            text: settings.get_string('tray-button-icon'),
        });
        trayIcon.connect('changed', () => {
            settings.set_string('tray-button-icon', trayIcon.text.trim());
        });
        settings.connect('changed::tray-button-icon', () => {
            const value = settings.get_string('tray-button-icon');
            if (trayIcon.text !== value)
                trayIcon.text = value;
        });
        panel.add(trayIcon);
        return page;
    }

    #spin(settings: Gio.Settings, key: string, title: string, lower: number, upper: number, step: number): Adw.SpinRow {
        const digits = step < 1 ? Math.max(1, Math.ceil(-Math.log10(step))) : 0;
        const row = new Adw.SpinRow({
            title,
            digits,
            adjustment: new Gtk.Adjustment({
                lower,
                upper,
                step_increment: step,
                page_increment: step * 10,
            }),
        });
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    #indicatorsPage(settings: Gio.Settings): Adw.PreferencesPage {
        const page = new Adw.PreferencesPage({title: 'Indicators', icon_name: 'view-grid-symbolic'});
        const document = parseRules(settings.get_string('rules-json'));
        const active = parseInventory(settings.get_string('active-items-json'));
        const represented = new Set<string>();
        const activeGroup = new Adw.PreferencesGroup({title: 'Active indicators'});
        page.add(activeGroup);
        for (const item of active) {
            const resolution = resolveRule(document, item);
            const ruleId = resolution.ruleId ?? GLib.uuid_string_random();
            const rule = resolution.rule ?? this.#defaultRule(item);
            represented.add(ruleId);
            activeGroup.add(this.#ruleRow(
                settings, document, ruleId, rule, item.title ?? 'Indicator', true, item,
                resolution.ruleId !== null,
            ));
        }
        if (active.length === 0)
            activeGroup.add(new Adw.ActionRow({title: 'No active indicators'}));

        const inactiveGroup = new Adw.PreferencesGroup({title: 'Modified inactive indicators'});
        page.add(inactiveGroup);
        for (const [ruleId, rule] of Object.entries(document.rules)) {
            if (represented.has(ruleId))
                continue;
            inactiveGroup.add(this.#ruleRow(
                settings, document, ruleId, rule,
                rule.nameOverride ?? rule.matcher.desktopEntry ?? rule.matcher.sniId ?? 'Indicator',
                false, null, true,
            ));
        }
        return page;
    }

    #defaultRule(identity: IndicatorIdentity): IndicatorRule {
        const matcher = defaultMatcher(identity);
        return {matcher, hidden: false, pinned: false, nameOverride: null, iconOverride: null};
    }

    #ruleRow(
        settings: Gio.Settings, document: RulesDocument, ruleId: string,
        initial: IndicatorRule, title: string, active: boolean,
        resetIdentity: IndicatorIdentity | null, initiallyModified: boolean,
    ): Adw.ExpanderRow {
        let rule = initial;
        let resetting = false;
        const row = new Adw.ExpanderRow({title, subtitle: active ? 'Active now' : 'Inactive'});
        const desktop = new Adw.EntryRow({title: 'DesktopEntry', text: rule.matcher.desktopEntry ?? ''});
        const sniId = new Adw.EntryRow({title: 'SNI ID', text: rule.matcher.sniId ?? ''});
        const name = new Adw.EntryRow({title: 'Display name', text: rule.nameOverride ?? ''});
        const icon = new Adw.EntryRow({
            title: 'Icon override',
            text: rule.iconOverride?.kind === 'theme' ? `theme:${rule.iconOverride.name}` : rule.iconOverride?.path ?? '',
        });
        const hidden = new Adw.SwitchRow({title: 'Hidden', active: rule.hidden});
        const pinned = new Adw.SwitchRow({title: 'Pinned to panel', active: rule.pinned});
        const save = (): void => {
            if (resetting)
                return;
            const matcher = normalizeIdentity(desktop.text, sniId.text);
            if (!isValidMatcher(matcher)) {
                row.subtitle = 'DesktopEntry and SNI ID cannot both be blank';
                return;
            }
            const iconOverride = this.#parseIcon(icon.text);
            rule = {
                matcher, hidden: hidden.active, pinned: pinned.active,
                nameOverride: name.text.trim() || null, iconOverride,
            };
            document.rules[ruleId] = rule;
            settings.set_string('rules-json', serializeRules(document));
            row.subtitle = active ? 'Active now' : 'Inactive';
        };
        for (const entry of [desktop, sniId, name, icon])
            entry.connect('changed', save);
        hidden.connect('notify::active', save);
        pinned.connect('notify::active', save);
        row.add_row(desktop);
        row.add_row(sniId);
        row.add_row(name);
        row.add_row(icon);
        row.add_row(hidden);
        row.add_row(pinned);
        const reset = new Gtk.Button({
            label: active ? 'Reset changes' : 'Forget',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
            visible: initiallyModified,
        });
        const revealReset = (): void => {
            reset.visible = true;
        };
        for (const entry of [desktop, sniId, name, icon])
            entry.connect('changed', revealReset);
        hidden.connect('notify::active', revealReset);
        pinned.connect('notify::active', revealReset);
        reset.connect('clicked', () => {
            resetting = true;
            Reflect.deleteProperty(document.rules, ruleId);
            settings.set_string('rules-json', serializeRules(document));
            if (active && resetIdentity) {
                rule = this.#defaultRule(resetIdentity);
                desktop.text = rule.matcher.desktopEntry ?? '';
                sniId.text = rule.matcher.sniId ?? '';
                name.text = '';
                icon.text = '';
                hidden.active = false;
                pinned.active = false;
                row.subtitle = 'Active now';
                reset.visible = false;
            } else {
                row.visible = false;
            }
            resetting = false;
        });
        row.add_suffix(reset);
        return row;
    }

    #parseIcon(value: string): IconOverride | null {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        if (trimmed.startsWith('theme:') && trimmed.length > 6)
            return {kind: 'theme', name: trimmed.slice(6)};
        if (trimmed.startsWith('/') && /\.(png|svg)$/i.test(trimmed))
            return {kind: 'file', path: trimmed};
        return null;
    }
}
