// Economic parameters: V1.2 §§3,5,7–12. No strategy belongs here.
export const GOODS = ['deerskin', 'sugar', 'sulfur', 'rice'];
export const RULES = {
    campCost: 5, campPrize: 18, severeFinalRansom: 8, returnTerms: { cloth: [2, 24, 24, 12], porcelain: [4, 36, 36, 18], weapons: [5, 60, 72, 0] },
    players: 4, initialCash: 30, crewPerPlayer: 4, stocksPerGood: 5, dealtStocks: 2,
    minimumBid: 1, minimumSealedBid: 0, stockMinimum: 5, stockPrices: [0, 5, 10, 20, 30],
    maxStart: 5, maxStartTotal: 9, finish: 13, spreadFloor: -6, spreadStep: 2,
    pledgeIncome: 12, pledgeRedemption: 15,
    seats: { deerskin: [4, 5, 6, 6], sugar: [3, 4, 5, 6], sulfur: [4, 5, 6], rice: [2, 3, 4] },
    outboundPrize: { deerskin: 36, sugar: 32, sulfur: 30, rice: 24 },
    betCosts: [4, 3, 2], betPrizes: [6, 8, 15], pirateCost: 5,
    pilotCosts: { large: 6, small: 2 }, insuranceIncome: 10, typhoonInsurance: 14,
    weatherBonus: 2, ransom: 6, strictRansom: 8, lenientRansom: 4,
    stableReturnAdjustment: 4,
};
export const COMMON_EVENTS = ['sugar-harvest', 'rice-shortage', 'deerskin-demand', 'sulfur-demand',
    'surplus', 'merchants', 'typhoon', 'tailwind'];
/** Public market offer. The ordinal names an interchangeable unit, never a physical certificate. */
export function offerGood(id) {
    return GOODS.find(good => id?.startsWith('offer-' + good + '-'));
}
/** Known public modifiers only. Market adjustment is supplied after the official dice. */
export function outboundPool(good, spread, event, marketAdjustment = 0) {
    return RULES.outboundPrize[good] + spread - (event === "navy-" + good ? 8 : 0) + marketAdjustment;
}
/** Occupied seats must be passed in ascending official seat order. */
export function splitDividend(pool, count) {
    return Array.from({ length: count }, (_, i) => Math.floor(pool / count) + Number(i < pool % count));
}
