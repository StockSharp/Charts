import {
    IndicatorCategory,
    type IndicatorCategory as IndicatorCategoryValue,
} from './indicator-definition.js';

export interface IndicatorTaxonomyEntry {
    readonly category: IndicatorCategoryValue;
    readonly label: string;
    readonly order: number;
}

/** Canonical trading-oriented category order and labels shared by catalog and UI. */
export const IndicatorTaxonomy: readonly IndicatorTaxonomyEntry[] = Object.freeze([
    entry(IndicatorCategory.Trend, 'Trend', 0),
    entry(IndicatorCategory.Momentum, 'Momentum', 1),
    entry(IndicatorCategory.Volatility, 'Volatility', 2),
    entry(IndicatorCategory.Volume, 'Volume', 3),
    entry(IndicatorCategory.Price, 'Price', 4),
    entry(IndicatorCategory.SupportResistance, 'Support & Resistance', 5),
    entry(IndicatorCategory.MarketStrength, 'Market Strength', 6),
    entry(IndicatorCategory.Cycle, 'Cycle', 7),
    entry(IndicatorCategory.Statistical, 'Statistical', 8),
]);

const taxonomyByCategory = new Map(IndicatorTaxonomy.map(item => [item.category, item]));

export function indicatorTaxonomyEntry(category: IndicatorCategoryValue): IndicatorTaxonomyEntry {
    const result = taxonomyByCategory.get(category);
    if (result === undefined)
        throw new RangeError(`sschart: indicator category '${String(category)}' is not classified`);
    return result;
}

export function indicatorCategoryLabel(category: IndicatorCategoryValue): string {
    return indicatorTaxonomyEntry(category).label;
}

function entry(
    category: IndicatorCategoryValue,
    label: string,
    order: number,
): IndicatorTaxonomyEntry {
    return Object.freeze({ category, label, order });
}
