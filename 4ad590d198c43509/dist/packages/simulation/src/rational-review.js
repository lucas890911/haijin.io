import { RULES } from '../../shared/src/index.js';
import { seededRandom } from '../../rules-engine/src/index.js';
export function ballotOutcome(options, votes) {
    const counts = options.map((o) => votes.filter((v) => v === o).length);
    const leaders = options.filter((_, i) => counts[i] === Math.max(...counts));
    return leaders.length === 1 ? leaders[0] : null;
}
export function voteCash(v, a, salt, die) {
    const ballot = v.returnVotes.find((b) => b.shipId === a.shipId);
    const choose = (crew, round) => ballot.options[seededRandom(salt + crew, round) % ballot.options.length];
    const votes = ballot.electorate.map((c) => c.crewId === a.crewId ? a.option : choose(c.crewId, ballot.round));
    const result = ballotOutcome(ballot.options, votes) ??
        (ballot.round === 1
            ? ballotOutcome(ballot.options, ballot.electorate.map((c) => choose(c.crewId, 2)))
            : null) ??
        'safe';
    const delta = [0, 0, 0, 0];
    if (result === 'safe')
        return delta;
    const [threshold, first, third, stable] = RULES.returnTerms[result], n = ballot.electorate.length;
    const prize = v.act === 2 ? stable + v.effects.stableReturnAdjustment : v.act === 1 ? first : third;
    const success = v.act === 2 || die >= threshold;
    ballot.electorate.forEach((c, i) => {
        const player = v.players.findIndex((p) => p.id === c.ownerId);
        delta[player] += success ? Math.floor(prize / n) + Number(i < prize % n) : -v.effects.ransom;
    });
    return delta;
}
export function waitingValue(v, salt) {
    const u = (key) => seededRandom(salt + key, 0) / 2 ** 32;
    const sailing = v.ships.filter((s) => s.status === 'sailing' || s.status === 'awaiting-pirates');
    const positions = new Map(sailing.map((s) => [s.id, s.position]));
    for (const pilot of v.positions.filter((p) => p.kind === 'pilot' && p.crewId)) {
        const movable = sailing.filter((s) => positions.has(s.id));
        if (!movable.length)
            break;
        const ship = movable[Math.floor(u(pilot.id) * movable.length)];
        const shift = Math.floor(u(pilot.id + 'shift') * 3) - 1;
        if (!shift)
            continue;
        const target = positions.get(ship.id) + shift;
        if (target === RULES.finish)
            positions.delete(ship.id);
        else if (target >= 1 && target <= RULES.finish)
            positions.set(ship.id, target);
    }
    const targets = sailing
        .filter((s) => positions.has(s.id) && positions.get(s.id) + 1 + Math.floor(u(s.id + 'die') * 6) === RULES.finish)
        .sort((a, b) => RULES.outboundPrize[b.good] +
        v.commodities[b.good].spread -
        RULES.outboundPrize[a.good] -
        v.commodities[a.good].spread);
    const pirates = v.positions.filter((p) => p.kind === 'pirate' && p.crewId).sort((a, b) => a.seat - b.seat);
    for (const p of pirates) {
        if (!targets.length)
            break;
        if (u(p.id + 'claim') < 0.15)
            continue;
        const target = targets.shift();
        if (v.players.find((x) => x.id === v.selfId).crew.some((c) => c.id === p.crewId)) {
            if (u(p.id + 'enter') < 0.1)
                return 0;
            const divisor = (v.ruleVersion === '1.3-t4-002' || v.ruleVersion === '1.5') && pirates.length > 1 ? 2 : 1;
            return (RULES.outboundPrize[target.good] +
                v.commodities[target.good].spread +
                (v.act === 2
                    ? RULES.returnTerms.cloth[3]
                    : RULES.returnTerms.cloth[v.act === 1 ? 1 : 2] * (5 / 6) - v.effects.ransom / 6)) / divisor;
        }
    }
    return 0;
}
// Affordability of one future placement and one affordable subscription, valued in silver.
export function capitalUse(v, cash) {
    const p = v.players.find((x) => x.id === v.selfId);
    const seat = p.crew.some((c) => c.status.kind === 'available')
        ? Math.min(Math.max(0, cash), Math.max(...RULES.betCosts)) * 0.6
        : 0;
    const stock = v.phase === 'AUCTION' || v.phase === 'CAPTAIN_STOCK_OPTION'
        ? Math.min(Math.max(0, cash - RULES.betCosts[0]), RULES.stockMinimum) * 0.5
        : 0;
    return seat + stock;
}
