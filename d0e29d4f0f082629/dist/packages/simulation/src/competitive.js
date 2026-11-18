import { GOODS, RULES, offerGood } from '../../shared/src/index.js';
import { policy } from './policies.js';
export const competitiveNames = [
    'CompetitiveStockInvestor',
    'CompetitiveEVTrader',
    'CompetitiveRiskSeeker',
];
export function competitivePolicy(name, optimizeRoute = false) {
    const stock = name === competitiveNames[0], risk = name === competitiveNames[2];
    const fallback = policy(stock ? 'StockInvestor' : risk ? 'RiskSeeker' : 'ExpectedValueTrader');
    return {
        name,
        version: '2.1-private',
        choose(v, l, random) {
            const cash = v.players.find((p) => p.id === v.selfId).cash;
            const reserve = (risk ? 1 : 2) * Math.min(...GOODS.map((g) => RULES.seats[g][0]));
            const env = { actorId: v.selfId, expectedVersion: v.version };
            const decision = (action, score, reason) => ({ action, score, reason });
            function market(g) {
                const price = v.commodities[g].stockPrice;
                const gain = (v.ruleVersion === '1.5' ? Math.min(5, 40 - price) : (RULES.stockPrices.find((p) => p > price) ?? price) - price);
                const holdings = (id) => v.stocks.filter((s) => s.good === g && s.ownerId === id && (id === v.selfId || s.source === 'subscription')).length;
                const rival = Math.max(...v.players.filter((p) => p.id !== v.selfId).map((p) => holdings(p.id)));
                return { price, gain, own: holdings(v.selfId), rival };
            }
            const priority = (g) => {
                const m = market(g);
                return (m.gain * (m.own * (stock ? 1.3 : 1) - 0.4 * m.rival) +
                    (RULES.outboundPrize[g] + v.commodities[g].spread) / 4);
            };
            if (v.phase === 'AUCTION') {
                const best = GOODS.slice().sort((a, b) => priority(b) - priority(a))[0];
                const m = market(best), chance = Math.min(1, Math.max(0, 0.5 + (RULES.maxStart + 10.5 + v.effects.firstSailModifier - RULES.finish) / 12));
                const projected = GOODS.filter((g) => v.inventory[g] > 0).map((g) => {
                    const x = market(g);
                    return (x.price + chance * x.gain * Math.min(2, 9 - v.season) - Math.max(x.price, RULES.stockMinimum));
                });
                const option = Math.max(0, ...projected);
                const control = m.gain * m.own * (chance - 0.25);
                const seat = (chance * (RULES.outboundPrize[best] + v.commodities[best].spread)) / 3 - RULES.seats[best][0];
                const denial = Math.max(...GOODS.map((g) => market(g).rival * market(g).gain)) * 0.25;
                const value = Math.max(1, Math.round((option * (stock ? 1.4 : 1) + control + seat + denial + 3) * (risk ? 1.2 : 1)));
                const limit = Math.max(0, Math.min(value, cash - reserve));
                const prior = v.ledger.filter((e) => e.reason === 'auction').slice(-4);
                const estimate = prior.length ? prior.reduce((n, e) => n - e.delta, 0) / prior.length : value * 0.7;
                const target = Math.min(Math.max(...v.players.filter((p) => p.id !== v.selfId).map((p) => p.cash)), estimate + random() * 4);
                const bid = l.bid;
                if (bid && (bid.type === 'SubmitSealedBid' || bid.minimum <= limit)) {
                    const offer = bid.type === 'SubmitSealedBid'
                        ? Math.max(value * 0.65, target)
                        : bid.minimum + Math.max(0, (target - bid.minimum) * 0.4);
                    const amount = Math.min(bid.maximum, limit, Math.max(bid.minimum, Math.round(offer)));
                    return decision({ ...env, type: bid.type, amount }, limit, 'ceiling ' +
                        limit +
                        '; subscription ' +
                        option.toFixed(1) +
                        '; holdings ' +
                        control.toFixed(1) +
                        '; crew ' +
                        seat.toFixed(1) +
                        '; rival ' +
                        denial.toFixed(1) +
                        '; historical price ' +
                        estimate.toFixed(1));
                }
                const withdraw = l.actions.find((a) => a.type === 'WithdrawPublic');
                if (withdraw)
                    return decision(withdraw, limit, 'price above cash-adjusted valuation');
                if (bid)
                    return decision({ ...env, type: bid.type, amount: bid.minimum }, bid.minimum, 'minimum funded opening bid');
            }
            if (l.assignShips && optimizeRoute) {
                const route = l.assignShips;
                const probabilities = Array.from({ length: route.maxStart + 1 }, (_, start) => {
                    let wins = 0;
                    for (let a = 1; a <= 6; a++)
                        for (let b = 1; b <= 6; b++)
                            for (let c = 1; c <= 6; c++)
                                if (start + a + b + c + v.effects.firstSailModifier > RULES.finish)
                                    wins++;
                    return wins / 216;
                });
                const ranked = GOODS.map((g) => {
                    const m = market(g), capacity = RULES.seats[g].length;
                    const crewCost = RULES.seats[g][0], dividend = (RULES.outboundPrize[g] + v.commodities[g].spread) / capacity;
                    return {
                        g,
                        value: (start) => probabilities[start] * (m.gain * (m.own * (stock ? 1.3 : 1) - 0.4 * m.rival) + dividend) -
                            crewCost,
                    };
                });
                let best = -Infinity, assignments = [];
                for (const a of ranked)
                    for (const b of ranked)
                        for (const c of ranked) {
                            if (new Set([a, b, c]).size !== 3)
                                continue;
                            for (let x = 1; x <= route.maxStart; x++)
                                for (let y = 1; y <= route.maxStart; y++)
                                    for (let z = 1; z <= Math.min(route.maxStart, route.maxStartTotal - x - y); z++) {
                                        const score = a.value(x) + b.value(y) + c.value(z);
                                        if (score > best) {
                                            best = score;
                                            assignments = [a, b, c].map((g, i) => ({
                                                shipId: route.shipIds[i],
                                                good: g.g,
                                                start: [x, y, z][i],
                                            }));
                                        }
                                    }
                        }
                return decision({ ...env, type: 'AssignShips', assignments }, best, 'route: three-die arrival odds, visible equity, dividend per capacity minus seat fee');
            }
            if (l.assignShips) {
                const route = l.assignShips, goods = GOODS.map((g) => ({ g, value: priority(g) + random() * 0.3 })).sort((a, b) => b.value - a.value);
                let left = route.maxStartTotal;
                const assignments = route.shipIds.map((shipId, i) => {
                    const start = Math.min(route.maxStart, left - (2 - i) * route.confirmedMinimumStart);
                    left -= start;
                    return { shipId, start, good: goods[i].g };
                });
                return decision({ ...env, type: 'AssignShips', assignments }, goods[0].value, 'rank portfolio exposure and crew dividend separately');
            }
            if (v.phase === 'CAPTAIN_STOCK_OPTION') {
                const choices = l.actions
                    .filter((a) => a.type === 'BuyStockOrSkip')
                    .map((action) => {
                    const good = offerGood(action.stockId);
                    if (!good)
                        return { action, score: 0 };
                    const m = market(good), cost = Math.max(RULES.stockMinimum, m.price);
                    return {
                        action,
                        score: m.price -
                            cost +
                            0.65 * m.gain * Math.min(3, 9 - v.season) +
                            priority(good) / 8 -
                            Math.max(0, reserve + cost - cash),
                    };
                })
                    .sort((a, b) => b.score - a.score);
                if (choices[0])
                    return { ...choices[0], reason: 'appreciation minus subscription and liquidity cost' };
            }
            if (v.phase === 'RETURN_VOTING') {
                const votes = l.actions
                    .filter((a) => a.type === 'VoteReturnOption')
                    .map((action) => {
                    const vote = v.returnVotes.find((x) => x.shipId === action.shipId);
                    if (action.option === 'safe')
                        return { action, score: 0 };
                    const [threshold, early, late, stable] = RULES.returnTerms[action.option];
                    const p = v.act === 2 ? 1 : (7 - threshold) / 6;
                    const reward = v.act === 2 ? stable + v.effects.stableReturnAdjustment : v.act === 1 ? early : late;
                    const owned = vote.electorate.filter((x) => x.ownerId === v.selfId).length;
                    return {
                        action,
                        score: owned *
                            ((p * reward) / vote.electorate.length -
                                (1 - p) * (v.effects.ransom + reserve) * (risk ? 0.45 : 1)),
                    };
                })
                    .sort((a, b) => b.score - a.score);
                if (votes[0])
                    return { ...votes[0], reason: 'shared reward and detention exposure per owned crew' };
            }
            return fallback.choose(v, l, random);
        },
    };
}
