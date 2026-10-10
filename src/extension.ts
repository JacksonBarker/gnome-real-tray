import Gio from 'gi://Gio';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type {IndicatorViewModel} from './model/indicator.js';
import {clearIconCache} from './icons/iconResolver.js';
import {calculatePlacement} from './placement/placementPolicy.js';
import {getMode, getPanelBox} from './settings/settings.js';
import {RulesStore} from './settings/rulesStore.js';
import {StatusNotifierWatcherService} from './protocol/statusNotifierWatcher.js';
import {ItemRegistry} from './registry/itemRegistry.js';
import {PanelItem} from './ui/panelItem.js';
import {TrayButton} from './ui/trayButton.js';

export default class RealTrayExtension extends Extension {
    #settings: Gio.Settings | null = null;
    #watcher: StatusNotifierWatcherService | null = null;
    #registry: ItemRegistry | null = null;
    #rulesStore: RulesStore | null = null;
    #panelItems: PanelItem[] = [];
    #trayButton: TrayButton | null = null;
    #settingsSignal = 0;
    #disconnectors: Array<() => void> = [];

    enable(): void {
        this.#settings = this.getSettings();
        this.#rulesStore = new RulesStore(this.#settings);
        this.#registry = new ItemRegistry(Gio.DBus.session, this.#rulesStore.load());
        this.#watcher = new StatusNotifierWatcherService();

        const disconnectRegistry = this.#registry.changed.connect(
            snapshot => this.#render(snapshot.views));
        const disconnectRegistered = this.#watcher.registered.connect(
            registration => void this.#registry?.add(registration));
        const disconnectUnregistered = this.#watcher.unregistered.connect(
            key => this.#registry?.remove(key));
        const disconnectConflict = this.#watcher.conflict.connect(() => {
            Main.notify(
                'Real Tray could not start',
                'Disable AppIndicator and KStatusNotifierItem Support; it already owns the tray service.',
            );
        });
        this.#disconnectors.push(
            disconnectRegistry, disconnectRegistered, disconnectUnregistered, disconnectConflict);
        this.#settingsSignal = this.#settings.connect('changed', (_settings, key) => {
            if (key === 'active-items-json')
                return;
            if (key === 'rules-json')
                this.#registry?.setRules(this.#rulesStore!.load());
            this.#render(this.#registry?.snapshot().views ?? []);
        });
        this.#watcher.start(`${this.path}/tools/busScanner.js`);
        this.#render([]);
    }

    disable(): void {
        if (this.#settings && this.#settingsSignal)
            this.#settings.disconnect(this.#settingsSignal);
        this.#settingsSignal = 0;
        for (const disconnect of this.#disconnectors)
            disconnect();
        this.#disconnectors = [];
        this.#clearActors();
        this.#watcher?.destroy();
        this.#watcher = null;
        this.#registry?.destroy();
        this.#registry = null;
        this.#rulesStore = null;
        this.#settings = null;
        clearIconCache();
    }

    #render(views: readonly IndicatorViewModel[]): void {
        if (!this.#settings || !this.#registry)
            return;
        const inventory = JSON.stringify(views.map(view => ({
            desktopEntry: view.identity.desktopEntry,
            sniId: view.identity.sniId,
            title: view.title,
        })));
        if (this.#settings.get_string('active-items-json') !== inventory)
            this.#settings.set_string('active-items-json', inventory);
        this.#clearActors();
        const placement = calculatePlacement(
            views, getMode(this.#settings), this.#settings.get_uint('panel-limit'),
        );
        const box = getPanelBox(this.#settings);
        const position = 0;
        const iconSize = this.#settings.get_uint('icon-size');
        const trayFirst = this.#settings.get_enum('tray-button-position') === 0;
        const compact = this.#settings.get_boolean('compact-mode');

        const addTray = (trayPosition: number): void => {
            if (!placement.showTrayButton)
                return;
            this.#trayButton = new TrayButton(
                this.#registry!, this.#settings!.get_uint('tray-icon-size'), compact,
                this.#settings!.get_string('tray-button-icon'),
            );
            const trayLayout = this.#settings!.get_enum('tray-layout') === 0 ? 'grid' : 'rows';
            const gridColumns = this.#settings!.get_uint('grid-columns');
            const gridIconSize = this.#settings!.get_uint('grid-icon-size');
            const attentionBadge = this.#settings!.get_boolean('attention-badge');
            this.#trayButton.update(
                placement.tray, trayLayout, gridColumns, gridIconSize, attentionBadge);
            Main.panel.addToStatusArea('real-tray', this.#trayButton.actor, trayPosition, box);
        };

        if (trayFirst)
            addTray(position);
        const panelStart = trayFirst && placement.showTrayButton ? position + 1 : position;
        placement.panel.forEach((view, index) => {
            const client = this.#registry!.getClient(view.registrationKey);
            if (!client)
                return;
            const item = new PanelItem(view, client, iconSize, compact);
            this.#panelItems.push(item);
            Main.panel.addToStatusArea(`real-tray-item-${index}`, item.actor, panelStart + index, box);
        });
        if (!trayFirst)
            addTray(position + placement.panel.length);
    }

    #clearActors(): void {
        for (const item of this.#panelItems)
            item.destroy();
        this.#panelItems = [];
        this.#trayButton?.destroy();
        this.#trayButton = null;
    }

}
