import { LeaderMonitor } from './leader.js';
import { AssetAudit } from './asset-target.js';
import { RULES } from '../../shared/src/index.js';
import { rationalNames, rationalPolicy } from './rational.js';
export function validateEmotions(seats, roles, table) {
    if (seats.length !== 4 ||
        new Set(seats).size !== 4 ||
        roles.length !== 4 ||
        !roles.every((r) => rationalNames.includes(r)))
        throw Error('Four named Rational seats required');
    const entries = Object.entries(table);
    const mixed = new Set(entries.map(([, c]) => c?.kind)).size > 1;
    if (mixed && entries.some(([, c]) => (c?.kind === 'E02' && c.policyVersion !== 'emotion-2-asset-targeting') ||
        (c?.kind === 'E04' && c.policyVersion !== 'emotion-e04-2-evidence')))
        throw Error('Mixed tables require asset-targeting E02 and evidence-gated E04');
    if (entries.length >= 4)
        throw Error('At least one unwrapped Rational seat required');
    if (entries.filter(([, c]) => c?.kind === 'E02').length > 1)
        throw Error('Only one directed target allowed');
    for (const [id, c] of entries) {
        if (!c || Array.isArray(c) || !seats.includes(id) ||
            !['E01', 'E02', 'E03', 'E04', 'E05'].includes(c.kind) ||
            !Number.isFinite(c.intensity) ||
            c.intensity < 0 ||
            c.intensity > 1)
            throw Error('Invalid emotion configuration');
        if ([c.leaderGap, c.minimumAgreement].some(n => n !== undefined && (c.kind !== 'E04' || !Number.isFinite(n) || n < 0 || n > 1)))
            throw Error('Invalid leader threshold');
        if (c.kind === 'E04' && c.policyVersion !== 'emotion-e04-1' && c.policyVersion !== 'emotion-e04-2-evidence')
            throw Error('Explicit E04 version required');
        if (c.kind !== 'E04' && c.policyVersion !== undefined && (c.kind !== 'E02' || c.policyVersion !== 'emotion-2-asset-targeting'))
            throw Error('Invalid asset targeting version');
        if (c.kind === 'E02' ? !seats.includes(c.targetId ?? '') || c.targetId === id : c.targetId !== undefined)
            throw Error('Invalid directed target');
        if (c.minSuccess !== undefined &&
            (c.kind !== 'E05' || !Number.isFinite(c.minSuccess) || c.minSuccess < 0 || c.minSuccess > 1))
            throw Error('Invalid success threshold');
    }
}
const dice = [[1]];
for (let n = 1; n <= 3; n++) {
    const next = Array(6 * n + 1).fill(0);
    dice[n - 1].forEach((p, i) => {
        for (let d = 1; d <= 6; d++)
            next[i + d] += p / 6;
    });
    dice.push(next);
}
function arrivals(v) {
    const n = v.phase.startsWith('PLACEMENT') ? 4 - Number(v.phase.slice(-1)) : 1;
    return v.ships.map((s) => s.status === 'arrived'
        ? 1
        : s.status === 'failed'
            ? 0
            : dice[n].reduce((p, w, i) => p + (s.position + i + (n === 3 ? v.effects.firstSailModifier : 0) > RULES.finish ? w : 0), 0));
}
function threshold(ps, k) {
    let a = [1];
    for (const p of ps) {
        const b = Array(a.length + 1).fill(0);
        a.forEach((w, i) => {
            b[i] += w * (1 - p);
            b[i + 1] += w * p;
        });
        a = b;
    }
    return a.slice(k).reduce((a, b) => a + b, 0);
}
export function gambling(v, a) {
    if (a.type === 'PirateTakeoverDecision' && (a.enterPort === true || a.join === true)) {
        const ship = v.ships.find((s) => s.id === a.shipId);
        return {
            p: 1,
            net: ((RULES.outboundPrize[ship.good] + v.commodities[ship.good].spread) / ((v.ruleVersion === '1.3-t4-002' || v.ruleVersion === '1.5') && (a.join || (v.pendingSpecial && v.pendingSpecial.pirateIndex + 1 < v.pendingSpecial.piratePositionIds.length)) ? 2 : 1)) * (a.join && !v.pendingSpecial?.takeover?.enterPort ? 0 : 1) - (v.ruleVersion === '1.5' ? 7 : RULES.pirateCost),
        };
    }
    const ps = arrivals(v);
    if (a.type === 'PlaceCrewOrPass' && a.placement) {
        const p = v.positions.find((p) => p.id === a.placement.positionId), cost = Math.min(p.cost, Math.max(0, v.players.find((x) => x.id === v.selfId).cash));
        if (p.kind === 'dock' || p.kind === 'port') {
            const port = p.kind === 'port';
            return {
                p: threshold(port ? ps : ps.map((x) => 1 - x), p.seat),
                net: RULES.betPrizes[p.seat - 1] + (port ? v.effects.portBonus : v.effects.dockBonus) - cost,
            };
        }
        if (p.kind === 'ship') {
            const i = v.ships.findIndex((s) => s.id === p.shipId), g = v.ships[i].good;
            return {
                p: ps[i],
                net: Math.ceil((RULES.outboundPrize[g] + v.commodities[g].spread) /
                    (1 + v.positions.filter((x) => x.shipId === p.shipId && x.crewId).length)) - cost,
            };
        }
        if (p.kind === 'pirate') {
            const rolls = 4 - Number(v.phase.slice(-1)), weather = rolls === 3 ? v.effects.firstSailModifier : 0;
            // A successful final-roll takeover can give the pirate the entire ship.
            // Competing pirates may claim first. Estimate the chance of this particular upside.
            const targets = v.ships
                .filter((s) => s.status === 'sailing')
                .map((s) => ({
                p: (dice[rolls][RULES.finish - s.position - weather] ?? 0) * (p.seat === 1 ? 1 : 0.35),
                net: RULES.outboundPrize[s.good] + v.commodities[s.good].spread - cost,
            }));
            const viable = targets.filter((t) => t.p > 0).sort((a, b) => b.net - a.net);
            if (!viable.length)
                return { p: 0, net: -cost };
            const peak = viable[0].net;
            return { p: 1 - viable.filter((t) => t.net === peak).reduce((n, t) => n * (1 - t.p), 1), net: peak };
        }
        if (p.kind === 'insurance') {
            const dock = v.positions.filter((x) => x.kind === 'dock' && x.crewId);
            return {
                p: dock.length ? threshold(ps, 4 - Math.min(...dock.map((x) => x.seat))) : 1,
                net: v.effects.insuranceIncome - cost,
            };
        }
    }
    if (a.type === 'VoteReturnOption' && a.option !== 'safe') {
        const [t, first, third, stable] = RULES.returnTerms[a.option], vote = v.returnVotes.find((b) => b.shipId === a.shipId), n = vote.electorate.length, owned = vote.electorate.filter((c) => c.ownerId === v.selfId).length;
        const prize = v.act === 2 ? stable + v.effects.stableReturnAdjustment : v.act === 1 ? first : third;
        const net = vote.electorate.reduce((z, c, i) => z + (c.ownerId === v.selfId ? Math.floor(prize / n) + Number(i < prize % n) : 0), 0);
        return { p: (v.act === 2 ? 1 : (7 - t) / 6) * (owned === n ? 1 : 1 / vote.options.length), net };
    }
    if (a.type === 'CampChoice' && a.crewIds.length) {
        const ships = v.ships.filter((s) => s.status === 'arrived' && v.positions.some((p) => p.shipId === s.id && p.crewId));
        return { p: 1 - (1 - 0.25) ** ships.length, net: a.crewIds.length * ((v.ruleVersion === '1.5' ? ([20, 12, 8].slice(0, ships.length).reduce((n, x) => n + x, 0) - 3) : RULES.campPrize - RULES.campCost)) };
    }
    return null;
}
export function directed(v, a, target) {
    const tokens = v.players.find((p) => p.id === target).crew.map((c) => c.id);
    const crew = (ship) => v.positions.filter((p) => ship && p.shipId === ship && tokens.includes(p.crewId ?? '')).length;
    if (a.type === 'ApplyPilotMoves')
        return a.moves.reduce((n, m) => {
            const g = v.ships.find((s) => s.id === m.shipId)?.good;
            return (n -
                m.delta *
                    (crew(m.shipId) +
                        v.stocks.filter((s) => s.source === 'subscription' && s.ownerId === target && s.good === g)
                            .length /
                            2));
        }, 0);
    if (a.type === 'PlaceCrewOrPass' && a.placement) {
        const pos = v.positions.find((p) => p.id === a.placement.positionId);
        if (pos.kind === 'ship')
            return crew(pos.shipId) / (v.positions.filter((p) => p.shipId === pos.shipId && p.crewId).length + 1);
        const opposite = pos.kind === 'port' ? 'dock' : pos.kind === 'dock' ? 'port' : null;
        return v.positions.some((p) => p.kind === opposite && tokens.includes(p.crewId ?? '')) ? 0.5 : 0;
    }
    if (a.type === 'PirateBoardOrDecline' && a.crewId)
        return Number(tokens.includes(v.positions.find((p) => p.id === a.seatId)?.crewId ?? ''));
    if (a.type === 'PirateTakeoverDecision' && a.enterPort !== null)
        return crew(a.shipId);
    return 0;
}
export function eligibleGamble(p, net, min) {
    return p > min && net > 0;
}
export class EmotionPolicy {
    config;
    name;
    version;
    base;
    monitor;
    asset;
    highBid = 0;
    lastSeason = 0;
    pressures = 0;
    constructor(role, config, version = 2) {
        this.config = config;
        if (config.policyVersion === 'emotion-2-asset-targeting') {
            if (config.kind !== 'E02' || version !== 2)
                throw Error('Asset targeting requires E02 and rational-2-review');
            this.asset = new AssetAudit();
        }
        if (config.kind === 'E04') {
            if (version !== 2 || (config.policyVersion !== 'emotion-e04-1' && config.policyVersion !== 'emotion-e04-2-evidence'))
                throw Error('E04 requires rational-2-review');
            this.monitor = new LeaderMonitor(config.policyVersion === 'emotion-e04-2-evidence');
            this.asset = new AssetAudit();
        }
        this.base = rationalPolicy(role, version === 2, undefined, config.intensity ? this.asset?.observe : undefined, config.intensity ? this.monitor?.observe.bind(this.monitor) : undefined);
        this.name = role;
        this.version = this.base.version + '+' + (config.policyVersion ?? 'emotion-1');
    }
    choose(v, l, r) {
        this.asset?.reset();
        this.monitor?.resetSamples();
        const base = this.base.choose(v, l, r), cfg = this.config;
        if (!cfg.intensity)
            return base;
        if (this.monitor) {
            const leader = this.monitor.summarize(v, cfg.leaderGap ?? .15, cfg.minimumAgreement ?? .6);
            if (!leader.applicable)
                return { ...base, leader };
            const d = this.asset.decide(v, base, leader.active, cfg.intensity, true);
            return { ...d, leader };
        }
        if (this.asset)
            return this.asset.decide(v, base, cfg.targetId, cfg.intensity);
        const history = v.ledger.filter((e) => e.reason === 'auction' && e.season < v.season);
        let losses = 0;
        for (const e of history.slice().reverse()) {
            if (e.playerId === v.selfId)
                break;
            losses++;
        }
        if (this.lastSeason !== v.season) {
            const prior = history.at(-1);
            if (this.highBid && prior?.playerId !== v.selfId && prior && -prior.delta > this.highBid)
                this.pressures++;
            this.highBid = 0;
            this.lastSeason = v.season;
        }
        const cap = v.players.find((p) => p.id === v.selfId).cash, price = v.auction?.highest?.amount ?? 0, cut = cfg.minSuccess ?? 0.05;
        const rated = (base.candidates ?? [base]).map((d) => {
            const a = d.action;
            let tilt = 0, why = 'no trigger';
            const bet = cfg.kind === 'E05' ? gambling(v, a) : null;
            if (cfg.kind === 'E01' && (a.type === 'BidPublic' || a.type === 'SubmitSealedBid')) {
                tilt = (0.14 * (1 + Math.min(losses, 5)) * Math.log1p(a.amount)) / Math.log1p(Math.max(1, cap));
                why = 'captain bid after ' + losses + ' losses';
            }
            if (cfg.kind === 'E02') {
                tilt = 0.19 * directed(v, a, cfg.targetId);
                why = 'public exposure of ' + cfg.targetId;
            }
            if (cfg.kind === 'E03') {
                if (a.type === 'BidPublic' && v.auction?.highest && v.auction.highest.actorId !== v.selfId) {
                    const rivals = v.players.filter((p) => p.id !== v.selfId && !v.auction.withdrawn.includes(p.id));
                    const ceiling = Math.min(Math.max(0, ...rivals.map((p) => p.cash)), price + 2 + Math.min(5, this.pressures));
                    tilt = a.amount <= ceiling ? 0.09 * (a.amount - price) : 0;
                    why = 'raise active public bidder';
                }
                if (a.type === 'PlaceCrewOrPass' && a.placement) {
                    const p = v.positions.find((p) => p.id === a.placement.positionId);
                    tilt =
                        p.kind === 'ship'
                            ? 0.06 * v.positions.filter((x) => x.shipId === p.shipId && x.crewId).length
                            : 0;
                    why = 'contest occupied ship';
                }
                if (a.type === 'PirateTakeoverDecision' && a.enterPort !== null) {
                    tilt = 0.07 * v.positions.filter((x) => x.shipId === a.shipId && x.crewId).length;
                    why = 'displace crew';
                }
            }
            if (bet) {
                tilt = eligibleGamble(bet.p, bet.net, cut) ? bet.net / 20 : 0;
                why = tilt
                    ? 'threshold-qualified net upside'
                    : bet.net <= 0
                        ? 'nonpositive net'
                        : 'below or equal threshold';
            }
            return { d, tilt, why, bet };
        });
        let best = rated[0], value = 0;
        for (const row of rated) {
            if (row.tilt <= 0)
                continue;
            const gain = (cfg.kind === 'E05' ? 1 - cfg.intensity : 1) * (row.d.score - base.score) + cfg.intensity * row.tilt;
            if (gain > value) {
                best = row;
                value = gain;
            }
        }
        const chosen = value > 0 ? best.d : base;
        if (chosen.action.type === 'BidPublic')
            this.highBid = chosen.action.amount;
        const delta = chosen.score - base.score;
        const { estimate, ...rest } = base;
        return {
            ...rest,
            ...(chosen.action === base.action && estimate ? { estimate } : {}),
            action: chosen.action,
            score: chosen.score,
            reason: chosen === base ? base.reason : best.why,
            emotion: {
                baseBestAction: base.action,
                chosenAction: chosen.action,
                estimatedWinProbabilityDelta: delta,
                estimatedRegret: Math.max(0, -delta),
                emotionKind: cfg.kind,
                intensity: cfg.intensity,
                triggerReason: value > 0 ? best.why : 'rational fallback',
                losses,
                pressures: this.pressures,
                targetId: cfg.targetId ?? null,
                minSuccess: cut,
                options: rated.flatMap((x) => (x.bet ? [{ action: x.d.action, ...x.bet, reason: x.why }] : [])),
            },
        };
    }
}
