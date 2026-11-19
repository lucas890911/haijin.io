import { voteCash, waitingValue, capitalUse } from './rational-review.js';
import { GOODS, RULES, offerGood, } from '../../shared/src/index.js';
import { seededRandom } from '../../rules-engine/src/index.js';
import { scoreSpecial } from './special-policy.js';
export const rationalNames = ['RationalStockInvestor', 'RationalMerchant', 'RationalRiskSeeker'];
const goods = [...GOODS].sort();
const priceTrack = RULES.stockPrices;
const step = (price, d, modern = false) => modern ? Math.min(40, Math.max(0, price + (d > 0 ? 5 : d < 0 ? -2 : 0))) :
    priceTrack[Math.max(0, Math.min(priceTrack.length - 1, priceTrack.indexOf(price) + d))];
function modeledStockChange(price, future, previousFailures, arrived, modern = false, pirate = false) {
    if (modern)
        return Math.max(0, Math.min(40, price + (arrived ? 5 : previousFailures % 2 ? -3 : -2) - (pirate ? 5 : 0))) - price;
    return Math.min(RULES.stockPrices.at(-1) - future, step(price, arrived ? 1 : previousFailures ? -1 : 0) - price);
}
const fourZeros = () => [0, 0, 0, 0];
function shuffle(a, r) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
export function sampleHoldings(v, evidence, r) {
    const owners = v.players.map(() => fourZeros()), self = v.players.findIndex((p) => p.id === v.selfId);
    const unknown = [];
    for (const [g, good] of goods.entries()) {
        const visible = v.stocks.filter((s) => s.good === good);
        for (const s of visible)
            owners[v.players.findIndex((p) => p.id === s.ownerId)][g]++;
        for (let i = visible.length + v.inventory[good]; i < RULES.stocksPerGood; i++)
            unknown.push(g);
    }
    const slots = v.players.flatMap((_, i) => (i === self ? [] : [i, i]));
    for (const g of shuffle(unknown, r)) {
        const weights = slots.map((i) => 1 + Math.min(2, evidence.get(v.players[i].id)?.get(goods[g]) ?? 0) * 0.25);
        let target = r() * weights.reduce((a, b) => a + b, 0), j = 0;
        while (j < weights.length - 1 && target >= weights[j]) {
            target -= weights[j++];
        }
        owners[slots.splice(j, 1)[0]][g]++;
    }
    return owners;
}
function makeWorld(v, self, evidence, r, revised, audit) {
    const hold = sampleHoldings(v, evidence, r), remaining = Math.max(0, (v.weaponsSuccesses >= 2 ? 8 : 7) - v.season);
    const paths = [];
    const future = goods.map((g) => {
        const path = [];
        paths.push(path);
        let price = v.commodities[g].stockPrice;
        for (let i = 0; i < remaining; i++) {
            const move = r() < 0.36 ? 1 : r() < 0.15 ? -1 : 0;
            path.push(move);
            price = step(price, move, v.ruleVersion === '1.5');
        }
        return price;
    });
    const base = v.players.map((p, i) => p.cash + (p.flags ?? 0) * 10 +
        hold[i].reduce((n, k, g) => n + k * future[g], 0) -
        RULES.pledgeRedemption *
            (v.ledger.filter((e) => e.playerId === p.id && e.reason === 'pledge').length -
                v.ledger.filter((e) => e.playerId === p.id && e.reason === 'redeem').length) -
        p.crew.filter((c) => c.status.kind === 'detained').length * RULES.ransom);
    const die = () => 1 + Math.floor(r() * 6), extra = goods.map(() => die() + die() + die());
    const forecast = goods.map(() => []);
    const available = v.players.map((p) => shuffle(goods.slice(), r).slice(0, Math.min(3, p.crew.filter((c) => c.status.kind === 'available').length)));
    const funds = v.players.map((p) => Math.max(0, p.cash));
    const reservedPirates = new Set();
    const assignedCargo = new Set();
    const routes = (revised ? shuffle(goods.slice(), r) : goods)
        .map((good) => {
        const g = goods.indexOf(good);
        const prize = RULES.outboundPrize[good] + v.commodities[good].spread + (v.eventRevealed === 'market-' + good ? (15 * 18 - 10 * 6) / 36 : 0) - (v.eventRevealed === 'navy-' + good ? 8 : 0);
        const capacity = RULES.seats[good].length;
        let visitors = shuffle([self, ...v.players.map((_, i) => i).filter((i) => i !== self)], r)
            .filter((i) => v.players[i].cash >= RULES.seats[good][0] && available[i].includes(good) && r() < 0.6)
            .slice(0, capacity);
        if (revised) {
            const admitted = [];
            for (const i of visitors) {
                const fee = RULES.seats[good][admitted.length];
                if (funds[i] >= fee) {
                    admitted.push(i);
                    funds[i] -= fee;
                }
            }
            visitors = admitted;
        }
        const cargo = v.act === 2 ? ['safe', 'cloth', 'porcelain'] : ['safe', 'cloth', 'porcelain', 'weapons'];
        if (revised)
            for (let i = cargo.length - 1; i >= 0; i--)
                if (assignedCargo.has(cargo[i]))
                    cargo.splice(i, 1);
        const votes = visitors.map(() => cargo[Math.floor(r() * cargo.length)]);
        const counts = cargo.map((c) => votes.filter((x) => x === c).length);
        const leaders = cargo.filter((_, i) => counts[i] === Math.max(...counts));
        const second = leaders.length === 1 ? [] : visitors.map(() => cargo[Math.floor(r() * cargo.length)]);
        const rec = cargo.map((c) => second.filter((x) => x === c).length), rerun = cargo.filter((_, i) => rec[i] === Math.max(...rec));
        const groupChoice = leaders.length === 1 ? leaders[0] : rerun.length === 1 ? rerun[0] : 'safe';
        const soloChoice = cargo[Math.floor(r() * cargo.length)], backDie = die();
        const pilot = r() < 0.15 ? (r() < 0.6 ? 1 : -1) : 0, pirateDraw = r() < 0.5 ? Math.floor(r() * 4) : -1;
        const pirate = pirateDraw >= 0 &&
            (!revised ||
                (reservedPirates.size < 2 &&
                    !reservedPirates.has(pirateDraw) &&
                    !visitors.includes(pirateDraw) &&
                    funds[pirateDraw] >= (v.ruleVersion === '1.5' ? 7 : RULES.pirateCost))) &&
            available[pirateDraw].includes(good) &&
            v.players[pirateDraw].cash >= (v.ruleVersion === '1.5' ? 7 : RULES.pirateCost)
            ? pirateDraw
            : -1;
        if (revised) {
            if (pirate >= 0) {
                reservedPirates.add(pirate);
                funds[pirate] -= (v.ruleVersion === '1.5' ? 7 : RULES.pirateCost);
            }
            if (groupChoice !== 'safe')
                assignedCargo.add(groupChoice);
        }
        audit?.push({ g, visitors, pirate, choice: groupChoice });
        return {
            g,
            starts: Array.from({ length: 6 }, (_, start) => {
                const pos = start + extra[g] + v.effects.firstSailModifier + pilot + (v.eventRevealed === "navy-" + good ? 2 : 0);
                const taken = pos === RULES.finish && pirate >= 0, arrived = pos > RULES.finish || taken;
                const owners = taken ? [pirate] : visitors, choice = taken && !revised ? soloChoice : groupChoice;
                const price = v.commodities[good].stockPrice;
                const change = modeledStockChange(price, future[g], v.commodities[good].consecutiveFailures, arrived, v.ruleVersion === '1.5', taken);
                const delta = hold.map((row) => row[g] * change);
                visitors.forEach((id, i) => (delta[id] -= RULES.seats[good][i]));
                if (taken)
                    delta[pirate] -= (v.ruleVersion === '1.5' ? 7 : RULES.pirateCost);
                const projection = {
                    arrived: +arrived,
                    boardedArrival: +(arrived && owners.includes(self)),
                    grossBack: 0,
                    detention: 0,
                    board: Number(owners.includes(self)),
                    outbound: 0,
                    back: 0,
                    equity: hold[self][g] * change,
                    cost: (visitors.includes(self) ? RULES.seats[good][visitors.indexOf(self)] : 0) +
                        (taken && pirate === self ? (v.ruleVersion === '1.5' ? 7 : RULES.pirateCost) : 0),
                };
                forecast[g][start] = projection;
                if (arrived)
                    for (const id of owners) {
                        if (id === self)
                            projection.outbound = prize / owners.length;
                        delta[id] += prize / owners.length;
                        if (v.ruleVersion === '1.5' && v.act === 2) {
                            // Estimate rank against two competing voyages at a neutral three-cell start.
                            const rank = extra.filter((movement, k) => k !== g && movement + 3 > Math.max(13, pos)).length;
                            const share = ([18, 12, 0][Math.min(rank, 2)] ?? 0) / owners.length;
                            const income = share + (rank === 0 && owners[0] === id ? 6 : 0);
                            delta[id] += income;
                            if (id === self) {
                                projection.back = income;
                                projection.grossBack = income;
                            }
                        }
                        else if (choice !== 'safe') {
                            const [threshold, a, b, stable] = RULES.returnTerms[choice];
                            const back = v.act === 2
                                ? (stable + v.effects.stableReturnAdjustment) / owners.length
                                : backDie >= threshold
                                    ? (v.act === 1 ? a : b) / owners.length
                                    : -v.effects.ransom;
                            delta[id] += back;
                            if (id === self) {
                                projection.back = back;
                                projection.grossBack = Math.max(0, back);
                                projection.detention = Math.max(0, -back);
                            }
                        }
                    }
                return delta;
            }),
        };
    })
        .sort((a, b) => a.g - b.g)
        .map((x) => x.starts);
    const control = hold.map((row, i) => {
        const values = goods.map((g, k) => row[k] * (step(v.commodities[g].stockPrice, 1, v.ruleVersion === '1.5') - v.commodities[g].stockPrice));
        const option = Math.max(0, ...goods
            .filter((g) => v.inventory[g] > 0 &&
            v.players[i].cash >= Math.max(RULES.stockMinimum, v.commodities[g].stockPrice))
            .map((g) => future[goods.indexOf(g)] - Math.max(RULES.stockMinimum, v.commodities[g].stockPrice)));
        const free = v.players[i].crew.some((c) => c.status.kind === 'available');
        const seat = free
            ? Math.max(0, ...goods
                .filter((g) => v.players[i].cash >= RULES.seats[g][0])
                .map((g) => (0.4 * (RULES.outboundPrize[g] + v.commodities[g].spread)) / 2 - RULES.seats[g][0]))
            : 0;
        return option + 0.55 * Math.max(...values) + seat;
    });
    const history = v.ledger.filter((e) => e.reason === 'auction').slice(-4);
    const market = history.length ? history.reduce((n, e) => n - e.delta, 0) / history.length : 10;
    const bids = control.map((c, i) => Math.max(0, Math.min(v.players[i].cash, Math.round(((market + c) / 2) * (0.45 + r() * 1.2)))));
    return {
        forecast,
        paths,
        salt: revised ? String(r()) : '',
        base,
        hold,
        routes,
        prices: future,
        control,
        bids,
        extra,
        die: die(),
        cargoDraw: die(),
        noise: 8 + 12 * Math.sqrt(remaining + 0.2),
    };
}
export function chronologicalPrice(price, current, later) {
    return later.reduce((p, d) => step(p, d), step(price, current));
}
export function rationalPolicy(name, revision = false, audit, terminalAudit, beliefAudit) {
    const revised = !!revision;
    const evidence = new Map(), seen = new Set();
    return {
        name,
        version: revision === 3 ? 'rational-3-stock-review' : revised ? 'rational-2-review' : 'rational-1',
        choose(v, l, r) {
            if (v.captainId && v.ships.every((s) => s.good) && !seen.has(v.season)) {
                const counts = evidence.get(v.captainId) ?? new Map();
                for (const s of v.ships)
                    counts.set(s.good, 0.7 * (counts.get(s.good) ?? 0) + Math.min(5, s.position ?? 0) / 6);
                evidence.set(v.captainId, counts);
                seen.add(v.season);
            }
            const self = v.players.findIndex((p) => p.id === v.selfId), me = v.players[self], budget = name === 'RationalStockInvestor' ? 16 : 12;
            const worlds = Array.from({ length: budget + (v.season >= 6 ? 4 : 0) }, () => makeWorld(v, self, evidence, r, revised));
            if (beliefAudit)
                for (const w of worlds)
                    beliefAudit(v, w.base, w.noise, w.hold, w.extra, w.salt, w.die);
            const randomSalt = String(r()), actions = l.actions.slice(), env = { actorId: v.selfId, expectedVersion: v.version };
            const add = (p) => actions.push({ ...p, ...env });
            if (l.bid)
                for (let amount = l.bid.minimum; amount <= l.bid.maximum; amount++)
                    add({ type: l.bid.type, amount });
            if (l.assignShips) {
                const route = l.assignShips;
                for (const a of goods)
                    for (const b of goods)
                        for (const c of goods) {
                            if (!(a < b && b < c))
                                continue;
                            for (let x = 1; x <= route.maxStart; x++)
                                for (let y = 1; y <= route.maxStart; y++)
                                    for (let z = 1; z <= Math.min(route.maxStart, route.maxStartTotal - x - y); z++) {
                                        const lanes = [a, b, c]
                                            .map((good, i) => ({ good, start: [x, y, z][i] }))
                                            .sort((u, t) => seededRandom(randomSalt + u.good, 0) - seededRandom(randomSalt + t.good, 0));
                                        add({
                                            type: 'AssignShips',
                                            assignments: lanes.map((lane, i) => ({
                                                ...lane,
                                                shipId: route.shipIds.slice().sort()[i],
                                            })),
                                        });
                                    }
                        }
            }
            const special = new Map(scoreSpecial(v, l, false, false).map((d) => [JSON.stringify(d.action), d.score]));
            const sample = (a, w, hint) => {
                const d = fourZeros();
                let value = hint, winner = -1;
                switch (a.type) {
                    case 'AssignShips':
                        for (const x of a.assignments) {
                            const change = w.routes[goods.indexOf(x.good)][x.start];
                            for (let i = 0; i < 4; i++)
                                d[i] += change[i];
                        }
                        break;
                    case 'BidPublic':
                    case 'SubmitSealedBid':
                    case 'WithdrawPublic': {
                        const bids = w.bids.slice();
                        bids[self] = a.type === 'WithdrawPublic' ? -1 : a.amount;
                        if (v.auction?.kind === 'public') {
                            for (let i = 0; i < 4; i++)
                                if (v.auction.withdrawn.includes(v.players[i].id))
                                    bids[i] = -1;
                            const high = v.auction.highest;
                            if (high) {
                                const i = v.players.findIndex((p) => p.id === high.actorId);
                                bids[i] = Math.max(bids[i], high.amount);
                            }
                        }
                        const max = Math.max(...bids), tied = bids.flatMap((x, i) => (x === max ? [i] : [])), id = tied[(w.die - 1) % tied.length];
                        const paid = id === self || v.auction?.kind === 'sealed'
                            ? max
                            : Math.max(v.auction?.highest?.amount ?? 1, 1 + Math.max(...bids.filter((_, i) => i !== id)));
                        winner = id;
                        const reserve = name === 'RationalMerchant' ? 8 : 5;
                        d[id] += w.control[id] - paid - 0.5 * Math.max(0, reserve - (v.players[id].cash - paid));
                        break;
                    }
                    case 'BuyStockOrSkip': {
                        const g = offerGood(a.stockId);
                        if (g) {
                            const price = v.commodities[g].stockPrice;
                            const cost = Math.max(RULES.stockMinimum, price), future = w.prices[goods.indexOf(g)];
                            const gIndex = goods.indexOf(g), advance = w.extra[gIndex] >= 9 ? 1 : 0;
                            const terminal = revision === 3
                                ? chronologicalPrice(price, advance, w.paths[gIndex])
                                : future + Math.min((v.ruleVersion === '1.5' ? 40 : RULES.stockPrices.at(-1)) - future, step(price, 1, v.ruleVersion === '1.5') - price) * advance;
                            // Both buy and skip consume this season's option.
                            const next = revision === 3 ? { ...v, phase: 'CAPTAIN_ASSIGN_SHIPS' } : v;
                            const liquidity = revised
                                ? capitalUse(next, me.cash) - capitalUse(next, me.cash - cost)
                                : Math.max(0, (name === 'RationalMerchant' ? 8 : 5) - (me.cash - cost)) * 0.5;
                            value = terminal - cost - liquidity;
                            audit?.(g, { future, increment: terminal - future, terminal, cost, liquidity, value });
                        }
                        break;
                    }
                    case 'PlaceCrewOrPass': {
                        const pos = v.positions.find((p) => p.id === a.placement?.positionId);
                        if (pos?.shipId) {
                            const ship = v.ships.find((s) => s.id === pos.shipId), occ = v.positions.filter((p) => p.shipId === ship.id && p.crewId);
                            const rem = 4 - Number(v.phase.slice(-1)), success = ship.position + Math.round((w.extra[goods.indexOf(ship.good)] * rem) / 3) > RULES.finish;
                            const cargo = w.cargoDraw <= 2
                                ? 'safe'
                                : w.cargoDraw <= 4
                                    ? 'cloth'
                                    : w.cargoDraw === 6 && v.act !== 2
                                        ? 'weapons'
                                        : 'porcelain';
                            const terms = cargo === 'safe' ? null : RULES.returnTerms[cargo];
                            const returnPay = terms
                                ? v.act === 2
                                    ? terms[3] + v.effects.stableReturnAdjustment
                                    : w.die >= terms[0]
                                        ? v.act === 1
                                            ? terms[1]
                                            : terms[2]
                                        : 0
                                : 0;
                            const pool = success
                                ? RULES.outboundPrize[ship.good] + v.commodities[ship.good].spread + returnPay
                                : 0;
                            value = pool / (occ.length + 1) - Math.min(Math.max(0, me.cash), pos.cost);
                            for (const seat of occ) {
                                const i = v.players.findIndex((p) => p.crew.some((c) => c.id === seat.crewId));
                                d[i] -= pool / (occ.length * (occ.length + 1));
                            }
                        }
                        break;
                    }
                    case 'PirateBoardOrDecline':
                    case 'PirateTakeoverDecision': {
                        const ship = v.ships.find((s) => s.id === a.shipId), g = goods.indexOf(ship.good);
                        const seats = v.positions.filter((p) => p.shipId === ship.id && p.crewId);
                        const pool = RULES.outboundPrize[ship.good] +
                            v.commodities[ship.good].spread +
                            RULES.returnTerms.cloth[v.act === 2 ? 3 : 1] / 2;
                        value = 0;
                        if (a.type === 'PirateBoardOrDecline') {
                            if (!a.crewId && revised) {
                                value = waitingValue(v, w.salt);
                            }
                            else if (!a.crewId) {
                                for (const other of v.ships)
                                    if (other.status !== 'arrived' && other.position + w.die === RULES.finish) {
                                        value = pool;
                                        break;
                                    }
                            }
                            else {
                                const kicked = seats.find((p) => p.id === a.seatId);
                                const members = kicked ? seats.length : seats.length + 1;
                                value = pool / members;
                                for (const seat of seats) {
                                    const i = v.players.findIndex((p) => p.crew.some((c) => c.id === seat.crewId));
                                    d[i] += (seat === kicked ? 0 : pool / members) - pool / seats.length;
                                }
                                if (v.positions.some((p) => p.kind === 'pilot' && p.crewId) && w.die === 1)
                                    value = 0;
                            }
                        }
                        else if ((v.ruleVersion === '1.3-t4-002' || v.ruleVersion === '1.5') && a.join !== undefined) {
                            value = a.join && v.pendingSpecial?.takeover?.enterPort ? pool / 2 : 0;
                        }
                        else if (a.enterPort !== null) {
                            const price = v.commodities[ship.good].stockPrice;
                            if (a.enterPort) {
                                value = pool / ((v.ruleVersion === '1.3-t4-002' || v.ruleVersion === '1.5') && v.pendingSpecial && v.pendingSpecial.pirateIndex + 1 < v.pendingSpecial.piratePositionIds.length ? 2 : 1);
                                for (let i = 0; i < 4; i++)
                                    d[i] += w.hold[i][g] * (step(price, 1, v.ruleVersion === '1.5') - price);
                            }
                        }
                        break;
                    }
                    case 'ApplyPilotMoves': {
                        value = 0;
                        for (const ship of v.ships) {
                            const moves = a.moves.filter((m) => m.shipId === ship.id);
                            if (!moves.length)
                                continue;
                            const target = ship.position + moves.reduce((n, m) => n + m.delta, 0), change = Number(target === RULES.finish || target + w.die > RULES.finish) -
                                Number(ship.position + w.die > RULES.finish);
                            const g = goods.indexOf(ship.good), price = v.commodities[ship.good].stockPrice;
                            for (let i = 0; i < 4; i++)
                                d[i] += change * w.hold[i][g] * (step(price, 1, v.ruleVersion === '1.5') - price);
                            const seats = v.positions.filter((p) => p.shipId === ship.id && p.crewId);
                            for (const seat of seats) {
                                const i = v.players.findIndex((p) => p.crew.some((c) => c.id === seat.crewId));
                                d[i] +=
                                    (change * (RULES.outboundPrize[ship.good] + v.commodities[ship.good].spread)) /
                                        seats.length;
                            }
                        }
                        break;
                    }
                    case 'VoteReturnOption': {
                        if (revised) {
                            const cash = voteCash(v, a, w.salt, w.die);
                            cash.forEach((x, i) => (d[i] += x));
                            break;
                        }
                        const ballot = v.returnVotes.find((b) => b.shipId === a.shipId);
                        if (a.option !== 'safe') {
                            const [t, first, third, stable] = RULES.returnTerms[a.option];
                            for (const c of ballot.electorate) {
                                const id = v.players.findIndex((p) => p.id === c.ownerId);
                                d[id] +=
                                    (v.act === 2
                                        ? (stable + v.effects.stableReturnAdjustment) / ballot.electorate.length
                                        : w.die >= t
                                            ? (v.act === 1 ? first : third) / ballot.electorate.length
                                            : -v.effects.ransom) / Math.max(1, ballot.electorate.length);
                            }
                        }
                        break;
                    }
                    case 'PledgeStock':
                        value =
                            RULES.pledgeIncome -
                                RULES.pledgeRedemption +
                                (revised ? capitalUse(v, me.cash + RULES.pledgeIncome) - capitalUse(v, me.cash) : 0);
                        break;
                    case 'RedeemPledgedStock':
                        value = revised
                            ? capitalUse(v, me.cash - RULES.pledgeRedemption) - capitalUse(v, me.cash)
                            : me.cash > RULES.pledgeRedemption + 10
                                ? 0.5
                                : -3;
                        break;
                    case 'RedeemCrew':
                        value = revised
                            ? RULES.ransom -
                                v.effects.ransom +
                                Math.max(0, 3 - me.crew.filter((c) => c.status.kind === 'available').length) * 2 +
                                capitalUse(v, me.cash - v.effects.ransom) -
                                capitalUse(v, me.cash)
                            : v.effects.ransom >= me.cash
                                ? -2
                                : 2;
                        break;
                }
                d[self] += value;
                const terminal = w.base[self] + d[self];
                let den = 1;
                for (let i = 0; i < 4; i++)
                    if (i !== self)
                        den += Math.exp(Math.min(700, (w.base[i] + d[i] - terminal) / w.noise));
                terminalAudit?.(a, w.base.map((x, i) => x + d[i]), w.noise, self, w.hold, winner, (good, start) => {
                    const g = goods.indexOf(good), market = v.commodities[good];
                    const arrived = w.forecast[g][start].arrived;
                    return modeledStockChange(market.stockPrice, w.prices[g], market.consecutiveFailures, !!arrived, v.ruleVersion === '1.5');
                });
                return { p: 1 / den, wealth: terminal };
            };
            const results = actions.map((action) => {
                const hint = special.get(JSON.stringify(action)) ?? 0;
                const outcomes = worlds.map((w) => sample(action, w, hint)), score = outcomes.reduce((n, x) => n + x.p, 0) / worlds.length;
                const se = Math.sqrt(outcomes.reduce((n, x) => n + (x.p - score) ** 2, 0) / (worlds.length * (worlds.length - 1)));
                const wealth = outcomes.reduce((n, x) => n + x.wealth, 0) / worlds.length, upper = Math.max(...outcomes.map((x) => x.wealth));
                const key = JSON.stringify(action);
                return {
                    action,
                    score,
                    se,
                    wealth,
                    upper,
                    key,
                    tie: seededRandom(randomSalt + key, 0),
                    reason: 'conditional terminal first-place estimate',
                };
            });
            const tolerance = name === 'RationalRiskSeeker' ? 0.001 : 1e-9;
            results.sort((a, b) => Math.round(b.score / tolerance) - Math.round(a.score / tolerance) ||
                (name === 'RationalRiskSeeker' ? b.upper - a.upper : 0) ||
                Math.round(b.wealth * 1e6) - Math.round(a.wealth * 1e6) ||
                b.tie - a.tie ||
                a.key.localeCompare(b.key));
            const best = results[0];
            const projection = best.action.type === 'AssignShips'
                ? best.action.assignments.map((x) => {
                    const sample = worlds.map((w) => w.forecast[goods.indexOf(x.good)][x.start]);
                    const mean = (k) => sample.reduce((n, r) => n + r[k], 0) / sample.length;
                    return {
                        ...x,
                        arrived: mean('arrived'),
                        boardedArrival: mean('boardedArrival'),
                        grossBack: mean('grossBack'),
                        detention: mean('detention'),
                        board: mean('board'),
                        outbound: mean('outbound'),
                        back: mean('back'),
                        cost: mean('cost'),
                        equity: mean('equity'),
                    };
                })
                : undefined;
            return {
                action: best.action,
                score: best.score,
                reason: best.reason,
                estimate: {
                    projection,
                    samples: worlds.length,
                    se: best.se,
                    low: Math.max(0, best.score - 1.96 * best.se),
                    high: Math.min(1, best.score + 1.96 * best.se),
                    runnerUp: results[1]?.score ?? null,
                },
                candidates: results.map(({ action, score, se, wealth, reason }) => ({
                    action,
                    score,
                    se,
                    wealth,
                    reason,
                })),
            };
        },
    };
}
// Offline diagnostic: the sampler receives exactly the same filtered observation as a policy.
export function auditRouteWorld(v, r, revised) {
    const audit = [];
    makeWorld(v, v.players.findIndex((p) => p.id === v.selfId), new Map(), r, revised, audit);
    return audit;
}
