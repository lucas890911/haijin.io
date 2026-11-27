import { RULES, offerGood } from '../../shared/src/index.js';
export const names = [
    'LegalRandom',
    'ConservativeMerchant',
    'StockInvestor',
    'RiskSeeker',
    'ExpectedValueTrader',
    'MixedAdaptive',
];
function exposure(v, good) {
    return v.stocks.filter((s) => s.ownerId === v.selfId && s.good === good && !s.pledged).length;
}
export function policy(name) {
    if (!names.includes(name))
        throw new Error('Unknown policy: ' + name);
    return {
        name,
        version: '1.2-private',
        choose(v, legal, random) {
            const cash = v.players.find((p) => p.id === v.selfId).cash;
            const style = name !== 'MixedAdaptive'
                ? name
                : cash < 12
                    ? 'ConservativeMerchant'
                    : v.act === 1 && v.season <= 2
                        ? 'RiskSeeker'
                        : v.stocks.filter((s) => s.ownerId === v.selfId).length >= 3
                            ? 'StockInvestor'
                            : 'ExpectedValueTrader';
            const risk = style === 'RiskSeeker', investor = style === 'StockInvestor', cautious = style === 'ConservativeMerchant';
            const envelope = { actorId: v.selfId, expectedVersion: v.version };
            const candidates = legal.actions.slice();
            const bid = legal.bid;
            const budget = Math.min(Math.max(0, cash), investor ? 9 : risk ? 6 : cautious ? 2 : 4);
            if (bid) {
                const amount = style === 'LegalRandom'
                    ? bid.minimum + Math.floor(random() * (1 + bid.maximum - bid.minimum))
                    : bid.type === 'SubmitSealedBid'
                        ? Math.max(bid.minimum, budget)
                        : bid.minimum;
                candidates.push({ ...envelope, type: bid.type, amount });
            }
            const route = legal.assignShips;
            if (route) {
                const ranked = route.goods
                    .map((g) => ({
                    g,
                    weight: random() + (investor ? 2 * exposure(v, g) + v.commodities[g].spread / 10 : 0),
                }))
                    .sort((a, b) => b.weight - a.weight);
                let remaining = route.maxStartTotal;
                const assignments = route.shipIds.map((shipId, i) => {
                    const max = Math.min(route.maxStart, remaining - (route.shipIds.length - i - 1) * route.confirmedMinimumStart);
                    const start = investor
                        ? max
                        : route.confirmedMinimumStart + Math.floor(random() * (1 + max - route.confirmedMinimumStart));
                    remaining -= start;
                    return { shipId, good: ranked[i].g, start };
                });
                candidates.push({ ...envelope, type: 'AssignShips', assignments });
            }
            function evaluate(a) {
                if (style === 'LegalRandom')
                    return [0, 'uniform candidate draw'];
                switch (a.type) {
                    case 'BidPublic':
                    case 'SubmitSealedBid':
                        return [a.amount <= budget ? 8 : -2, 'cash bid budget ' + budget];
                    case 'WithdrawPublic':
                        return [1, 'preserve cash above bid budget'];
                    case 'BuyStockOrSkip': {
                        const good = offerGood(a.stockId);
                        return good
                            ? [
                                investor || cash > 18 ? 4 + v.commodities[good].spread / 10 : -2,
                                'cash reserve and commodity spread',
                            ]
                            : [0, 'retain silver'];
                    }
                    case 'PlaceCrewOrPass': {
                        if (!a.placement)
                            return [cautious && cash < 8 ? 15 : 0, 'retain cash and crew'];
                        const pos = v.positions.find((p) => p.id === a.placement.positionId);
                        if (pos.kind === 'ship') {
                            const ship = v.ships.find((s) => s.id === pos.shipId);
                            const rounds = 4 - Number(v.phase.slice(-1));
                            const chance = Math.max(0, Math.min(1, 0.5 + (ship.position + 3.5 * rounds - RULES.finish) / (6 * rounds)));
                            const seats = 1 + v.positions.filter((p) => p.shipId === ship.id && p.crewId).length;
                            const gross = ((RULES.outboundPrize[ship.good] + v.commodities[ship.good].spread) * chance) / seats;
                            return [
                                gross - pos.cost * (cautious ? 2 : 1) + (investor ? 4 * exposure(v, ship.good) : 0),
                                'estimated shared outbound prize minus seat cost',
                            ];
                        }
                        return [
                            risk && (pos.kind === 'pirate' || pos.kind === 'pilot')
                                ? 14
                                : pos.kind === 'port' || pos.kind === 'dock'
                                    ? RULES.betPrizes[pos.seat - 1] / (pos.seat + 1) - pos.cost
                                    : 1,
                            'special role preference or discounted public prize',
                        ];
                    }
                    case 'VoteReturnOption': {
                        if (a.option === 'safe')
                            return [cautious ? 50 : 0, 'avoid detention'];
                        const [target, early, late, stable] = RULES.returnTerms[a.option];
                        const crew = v.returnVotes.find((b) => b.shipId === a.shipId).electorate.length;
                        const probability = v.act === 2 ? 1 : (7 - target) / 6;
                        const value = ((v.act === 2 ? stable + v.effects.stableReturnAdjustment : v.act === 1 ? early : late) *
                            probability) /
                            crew;
                        return [
                            risk ? target * 10 : value - (1 - probability) * v.effects.ransom,
                            'public cargo reward, die odds and detention exposure',
                        ];
                    }
                    case 'PledgeStock':
                        return [-20, 'avoid mortgage unless funding is required'];
                    case 'RedeemPledgedStock':
                        return [cash > 30 ? 10 : -25, 'redeem with cash reserve'];
                    case 'CampChoice':
                        return [a.crewIds.length * (risk ? 1 : -1), 'camp stake risk'];
                    case 'PirateBoardOrDecline':
                        return [a.crewId ? 5 : 0, 'seek outbound dividend'];
                    case 'PirateTakeoverDecision':
                        return [a.enterPort || (a.join && v.pendingSpecial?.takeover?.enterPort) ? 4 : 0, 'prefer capture or joining with port entry'];
                    case 'ApplyPilotMoves':
                        return [a.moves.reduce((n, m) => n + m.delta, 0), 'advance ships toward port'];
                    case 'RedeemCrew':
                        return [cash > 15 ? 4 : -1, 'recover crew with cash reserve'];
                    default:
                        return [0, 'advance current decision'];
                }
            }
            let best, bestRank = -Infinity;
            for (const action of candidates) {
                const [score, factor] = evaluate(action);
                const rank = score + random() * 0.001;
                if (rank > bestRank) {
                    bestRank = rank;
                    best = { action, reason: style + ' / ' + factor, score };
                }
            }
            if (!best)
                throw new Error('Empty legal decision set');
            return best;
        },
    };
}
