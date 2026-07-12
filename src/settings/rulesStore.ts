import Gio from 'gi://Gio';
import type {RulesDocument} from '../model/rules.js';
import {parseRules, serializeRules} from '../model/rules.js';

export class RulesStore {
    constructor(readonly settings: Gio.Settings) {}

    load(): RulesDocument {
        return parseRules(this.settings.get_string('rules-json'));
    }

    save(document: RulesDocument): void {
        this.settings.set_string('rules-json', serializeRules(document));
    }
}
