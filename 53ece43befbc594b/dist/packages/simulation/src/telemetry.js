import { SpecialObserver } from './special-observer.js';
import { GOODS, RULES } from '../../shared/src/index.js';
function balances(s) {
    return s.players.map((p) => {
        const stocks = s.stocks.filter((x) => x.ownerId === p.id);
        const marketValue = stocks.reduce((n, x) => n + s.commodities[x.good].stockPrice, 0);
        const mortgage = stocks.filter((x) => x.pledged).length * RULES.pledgeRedemption;
        return {
            playerId: p.id,
            cash: p.cash,
            stocks,
            byGood: Object.fromEntries(GOODS.map((g) => [g, stocks.filter((x) => x.good === g).length])),
            marketValue,
            mortgage,
            net: p.cash + marketValue - mortgage,
            detained: p.crew.filter((c) => c.status.kind === 'detained').length,
        };
    });
}
class Season {
    special = new SpecialObserver();
    opening;
    event;
    assigned;
    outbound;
    resolved;
    election;
    votes = [];
    moves = [];
    stockId = null;
    constructor(s) {
        this.opening = this.event = this.assigned = this.outbound = this.resolved = this.election = s;
    }
    finish(s, end, config) {
        const ledger = end.ledger.slice(this.opening.ledger.length);
        const bids = this.election.auction;
        const common = {
            schemaVersion: 1,
            gameId: JSON.stringify([
                config.seed,
                config.strategySeed,
                config.mode,
                config.seats,
                config.agentPolicies,
                config.ruleVersion,
            ]),
            ...config,
            season: s.season,
            act: s.act,
            eventCard: s.eventRevealed,
        };
        const commodities = GOODS.map((g) => ({
            good: g,
            opening: this.opening.commodities[g],
            afterEvent: this.event.commodities[g],
            outbound: this.outbound.commodities[g],
            closing: end.commodities[g],
            shipped: s.ships.some((x) => x.good === g),
            arrived: s.ships.some((x) => x.good === g && x.status === 'arrived'),
            stocks: end.stocks.filter((x) => x.good === g),
        }));
        const voyages = this.outbound.ships.map((ship) => {
            const crew = this.outbound.positions.filter((p) => p.shipId === ship.id && p.crewId);
            const entries = ledger.filter((e) => e.shipId === ship.id && e.reason !== 'return');
            const crewEconomics = [
                ...new Set([...entries.map((e) => e.crewId), ...crew.map((p) => p.crewId)]),
            ].map((crewId) => {
                const payments = entries.filter((e) => e.crewId === crewId);
                return {
                    crewId,
                    ownerId: this.outbound.players.find((p) => p.crew.some((c) => c.id === crewId)).id,
                    cost: -payments.filter((e) => e.reason === 'placement').reduce((n, e) => n + e.delta, 0),
                    dividend: payments.filter((e) => e.reason === 'dividend').reduce((n, e) => n + e.delta, 0),
                    net: payments.reduce((n, e) => n + e.delta, 0),
                };
            });
            return {
                ...ship,
                crewEconomics,
                start: this.assigned.ships.find((x) => x.id === ship.id).position,
                weather: this.event.effects.firstSailModifier,
                rank: s.returnVotes.findIndex((v) => v.shipId === ship.id) + 1 || null,
                crew,
                entries,
                payout: entries.filter((e) => e.reason === 'dividend').reduce((n, e) => n + e.delta, 0),
                moves: this.moves.filter((m) => ('shipId' in m.action && m.action.shipId === ship.id) ||
                    (m.action.type === 'ApplyPilotMoves' && m.action.moves.some((x) => x.shipId === ship.id))),
            };
        });
        const returns = s.returnVotes.map((v, i) => {
            const die = this.resolved.rngLog
                .slice()
                .reverse()
                .find((r) => r.purpose === 'return:' + v.shipId && r.cursor >= this.opening.rngCursor && r.result >= 0);
            const captured = this.resolved.players
                .flatMap((p) => p.crew)
                .filter((c) => v.electorate.some((e) => e.crewId === c.id) && c.status.kind === 'detained');
            const entries = ledger.filter((e) => e.shipId === v.shipId && e.reason === 'return');
            const ballots = this.votes.filter((b) => b.action.shipId === v.shipId);
            const last = ballots.filter((b) => b.round === 2);
            const counts = v.options.map((o) => last.filter((b) => b.action.option === o).length);
            return {
                ...v,
                rank: i + 1,
                ballots,
                firstTie: v.round === 2,
                secondTie: last.length > 0 && counts.filter((n) => n === Math.max(...counts)).length > 1,
                die: die ? die.result + 1 : null,
                outcome: captured.length
                    ? captured.some((c) => c.status.kind === 'detained' && c.status.severe)
                        ? 'severe'
                        : 'failure'
                    : v.result === 'safe'
                        ? 'safe'
                        : 'success',
                captured,
                entries,
                payout: entries.reduce((n, e) => n + e.delta, 0),
                ransom: ledger.filter((e) => e.reason === 'ransom' && captured.some((c) => c.id === e.crewId)),
            };
        });
        const closing = balances(end);
        const players = balances(this.opening).map((opening, i) => {
            const flows = {};
            for (const e of ledger.filter((x) => x.playerId === opening.playerId)) {
                const bucket = (flows[e.reason] ??= { income: 0, expense: 0 });
                if (e.delta >= 0)
                    bucket.income += e.delta;
                else
                    bucket.expense -= e.delta;
            }
            return { playerId: opening.playerId, opening, closing: closing[i], flows };
        });
        return {
            ...common,
            special: this.special.finish(s, this.outbound, ledger),
            commodities,
            voyages,
            returns,
            players,
            ledger,
            camp: s.campCrew,
            auction: {
                kind: bids.kind,
                bids: bids.kind === 'sealed' ? bids.sealedBids : bids.publicHistory,
                winner: bids.highest.actorId,
                amount: bids.highest.amount,
                cashAfter: this.election.players.find((p) => p.id === bids.highest.actorId).cash,
                stockId: this.stockId,
                routes: this.assigned.ships.map((x) => ({
                    shipId: x.id,
                    good: x.good,
                    lane: x.lane,
                    start: x.position,
                })),
            },
        };
    }
}
export class SeasonObserver {
    config;
    records = [];
    current;
    constructor(config, s) {
        this.config = config;
        this.current = new Season(s);
    }
    observe(before, after, a) {
        const c = this.current;
        c.special.observe(before, after, a);
        if (before.phase === 'AUCTION' && after.auction?.revealed)
            c.election = after;
        switch (a.type) {
            case 'RevealEvent':
                c.event = after;
                break;
            case 'BuyStockOrSkip':
                c.stockId = a.stockId;
                break;
            case 'AssignShips':
                c.assigned = after;
                break;
            case 'SettleOutbound':
                c.outbound = before;
                break;
            case 'ResolveReturns':
                c.resolved = after;
                break;
            case 'ApplyPilotMoves':
            case 'PirateBoardOrDecline':
            case 'PirateTakeoverDecision':
                c.moves.push({ action: a, before: before.positions, after: after.positions });
                break;
            case 'VoteReturnOption':
                c.votes.push({ action: a, round: before.returnVotes.find((v) => v.shipId === a.shipId).round });
                break;
            case 'EndSeason':
                this.records.push(c.finish(before, after, this.config));
                this.current = new Season(after);
                break;
        }
    }
}
