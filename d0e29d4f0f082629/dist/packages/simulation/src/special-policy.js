import { RULES } from '../../shared/src/index.js';
import { competitivePolicy } from './competitive.js';
const dice = [[1]];
for (let n = 1; n <= 3; n++) {
    const next = Array(6 * n + 1).fill(0);
    dice[n - 1].forEach((p, sum) => {
        for (let d = 1; d <= 6; d++)
            next[sum + d] += p / 6;
    });
    dice.push(next);
}
const cargos = ['cloth', 'porcelain', 'weapons'];
function terms(v, item) {
    const [threshold, early, late, stable] = RULES.returnTerms[item];
    return {
        p: v.act === 2 ? 1 : (7 - threshold) / 6,
        reward: v.act === 2 ? stable + v.effects.stableReturnAdjustment : v.act === 1 ? early : late,
    };
}
function shares(v, ship) {
    const aboard = v.positions.filter((p) => p.shipId === ship.id && p.crewId);
    const own = v.players.find((p) => p.id === v.selfId).crew;
    return { count: aboard.length, own: aboard.filter((p) => own.some((c) => c.id === p.crewId)).length };
}
// Enumerate uncertain cargo choices (safe included), without replacement, in public arrival order.
function campRisk(v) {
    const ships = v.ships
        .filter((s) => s.status === 'arrived' && shares(v, s).count)
        .sort((a, b) => a.arrivalRound - b.arrivalRound ||
        Number(b.arrivalMethod === 'pilot') - Number(a.arrivalMethod === 'pilot') ||
        b.dice.reduce((a, b) => a + b, 0) - a.dice.reduce((a, b) => a + b, 0) ||
        a.lane - b.lane);
    function survive(i, options, attempted = false) {
        if (i === ships.length)
            return v.ruleVersion === '1.5' ? (attempted ? 0 : 3) : 1;
        const crew = shares(v, ships[i]).count;
        const choices = options.map((item) => {
            const { p, reward } = terms(v, item);
            return { item, p, w: Math.exp(((p * reward) / crew - (1 - p) * v.effects.ransom) / 7) };
        });
        const weight = 1 + choices.reduce((n, c) => n + c.w, 0);
        if (v.ruleVersion === '1.5') {
            const deduction = 4 * shares(v, ships[i]).own;
            const payoff = (item) => item === 'cloth' ? Math.max(0, 8 - deduction) / 6 : item === 'porcelain' ? Math.max(0, 12 - deduction) / 2 : (Math.max(0, 20 - deduction) + 3 * Math.max(0, 16 - deduction)) / 6;
            return (survive(i + 1, options, attempted) + choices.reduce((n, c) => n + c.w * (payoff(c.item) + survive(i + 1, options.filter(x => x !== c.item), true)), 0)) / weight;
        }
        return ((survive(i + 1, options) +
            choices.reduce((n, c) => n +
                c.w *
                    c.p *
                    survive(i + 1, options.filter((x) => x !== c.item)), 0)) /
            weight);
    }
    if (v.ruleVersion === "1.5")
        return survive(0, cargos);
    return (1 -
        survive(0, cargos.filter((x) => v.act !== 2 || x !== 'weapons')));
}
export function specialPolicy(name, optimizeRoute = false) {
    const base = competitivePolicy(name, optimizeRoute), risk = name === 'CompetitiveRiskSeeker', stock = name === 'CompetitiveStockInvestor';
    return {
        ...base,
        version: optimizeRoute ? '3.2-private-route' : '3.1-private',
        choose(v, l, random) {
            const scored = scoreSpecial(v, l, risk, stock);
            if (!scored.length)
                return base.choose(v, l, random);
            const ranked = scored
                .map((d) => ({ ...d, rank: d.score + random() * 0.001 }))
                .sort((a, b) => b.rank - a.rank);
            const { action, score, reason } = ranked[0];
            return { action, score, reason, candidates: scored };
        },
    };
}
export function scoreSpecial(v, l, risk = false, stock = false) {
    if (!/^(PLACEMENT_|PIRATE_|PILOT_|ANTI_SMUGGLING)/.test(v.phase))
        return [];
    const me = v.players.find((p) => p.id === v.selfId);
    const owner = (id) => v.players.find((p) => p.crew.some((c) => c.id === id))?.id;
    const pirates = v.positions.filter((p) => p.kind === 'pirate' && p.crewId);
    const round = v.phase.startsWith('PLACEMENT') ? Number(v.phase.slice(-1)) : 3;
    const rolls = 4 - round, liquidity = me.cash < 12 ? (risk ? 1.1 : 1.35) : 1;
    function odds(s, pos = s.position, force = false) {
        if (force || s.status === 'arrived')
            return { port: 1, exact: 0 };
        if (s.status === 'failed')
            return { port: 0, exact: 0 };
        const weather = round === 1 ? v.effects.firstSailModifier : 0;
        const target = RULES.finish - pos - weather;
        const exact = dice[rolls][target] ?? 0;
        const over = dice[rolls].reduce((n, p, i) => n + (i > target ? p : 0), 0);
        return { port: over + exact * (pirates.length ? 0.8 : 0), exact };
    }
    // Placement forecasts marginalize a possible single pilot step toward the pilot owner's
    // crew interest. At the pilot's actual turn the legal move is evaluated explicitly below.
    const ports = v.ships.map((s) => {
        const raw = odds(s).port;
        if (!v.phase.startsWith('PLACEMENT') || s.status !== 'sailing')
            return raw;
        const pilots = v.positions.filter((p) => p.kind === 'pilot' && p.crewId);
        if (!pilots.length)
            return raw;
        const crew = v.positions.filter((p) => p.shipId === s.id && p.crewId);
        const interested = pilots.filter((p) => crew.some((c) => owner(c.crewId) === owner(p.crewId)));
        const forward = interested.length > 0;
        const shifted = Math.max(1, s.position + (forward ? 1 : -1));
        const probability = (forward ? 0.4 : 0.15) / rolls;
        return (raw * (1 - probability) + odds(s, shifted, rolls === 1 && shifted === RULES.finish).port * probability);
    });
    function atLeast(ps, k) {
        let distribution = [1];
        for (const p of ps) {
            const next = Array(distribution.length + 1).fill(0);
            distribution.forEach((w, i) => {
                next[i] += w * (1 - p);
                next[i + 1] += w * p;
            });
            distribution = next;
        }
        return distribution.slice(k).reduce((a, b) => a + b, 0);
    }
    const failure = ports.map((p) => 1 - p);
    const gross = (ship) => RULES.outboundPrize[ship.good] + v.commodities[ship.good].spread;
    function returnValue(n) {
        if (v.ruleVersion === "1.5" && v.act === 2)
            return 10 / n; // Mean pool across three ranks before arrival order is known.
        return Math.max(0, ...cargos
            .filter((c) => v.act !== 2 || c !== 'weapons')
            .map((c) => {
            const t = terms(v, c);
            return (t.p * t.reward) / n - (1 - t.p) * (v.effects.ransom + 3) * (risk ? 0.5 : 1);
        }));
    }
    const shipValue = (s, n) => gross(s) / n + returnValue(n);
    const waitValue = v.ships.reduce((sum, s) => sum + odds(s).exact * shipValue(s, 1), 0);
    const liability = v.positions
        .filter((p) => p.kind === 'dock')
        .reduce((n, p) => n +
        atLeast(failure, p.seat) *
            (RULES.betPrizes[p.seat - 1] + v.effects.dockBonus) *
            (p.crewId ? 1 : 0.18 * rolls), 0);
    const camp = v.phase === 'ANTI_SMUGGLING_PLACEMENT' ? campRisk(v) : 0;
    function estimate(a) {
        if (a.type === 'PlaceCrewOrPass') {
            if (!a.placement)
                return [0, 'reserve token'];
            const p = v.positions.find((p) => p.id === a.placement.positionId);
            const cost = v.act === 2 && me.flags && me.placements === 2 ? 0 : Math.min(Math.max(0, me.cash), p.cost) * liquidity;
            if (p.kind === 'dock' || p.kind === 'port') {
                const prob = atLeast(p.kind === 'port' ? ports : failure, p.seat), reward = RULES.betPrizes[p.seat - 1] + (p.kind === 'port' ? v.effects.portBonus : v.effects.dockBonus);
                return [
                    prob * reward - cost,
                    'threshold p=' + prob.toFixed(3) + ' gross=' + reward + ' capital cost=' + cost,
                ];
            }
            if (p.kind === 'insurance')
                return [
                    v.effects.insuranceIncome - liability * (me.cash < 12 ? 1.3 : 1),
                    'premium=' + v.effects.insuranceIncome + ' projected dock liability=' + liability.toFixed(2),
                ];
            if (p.kind === 'pirate')
                return [
                    waitValue * (p.seat === 1 ? 1 : 0.65) * (risk ? 1.25 : 1) + (round < 3 ? 2 : 0) - cost,
                    'exact-track takeover and return EV=' + waitValue.toFixed(2),
                ];
            if (p.kind === 'pilot') {
                const leverage = v.ships.reduce((n, s) => {
                    const h = shares(v, s);
                    return n + (((h.own + 0.35) * gross(s)) / Math.max(1, h.count)) * odds(s).port * (1 - odds(s).port);
                }, 0);
                return [
                    leverage * (p.seat === 1 ? 0.7 : 0.45) * (risk ? 1.4 : 1) - cost,
                    'crew dividend sensitivity=' + leverage.toFixed(2),
                ];
            }
            const s = v.ships.find((s) => s.id === p.shipId), h = shares(v, s), n = h.count + 1;
            const dilution = 1 + 0.65 * (rolls - 1);
            const value = odds(s).port * (shipValue(s, n + dilution) - (h.own * gross(s)) / (n * Math.max(1, h.count)));
            return [
                value - cost,
                'arrival p=' + odds(s).port.toFixed(3) + ' expected shared voyage=' + value.toFixed(2),
            ];
        }
        if (a.type === 'CampChoice')
            return [
                a.crewIds.length * ((v.ruleVersion === '1.5' ? camp - 3 * liquidity : camp * RULES.campPrize - RULES.campCost * liquidity)) -
                    (a.crewIds.length === 2 && !risk ? 0.8 : 0),
                (v.ruleVersion === '1.5' ? 'expected camp gross=' : 'at least one failed return p=') + camp.toFixed(3),
            ];
        if (a.type === 'PirateBoardOrDecline' || a.type === 'PirateTakeoverDecision') {
            const s = v.ships.find((s) => s.id === a.shipId), h = shares(v, s);
            const priority = owner(pirates[0]?.crewId ?? null) === v.selfId ? 1 : 0.65;
            if (a.type === 'PirateBoardOrDecline') {
                if (!a.crewId)
                    return [waitValue * priority, 'reserve for final exact-track opportunities'];
                const kicked = v.positions.find((p) => p.id === a.seatId)?.crewId;
                const n = h.count + (kicked ? 0 : 1);
                const displacement = kicked ? (owner(kicked) === v.selfId ? -1 : 0.25) * shipValue(s, n) : 0;
                const hazard = pirates.length > 1 && v.positions.some((p) => p.kind === 'pilot' && p.crewId) ? 1 / 6 : 0;
                return [
                    (shipValue(s, n) + displacement) * (1 - hazard),
                    'board share, displaced owner and recapture risk=' + hazard,
                ];
            }
            if (a.type === 'PirateTakeoverDecision' && a.join !== undefined)
                return [a.join && v.pendingSpecial?.takeover?.enterPort ? shipValue(s, 2) : 0, 'join confirmed takeover using a vacant seat'];
            const coPirate = (v.ruleVersion === '1.3-t4-002' || v.ruleVersion === '1.5') && v.pendingSpecial && v.pendingSpecial.pirateIndex + 1 < v.pendingSpecial.piratePositionIds.length;
            const m = v.stocks.filter((x) => x.good === s.good && x.ownerId !== null);
            const influence = m.reduce((n, x) => n + (x.ownerId === v.selfId ? 1 : -0.4), 0) * (stock ? 5 : 3);
            return [
                a.enterPort === null ? 0 : a.enterPort ? shipValue(s, coPirate ? 2 : 1) + influence : -influence,
                'sole outbound/return value and public stock exposure',
            ];
        }
        if (a.type === 'ApplyPilotMoves') {
            let total = 0;
            for (const s of v.ships) {
                const moves = a.moves.filter((m) => m.shipId === s.id);
                if (!moves.length)
                    continue;
                const pos = s.position + moves.reduce((n, m) => n + m.delta, 0), direct = pos === RULES.finish;
                const after = odds(s, pos, direct), before = odds(s), h = shares(v, s), n = Math.max(1, h.count);
                const stake = (h.own - 0.4 * (h.count - h.own)) * shipValue(s, n);
                const equity = v.stocks.filter((x) => x.good === s.good && x.ownerId === v.selfId).length * (stock ? 4 : 2);
                const pirateStake = pirates.reduce((n, p) => n + (owner(p.crewId) === v.selfId ? 1 : -0.35) / p.seat, 0);
                total +=
                    (after.port - before.port) * (stake + equity) +
                        (after.exact - before.exact) * pirateStake * shipValue(s, 1);
                if (direct)
                    total += ((v.act === 2 ? 4 : 2) * (h.own - 0.4 * (h.count - h.own))) / n;
            }
            return [total, 'change in crew, shares, exact-track piracy and return priority'];
        }
        if (a.type === 'RedeemPledgedStock')
            return [me.cash > 35 ? 3 : -15, 'redemption vs liquidity'];
        return [-20, 'retain stock unless required for funding'];
    }
    return l.actions.map((action) => {
        const [score, reason] = estimate(action);
        return { action, score, reason };
    });
}
