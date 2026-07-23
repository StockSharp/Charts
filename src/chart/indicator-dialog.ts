import { T } from './i18n.js';
import { TerminalUtils } from './utils.js';
import { IndicatorSettings } from './indicators/indicator-settings.js';
import { humanize } from './indicators/calc/index.js';
import {
    IndicatorCandleField,
    IndicatorSourceKind,
    type IndicatorParameterValue,
    type IndicatorOutputStylePatch,
    type IndicatorSource,
} from '../indicators/index.js';
import type {
    IndicatorController,
    IndicatorControllerSnapshot,
    IndicatorUpdatePatch,
} from '../workspace/indicator-controller.js';
import {
    IndicatorCatalogController,
    type IndicatorCatalogListener,
    type IndicatorFavoritesStorage,
} from '../workspace/indicator-catalog-controller.js';
import {
    IndicatorTemplateController,
    type IndicatorTemplateListener,
} from '../workspace/templates.js';

const FAVORITES_GROUP = '__favorites__';

const CANDLE_FIELDS = [
    [IndicatorCandleField.Open, 'Open'],
    [IndicatorCandleField.High, 'High'],
    [IndicatorCandleField.Low, 'Low'],
    [IndicatorCandleField.Close, 'Close'],
    [IndicatorCandleField.Median, 'HL2'],
    [IndicatorCandleField.Typical, 'HLC3'],
    [IndicatorCandleField.Average, 'OHLC4'],
    [IndicatorCandleField.Volume, 'Volume'],
] as const;

const LINE_STYLES = [
    [0, 'Solid'],
    [1, 'Dotted'],
    [2, 'Dashed'],
    [3, 'Large dashed'],
    [4, 'Sparse dotted'],
] as const;

/** Trading-workspace indicator picker and complete editor over IndicatorController. */
export class IndicatorDialog {
    private modalEl: HTMLElement | null = null;
    private indicatorEngine: any = null;
    private controller: IndicatorController | null = null;
    private catalog: IndicatorCatalogController | null = null;
    private templates: IndicatorTemplateController | null = null;
    private chart: any = null;
    private searchInput: HTMLInputElement | null = null;
    private listEl: HTMLElement | null = null;
    private settingsEl: HTMLElement | null = null;
    private activeListEl: HTMLElement | null = null;
    private selectedType: string | null = null;
    private targetPaneId: string | null = null;
    private editingId: string | null = null;
    private editingSnapshot: IndicatorControllerSnapshot | null = null;
    private shown = false;
    private events: AbortController | null = null;

    private readonly handleControllerChange = (): void => {
        if (!this.shown) return;
        this.renderActiveList();
    };
    private readonly handleCatalogChange: IndicatorCatalogListener = (): void => {
        if (!this.shown) return;
        this.renderList();
    };
    private readonly handleTemplateChange: IndicatorTemplateListener = (): void => {
        if (!this.shown || !this.editingSnapshot) return;
        this.refreshTemplateSelect(this.editingSnapshot.type);
    };

