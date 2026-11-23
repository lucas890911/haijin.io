import { RULES } from '../../shared/src/index.js';
export class SpecialObserver {
    pirates = [];
    pilots = [];
    campChoices = [];
    observe(s, next, a) {
        if (a.type === 'CampChoice')
            this.campChoices.push({ actor: a.actorId, crew: a.crewIds });
        if (a.type === 'PirateBoardOrDecline' || a.type === 'PirateTakeoverDecision') {
            const q = s.pendingSpecial, position = q.piratePositionIds[q.pirateIndex];
            const occupants = (state) => state.positions.filter((p) => p.shipId === a.shipId && p.crewId).map((p) => p.crewId);
            const end = occupants(next);
            this.pirates.push({
                position,
                crew: s.positions.find((p) => p.id === position).crewId,
                phase: s.phase,
                targets: q.shipIds.filter((id) => s.ships.find((x) => x.id === id)?.status === 'awaiting-pirates'),
                ship: a.shipId,
                board: a.type === 'PirateBoardOrDecline' && !!a.crewId,
                wait: a.type === 'PirateBoardOrDecline' ? !a.crewId : a.enterPort === null,
                kicked: occupants(s).filter((id) => !end.includes(id)),
                takeover: a.type === 'PirateTakeoverDecision' && a.enterPort !== null,
                enterPort: a.type === 'PirateTakeoverDecision' ? a.enterPort : null,
            });
        }
        if (a.type === 'ApplyPilotMoves') {
            for (const id of new Set(a.moves.map((m) => m.shipId))) {
                const ship = s.ships.find((x) => x.id === id), after = next.ships.find((x) => x.id === id);
                const seats = s.positions.filter((p) => p.shipId === id && p.crewId);
                const ownCrew = seats.filter((p) => s.players.find((x) => x.id === a.actorId).crew.some((c) => c.id === p.crewId)).length;
                // Simplified last-die estimate: exact 13 is unresolved by dice alone; omit pirate proceeds.
                const chance = (at) => Math.min(6, Math.max(0, at + 6 - RULES.finish)) / 6;
                const direct = after.status === 'arrived';
                const estimateDelta = (((direct ? 1 : chance(after.position)) - chance(ship.position)) *
                    (RULES.outboundPrize[ship.good] + s.commodities[ship.good].spread) *
                    ownCrew) /
                    Math.max(1, seats.length);
                this.pilots.push({
                    position: s.phase === 'PILOT_LARGE' ? 'pilot-large' : 'pilot-small',
                    ship: id,
                    before: ship.position,
                    after: after.position,
                    steps: a.moves.filter((m) => m.shipId === id).map((m) => m.delta),
                    direct,
                    ownCrew,
                    estimateDelta,
                    rankChange: null,
                    failureToSuccess: null,
                });
            }
        }
    }
    finish(s, out, ledger) {
        const sum = (entries) => entries.reduce((n, e) => n + e.delta, 0);
        const rows = out.positions
            .filter((p) => !p.shipId)
            .flatMap((p) => {
            const paid = ledger.filter((e) => e.reason === 'placement' && e.positionId === p.id);
            const openings = Math.max(paid.length, 1 + this.pirates.filter((x) => x.position === p.id && x.board).length);
            return Array.from({ length: openings }, (_, i) => {
                const placement = paid[i];
                return {
                    id: p.id,
                    actor: placement?.playerId ?? null,
                    crew: placement?.crewId ?? null,
                    cost: Math.abs(placement?.delta ?? 0),
                    prize: 0,
                    expense: 0,
                    net: 0,
                    trigger: false,
                    ledgerIds: placement ? [placement.id] : [],
                };
            });
        });
        if (s.act !== 2)
            for (const i of [0, 1]) {
                const crew = s.campCrew[i] ?? null;
                rows.push({
                    id: 'camp-' + (i + 1),
                    actor: crew ? s.players.find((p) => p.crew.some((c) => c.id === crew)).id : null,
                    crew,
                    cost: 0,
                    prize: 0,
                    expense: 0,
                    net: 0,
                    trigger: false,
                    ledgerIds: [],
                });
            }
        const arrived = out.ships.filter((x) => x.status === 'arrived').length;
        const distribute = (seats, reason, field) => {
            const entries = ledger.filter((e) => e.reason === reason);
            if (entries.length !== seats.length)
                throw Error('Ledger count mismatch: ' + reason);
            seats.forEach((seat, i) => {
                const entry = entries[i];
                if (entry.playerId !== seat.actor)
                    throw Error('Ledger owner mismatch: ' + reason);
                seat[field] += field === 'prize' ? entry.delta : -entry.delta;
                seat.ledgerIds.push(entry.id);
            });
        };
        for (const [kind, count] of [
            ['port', arrived],
            ['dock', 3 - arrived],
        ]) {
            distribute(rows.filter((p) => p.crew && p.id.startsWith(kind + '-') && Number(p.id.slice(-1)) <= count), kind, 'prize');
        }
        const insurance = rows.find((p) => p.id === 'insurance');
        distribute(insurance.crew ? [insurance] : [], 'insurance', 'prize');
        distribute(ledger.some((e) => e.reason === 'reimbursement') ? [insurance] : [], 'reimbursement', 'expense');
        const camp = rows.filter((p) => p.crew && p.id.startsWith('camp-'));
        distribute(camp, 'camp', 'cost');
        distribute(ledger.some((e) => e.reason === 'camp-prize') ? camp : [], 'camp-prize', 'prize');
        const eligibility = out.players.map((p) => {
            const ships = out.positions
                .filter((x) => x.shipId && p.crew.some((c) => c.id === x.crewId))
                .map((x) => out.ships.find((y) => y.id === x.shipId));
            const failed = ships.some((x) => x.status === 'failed'), success = ships.some((x) => x.status === 'arrived'), free = p.crew.filter((c) => c.status.kind === 'available').length;
            return { actor: p.id, failed, success, free, eligible: failed && !success && free > 0 };
        });
        for (const row of rows) {
            if (row.id.startsWith('pirate') && row.crew) {
                const last = ledger.filter((e) => e.reason === 'placement' && e.crewId === row.crew).at(-1);
                const entries = last?.id === row.ledgerIds[0]
                    ? ledger.filter((e) => e.crewId === row.crew && e.reason === 'dividend')
                    : [];
                row.prize = sum(entries);
                row.ledgerIds.push(...entries.map((e) => e.id));
            }
            row.trigger = row.id.startsWith('pilot')
                ? this.pilots.some((p) => p.position === row.id)
                : row.prize > 0;
            row.net = row.prize - row.cost - row.expense;
        }
        for (const p of this.pilots) {
            const ship = out.ships.find((x) => x.id === p.ship);
            if (!p.direct && ship.dice.length === 3 && this.pilots.filter((x) => x.ship === p.ship).length === 1) {
                const base = p.before + ship.dice[2];
                if (base !== RULES.finish &&
                    ship.arrivalMethod !== 'pirate' &&
                    !this.pirates.some((x) => x.ship === p.ship && x.takeover)) {
                    p.failureToSuccess = base < RULES.finish && ship.status === 'arrived';
                    if (base > RULES.finish && ship.status === 'arrived')
                        p.rankChange = 0;
                }
            }
        }
        return {
            rows,
            pirates: this.pirates,
            pilots: this.pilots,
            eligibility: s.act === 2 ? [] : eligibility,
            campChoices: this.campChoices,
            dockPaid: sum(ledger.filter((e) => e.reason === 'dock')),
            insuranceDebt: ledger.some((e) => e.reason === 'reimbursement' && e.balance < 0),
            pirateArrivals: rows
                .filter((p) => p.id.startsWith('pirate') &&
                p.crew &&
                out.positions.some((x) => x.crewId === p.crew &&
                    out.ships.some((ship) => ship.id === x.shipId && ship.status === 'arrived')))
                .map((p) => p.crew),
        };
    }
}
