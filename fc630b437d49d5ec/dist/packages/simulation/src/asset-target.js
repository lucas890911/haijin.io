import { GOODS, RULES, offerGood } from '../../shared/src/index.js';
const goods = [...GOODS].sort();
export class AssetAudit {
    rows = new Map();
    holdings = [];
    samples = 0;
    reset() {
        this.rows.clear();
        this.holdings.length = 0;
        this.samples = 0;
    }
    observe = (action, totals, _noise, self, hold, winner, unitEquity) => {
        if (!this.rows.size || this.rows.keys().next().value === action) {
            this.samples++;
            hold.forEach((row, i) => {
                const sum = this.holdings[i] ??= goods.map(() => 0);
                row.forEach((n, j) => sum[j] += n);
            });
        }
        const row = this.rows.get(action) ?? { sums: totals.map(() => 0), n: 0, control: 0, equity: {} };
        totals.forEach((x, i) => row.sums[i] += x);
        if (action.type === 'AssignShips') {
            for (const { good, start } of action.assignments) {
                const marginal = unitEquity(good, start), j = goods.indexOf(good);
                const equity = row.equity[good] ??= totals.map(() => 0);
                hold.forEach((shares, i) => equity[i] += shares[j] * marginal);
            }
        }
        row.n++;
        row.control += Number(winner === self);
        this.rows.set(action, row);
    };
    decide(v, base, target, intensity, counterbalance = false) {
        const self = v.players.findIndex(p => p.id === v.selfId), b = v.players.findIndex(p => p.id === target);
        const exposure = goods.map((good, j) => {
            const price = v.commodities[good].stockPrice, track = RULES.stockPrices;
            return {
                good, price, step: (v.ruleVersion === '1.5' ? Math.min(5, 40 - price) : (track[track.indexOf(price) + 1] ?? price) - price),
                known: v.players.map(p => v.stocks.filter(s => s.good === good && s.ownerId === p.id).length),
                estimated: this.holdings.map(h => h[j] / this.samples)
            };
        });
        // Avoid paying for control of a commodity which benefits A at least as much.
        const leverage = Math.max(0, ...exposure.map(x => x.step * (x.known[b] - x.known[self]) * .55));
        // Financing defers the pending decision. Its immediate forecast cannot be compared
        // to completing the auction, casting a ballot or committing a route.
        const finance = (a) => a.type === 'PledgeStock' || a.type === 'RedeemPledgedStock';
        const candidates = base.candidates.filter(c => finance(base.action) ? c.action === base.action : !finance(c.action));
        const forecast = (c) => {
            const a = c.action, row = this.rows.get(a);
            const value = row.sums.map(n => n / row.n);
            if (a.type === 'BidPublic' || a.type === 'SubmitSealedBid' || a.type === 'WithdrawPublic')
                value[b] -= leverage * row.control / row.n;
            if (a.type === 'BuyStockOrSkip') {
                const good = offerGood(a.stockId), x = exposure.find(x => x.good === good);
                // If A also invests, subsequently excluding this cargo sacrifices its marginal growth.
                if (x && x.known[b] > 0)
                    value[self] -= .55 * x.step;
            }
            return value;
        };
        const original = candidates.find(c => c.action === base.action);
        const baseline = forecast(original);
        const targetTokens = new Set(v.players[b].crew.map(c => c.id));
        const hedge = (a) => {
            if (a.type !== 'PlaceCrewOrPass' || !a.placement)
                return 0;
            const pos = v.positions.find(p => p.id === a.placement.positionId);
            const opposite = pos?.kind === 'port' ? 'dock' : pos?.kind === 'dock' ? 'port' : null;
            if (!opposite)
                return 0;
            // A hedge changes relative upside, not B's payout. Opposite side pays on
            // mutually exclusive arrival thresholds only when their seat numbers sum to four or more.
            return v.positions.some(p => p.kind === opposite && p.seat + pos.seat >= 4 && targetTokens.has(p.crewId ?? '')) ? 1 : 0;
        };
        const evaluate = (c) => {
            const diff = forecast(c).map((n, i) => n - baseline[i]);
            const suppression = -diff[b], selfCost = -diff[self];
            const spill = diff.reduce((s, n, i) => s + (i !== self && i !== b ? Math.max(0, n) : 0), 0);
            // Silver equivalents are policy preferences, never ledger transfers.
            let utility = c.score - base.score + intensity * (suppression + (hedge(c.action) - hedge(original.action)) - .35 * Math.max(0, selfCost) - .15 * spill) / 40;
            if (counterbalance) {
                const a = c.action;
                // A hedge alone has no effect on the target. A higher bid also needs
                // attainable equity exposure, higher control probability and a funded premium.
                if (suppression <= 0)
                    utility = Math.min(0, utility);
                if ((a.type === 'BidPublic' || a.type === 'SubmitSealedBid') && a.amount > ('amount' in original.action ? original.action.amount : 0)) {
                    const premium = a.amount - ('amount' in original.action ? original.action.amount : 0);
                    const gain = leverage * (this.rows.get(a).control - this.rows.get(original.action).control) / this.samples;
                    if (gain <= 0 || premium > gain)
                        utility = Math.min(0, utility);
                }
            }
            return { c, diff, suppression, selfCost, utility };
        };
        const rated = candidates.map(evaluate);
        const best = rated.reduce((best, next) => next.utility > best.utility ? next : best, rated.find(r => r.c === original));
        const { estimate, ...rest } = base;
        const delta = best.c.score - base.score;
        const routeCases = [];
        if (base.action.type === 'AssignShips') {
            for (const x of exposure.filter(x => x.known[b] > 0)) {
                for (const start of [0, 1, RULES.maxStart]) {
                    const alternative = rated.find(r => r.c.action.type === 'AssignShips' && (r.c.action.assignments.find(s => s.good === x.good)?.start ?? 0) === start);
                    if (alternative)
                        routeCases.push({ good: x.good, start, targetCargoEquity: (this.rows.get(alternative.c.action).equity[x.good]?.[b] ?? 0) / this.samples, targetDelta: -alternative.suppression, selfDelta: -alternative.selfCost });
                }
            }
        }
        const known = exposure.reduce((n, x) => n + x.known[b], 0);
        return {
            ...rest, ...(best.c === original && estimate ? { estimate } : {}), action: best.c.action, score: best.c.score,
            reason: best.c === original ? base.reason : 'estimated target asset suppression',
            emotion: {
                baseBestAction: base.action, chosenAction: best.c.action, estimatedWinProbabilityDelta: delta,
                estimatedRegret: Math.max(0, -delta), emotionKind: counterbalance ? 'E04' : 'E02', intensity, triggerReason: best.c === original ? 'rational fallback' : 'paired public asset forecast',
                losses: 0, pressures: 0, targetId: target, minSuccess: 0.05, options: [],
                asset: {
                    exposure, estimatedTargetSuppression: best.suppression, estimatedSelfCost: best.selfCost,
                    ...(v.phase === 'AUCTION' ? { auctionControlPrior: { leverage, winFraction: this.rows.get(best.c.action).control / this.samples } } : {}),
                    knownExposureFraction: known / (known + RULES.dealtStocks), playerDeltas: best.diff, routeCases
                }
            }
        };
    }
}