    init(
        modalId: string,
        indicatorEngine: any,
        controller: IndicatorController,
        chart: any,
        catalog?: IndicatorCatalogController,
        templates?: IndicatorTemplateController,
    ): void {
        this.dispose();
        this.modalEl = document.getElementById(modalId);
        this.indicatorEngine = indicatorEngine;
        this.controller = controller;
        this.catalog = catalog ?? createIndicatorCatalogController();
        this.templates = templates ?? new IndicatorTemplateController({ indicators: controller });
        this.chart = chart;
        if (!this.modalEl) return;
        if (!controller || typeof controller.indicators !== 'function'
            || typeof controller.update !== 'function') {
            throw new TypeError('sschart: indicator dialog controller is invalid');
        }
        this.searchInput = this.modalEl.querySelector('.indicator-search-input');
        this.listEl = this.modalEl.querySelector('.indicator-list');
        this.settingsEl = this.modalEl.querySelector('.indicator-settings');
        this.activeListEl = this.modalEl.querySelector('.active-indicators-list');
        this.renderCategoryTabs();
        this.events = new AbortController();
        const signal = this.events.signal;

        this.modalEl.addEventListener('mousedown', (event) => {
            if (event.target === this.modalEl) this.hide();
        }, { signal });
        this.modalEl.querySelectorAll('[data-close-modal]').forEach(button => (
            button.addEventListener('click', () => this.hide(), { signal })
        ));
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.shown) this.hide();
        }, { signal });
        this.searchInput?.addEventListener('input', () => this.filterList(), { signal });
        this.modalEl.querySelectorAll('.indicator-category-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.modalEl!.querySelectorAll('.indicator-category-tab')
                    .forEach(item => item.classList.remove('active'));
                tab.classList.add('active');
                this.filterList();
            }, { signal });
        });
        this.controller.subscribe(this.handleControllerChange);
        this.catalog.subscribe(this.handleCatalogChange);
        this.templates.subscribe(this.handleTemplateChange);
        this.renderList();
    }

    show(): void {
        if (!this.modalEl) return;
        this.renderActiveList();
        this.selectedType = null;
        this.targetPaneId = null;
        this.editingId = null;
        this.editingSnapshot = null;
        if (this.settingsEl) {
            this.settingsEl.innerHTML = `<div class="indicator-editor-empty">${html(
                T.t('Select an indicator from the list'),
            )}</div>`;
        }
        if (this.searchInput) this.searchInput.value = '';
        this.modalEl.querySelectorAll('.indicator-category-tab').forEach(tab => (
            tab.classList.toggle('active', (tab as HTMLElement).dataset.group === 'All')
        ));
        this.renderList();
        this.modalEl.style.display = 'flex';
        this.modalEl.classList.add('show');
        this.shown = true;
        if (this.searchInput) setTimeout(() => this.searchInput?.focus(), 100);
    }

    showForPane(paneId: string): void {
        this.show();
        this.targetPaneId = paneId;
    }

    showEdit(id: string | number): void {
        this.show();
        const snapshot = this.resolveSnapshot(id);
        if (snapshot) this.renderEditor(snapshot);
    }

    hide(): void {
        if (!this.modalEl) return;
        this.modalEl.style.display = 'none';
        this.modalEl.classList.remove('show');
        this.shown = false;
    }

    dispose(): void {
        this.events?.abort();
        this.events = null;
        this.controller?.unsubscribe(this.handleControllerChange);
        this.catalog?.unsubscribe(this.handleCatalogChange);
        this.templates?.unsubscribe(this.handleTemplateChange);
        this.controller = null;
        this.catalog = null;
        this.templates = null;
        this.shown = false;
    }

    /** Compatibility hook retained for terminal hosts that opened the old editor directly. */
    _showSettings(typeId: string, editId?: string | number): void {
        if (editId !== undefined) {
            const snapshot = this.resolveSnapshot(editId);
            if (snapshot) this.renderEditor(snapshot);
            return;
        }
        this.renderAddSettings(typeId);
    }

    private filterList(): void {
        this.renderList();
    }

    private renderCategoryTabs(): void {
        const tabs = this.modalEl?.querySelector('.indicator-category-tabs');
        if (!tabs) return;
        const groups = IndicatorSettings.GROUPS as readonly string[];
        const categories = [
            ['All', T.t('All')],
            [FAVORITES_GROUP, T.t('Favorites')],
            ...groups.map(group => [group, T.t(group)]),
        ] as const;
        tabs.innerHTML = categories
            .map(([group, label], index) => {
                return `<button type="button" class="indicator-category-tab${
                    index === 0 ? ' active' : ''
                }" data-group="${attr(group)}">${html(label)}</button>`;
            }).join('');
    }

    private renderList(): void {
        if (!this.listEl || !this.catalog) return;
        const activeTab = this.modalEl?.querySelector(
            '.indicator-category-tab.active',
        ) as HTMLElement | null;
        const group = activeTab?.dataset.group || 'All';
        const entries = this.catalog.search({
            text: this.searchInput?.value || '',
            category: group === 'All' || group === FAVORITES_GROUP ? undefined : group,
            favoritesOnly: group === FAVORITES_GROUP,
        });
        const indicators = entries.map(entry => IndicatorSettings.getIndicator(entry.id))
            .filter(indicator => indicator !== null);
        if (indicators.length === 0) {
            this.listEl.innerHTML = `<div class="indicator-list-empty">${html(T.t(
                group === FAVORITES_GROUP ? 'No favorite indicators' : 'No indicators found',
            ))}</div>`;
            return;
        }
        this.listEl.innerHTML = indicators.map((indicator) => {
            const translatedFullName = T.t(indicator.fullName);
            const favorite = this.catalog!.isFavorite(indicator.id);
            return `<div class="indicator-list-item" data-id="${attr(indicator.id)}">
                <button type="button" class="indicator-favorite-toggle${
                    favorite ? ' is-favorite' : ''
                }" aria-pressed="${favorite}" title="${attr(T.t(
                    favorite ? 'Remove from favorites' : 'Add to favorites',
                ))}">${favorite ? '&#9733;' : '&#9734;'}</button>
                <button type="button" class="indicator-list-select">
                    <span class="indicator-list-info">
                        <span class="indicator-list-name">${html(indicator.name)}</span>
                        <span class="indicator-list-fullname">${html(translatedFullName)}</span>
                    </span>
                    <span class="indicator-list-group">${html(T.t(indicator.group))}</span>
                </button>
            </div>`;
        }).join('');
        this.listEl.querySelectorAll('.indicator-list-item').forEach((element) => {
            const item = element as HTMLElement;
            item.querySelector('.indicator-list-select')?.addEventListener('click', () => {
                const id = item.dataset.id;
                if (!id) return;
                this.selectedType = id;
                this.renderAddSettings(id);
            });
            item.querySelector('.indicator-favorite-toggle')?.addEventListener('click', () => {
                const id = item.dataset.id;
                if (!id || !this.catalog) return;
                void this.catalog.toggleFavorite(id).catch(error => this.showError(error));
            });
        });
    }

    private renderAddSettings(typeId: string): void {
        if (!this.settingsEl) return;
        const settings = IndicatorSettings.getIndicator(typeId);
        if (!settings) return;
        this.editingId = null;
        this.editingSnapshot = null;
        const defaultPane = this.targetPaneId
            || (settings.pane === 'overlay' ? '__main__' : '__new__');
        const parameterRows = (settings.params as any[]).map(parameter => (
            legacyParameterRow(parameter)
        )).join('');
        this.settingsEl.innerHTML = `
            <div class="indicator-settings-title">${html(T.t(settings.name))}</div>
            <section class="indicator-editor-section">
                <div class="indicator-section-title">${html(T.t('Inputs'))}</div>
                <div class="indicator-settings-params">${parameterRows || emptyValue('No inputs')}</div>
            </section>
            <section class="indicator-editor-section">
                <div class="indicator-section-title">${html(T.t('Placement'))}</div>
                <div class="indicator-param-row">
                    <label class="indicator-param-label">${html(T.t('Pane'))}</label>
                    <select class="indicator-editor-select indicator-target-select">
                        ${this.paneOptions(defaultPane, true)}
                    </select>
                </div>
            </section>
            <div class="indicator-editor-error" hidden></div>
            <div class="indicator-editor-actions">
                <button type="button" class="btn btn-sm btn-primary indicator-add-btn">
                    ${html(T.t('Add {0}', T.t(settings.name)))}
                </button>
            </div>`;
        this.settingsEl.querySelector('.indicator-add-btn')?.addEventListener('click', () => (
            this.addIndicator(typeId)
        ));
    }

    private renderEditor(snapshot: IndicatorControllerSnapshot): void {
        if (!this.settingsEl || !this.controller) return;
        this.editingId = snapshot.id;
        this.editingSnapshot = snapshot;
        const parameterRows = snapshot.parameterDefinitions.map((definition) => (
            parameterRow(definition, snapshot.parameters[definition.id])
        )).join('');
        const sourceOptions = this.sourceOptions(snapshot);
        const selectedSource = sourceValue(snapshot.source);
        const outputRows = snapshot.outputs.map(output => outputRow(output)).join('');
        const templateSourceNote = snapshot.source.kind === IndicatorSourceKind.IndicatorOutput
            ? `<div class="indicator-template-note">${html(T.t(
                'The runtime indicator source is not stored in portable templates',
            ))}</div>` : '';
        const sourceWarning = snapshot.sourceStatus.available ? '' : `
            <div class="indicator-source-warning">
                ${html(T.t(`Source unavailable: ${snapshot.sourceStatus.reason}`))}
            </div>`;

        this.settingsEl.innerHTML = `
            <div class="indicator-settings-title">
                <span>${html(T.t('Edit {0}', snapshot.name))}</span>
                <span class="indicator-editor-id">${html(snapshot.id)}</span>
            </div>
            <section class="indicator-editor-section">
                <div class="indicator-section-title">${html(T.t('Inputs'))}</div>
                <div class="indicator-settings-params">${parameterRows || emptyValue('No inputs')}</div>
            </section>
            <section class="indicator-editor-section">
                <div class="indicator-section-title">${html(T.t('Source and placement'))}</div>
                <div class="indicator-param-row indicator-param-row-wide">
                    <label class="indicator-param-label">${html(T.t('Source'))}</label>
                    <select class="indicator-editor-select indicator-source-select">
                        ${selectOptions(sourceOptions, selectedSource)}
                    </select>
                </div>
                ${sourceWarning}
                <div class="indicator-param-row">
                    <label class="indicator-param-label">${html(T.t('Pane'))}</label>
                    <select class="indicator-editor-select indicator-target-select">
                        ${this.paneOptions(snapshot.paneId ?? '__main__', false)}
                    </select>
                </div>
                <div class="indicator-param-row">
                    <label class="indicator-param-label">${html(T.t('Price scale'))}</label>
                    <select class="indicator-editor-select indicator-scale-select">
                        ${this.scaleOptions(snapshot.paneId, snapshot.priceScaleId)}
                    </select>
                    <span class="indicator-effective-scale">
                        ${html(T.t('Effective: {0}', snapshot.effectivePriceScaleId))}
                    </span>
                </div>
                <label class="indicator-toggle-row">
                    <input type="checkbox" class="indicator-visible-input"${
                        snapshot.visible ? ' checked' : ''
                    } />
                    <span>${html(T.t('Show indicator'))}</span>
                </label>
            </section>
            <section class="indicator-editor-section indicator-output-section">
                <div class="indicator-section-title">${html(T.t('Outputs'))}</div>
                <div class="indicator-output-header" aria-hidden="true">
                    <span>${html(T.t('Output'))}</span>
                    <span>${html(T.t('Color'))}</span>
                    <span>${html(T.t('Width'))}</span>
                    <span>${html(T.t('Style'))}</span>
                    <span>${html(T.t('Precision'))}</span>
                </div>
                <div class="indicator-output-list">${outputRows}</div>
            </section>
            <section class="indicator-editor-section indicator-template-section">
                <div class="indicator-section-title">${html(T.t('Templates'))}</div>
                <div class="indicator-template-existing">
                    <select class="indicator-editor-select indicator-template-select"
                        aria-label="${attr(T.t('Indicator template'))}">
                        ${this.templateOptions(snapshot.type)}
                    </select>
                    <button type="button" class="btn btn-sm indicator-template-apply-btn">
                        ${html(T.t('Apply'))}
                    </button>
                    <button type="button" class="btn btn-sm indicator-template-update-btn">
                        ${html(T.t('Update'))}
                    </button>
                    <button type="button" class="btn btn-sm indicator-template-remove-btn">
                        ${html(T.t('Delete'))}
                    </button>
                </div>
                <div class="indicator-template-create">
                    <input type="text" class="indicator-template-name"
                        placeholder="${attr(T.t('Template name'))}" />
                    <button type="button" class="btn btn-sm indicator-template-create-btn">
                        ${html(T.t('Save as template'))}
                    </button>
                </div>
                ${templateSourceNote}
            </section>
            <div class="indicator-editor-error" hidden></div>
            <div class="indicator-editor-actions">
                <button type="button" class="btn btn-sm btn-primary indicator-save-btn">
                    ${html(T.t('Save'))}
                </button>
            </div>`;

        const paneSelect = this.settingsEl.querySelector(
            '.indicator-target-select',
        ) as HTMLSelectElement | null;
        paneSelect?.addEventListener('change', () => {
            const scale = this.settingsEl?.querySelector(
                '.indicator-scale-select',
            ) as HTMLSelectElement | null;
            if (scale) scale.innerHTML = this.scaleOptions(
                paneSelect.value === '__main__' ? null : paneSelect.value,
                null,
            );
        });
        this.settingsEl.querySelectorAll('.indicator-output-row').forEach((element) => {
            const row = element as HTMLElement;
            const picker = row.querySelector('.indicator-output-color-picker') as HTMLInputElement | null;
            const text = row.querySelector('.indicator-output-color') as HTMLInputElement | null;
            picker?.addEventListener('input', () => { if (text) text.value = picker.value; });
            text?.addEventListener('input', () => {
                if (picker && /^#[0-9a-f]{6}$/i.test(text.value.trim()))
                    picker.value = text.value.trim();
            });
        });
        this.settingsEl.querySelector('.indicator-save-btn')?.addEventListener('click', () => (
            this.saveIndicator(snapshot.id)
        ));
        this.bindTemplateEditor(snapshot);
    }

    private addIndicator(typeId: string): void {
        if (!this.settingsEl || !this.indicatorEngine) return;
        try {
            const parameters = readParameters(this.settingsEl);
            const pane = this.settingsEl.querySelector(
                '.indicator-target-select',
            ) as HTMLSelectElement | null;
            const entry = this.indicatorEngine.add(typeId, parameters, pane?.value);
            if (!entry) throw new Error(T.t('Indicator could not be added'));
            const snapshot = this.controller?.get(entry.persistenceId);
            this.renderActiveList();
            if (snapshot) this.renderEditor(snapshot);
            TerminalUtils.showToast(
                T.t('{0} added', T.t(IndicatorSettings.getIndicator(typeId)?.name || typeId)),
                'success',
            );
        } catch (error) {
            this.showError(error);
        }
    }

    private saveIndicator(id: string): void {
        if (!this.settingsEl || !this.controller) return;
        try {
            const updated = this.updateIndicatorFromEditor(id);
            this.renderActiveList();
            this.renderEditor(updated);
            TerminalUtils.showToast(T.t('Indicator updated'), 'success');
        } catch (error) {
            this.showError(error);
        }
    }

    private updateIndicatorFromEditor(id: string): IndicatorControllerSnapshot {
        if (!this.settingsEl || !this.controller)
            throw new Error('sschart: indicator editor is unavailable');
        const sourceSelect = this.settingsEl.querySelector(
            '.indicator-source-select',
        ) as HTMLSelectElement;
        const paneSelect = this.settingsEl.querySelector(
            '.indicator-target-select',
        ) as HTMLSelectElement;
        const scaleSelect = this.settingsEl.querySelector(
            '.indicator-scale-select',
        ) as HTMLSelectElement;
        const visible = this.settingsEl.querySelector(
            '.indicator-visible-input',
        ) as HTMLInputElement;
        const previousOutputs = new Map(
            (this.editingSnapshot?.outputs || []).map(output => [output.id, output.style]),
        );
        const outputs: Record<string, IndicatorOutputStylePatch> = {};
        this.settingsEl.querySelectorAll('.indicator-output-row').forEach((element) => {
            const row = element as HTMLElement;
            const outputId = row.dataset.outputId;
            if (!outputId) return;
            const color = (row.querySelector('.indicator-output-color') as HTMLInputElement)
                .value.trim();
            const width = (row.querySelector('.indicator-output-width') as HTMLInputElement)
                .value.trim();
            const style = (row.querySelector('.indicator-output-line-style') as HTMLSelectElement)
                .value;
            const precisionValue = (row.querySelector(
                '.indicator-output-precision',
            ) as HTMLSelectElement).value;
            const visibleValue = (row.querySelector(
                '.indicator-output-visible',
            ) as HTMLInputElement).checked;
            const previous = previousOutputs.get(outputId);
            const next: Record<string, unknown> = {};
            const colorValue = color.length === 0 ? undefined : color;
            const widthValue = width.length === 0 ? undefined : Number(width);
            const styleValue = style.length === 0 ? undefined : Number(style);
            const precision = precisionValue.length === 0
                ? undefined : Number(precisionValue);
            if (colorValue === undefined && previous?.color !== undefined)
                throw new TypeError(T.t('Output color cannot be empty'));
            if (colorValue !== previous?.color && colorValue !== undefined)
                next.color = colorValue;
            if (widthValue !== previous?.lineWidth)
                next.lineWidth = widthValue === undefined ? null : widthValue;
            if (styleValue !== previous?.lineStyle)
                next.lineStyle = styleValue === undefined ? null : styleValue;
            if (visibleValue !== previous?.visible) next.visible = visibleValue;
            if (precision !== previous?.precision)
                next.precision = precision === undefined ? null : precision;
            if (Object.keys(next).length > 0)
                outputs[outputId] = next as IndicatorOutputStylePatch;
        });
        const patch: IndicatorUpdatePatch = {
            parameters: readParameters(this.settingsEl),
            source: parseSourceValue(sourceSelect.value),
            paneId: paneSelect.value === '__main__' ? null : paneSelect.value,
            priceScaleId: scaleSelect.value.length === 0 ? null : scaleSelect.value,
            visible: visible.checked,
            outputs,
        };
        const updated = this.controller.update(id, patch);
        this.editingSnapshot = updated;
        return updated;
    }

    private bindTemplateEditor(snapshot: IndicatorControllerSnapshot): void {
        if (!this.settingsEl || !this.templates) return;
        const select = this.settingsEl.querySelector(
            '.indicator-template-select',
        ) as HTMLSelectElement | null;
        const syncButtons = (): void => {
            const disabled = !select?.value;
            this.settingsEl?.querySelectorAll(
                '.indicator-template-apply-btn, .indicator-template-update-btn, '
                + '.indicator-template-remove-btn',
            ).forEach(button => { (button as HTMLButtonElement).disabled = disabled; });
        };
        select?.addEventListener('change', syncButtons);
        syncButtons();

        this.settingsEl.querySelector('.indicator-template-create-btn')
            ?.addEventListener('click', () => {
                try {
                    const name = (this.settingsEl!.querySelector(
                        '.indicator-template-name',
                    ) as HTMLInputElement).value;
                    const updated = this.updateIndicatorFromEditor(snapshot.id);
                    const creating = this.templates!.create(name, updated.id);
                    this.renderEditor(updated);
                    void creating.then((template) => {
                        this.refreshTemplateSelect(updated.type, template.id);
                        TerminalUtils.showToast(T.t('Indicator template saved'), 'success');
                    }).catch(error => this.showError(error));
                } catch (error) { this.showError(error); }
            });
        this.settingsEl.querySelector('.indicator-template-apply-btn')
            ?.addEventListener('click', () => {
                try {
                    if (!select?.value) return;
                    const templateId = select.value;
                    const updated = this.templates!.apply(templateId, snapshot.id);
                    this.renderEditor(updated);
                    this.refreshTemplateSelect(updated.type, templateId);
                    TerminalUtils.showToast(T.t('Indicator template applied'), 'success');
                } catch (error) { this.showError(error); }
            });
        this.settingsEl.querySelector('.indicator-template-update-btn')
            ?.addEventListener('click', () => {
                try {
                    if (!select?.value) return;
                    const templateId = select.value;
                    const updated = this.updateIndicatorFromEditor(snapshot.id);
                    const replacing = this.templates!.replace(templateId, updated.id);
                    this.renderEditor(updated);
                    void replacing.then(() => {
                        this.refreshTemplateSelect(updated.type, templateId);
                        TerminalUtils.showToast(T.t('Indicator template updated'), 'success');
                    }).catch(error => this.showError(error));
                } catch (error) { this.showError(error); }
            });
        this.settingsEl.querySelector('.indicator-template-remove-btn')
            ?.addEventListener('click', () => {
                if (!select?.value) return;
                void this.templates!.remove(select.value).then(() => {
                    this.refreshTemplateSelect(snapshot.type);
                    TerminalUtils.showToast(T.t('Indicator template deleted'), 'success');
                }).catch(error => this.showError(error));
            });
    }

    private renderActiveList(): void {
        if (!this.activeListEl || !this.controller) return;
        const indicators = this.controller.indicators();
        if (indicators.length === 0) {
            this.activeListEl.innerHTML = `<div class="no-indicators">${html(
                T.t('No active indicators'),
            )}</div>`;
            return;
        }
        this.activeListEl.innerHTML = indicators.map(indicator => `
            <div class="active-indicator-item" data-id="${attr(indicator.id)}">
                <button type="button" class="active-indicator-visible${
                    indicator.visible ? ' is-visible' : ''
                }" title="${attr(T.t(indicator.visible ? 'Hide' : 'Show'))}">
                    ${indicator.visible ? '&#9679;' : '&#9675;'}
                </button>
                <button type="button" class="active-indicator-name active-indicator-edit">
                    <span>${html(indicator.name)} (${html(Object.values(indicator.parameters).join(', '))})</span>
                    <small>${html(indicator.paneId ?? T.t('Main chart'))}</small>
                </button>
                <button type="button" class="btn btn-sm active-indicator-remove"
                    title="${attr(T.t('Remove'))}">&times;</button>
            </div>`).join('');
        this.activeListEl.querySelectorAll('.active-indicator-item').forEach((element) => {
            const row = element as HTMLElement;
            const id = row.dataset.id;
            if (!id) return;
            row.querySelector('.active-indicator-edit')?.addEventListener('click', () => {
                const snapshot = this.controller?.get(id);
                if (snapshot) this.renderEditor(snapshot);
            });
            row.querySelector('.active-indicator-visible')?.addEventListener('click', () => {
                const snapshot = this.controller?.get(id);
                if (!snapshot) return;
                try { this.controller!.setVisible(id, !snapshot.visible); }
                catch (error) { this.showError(error); }
            });
            row.querySelector('.active-indicator-remove')?.addEventListener('click', () => {
                const entry = this.indicatorEngine?.getIndicators().find(
                    (candidate: any) => candidate.persistenceId === id,
                );
                if (!entry) return;
                this.indicatorEngine.remove(entry.id);
                if (this.editingId === id) {
                    this.editingId = null;
                    this.editingSnapshot = null;
                    if (this.settingsEl) this.settingsEl.innerHTML = emptyValue('Indicator removed');
                }
                this.renderActiveList();
            });
        });
    }

    private resolveSnapshot(id: string | number): IndicatorControllerSnapshot | undefined {
        if (!this.controller) return undefined;
        if (typeof id === 'string') {
            const byStable = this.controller.get(id);
            if (byStable) return byStable;
        }
        const entry = this.indicatorEngine?.getIndicators().find(
            (candidate: any) => candidate.id === id || candidate.persistenceId === id,
        );
        return entry ? this.controller.get(entry.persistenceId) : undefined;
    }

    private templateOptions(indicatorType: string, selected = ''): string {
        const values: Array<readonly [string, string]> = [
            ['', T.t('Select template')],
            ...(this.templates?.templates(indicatorType).map(template => (
                [template.id, template.name] as const
            )) || []),
        ];
        return selectOptions(values, selected);
    }

    private refreshTemplateSelect(indicatorType: string, selected?: string): void {
        const select = this.settingsEl?.querySelector(
            '.indicator-template-select',
        ) as HTMLSelectElement | null;
        if (!select) return;
        const next = selected ?? select.value;
        select.innerHTML = this.templateOptions(indicatorType, next);
        if (![...select.options].some(option => option.value === next)) select.value = '';
        select.dispatchEvent(new Event('change'));
    }

    private paneOptions(selected: string, includeNew: boolean): string {
        const values: Array<readonly [string, string]> = [];
        if (includeNew) values.push(['__new__', T.t('New pane')]);
        values.push(['__main__', T.t('Main chart')]);
        for (const pane of this.chart?.panes?.() || []) {
            const id = pane.id?.();
            if (typeof id === 'string' && id !== 'main') values.push([id, id]);
        }
        if (!values.some(([value]) => value === selected)) values.push([selected, selected]);
        return selectOptions(values, selected);
    }

    private scaleOptions(paneId: string | null, selected: string | null): string {
        const ids = new Set(['right', 'left']);
        const targetId = paneId ?? 'main';
        const pane = (this.chart?.panes?.() || []).find((candidate: any) => (
            candidate.id?.() === targetId
        ));
        for (const id of pane?.priceScaleIds?.() || []) ids.add(id);
        if (selected) ids.add(selected);
        const values: Array<readonly [string, string]> = [
            ['', T.t('Auto')],
            ...[...ids].map(id => [id, id] as const),
        ];
        return selectOptions(values, selected ?? '');
    }

    private sourceOptions(
        current: IndicatorControllerSnapshot,
    ): Array<readonly [string, string]> {
        const options: Array<readonly [string, string]> = [
            ['candles', T.t('OHLC candles')],
            ...CANDLE_FIELDS.map(([field, label]) => (
                [`field:${field}`, T.t(label)] as const
            )),
        ];
        for (const indicator of this.controller?.indicators() || []) {
            if (indicator.id === current.id) continue;
            for (const output of indicator.outputs) {
                options.push([
                    `indicator:${encodeURIComponent(indicator.id)}:${encodeURIComponent(output.id)}`,
                    `${indicator.name} → ${output.name}`,
                ]);
            }
        }
        const selected = sourceValue(current.source);
        if (!options.some(([value]) => value === selected))
            options.push([selected, T.t('Unavailable source')]);
        return options;
    }

    private showError(error: unknown): void {
        const target = this.settingsEl?.querySelector('.indicator-editor-error') as HTMLElement | null;
        const message = error instanceof Error ? error.message : String(error);
        if (target) {
            target.textContent = message;
            target.hidden = false;
        } else {
            TerminalUtils.showToast(message, 'error');
        }
    }
}

