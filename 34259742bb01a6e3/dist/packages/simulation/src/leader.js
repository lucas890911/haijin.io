import { voteCash } from './rational-review.js';
import { seededRandom } from '../../rules-engine/src/index.js';
import { GOODS, RULES } from '../../shared/src/index.js';
export class LeaderMonitor {
    evidenceGate;
    constructor(evidenceGate = false) {
        this.evidenceGate = evidenceGate;
    }
    lastEvidence = '';
    active = null;
    pending = null;
    streak = 0;
    lastVersion = -1;
    samples = [];
    shares = [];
    crew = [];
    returns = [];
    resetSamples() { this.samples = []; this.shares = []; this.crew = []; this.returns = []; }
    observe(v, base, noise, holdings, dieTotal, salt, die) {
        const wealth = base.slice();
        // Only pending outbound dividends; settled cash is already in base.
        const pending = v.phase.startsWith('PLACEMENT') || /^(SAIL|PILOT|PIRATE)_/.test(v.phase);
        for (const ship of pending ? v.ships : []) {
            if (!ship.good || ship.status === 'failed')
                continue;
            const seats = v.positions.filter(p => p.shipId === ship.id && p.crewId);
            const remaining = Math.max(0, 3 - ship.dice.length);
            const arrives = ship.status === 'arrived' || (ship.position ?? 0) + remaining * dieTotal[[...GOODS].sort().indexOf(ship.good)] / 3 > RULES.finish;
            if (!arrives)
                continue;
            for (const p of seats) {
                const i = v.players.findIndex(x => x.crew.some(c => c.id === p.crewId));
                wealth[i] += (RULES.outboundPrize[ship.good] + v.commodities[ship.good].spread) / seats.length;
            }
        }
        const back = base.map(() => 0);
        if (v.phase === 'RETURN_VOTING')
            for (const ballot of v.returnVotes) {
                const first = ballot.electorate[0];
                if (!first || !ballot.options.length)
                    continue;
                if (!ballot.result) {
                    const option = ballot.options[seededRandom(salt + first.crewId, ballot.round) % ballot.options.length];
                    const deltas = voteCash(v, {
                        type: 'VoteReturnOption', actorId: first.ownerId, expectedVersion: v.version,
                        shipId: ballot.shipId, crewId: first.crewId, option
                    }, salt, die);
                    deltas.forEach((n, i) => back[i] += n);
                }
                else if (ballot.result !== 'safe') {
                    const [cut, firstAct, thirdAct, stable] = RULES.returnTerms[ballot.result];
                    const payout = v.act === 2 ? stable + v.effects.stableReturnAdjustment : v.act === 1 ? firstAct : thirdAct;
                    ballot.electorate.forEach((c, i) => {
                        const index = v.players.findIndex(p => p.id === c.ownerId);
                        back[index] += v.act === 2 || die >= cut ? Math.floor(payout / ballot.electorate.length) + Number(i < payout % ballot.electorate.length) : -v.effects.ransom;
                    });
                }
            }
        back.forEach((n, i) => { wealth[i] += n; this.returns[i] = (this.returns[i] ?? 0) + n; });
        const top = Math.max(...wealth), weights = wealth.map(n => Math.exp((n - top) / noise));
        const sum = weights.reduce((a, b) => a + b);
        this.samples.push({ wealth, odds: weights.map(x => x / sum) });
        holdings.forEach((row, i) => {
            const totals = this.shares[i] ??= row.map(() => 0);
            row.forEach((x, j) => totals[j] += x);
            this.crew[i] = (this.crew[i] ?? 0) + wealth[i] - base[i] - back[i];
        });
    }
    summarize(v, threshold, minimumAgreement) {
        const count = this.samples.length;
        const estimates = v.players.map((p, i) => {
            const sorted = this.samples.map(s => s.wealth[i]).sort((a, b) => a - b);
            const debts = v.ledger.filter(e => e.playerId === p.id).reduce((n, e) => n + Number(e.reason === 'pledge') - Number(e.reason === 'redeem'), 0);
            return {
                id: p.id, win: this.samples.reduce((n, s) => n + s.odds[i], 0) / count,
                mean: sorted.reduce((n, x) => n + x) / count, low: sorted[Math.floor((count - 1) * .025)], high: sorted[Math.ceil((count - 1) * .975)],
                publicFloor: p.cash - debts * RULES.pledgeRedemption + v.stocks.filter(s => s.ownerId === p.id && s.source === 'subscription').reduce((n, s) => n + v.commodities[s.good].stockPrice, 0),
                expectedCrew: this.crew[i] / count, expectedReturn: this.returns[i] / count, expectedShares: this.shares[i].map(x => x / count),
                marginalStockExposure: [...GOODS].sort().map((g, j) => {
                    const price = v.commodities[g].stockPrice, track = RULES.stockPrices;
                    return this.shares[i][j] / count * ((v.ruleVersion === '1.5' ? Math.min(5, 40 - price) : (track[track.indexOf(price) + 1] ?? price) - price));
                })
            };
        });
        const [first, second] = [...estimates].sort((a, b) => b.win - a.win);
        const gap = first.win - second.win, idx = estimates.indexOf(first);
        const agreement = this.samples.filter(s => s.wealth.every((n, i) => i === idx || n < s.wealth[idx])).length / count;
        const candidate = first.id;
        const qualifying = gap >= threshold && agreement >= minimumAgreement && gap > 0 ? candidate : null;
        const before = this.active;
        // Compare economically meaningful public observations. A new action envelope,
        // an unpublished sealed bid or another submitted ballot is not new asset evidence.
        const key = this.evidenceGate ? JSON.stringify([
            v.season, v.act, v.eventRevealed, v.effects, v.captainId, v.inventory, v.commodities,
            v.players.map(p => [p.id, p.cash, p.crew]), v.stocks.filter(s => s.source === 'subscription'),
            v.positions, v.ships, v.auction?.highest, v.auction?.withdrawn,
            v.returnVotes.map(b => [b.shipId, b.electorate, b.result]), v.returnCargoTaken,
            v.ledger.filter(e => e.reason === 'pledge' || e.reason === 'redeem').map(e => [e.playerId, e.reason]),
        ]) : '';
        const newEvidence = this.evidenceGate ? key !== this.lastEvidence : v.version !== this.lastVersion;
        if (newEvidence) {
            this.lastEvidence = key;
            this.lastVersion = v.version;
            if (qualifying === this.pending)
                this.streak++;
            else {
                this.pending = qualifying;
                this.streak = 1;
            }
            if (this.streak >= 2)
                this.active = qualifying;
        }
        return {
            ...(this.evidenceGate ? { review: this.diagnostics(estimates, v.selfId, newEvidence, threshold, minimumAgreement) } : {}),
            estimates, candidate, active: this.active, gap, agreement, threshold, minimumAgreement,
            applicable: !!this.active && this.active === qualifying && this.active !== v.selfId,
            event: before === this.active ? (this.active ? 'keep' : 'idle') : !this.active ? 'release' : before ? 'switch' : 'enter'
        };
    }
    diagnostics(estimates, selfId, newEvidence, threshold, minimumAgreement) {
        const gapByTemperature = [], qualifiesByTemperature = [];
        for (const scale of [.75, 1, 1.5]) {
            const means = estimates.map(() => 0);
            for (const sample of this.samples) {
                const weights = sample.odds.map(p => p ** (1 / scale)), sum = weights.reduce((a, b) => a + b);
                weights.forEach((w, i) => means[i] += w / sum / this.samples.length);
            }
            const order = means.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
            const gap = order[0].p - order[1].p, idx = order[0].i;
            const agreement = this.samples.filter(s => s.wealth.every((x, i) => idx === i || x < s.wealth[idx])).length / this.samples.length;
            gapByTemperature.push(gap);
            qualifiesByTemperature.push(gap >= threshold && agreement >= minimumAgreement && gap > 0);
        }
        return { newEvidence, confirmations: this.streak, desperation: 1 - estimates.find(p => p.id === selfId).win, gapByTemperature, qualifiesByTemperature };
    }
}
