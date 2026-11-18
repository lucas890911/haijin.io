import { publicStep } from './public-step.js';
import { applyPlayerAction, createGame, getLegalActions, getPublicView, getPlayerView, seededRandom } from '../../rules-engine/src/index.js';
import { EmotionPolicy, validateEmotions } from './emotion.js';
import { rationalPolicy } from './rational.js';
import { nextHostTurn } from './runner.js';
/** Trusted local host. Only screen() and submit() belong on the player's interface. */
export class SinglePlayerHost {
    #config;
    #state;
    #agents;
    #cursors = [0, 0, 0, 0];
    #humans;
    #viewer;
    #inputs = [];
    #audit;
    constructor(config, audit) {
        if (audit)
            this.#audit = audit;
        this.#config = structuredClone({ ...config, pirateProtection: config.pirateProtection ?? true, ruleVersion: config.ruleVersion ?? "1.5" });
        const { seats, roles, human, emotions, seed, mode } = this.#config;
        validateEmotions(seats, roles, emotions);
        const humans = [human, ...(this.#config.additionalHumans ?? [])];
        this.#humans = new Set(humans);
        this.#viewer = human;
        if (this.#humans.size !== humans.length || humans.some(id => !seats.includes(id) || emotions[id]) ||
            (humans.length < 4 && !seats.some(id => !this.#humans.has(id) && !emotions[id])))
            throw Error('A human seat and at least one unwrapped rational AI are required');
        this.#agents = roles.map((role, i) => {
            const emotion = emotions[seats[i]];
            return emotion ? new EmotionPolicy(role, emotion, 2) : rationalPolicy(role, true);
        });
        this.#state = createGame({ pirateProtection: this.#config.pirateProtection ?? true, ruleVersion: config.ruleVersion ?? "1.5", seed, mode, playerIds: seats, firstAuctionPlayerId: seats[0] });
        this.advance();
    }
    apply(actor, action, system = false) {
        const result = applyPlayerAction(this.#state, actor, action);
        if (!result.ok)
            return result.error;
        const before = this.#state;
        this.#state = result.state;
        this.#audit?.(structuredClone(action), getPublicView(this.#state), publicStep(before, this.#state, action, system));
        return null;
    }
    advance() {
        while (!this.#state.finalWealth) {
            if (this.#state.version >= 2000)
                throw Error('MAX_ACTIONS');
            const { human, seats, strategySeed } = this.#config;
            const next = nextHostTurn(this.#state, getPlayerView(this.#state, human));
            if (this.#config.captainRolls && next.system?.type === 'Sail') {
                next.actor = this.#state.captainId;
                if (this.#humans.has(next.actor)) {
                    this.#viewer = next.actor;
                    return;
                }
            }
            if (!next.system && this.#humans.has(next.actor)) {
                this.#viewer = next.actor;
                return;
            }
            const i = seats.indexOf(next.actor);
            const action = next.system
                ? { ...next.system, actorId: next.actor, expectedVersion: this.#state.version }
                : this.#agents[i].choose(getPlayerView(this.#state, next.actor), getLegalActions(this.#state, next.actor), () => seededRandom(JSON.stringify([strategySeed, i]), this.#cursors[i]++) / 2 ** 32).action;
            const error = this.apply(next.actor, action, !!next.system && !(this.#config.captainRolls && action.type === 'Sail'));
            if (error)
                throw Error(error.code + ' ' + error.message);
        }
    }
    screen() {
        const observation = getPlayerView(this.#state, this.#viewer);
        return this.#state.finalWealth
            ? { status: 'finished', observation, wealth: structuredClone(this.#state.finalWealth) }
            : { status: 'awaiting-human', observation, legal: getLegalActions(this.#state, this.#viewer) };
    }
    submit(action) {
        if (this.#state.finalWealth)
            return { ok: false, reason: 'Finished' };
        if (!action || typeof action !== 'object')
            return { ok: false, reason: 'Invalid action' };
        const legal = getLegalActions(this.#state, this.#viewer);
        if (!legal.actions.some(a => a.type === action.type) && legal.bid?.type !== action.type &&
            !(action.type === 'AssignShips' && legal.assignShips))
            return { ok: false, reason: 'Action is not offered at this prompt' };
        const error = this.apply(this.#viewer, structuredClone(action));
        if (error)
            return { ok: false, reason: error.message };
        this.#inputs.push(structuredClone(action));
        this.advance();
        return { ok: true };
    }
    exportFinished() {
        if (!this.#state.finalWealth)
            throw Error('Export requires a finished game');
        const { actionLog, rngLog, ledger, stocks, commodities, finalWealth, ruleVersion } = this.#state;
        return structuredClone({ schema: 'haijin-completed-1', rulesDocument: ruleVersion === '1.5' ? 'V1.5' : 'V1.3', ruleVersion, rationalVersion: 2, save: this.saveForHost(), actionLog, rngLog, ledger, stocks, commodities, finalWealth });
    }
    saveForHost() {
        return structuredClone({ format: 'm063-replay-1', config: this.#config, humanActions: this.#inputs, checkpoint: this.#state.version });
    }
    static restore(save, audit) {
        if (save.format !== 'm063-replay-1')
            throw Error('Unsupported host save');
        const host = new SinglePlayerHost({ ...save.config, pirateProtection: save.config.pirateProtection ?? false, ruleVersion: save.config.ruleVersion ?? "1.2-m04.1" }, audit);
        for (const action of save.humanActions)
            if (!host.submit(action).ok)
                throw Error('Save diverged at human action ' + action.expectedVersion);
        if (host.#state.version !== save.checkpoint)
            throw Error('Save checkpoint mismatch');
        return host;
    }
}