/** Builds the terminal catalog model while leaving preference persistence to the host. */
export function createIndicatorCatalogController(
    storage?: IndicatorFavoritesStorage,
): IndicatorCatalogController {
    return new IndicatorCatalogController({
        entries: IndicatorSettings.getAllIndicators().map(indicator => ({
            id: indicator.id,
            name: indicator.name,
            fullName: indicator.fullName,
            category: indicator.category || indicator.group,
            categoryLabel: indicator.group,
            aliases: [
                ...(indicator.aliases || []),
                indicator.serverKind,
                T.t(indicator.name),
                T.t(indicator.fullName),
                T.t(indicator.group),
            ].filter((value): value is string => typeof value === 'string' && value.length > 0),
        })),
        storage,
    });
}

function parameterRow(definition: any, value: IndicatorParameterValue | undefined): string {
    const id = attr(definition.id);
    const label = html(T.t(definition.name || humanize(definition.id)));
    if (definition.type === 'boolean') {
        return `<label class="indicator-toggle-row">
            <input type="checkbox" data-parameter-id="${id}" data-parameter-type="boolean"${
                value === true ? ' checked' : ''
            } /><span>${label}</span></label>`;
    }
    if (definition.type === 'string' && definition.options?.length) {
        return `<div class="indicator-param-row"><label class="indicator-param-label">${label}</label>
            <select class="indicator-editor-select" data-parameter-id="${id}"
                data-parameter-type="string">${selectOptions(
                    definition.options.map((option: string) => [option, option]),
                    String(value ?? definition.defaultValue),
                )}</select></div>`;
    }
    const type = definition.type === 'string' ? 'text' : 'number';
    return `<div class="indicator-param-row"><label class="indicator-param-label">${label}</label>
        <input type="${type}" class="indicator-param-input" data-parameter-id="${id}"
            data-parameter-type="${attr(definition.type)}" value="${attr(
                String(value ?? definition.defaultValue),
            )}"${numberAttribute('min', definition.min)}${numberAttribute('max', definition.max)}${
                numberAttribute('step', definition.step)
            } /></div>`;
}

