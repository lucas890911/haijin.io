import { EmotionPolicy, validateEmotions } from './emotion.js';
import { rationalPolicy, rationalNames } from './rational.js';
import { specialPolicy } from './special-policy.js';
import { competitivePolicy, competitiveNames } from './competitive.js';
import { SeasonObserver } from './telemetry.js';
import { applyPlayerAction, createGame, getLegalActions, getPlayerView, seededRandom, } from '../../rules-engine/src/index.js';
import { names, policy, } from './policies.js';
export function nextHostTurn(s, v) {
    const actor = s.players[0].id;
    switch (s.phase) {
        case 'SEASON_START':
            return { actor, system: { type: 'StartSeason' } };
        case 'EVENT_REVEAL':
            return { actor, system: { type: s.eventRevealed ? 'BeginAuction' : 'RevealEvent' } };
        case 'SAIL_1':
        case 'SAIL_2':
        case 'SAIL_3':
            return { actor, system: { type: 'Sail' } };
        case 'OUTBOUND_SETTLEMENT':
            return { actor, system: { type: 'SettleOutbound' } };
        case 'RETURN_RESOLUTION':
            return { actor, system: { type: 'ResolveReturns' } };
        case 'RETURN_VOTING': {
            if (!v.returnVotes.length)
                return { actor, system: { type: 'PrepareReturns' } };
            const ballot = v.returnVotes.find((b) => !b.result);
            return { actor: ballot.electorate.find((c) => !ballot.submittedCrewIds.includes(c.crewId)).ownerId };
        }
        case 'SEASON_END': {
            const owing = s.players.find((p) => !s.ransomDone.includes(p.id) &&
                p.crew.some((c) => c.status.kind === 'detained' && !c.status.severe && c.status.capturedSeason === s.season));
            return owing ? { actor: owing.id } : { actor, system: { type: 'EndSeason' } };
        }
        case 'AUCTION':
            return {
                actor: v.auction.turnId ?? s.players.find((p) => !v.auction.submittedPlayerIds.includes(p.id)).id,
            };
        case 'CAPTAIN_STOCK_OPTION':
        case 'CAPTAIN_ASSIGN_SHIPS':
            return { actor: s.captainId };
        case 'ANTI_SMUGGLING_PLACEMENT':
            return v.campActorId
                ? { actor: v.campActorId }
                : { actor, system: { type: 'CampChoice', crewIds: [] } };
        case 'PLACEMENT_1':
        case 'PLACEMENT_2':
        case 'PLACEMENT_3':
            return { actor: v.placementActorId };
        case 'PILOT_LARGE':
        case 'PILOT_SMALL':
        case 'PIRATE_BOARDING':
        case 'PIRATE_TAKEOVER': {
            const pos = s.pendingSpecial?.piratePositionIds[s.pendingSpecial.pirateIndex] ??
                (s.phase === 'PILOT_LARGE' ? 'pilot-large' : 'pilot-small');
            const crew = s.positions.find((p) => p.id === pos).crewId;
            return { actor: s.players.find((p) => p.crew.some((c) => c.id === crew)).id };
        }
        default:
            throw new Error('Unexpected phase ' + s.phase);
    }
}
export function runGame(options) {
    const seats = [...(options.seats ?? ['A', 'B', 'C', 'D'])], mode = options.mode ?? 'hybrid';
    const rv = options.rationalVersion ?? (options.emotions ? 2 : undefined);
    const roles = options.agentPolicies ?? names.slice(0, 4);
    if (options.emotions) {
        validateEmotions(seats, roles, options.emotions);
        if (rv !== 2 && rv !== 1)
            throw Error('Emotion baseline must be rational-1 or rational-2-review');
    }
    if (roles.some(p => p instanceof EmotionPolicy))
        throw Error('Use per-game emotions configuration');
    const agents = roles.map((p, i) => {
        const cfg = options.emotions && Object.hasOwn(options.emotions, seats[i]) ? options.emotions[seats[i]] : undefined;
        if (cfg)
            return new EmotionPolicy(p, structuredClone(cfg), rv === 2 ? 2 : 1);
        if (typeof p !== 'string')
            return p;
        if (rationalNames.includes(p))
            return rationalPolicy(p, options.rationalVersion === 3 ? 3 : rv === 2);
        if (competitiveNames.includes(p)) {
            const factory = options.competitiveVersion === 3 ? specialPolicy : competitivePolicy;
            return factory(p, options.optimizeRoute);
        }
        return policy(p);
    });
    const maxActions = options.maxActions ?? 2000, strategySeed = options.strategySeed ?? 'strategy-v1';
    if (typeof options.seed !== 'string' ||
        typeof strategySeed !== 'string' ||
        agents.some((p) => !p || typeof p.choose !== 'function' || !p.name || !p.version) ||
        agents.length !== 4 ||
        seats.length !== 4 ||
        new Set(seats).size !== 4 ||
        !seats.every((id) => typeof id === 'string' && id.length > 0) ||
        !['hybrid', 'sealed', 'public'].includes(mode) ||
        !Number.isSafeInteger(maxActions) ||
        maxActions < 1)
        throw new Error('Invalid simulation configuration');
    const streams = seats.map(() => 0);
    let state = createGame({ seed: options.seed, mode, playerIds: seats, firstAuctionPlayerId: seats[0] }, options.gameRandom?.draw);
    const config = {
        seed: options.seed,
        strategySeed,
        ...(rv ? { rationalVersion: rv } : {}),
        ...(options.gameRandom ? { gameRandomId: options.gameRandom.id } : {}),
        mode,
        seats,
        maxActions,
        ...(options.emotions ? { emotions: structuredClone(options.emotions) } : {}),
        informationModel: "hiddenInitialStocks",
        ...(options.optimizeRoute ? { optimizeRoute: true } : {}),
        ...(options.competitiveVersion ? { competitiveVersion: options.competitiveVersion } : {}),
        ruleVersion: state.ruleVersion,
        agentPolicies: agents.map(({ name, version }) => ({ name, version })),
    };
    const observer = options.seasonRecords ? new SeasonObserver(config, state) : null;
    const decisions = [];
    let status = 'completed';
    let failure = null;
    let actor = null, decision = null;
    const stop = (code, message) => {
        status = code === 'RULE_UNRESOLVED' || code === 'MAX_ACTIONS' ? 'blocked' : 'error';
        failure = {
            code,
            message,
            season: state.season,
            act: state.act,
            phase: state.phase,
            actor,
            decision,
            version: state.version,
        };
    };
    try {
        while (!state.finalWealth) {
            actor = null;
            decision = null;
            if (state.version >= maxActions) {
                stop('MAX_ACTIONS', 'Action limit reached');
                break;
            }
            // Logs are append-only audit data. Candidate probes never need their history.
            // All actual actions, including system transitions, use the full authoritative state.
            const probe = { ...state, actionLog: state.stocks.some(x => x.ownerId && !x.source) ? state.actionLog : [], ledger: [], rngLog: [], events: [] };
            const next = nextHostTurn(state, getPlayerView(probe, seats[0]));
            actor = next.actor;
            if (next.system)
                decision = {
                    action: { ...next.system, actorId: actor, expectedVersion: state.version },
                    reason: 'system',
                    score: 0,
                };
            else {
                const legal = getLegalActions(probe, actor);
                if (!legal.actions.length && !legal.bid && !legal.assignShips) {
                    stop('NO_LEGAL_ACTION', 'No decision offered by engine');
                    break;
                }
                const i = seats.indexOf(actor), agent = agents[i];
                const random = () => seededRandom(JSON.stringify([strategySeed, i]), streams[i]++) / 0x100000000;
                decision = structuredClone(agent.choose(getPlayerView(state, actor), legal, random));
                if (decision.action.actorId !== actor) {
                    stop('ILLEGAL_ACTION', 'Agent selected another actor');
                    break;
                }
            }
            const result = applyPlayerAction(state, actor, decision.action, options.gameRandom?.draw);
            if (!result.ok) {
                stop(result.error.code, result.error.message);
                break;
            }
            decisions.push({
                ...decision,
                phase: state.phase,
                season: state.season,
                round: state.returnVotes.find((v) => !v.result)?.round ?? null,
            });
            observer?.observe(state, result.state, decision.action);
            state = result.state;
        }
    }
    catch (e) {
        stop('EXCEPTION', e instanceof Error ? e.message : String(e));
    }
    const counts = Object.create(null);
    for (const d of decisions.filter((d) => d.reason !== 'system')) {
        const name = agents[seats.indexOf(d.action.actorId)].name, bucket = (counts[name] ??= Object.create(null));
        let key = d.action.type;
        if (d.action.type === 'VoteReturnOption')
            key += ':' + d.action.option;
        if (d.action.type === 'PlaceCrewOrPass')
            key += ':' + (d.action.placement?.positionId.split('-')[0] ?? 'pass');
        bucket[key] = (bucket[key] ?? 0) + 1;
    }
    const cashFlow = {};
    for (const entry of state.ledger)
        cashFlow[entry.reason] = (cashFlow[entry.reason] ?? 0) + entry.delta;
    return {
        summary: {
            config,
            status: status,
            season: state.season,
            actions: state.version,
            wealth: state.finalWealth,
            failure: failure,
            counts,
            cashFlow,
        },
        state,
        decisions,
        seasonRecords: observer?.records,
    };
}
export function* runBatch(options, count) {
    if (!Number.isSafeInteger(count) || count < 1)
        throw new Error('Invalid batch size');
    const pool = options.agentPolicies ?? names;
    if (!pool.length)
        throw new Error('Empty strategy pool');
    if (options.emotions) {
        const ids = options.seats ?? ['A', 'B', 'C', 'D'];
        validateEmotions(ids, pool, options.emotions);
        for (let i = 0; i < count; i++) {
            const seats = ids.map((_, j) => ids[(i + j) % 4]);
            yield runGame({ ...options, seed: options.seed + '-' + i, seats, agentPolicies: seats.map(id => pool[ids.indexOf(id)]) });
        }
        return;
    }
    for (let i = 0; i < count; i++) {
        const agentPolicies = Array.from({ length: 4 }, (_, seat) => pool[(i + seat) % pool.length]);
        yield runGame({ ...options, seed: options.seed + '-' + i, agentPolicies });
    }
}
