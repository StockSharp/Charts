// Indicator Dialog — Bootstrap modal for adding/configuring indicators
import { T } from './i18n.js';

declare const bootstrap: any;
import { TerminalUtils } from './utils.js';
import { IndicatorSettings } from './indicators/indicator-settings.js';

export class IndicatorDialog {
    _modalEl: HTMLElement | null;
    _modal: any;
    _indicatorEngine: any;
    _searchInput: HTMLInputElement | null;
    _listEl: HTMLElement | null;
    _settingsEl: HTMLElement | null;
    _activeListEl: HTMLElement | null;
    _selectedType: string | null;
    // When opened from a sub-pane's ＋ button, the id of the pane new indicators
    // should be placed into; null = automatic placement (overlay vs own pane).
    _targetPaneId: string | null;

    constructor() {
        this._modalEl = null;
        this._modal = null;
        this._indicatorEngine = null;
        this._searchInput = null;
        this._listEl = null;
        this._settingsEl = null;
        this._activeListEl = null;
        this._selectedType = null;
        this._targetPaneId = null;
    }

    init(modalId, indicatorEngine) {
        this._modalEl = document.getElementById(modalId);
        this._indicatorEngine = indicatorEngine;
        if (!this._modalEl) return;

        // Dependency-free modal (Bootstrap removed): a sentinel object plus the
        // close affordances Bootstrap used to supply from the .cshtml markup —
        // backdrop click, Esc, and any [data-close-modal] button.
        this._modal = { shown: false };
        this._modalEl.addEventListener('mousedown', (e) => { if (e.target === this._modalEl) this.hide(); });
        this._modalEl.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', () => this.hide()));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this._modal && this._modal.shown) this.hide(); });
        this._searchInput = this._modalEl.querySelector('.indicator-search-input') as HTMLInputElement | null;
        this._listEl = this._modalEl.querySelector('.indicator-list');
        this._settingsEl = this._modalEl.querySelector('.indicator-settings');
        this._activeListEl = this._modalEl.querySelector('.active-indicators-list');

        // Search
        if (this._searchInput) {
            this._searchInput.addEventListener('input', () => this._filterList());
        }

        // Category tabs
        this._modalEl.querySelectorAll('.indicator-category-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this._modalEl!.querySelectorAll('.indicator-category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this._filterList();
            });
        });

        this._renderList();
    }

    // Open the picker with a target pre-selected in the pane dropdown: an
    // existing pane id, or the sentinels '__new__' (a fresh pane) / '__main__'
    // (the main chart). show() clears the target, so set it after show().
    showForPane(paneId) {
        this.show();
        this._targetPaneId = paneId;
    }

    // Options for the target-pane <select>: a fresh pane, the main chart, or any
    // existing sub-pane (by its label). `selected` marks the default option.
    _paneOptionsHtml(selected) {
        const opts: Array<{ v: string; label: string }> = [
            { v: '__new__', label: T.t('New pane') },
            { v: '__main__', label: T.t('Main chart') },
        ];
        const panes = this._indicatorEngine?._paneManager?._panes;
        if (panes) {
            for (const [id, pane] of panes) opts.push({ v: id, label: pane.label || id });
        }
        return opts.map(o =>
            `<option value="${o.v}"${o.v === selected ? ' selected' : ''}>${o.label}</option>`).join('');
    }

    show() {
        if (!this._modal || !this._modalEl) return;
        this._renderList();
        this._renderActiveList();
        this._selectedType = null;
        this._targetPaneId = null;
        if (this._settingsEl) this._settingsEl.innerHTML = '';
        if (this._searchInput) this._searchInput.value = '';
        // Re-apply the category filter — _renderList repopulated the list with
        // everything visible, but the active tab may be stale from a previous open.
        this._filterList();
        this._modalEl.style.display = 'flex';
        this._modalEl.classList.add('show');
        this._modal.shown = true;
        if (this._searchInput) setTimeout(() => this._searchInput!.focus(), 100);
    }

    hide() {
        if (!this._modal || !this._modalEl) return;
        this._modalEl.style.display = 'none';
        this._modalEl.classList.remove('show');
        this._modal.shown = false;
    }

    _filterList() {
        const query = (this._searchInput?.value || '').toLowerCase();
        const activeTab = this._modalEl?.querySelector('.indicator-category-tab.active') as HTMLElement | null;
        const group = activeTab?.dataset.group || 'All';

        const items = this._listEl?.querySelectorAll('.indicator-list-item');
        if (!items) return;

        items.forEach((it: Element) => {
            const item = it as HTMLElement;
            const name = (item.dataset.name || '').toLowerCase();
            const itemGroup = item.dataset.group || '';
            const matchSearch = !query || name.includes(query);
            const matchGroup = group === 'All' || itemGroup === group;
            item.style.display = matchSearch && matchGroup ? '' : 'none';
        });
    }

    _renderList() {
        if (!this._listEl) return;
        const indicators = IndicatorSettings.getAllIndicators();
        let html = '';

        for (const ind of indicators) {
            const fullNameT = T.t(ind.fullName);
            const groupT = T.t(ind.group);
            // data-name holds both the short code ("SMA") and the localized
            // full name ("Простое скользящее среднее") so the text filter hits
            // either — users type either the ticker or the translation.
            const searchKey = `${ind.name} ${ind.fullName} ${fullNameT}`;
            html += `<div class="indicator-list-item" data-id="${ind.id}" data-name="${searchKey}" data-group="${ind.group}">
                <div class="indicator-list-info">
                    <span class="indicator-list-name">${ind.name}</span>
                    <span class="indicator-list-fullname">${fullNameT}</span>
                </div>
                <span class="indicator-list-group">${groupT}</span>
            </div>`;
        }
        this._listEl.innerHTML = html;

        // Bind click
        this._listEl.querySelectorAll('.indicator-list-item').forEach((it: Element) => {
            const item = it as HTMLElement;
            item.addEventListener('click', () => {
                this._selectedType = item.dataset.id!;
                this._showSettings(item.dataset.id!);
            });
        });
    }

    _showSettings(typeId, editId?: any) {
        if (!this._settingsEl) return;
        const settings = IndicatorSettings.getIndicator(typeId);
        if (!settings) return;

        const isEdit = editId !== undefined;
        let currentParams = null;
        if (isEdit) {
            const entry = this._indicatorEngine.getIndicators().find(e => e.id === editId);
            if (entry) currentParams = entry.params;
        }

        const localizedName = T.t(settings.name);
        const settingsTitle = isEdit ? T.t('Edit {0}', localizedName) : localizedName;
        let html = `<div class="indicator-settings-title">${settingsTitle}</div>`;

        if (settings.params.length > 0) {
            html += '<div class="indicator-settings-params">';
            for (const p of settings.params as any[]) {
                const step = p.step || 1;
                const value = currentParams ? (currentParams[p.key] ?? p.default) : p.default;
                html += `<div class="indicator-param-row">
                    <label class="indicator-param-label">${T.t(p.label)}</label>
                    <input type="number" class="form-control form-control-sm indicator-param-input"
                           data-key="${p.key}" value="${value}" min="${p.min}" max="${p.max}" step="${step}" />
                </div>`;
            }
            html += '</div>';
        }

        if (isEdit) {
            html += `<button class="btn btn-sm btn-primary indicator-save-btn">${T.t('Save')}</button>`;
        } else {
            // Where the study goes. Default: the pane the picker was opened from,
            // else main chart for an overlay / a new pane for an oscillator.
            const def = this._targetPaneId || (settings.pane === 'overlay' ? '__main__' : '__new__');
            html += `<div class="indicator-param-row indicator-target-row">
                <label class="indicator-param-label">${T.t('Pane')}</label>
                <select class="indicator-target-select">${this._paneOptionsHtml(def)}</select>
            </div>`;
            html += `<button class="btn btn-sm btn-primary indicator-add-btn">${T.t('Add {0}', localizedName)}</button>`;
        }
        this._settingsEl.innerHTML = html;

        if (isEdit) {
            this._settingsEl.querySelector('.indicator-save-btn')!.addEventListener('click', () => {
                this._saveIndicator(editId);
            });
        } else {
            this._settingsEl.querySelector('.indicator-add-btn')!.addEventListener('click', () => {
                this._addIndicator(typeId);
            });
        }
    }

    _addIndicator(typeId) {
        if (!this._indicatorEngine || !this._settingsEl) return;

        const params: Record<string, number> = {};
        this._settingsEl.querySelectorAll('.indicator-param-input').forEach((inp: Element) => {
            const input = inp as HTMLInputElement;
            params[input.dataset.key!] = parseFloat(input.value);
        });

        const sel = this._settingsEl.querySelector('.indicator-target-select') as HTMLSelectElement | null;
        const target = sel ? sel.value : this._targetPaneId;
        this._indicatorEngine.add(typeId, params, target);
        this._renderActiveList();
        const addedSettings = IndicatorSettings.getIndicator(typeId);
        TerminalUtils.showToast(T.t('{0} added', T.t(addedSettings?.name || typeId)), 'success');
    }

    async _saveIndicator(editId) {
        if (!this._indicatorEngine || !this._settingsEl) return;

        const params: Record<string, number> = {};
        this._settingsEl.querySelectorAll('.indicator-param-input').forEach((inp: Element) => {
            const input = inp as HTMLInputElement;
            params[input.dataset.key!] = parseFloat(input.value);
        });

        // replaceParams drops the old sub and adds a fresh one with a new id —
        // await it so the dialog's active-list re-render sees the new entry,
        // then re-open the settings panel on the replacement so users see the
        // updated value stick rather than a blank panel.
        await this._indicatorEngine.replaceParams(editId, params);
        this._renderActiveList();

        const type = this._indicatorEngine.getIndicators()
            .slice(-1)[0]?.type; // freshest entry is our replacement
        if (type) this._showSettings(type, this._indicatorEngine.getIndicators().slice(-1)[0].id);

        TerminalUtils.showToast(T.t('Indicator updated'), 'success');
    }

    _renderActiveList() {
        if (!this._activeListEl || !this._indicatorEngine) return;
        const indicators = this._indicatorEngine.getIndicators();

        if (indicators.length === 0) {
            this._activeListEl.innerHTML = `<div class="no-indicators">${T.t('No active indicators')}</div>`;
            return;
        }

        let html = '';
        for (const ind of indicators) {
            const settings = IndicatorSettings.getIndicator(ind.type);
            const paramStr = Object.values(ind.params).join(', ');
            html += `<div class="active-indicator-item">
                <span class="active-indicator-name">${T.t(settings?.name || ind.type)} (${paramStr})</span>
                <div class="active-indicator-actions">
                    <button class="btn btn-sm btn-outline-primary active-indicator-edit" data-id="${ind.id}" data-type="${ind.type}" title="${T.t('Edit')}">&#9998;</button>
                    <button class="btn btn-sm btn-outline-danger active-indicator-remove" data-id="${ind.id}" title="${T.t('Remove')}">&times;</button>
                </div>
            </div>`;
        }
        this._activeListEl.innerHTML = html;

        // Bind edit
        this._activeListEl.querySelectorAll('.active-indicator-edit').forEach((b: Element) => {
            const btn = b as HTMLElement;
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id!);
                const type = btn.dataset.type!;
                this._showSettings(type, id);
            });
        });

        // Bind remove
        this._activeListEl.querySelectorAll('.active-indicator-remove').forEach((b: Element) => {
            const btn = b as HTMLElement;
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id!);
                this._indicatorEngine.remove(id);
                this._renderActiveList();
            });
        });
    }
}