function legacyParameterRow(parameter: any): string {
    return parameterRow({
        id: parameter.key,
        name: parameter.label || humanize(parameter.key),
        type: parameter.type === 'bool' ? 'boolean'
            : parameter.type === 'string' ? 'string'
                : Number.isInteger(parameter.default) ? 'integer' : 'number',
        defaultValue: parameter.default,
        min: parameter.min,
        max: parameter.max,
        step: parameter.step,
        options: parameter.options,
    }, parameter.default);
}

function outputRow(output: IndicatorControllerSnapshot['outputs'][number]): string {
    const style = output.style;
    const color = style.color ?? '';
    const picker = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
    return `<div class="indicator-output-row" data-output-id="${attr(output.id)}">
        <label class="indicator-output-name">
            <input type="checkbox" class="indicator-output-visible"${style.visible ? ' checked' : ''} />
            <span>${html(output.name)}</span>
        </label>
        <div class="indicator-color-editor">
            <input type="color" class="indicator-output-color-picker" value="${attr(picker)}" />
            <input type="text" class="indicator-output-color" value="${attr(color)}"
                aria-label="${attr(T.t('Color'))}" />
        </div>
        <input type="number" class="indicator-output-width" min="0.1" step="0.5"
            value="${style.lineWidth === undefined ? '' : attr(String(style.lineWidth))}"
            placeholder="${attr(T.t('Auto'))}" aria-label="${attr(T.t('Width'))}" />
        <select class="indicator-output-line-style" aria-label="${attr(T.t('Style'))}">
            ${selectOptions([
                ['', T.t('Auto')],
                ...LINE_STYLES.map(([value, label]) => [String(value), T.t(label)] as const),
            ], style.lineStyle === undefined ? '' : String(style.lineStyle))}
        </select>
        <select class="indicator-output-precision" aria-label="${attr(T.t('Precision'))}">
            ${selectOptions([
                ['', T.t('Auto')],
                ...Array.from({ length: 13 }, (_, precision) => (
                    [String(precision), String(precision)] as const
                )),
            ], style.precision === undefined ? '' : String(style.precision))}
        </select>
    </div>`;
}

function readParameters(root: HTMLElement): Readonly<Record<string, IndicatorParameterValue>> {
    const result: Record<string, IndicatorParameterValue> = {};
    root.querySelectorAll('[data-parameter-id]').forEach((element) => {
        const input = element as HTMLInputElement | HTMLSelectElement;
        const id = input.dataset.parameterId;
        if (!id) return;
        const type = input.dataset.parameterType;
        if (type === 'boolean') result[id] = (input as HTMLInputElement).checked;
        else if (type === 'string') result[id] = input.value;
        else result[id] = Number(input.value);
    });
    return result;
}

function sourceValue(source: IndicatorSource): string {
    if (source.kind === IndicatorSourceKind.Candles) return 'candles';
    if (source.kind === IndicatorSourceKind.CandleField) return `field:${source.field}`;
    return `indicator:${encodeURIComponent(source.indicatorId)}:${encodeURIComponent(source.outputId)}`;
}

function parseSourceValue(value: string): IndicatorSource {
    if (value === 'candles') return { kind: IndicatorSourceKind.Candles };
    if (value.startsWith('field:')) return {
        kind: IndicatorSourceKind.CandleField,
        field: value.slice('field:'.length) as typeof IndicatorCandleField[keyof typeof IndicatorCandleField],
    };
    if (value.startsWith('indicator:')) {
        const [indicatorId, outputId, ...extra] = value.slice('indicator:'.length).split(':');
        if (!indicatorId || !outputId || extra.length > 0)
            throw new TypeError('sschart: invalid indicator source selection');
        return {
            kind: IndicatorSourceKind.IndicatorOutput,
            indicatorId: decodeURIComponent(indicatorId),
            outputId: decodeURIComponent(outputId),
        };
    }
    throw new TypeError('sschart: invalid indicator source selection');
}

function selectOptions(
    values: readonly (readonly [string, string])[],
    selected: string,
): string {
    return values.map(([value, label]) => (
        `<option value="${attr(value)}"${value === selected ? ' selected' : ''}>${html(label)}</option>`
    )).join('');
}

function numberAttribute(name: string, value: unknown): string {
    return typeof value === 'number' && Number.isFinite(value)
        ? ` ${name}="${attr(String(value))}"` : '';
}

function emptyValue(text: string): string {
    return `<div class="indicator-editor-empty">${html(T.t(text))}</div>`;
}

function html(value: unknown): string {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]!));
}

function attr(value: unknown): string { return html(value); }
