import { outboundPool, splitDividend, COMMON_EVENTS, GOODS, RULES, offerGood, } from '../../shared/src/index.js';
import { draw, seededRandom, shuffle } from './random.js';
export { seededRandom } from './random.js';
class Rejection extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function requireRule(condition, message) {
    if (!condition)
        throw new Rejection('ILLEGAL_ACTION', message);
}
function unresolved(message) { throw new Rejection('RULE_UNRESOLVED', message); }
const placementPhases = ['PLACEMENT_1', 'PLACEMENT_2', 'PLACEMENT_3'];
export function auctionKind(mode, act) {
    return mode === 'hybrid' ? (act === 1 ? 'public' : 'sealed') : mode;
}
export function actForSeason(season, extendedSecondAct) {
    requireRule(Number.isInteger(season) && season >= 1 && season <= (extendedSecondAct ? 8 : 7), 'Invalid season');
    return season <= 3 ? 1 : season <= (extendedSecondAct ? 6 : 5) ? 2 : 3;
}
export function eventCardsForAct(act, version) {
    if (version === '1.5')
        return [...GOODS.map(g => ('market-' + g)), 'extra-stock', 'dutch', 'reef', ...(act === 2 ? ['navy-rice', 'navy-sulfur'] : ['inspection', 'bribery'])];
    return [...COMMON_EVENTS, ...(act === 2 ? ['prosperity', 'abundance'] : ['inspection', 'bribery'])];
}
function defaultEffects() {
    return { firstSailModifier: 0, portBonus: 0, dockBonus: 0, insuranceIncome: RULES.insuranceIncome,
        ransom: RULES.ransom, stableReturnAdjustment: 0 };
}
function cash(s, playerId, delta, reason, source = {}) {
    delta = delta === 0 ? 0 : delta;
    const p = s.players.find(p => p.id === playerId);
    p.cash += delta;
    s.treasury -= delta;
    s.ledger.push({ id: `ledger-${s.ledger.length + 1}`, season: s.season, version: s.version,
        playerId, delta, treasuryDelta: delta === 0 ? 0 : -delta, balance: p.cash, reason, ...source });
}
export function createGame(options, rng = seededRandom) {
    requireRule(options.playerIds.length === RULES.players && new Set(options.playerIds).size === RULES.players
        && options.playerIds.every(id => typeof id === 'string' && id.length > 0), 'Exactly four unique player IDs required');
    requireRule(options.playerIds.includes(options.firstAuctionPlayerId), 'Starting player must be supplied');
    requireRule(typeof options.seed === 'string' && options.seed.length > 0, 'Seed required');
    const mode = options.mode ?? 'hybrid';
    requireRule(['public', 'sealed', 'hybrid'].includes(mode), 'Invalid auction mode');
    const s = {
        ...(options.ruleVersion === '1.5' ? { pirateProtection: options.pirateProtection ?? true } : {}), ruleVersion: options.ruleVersion ?? '1.2-m04.1', version: 0, seed: options.seed, rngCursor: 0, rngLog: [], season: 1, act: 1,
        extendedSecondAct: false, phase: 'SEASON_START', mode,
        players: options.playerIds.map((id, playerIndex) => ({ id, cash: 0, ...(options.ruleVersion === '1.5' ? { flags: 0, placements: 0 } : {}),
            crew: Array.from({ length: RULES.crewPerPlayer }, (_, i) => ({ id: `crew-${playerIndex + 1}-${i + 1}`,
                ownerId: id, status: { kind: 'available' } })) })),
        stocks: GOODS.flatMap(good => Array.from({ length: RULES.stocksPerGood }, (_, i) => ({
            id: `stock-${good}-${i + 1}`, good, ownerId: null, pledged: false
        }))),
        commodities: Object.fromEntries(GOODS.map(g => [g, { spread: 0, stockPrice: 0, consecutiveFailures: 0 }])),
        ships: Array.from({ length: 3 }, (_, i) => ({ id: `ship-${i + 1}`, good: null, lane: null,
            position: null, status: 'unassigned', dice: [], arrivalRound: null, arrivalMethod: null })),
        eventDeck: [], eventDiscard: [], eventRevealed: null, effects: defaultEffects(), auction: null,
        captainId: null, auctionStarterId: options.firstAuctionPlayerId, stockOptionUsed: false,
        positions: [], placementTurn: 0, ledger: [], treasury: 0, actionLog: [], events: [],
        campTurn: 0, campCrew: [], ransomDone: [], weaponsSuccesses: 0, finalWealth: null, ...(options.reshufflePolicy ? { reshufflePolicy: options.reshufflePolicy } : {}),
        pendingSpecial: null, returnVotes: [], returnCargoTaken: [],
    };
    const stockIds = shuffle(s, s.stocks.map(x => x.id), 'initial-stocks', rng);
    s.players.forEach((p, i) => {
        cash(s, p.id, RULES.initialCash, 'initial');
        for (let j = 0; j < RULES.dealtStocks; j++) {
            const stock = s.stocks.find(x => x.id === stockIds[i * RULES.dealtStocks + j]);
            stock.ownerId = p.id;
            stock.source = 'initial';
        }
    });
    s.eventDeck = shuffle(s, eventCardsForAct(s.act, s.ruleVersion), 'event-deck', rng);
    return s;
}
function revealEvent(s, rng) {
    const card = s.eventDeck.shift();
    if (!card)
        unresolved('Q-EVT-01: event deck exhausted within act');
    s.eventRevealed = card;
    s.eventDiscard.push(card);
    const adjust = (g, delta) => { s.commodities[g].spread = Math.max(RULES.spreadFloor, s.commodities[g].spread + delta); };
    const step = RULES.spreadStep;
    if (card === 'sugar-harvest')
        adjust('sugar', -step);
    if (card === 'rice-shortage')
        adjust('rice', step);
    if (card === 'deerskin-demand')
        adjust('deerskin', step);
    if (card === 'sulfur-demand')
        adjust('sulfur', step);
    if (card === 'surplus' || card === 'merchants') {
        const values = GOODS.map(g => s.commodities[g].spread);
        const target = card === 'surplus' ? Math.max(...values) : Math.min(...values);
        for (const g of GOODS.filter(g => s.commodities[g].spread === target))
            adjust(g, card === 'surplus' ? -step : step);
    }
    const weather = s.ruleVersion === '1.5' ? (s.weather = ['typhoon', 'tailwind', 'normal', 'normal', 'normal'][draw(s, 5, 'weather', rng)]) : card;
    if (weather === 'typhoon')
        Object.assign(s.effects, { firstSailModifier: -1, portBonus: RULES.weatherBonus, insuranceIncome: RULES.typhoonInsurance });
    if (weather === 'tailwind')
        Object.assign(s.effects, { firstSailModifier: 1, dockBonus: RULES.weatherBonus });
    if (card === 'inspection')
        s.effects.ransom = RULES.strictRansom;
    if (card === 'bribery')
        s.effects.ransom = RULES.lenientRansom;
    if (card === 'prosperity')
        s.effects.stableReturnAdjustment = RULES.stableReturnAdjustment;
    if (card === 'abundance')
        s.effects.stableReturnAdjustment = -RULES.stableReturnAdjustment;
    s.events.push({ type: 'EventRevealed', detail: card });
}
function winAuction(s, winner) {
    s.captainId = winner.actorId;
    s.auction.highest = winner;
    s.auction.revealed = true;
    cash(s, winner.actorId, -winner.amount, 'auction');
    s.phase = 'CAPTAIN_STOCK_OPTION';
    s.events.push({ type: 'CaptainElected', actorId: winner.actorId });
}
function nextBidder(s, current) {
    const a = s.auction;
    const start = s.players.findIndex(p => p.id === current);
    for (let n = 1; n <= RULES.players; n++) {
        const id = s.players[(start + n) % RULES.players].id;
        if (!a.withdrawn.includes(id) && a.highest?.actorId !== id)
            return id;
    }
    throw new Error('No next bidder');
}
function positions(s) {
    const result = [];
    const add = (id, kind, cost, seat, shipId = null) => result.push({ id, kind, cost, seat, shipId, crewId: null });
    for (const ship of s.ships)
        RULES.seats[ship.good].forEach((cost, i) => add(`${ship.id}-seat-${i + 1}`, 'ship', cost, i + 1, ship.id));
    for (const kind of ['port', 'dock'])
        RULES.betCosts.forEach((cost, i) => add(`${kind}-${i + 1}`, kind, cost, i + 1));
    add('pirate-1', 'pirate', s.ruleVersion === '1.5' ? 7 : RULES.pirateCost, 1);
    add('pirate-2', 'pirate', s.ruleVersion === '1.5' ? 7 : RULES.pirateCost, 2);
    add('pilot-large', 'pilot', RULES.pilotCosts.large, 1);
    add('pilot-small', 'pilot', RULES.pilotCosts.small, 2);
    add('insurance', 'insurance', 0, 1);
    return result;
}
export function placementActor(s) {
    if (!placementPhases.includes(s.phase) || !s.captainId)
        return null;
    return s.players[(s.players.findIndex(p => p.id === s.captainId) + s.placementTurn) % RULES.players].id;
}
function availablePositions(s) {
    return s.positions.filter(p => !p.crewId && !(p.kind === 'pirate' && (s.pirateBets ?? 0) >= 2) && (p.kind !== 'ship' || s.ships.find(x => x.id === p.shipId)?.status === 'sailing'));
}
function placementPayment(s, actorId, pos) {
    const p = s.players.find(p => p.id === actorId);
    if (s.ruleVersion === '1.5' && s.act === 2 && p.flags && p.placements === 2)
        return 0;
    const minimum = Math.min(...availablePositions(s).map(x => x.cost));
    if (p.cash < 0) {
        requireRule(pos.cost === minimum, 'Debt permits only cheapest available position');
        return 0;
    }
    if (p.cash >= pos.cost)
        return pos.cost;
    requireRule(s.stocks.filter(x => x.ownerId === actorId).every(x => x.pledged), 'Pledge available stocks before subsidy');
    requireRule(p.cash < minimum && pos.cost === minimum, 'Subsidy permits only cheapest available position');
    return p.cash;
}
function decisionActor(s) {
    if (s.phase === 'ANTI_SMUGGLING_PLACEMENT')
        return campActor(s) ?? null;
    if (placementPhases.includes(s.phase))
        return placementActor(s);
    if (s.phase === 'AUCTION' && s.auction?.kind === 'public')
        return s.auction.turnId;
    if (s.phase === 'CAPTAIN_STOCK_OPTION' || s.phase === 'CAPTAIN_ASSIGN_SHIPS')
        return s.captainId;
    return null;
}
function campOrder(s) {
    const i = s.players.findIndex(p => p.id === s.captainId);
    return [...s.players.slice(i), ...s.players.slice(0, i)];
}
function campActor(s) {
    return campOrder(s).slice(s.campTurn).find(p => {
        const aboard = s.positions.filter(pos => pos.shipId && p.crew.some(c => c.id === pos.crewId)).map(pos => s.ships.find(ship => ship.id === pos.shipId).status);
        if (s.ruleVersion === '1.5')
            return aboard.includes('failed');
        return aboard.includes('failed') && !aboard.includes('arrived') && p.crew.some(c => c.status.kind === 'available');
    })?.id;
}
function redeemable(s, id) {
    return s.players.find(p => p.id === id).crew.filter(c => c.status.kind === 'detained' && !c.status.severe && c.status.capturedSeason === s.season);
}
export function voyageStockQuote(price, arrived, failures, pirateImpact, dutchFirst) {
    const voyage = arrived ? 5 : failures % 2 ? -2 : -3;
    const pirate = pirateImpact ? -5 : 0;
    const bonus = dutchFirst ? 5 : 0;
    return { voyage, pirate, bonus, price: Math.min(40, Math.max(0, price + voyage + pirate + bonus)) };
}
function arrivedShips(s) {
    const total = (dice) => dice.reduce((a, b) => a + b, 0);
    // M02 snapshots used two dice plus arrivalRound 3 for pilot arrivals.
    const pilotRank = (ship) => ship.arrivalMethod === 'pilot' || (!ship.arrivalMethod && ship.arrivalRound === 3 && ship.dice.length < 3) ? 0 : 1;
    return s.ships.filter(x => x.status === 'arrived').sort((a, b) => a.arrivalRound - b.arrivalRound || pilotRank(a) - pilotRank(b) || total(b.dice) - total(a.dice) || a.lane - b.lane);
}
export function pirateStockPreview(s, shipId, enterPort) {
    const ship = s.ships.find(candidate => candidate.id === shipId);
    if (!ship?.good)
        return null;
    const market = s.commodities[ship.good];
    const quote = (dutchFirst) => voyageStockQuote(market.stockPrice, enterPort, market.consecutiveFailures + 1, true, dutchFirst);
    let possibilities = [quote(false)];
    if (enterPort && s.eventRevealed === "dutch") {
        const arrival = (candidate) => ({ ...candidate, status: "arrived", arrivalRound: 3, arrivalMethod: "pirate" });
        const pending = s.pendingSpecial?.takeover;
        const known = s.ships.map(candidate => candidate.id === shipId || (candidate.id === pending?.shipId && pending.enterPort) ? arrival(candidate) : candidate);
        if (arrivedShips({ ships: known })[0]?.id === shipId) {
            const queue = s.pendingSpecial;
            const anotherPirate = queue && queue.pirateIndex + 1 < queue.piratePositionIds.length;
            const possible = known.map(candidate => anotherPirate && candidate.status === "awaiting-pirates" && candidate.id !== pending?.shipId ? arrival(candidate) : candidate);
            possibilities = arrivedShips({ ships: possible })[0]?.id === shipId ? [quote(true)] : [quote(false), quote(true)];
        }
    }
    return { previous: market.stockPrice, alreadyApplied: !!ship.pirateImpact, possibilities };
}
function openVote(s) {
    for (const vote of s.returnVotes.filter(v => !v.result)) {
        const cargo = s.act === 2 ? ['cloth', 'porcelain'] : ['cloth', 'porcelain', 'weapons'];
        vote.options = ['safe', ...cargo.filter(o => !s.returnCargoTaken.includes(o))];
        if (!vote.electorate.length || vote.options.length === 1) {
            vote.result = 'safe';
            continue;
        }
        return;
    }
    s.phase = 'RETURN_RESOLUTION';
}
function reduce(s, a, rng) {
    const p = s.players.find(x => x.id === a.actorId);
    const at = (phase) => requireRule(s.phase === phase, `Expected ${phase}, got ${s.phase}`);
    const captain = () => requireRule(s.captainId === a.actorId, 'Only elected captain may act');
    switch (a.type) {
        case 'StartSeason':
            at('SEASON_START');
            s.phase = 'EVENT_REVEAL';
            return;
        case 'RevealEvent':
            at('EVENT_REVEAL');
            requireRule(!s.eventRevealed, 'Event already revealed');
            revealEvent(s, rng);
            return;
        case 'BeginAuction':
            at('EVENT_REVEAL');
            requireRule(s.eventRevealed, 'Reveal event before auction');
            s.auction = { kind: auctionKind(s.mode, s.act), turnId: s.auctionStarterId, withdrawn: [], publicHistory: [],
                sealedBids: [], revealed: false, highest: null };
            s.phase = 'AUCTION';
            return;
        case 'BidPublic':
        case 'WithdrawPublic': {
            at('AUCTION');
            const auction = s.auction;
            requireRule(auction.kind === 'public' && auction.turnId === a.actorId, 'Not your public auction turn');
            if (a.type === 'BidPublic') {
                requireRule(Number.isSafeInteger(a.amount) && a.amount >= RULES.minimumBid && a.amount > (auction.highest?.amount ?? 0), 'Bid must increase in integer silver');
                if (a.amount > p.cash)
                    unresolved('Q-AUC-01: bid exceeds available cash');
                auction.highest = { actorId: a.actorId, amount: a.amount };
                auction.publicHistory.push(auction.highest);
            }
            else {
                if (!auction.highest && auction.withdrawn.length === RULES.players - 1)
                    unresolved('Q-AUC-02: all players withdraw');
                auction.withdrawn.push(a.actorId);
                auction.publicHistory.push({ actorId: a.actorId, amount: null });
            }
            if (auction.highest && auction.withdrawn.length === RULES.players - 1)
                winAuction(s, auction.highest);
            else
                auction.turnId = nextBidder(s, a.actorId);
            return;
        }
        case 'SubmitSealedBid': {
            at('AUCTION');
            const auction = s.auction;
            requireRule(auction.kind === 'sealed' && !auction.sealedBids.some(b => b.actorId === a.actorId), 'One sealed bid per player');
            requireRule(Number.isSafeInteger(a.amount) && a.amount >= RULES.minimumSealedBid, 'Nonnegative integer bid required');
            if (a.amount > Math.max(0, p.cash))
                unresolved('Q-AUC-01: bid exceeds available cash');
            auction.sealedBids.push({ actorId: a.actorId, amount: a.amount });
            s.events.push({ type: 'SealedBidSubmitted', actorId: a.actorId });
            if (auction.sealedBids.length === RULES.players) {
                const maximum = Math.max(...auction.sealedBids.map(b => b.amount));
                // Canonical seating order makes tie draw independent of network submission order.
                const tied = s.players.flatMap(p => auction.sealedBids.filter(b => b.actorId === p.id && b.amount === maximum));
                winAuction(s, tied[tied.length === 1 ? 0 : draw(s, tied.length, 'auction-tie', rng)]);
                s.events.push({ type: 'SealedBidsRevealed' });
            }
            return;
        }
        case 'BuyStockOrSkip': {
            at('CAPTAIN_STOCK_OPTION');
            captain();
            requireRule(!s.stockOptionUsed, 'Stock option already used');
            if (a.stockId !== null) {
                const good = offerGood(a.stockId);
                const stock = good ? marketOffers(s, good).find(x => x.offer === a.stockId)?.stock : undefined;
                requireRule(stock && stock.ownerId === null, 'Stock unavailable');
                requireRule(stock.good !== s.firstPurchase, 'Choose a different commodity');
                const price = Math.max(RULES.stockMinimum, s.commodities[stock.good].stockPrice);
                requireRule(p.cash >= price, 'Insufficient stock purchase cash');
                cash(s, p.id, -price, 'stock');
                stock.ownerId = p.id;
                stock.source = 'subscription';
                stock.publicId = 'purchase-' + s.version;
                if (s.eventRevealed === 'extra-stock' && !s.firstPurchase) {
                    s.firstPurchase = stock.good;
                    return;
                }
            }
            s.stockOptionUsed = true;
            s.phase = 'CAPTAIN_ASSIGN_SHIPS';
            return;
        }
        case 'AssignShips': {
            at('CAPTAIN_ASSIGN_SHIPS');
            captain();
            requireRule(a.assignments.length === 3 && new Set(a.assignments.map(x => x.shipId)).size === 3, 'Assign three distinct ships');
            requireRule(new Set(a.assignments.map(x => x.good)).size === 3, 'Three distinct goods required');
            for (const x of a.assignments) {
                requireRule(s.ships.some(ship => ship.id === x.shipId) && GOODS.includes(x.good), 'Unknown ship or good');
                requireRule(Number.isSafeInteger(x.start) && x.start >= (s.ruleVersion === '1.5' ? 1 : 0) && x.start <= RULES.maxStart, 'Invalid starting position');
                if (x.start === 0)
                    unresolved('Q-ROUTE-01: lower starting position boundary');
            }
            requireRule(a.assignments.reduce((sum, x) => sum + x.start, 0) <= RULES.maxStartTotal, 'Start sum exceeds 9');
            a.assignments.forEach((x, i) => Object.assign(s.ships.find(ship => ship.id === x.shipId), {
                good: x.good, lane: i + 1, position: x.start, status: 'sailing'
            }));
            s.positions = positions(s);
            s.phase = 'PLACEMENT_1';
            s.placementTurn = 0;
            return;
        }
        case 'PlaceCrewOrPass': {
            requireRule(placementPhases.includes(s.phase) && placementActor(s) === p.id, 'Not your placement turn');
            if (a.placement) {
                const crew = p.crew.find(c => c.id === a.placement.crewId);
                const pos = availablePositions(s).find(x => x.id === a.placement.positionId);
                requireRule(crew?.status.kind === 'available' && pos, 'Crew or position unavailable');
                const paid = placementPayment(s, p.id, pos);
                if (s.ruleVersion === '1.5') {
                    p.placements = (p.placements ?? 0) + 1;
                    pos.paid = paid;
                    if (pos.kind === 'pirate')
                        s.pirateBets = (s.pirateBets ?? 0) + 1;
                }
                cash(s, p.id, -paid, 'placement', { positionId: pos.id, crewId: crew.id, ...(pos.shipId ? { shipId: pos.shipId } : {}) });
                crew.status = { kind: 'placed', positionId: pos.id };
                pos.crewId = crew.id;
                if (pos.kind === 'insurance')
                    cash(s, p.id, s.effects.insuranceIncome, 'insurance', { positionId: pos.id, crewId: crew.id });
            }
            s.placementTurn++;
            if (s.placementTurn === RULES.players) {
                s.placementTurn = 0;
                s.phase = s.phase === 'PLACEMENT_1' ? 'SAIL_1' : s.phase === 'PLACEMENT_2' ? 'SAIL_2'
                    : s.positions.some(p => p.id === 'pilot-large' && p.crewId) ? 'PILOT_LARGE'
                        : s.positions.some(p => p.id === 'pilot-small' && p.crewId) ? 'PILOT_SMALL' : 'SAIL_3';
            }
            return;
        }
        case 'PledgeStock':
        case 'RedeemPledgedStock': {
            requireRule(decisionActor(s) === p.id || (s.phase === 'SEASON_END' && !(s.ransomDone ?? []).includes(p.id) && redeemable(s, p.id).length > 0) || (s.phase === 'AUCTION' && s.auction?.kind === 'sealed'
                && !s.auction.sealedBids.some(b => b.actorId === p.id)), 'Financing only at own decision opportunity');
            const stock = s.stocks.find(x => (publicStockId(s, x) ?? x.id) === a.stockId);
            requireRule(stock?.ownerId === p.id, 'Only own stock may be financed');
            if (a.type === 'PledgeStock') {
                requireRule(!stock.pledged, 'Stock already pledged');
                stock.pledged = true;
                cash(s, p.id, RULES.pledgeIncome, 'pledge');
            }
            else {
                requireRule(stock.pledged && p.cash >= RULES.pledgeRedemption, 'Cannot redeem stock');
                stock.pledged = false;
                cash(s, p.id, -RULES.pledgeRedemption, 'redeem');
            }
            return;
        }
        case 'Sail': {
            requireRule(s.captainId, 'Auction must finish before sailing');
            requireRule(s.phase === 'SAIL_1' || s.phase === 'SAIL_2' || s.phase === 'SAIL_3', 'Not a sailing phase');
            const round = s.phase === 'SAIL_1' ? 1 : s.phase === 'SAIL_2' ? 2 : 3;
            for (const ship of [...s.ships].sort((x, y) => x.lane - y.lane)) {
                if (ship.status !== 'sailing')
                    continue;
                const die = draw(s, 6, `sail-${round}:${ship.id}`, rng) + 1;
                ship.dice.push(die);
                ship.position += die + (round === 1 ? s.effects.firstSailModifier : 0);
                if (round === 3 && s.eventRevealed === 'navy-' + ship.good)
                    ship.position += 2;
                if (s.eventRevealed === 'reef' && ship.position === 8) {
                    ship.status = 'failed';
                    continue;
                }
                if (ship.position > RULES.finish) {
                    ship.status = 'arrived';
                    ship.arrivalRound = round;
                    ship.arrivalMethod = 'dice';
                }
                else if (round >= 2 && ship.position === RULES.finish)
                    ship.status = 'awaiting-pirates';
                else if (round === 3)
                    ship.status = 'failed';
            }
            const pending = s.ships.filter(ship => ship.status === 'awaiting-pirates');
            if (pending.length && s.positions.some(p => p.kind === 'pirate' && p.crewId)) {
                s.phase = round === 2 ? 'PIRATE_BOARDING' : 'PIRATE_TAKEOVER';
                s.pendingSpecial = { shipIds: pending.sort((x, y) => x.lane - y.lane).map(x => x.id),
                    piratePositionIds: s.positions.filter(p => p.kind === 'pirate' && p.crewId).sort((x, y) => x.seat - y.seat).map(x => x.id), shipIndex: 0, pirateIndex: 0 };
            }
            else {
                for (const ship of pending)
                    ship.status = round === 2 ? 'sailing' : 'failed';
                s.phase = round === 1 ? 'PLACEMENT_2' : round === 2 ? 'PLACEMENT_3' : 'OUTBOUND_SETTLEMENT';
            }
            return;
        }
        case 'ApplyPilotMoves': {
            const large = s.phase === 'PILOT_LARGE';
            requireRule(large || s.phase === 'PILOT_SMALL', 'Not a pilot phase');
            const pilot = s.positions.find(x => x.id === (large ? 'pilot-large' : 'pilot-small'));
            requireRule(p.crew.some(c => c.id === pilot?.crewId), 'Not active pilot');
            requireRule(Array.isArray(a.moves), 'Invalid moves');
            let cost = 0;
            for (const move of a.moves) {
                requireRule(move && Number.isInteger(move.delta) && move.delta !== 0, 'Invalid pilot displacement');
                cost += Math.abs(move.delta);
                requireRule(cost <= (large ? 2 : 1), 'Pilot movement budget exceeded');
                const ship = s.ships.find(x => x.id === move.shipId);
                requireRule(ship?.status === 'sailing', 'Ship unavailable');
                const target = ship.position + move.delta;
                if (target < 1 || target > RULES.finish)
                    unresolved('Q-PILOT-01: outside marked track');
                ship.position = target;
                if (target === RULES.finish) {
                    ship.status = 'arrived';
                    ship.arrivalRound = 3;
                    ship.arrivalMethod = 'pilot';
                }
            }
            s.phase = large && s.positions.some(x => x.id === 'pilot-small' && x.crewId) ? 'PILOT_SMALL' : 'SAIL_3';
            return;
        }
        case 'PirateBoardOrDecline':
        case 'PirateTakeoverDecision': {
            const boarding = a.type === 'PirateBoardOrDecline';
            at(boarding ? 'PIRATE_BOARDING' : 'PIRATE_TAKEOVER');
            const queue = s.pendingSpecial;
            const ship = s.ships.find(x => x.id === a.shipId && queue.shipIds.includes(x.id) && x.status === 'awaiting-pirates');
            requireRule(ship && ship.id === a.shipId, 'Wrong pirate target');
            const pirate = s.positions.find(x => x.id === queue.piratePositionIds[queue.pirateIndex]);
            const token = p.crew.find(c => c.id === pirate.crewId);
            requireRule(token, 'Wrong pirate actor');
            const seats = s.positions.filter(x => x.shipId === ship.id);
            const vacate = (seat) => {
                const owner = s.players.find(player => player.crew.some(c => c.id === seat.crewId));
                if (s.act === 2 && owner?.flags && seat.crewId)
                    cash(s, owner.id, seat.paid ?? 0, 'flag-pension', { shipId: ship.id, crewId: seat.crewId });
                delete seat.paid;
                if (seat.crewId)
                    s.players.flatMap(x => x.crew).find(c => c.id === seat.crewId).status = { kind: 'available' };
                seat.crewId = null;
            };
            const occupy = (seat) => {
                if (s.ruleVersion === '1.5')
                    ship.pirateImpact = true;
                pirate.crewId = null;
                seat.crewId = token.id;
                token.status = { kind: 'placed', positionId: seat.id };
            };
            const joint = !boarding && (s.ruleVersion === '1.5' || s.ruleVersion === '1.3-t4-002');
            if (joint && !queue.takeover && a.type === 'PirateTakeoverDecision')
                requireRule(a.join === undefined, 'No existing takeover to join');
            const finishTakeover = () => {
                const decision = queue.takeover;
                const target = s.ships.find(x => x.id === decision.shipId);
                target.status = decision.enterPort ? 'arrived' : 'failed';
                target.arrivalRound = decision.enterPort ? 3 : null;
                target.arrivalMethod = decision.enterPort ? 'pirate' : null;
                delete queue.takeover;
            };
            if (joint && queue.takeover && a.shipId !== queue.takeover.shipId) {
                requireRule(a.type === 'PirateTakeoverDecision' && a.join === undefined, 'Join target must be captured ship');
                finishTakeover();
            }
            if (joint && queue.takeover && a.type === 'PirateTakeoverDecision' && a.shipId === queue.takeover.shipId) {
                requireRule(typeof a.join === 'boolean' && a.enterPort === null, 'Choose join or decline; captain pirate controls port');
                if (a.join) {
                    const seat = seats.find(x => !x.crewId);
                    requireRule(seat && token.id !== queue.takeover.firstCrewId, 'No vacant joining seat');
                    occupy(seat);
                }
                finishTakeover();
            }
            else if (boarding && a.crewId !== null) {
                requireRule(a.crewId === token.id, 'Wrong boarding token');
                const empty = seats.filter(x => !x.crewId);
                const seat = seats.find(x => x.id === a.seatId);
                requireRule(seat && (!empty.length || !seat.crewId), 'Choose vacant seat before replacement');
                requireRule(!s.pirateProtection || !ship.boardedPirates?.includes(seat.crewId), 'Already boarded pirate is protected');
                vacate(seat);
                occupy(seat);
                if (s.pirateProtection)
                    (ship.boardedPirates ??= []).push(token.id);
            }
            else if (!boarding && a.enterPort !== null) {
                requireRule(typeof a.enterPort === 'boolean', 'Invalid takeover');
                requireRule(a.type === 'PirateTakeoverDecision' && a.join === undefined, 'Invalid takeover join');
                if (joint && queue.takeover)
                    finishTakeover();
                seats.forEach(vacate);
                occupy(seats[0]);
                if (joint && queue.pirateIndex + 1 < queue.piratePositionIds.length) {
                    queue.takeover = { shipId: ship.id, enterPort: a.enterPort, firstCrewId: token.id };
                    queue.pirateIndex++;
                    return;
                }
                ship.status = a.enterPort ? 'arrived' : 'failed';
                ship.arrivalRound = a.enterPort ? 3 : null;
                ship.arrivalMethod = a.enterPort ? 'pirate' : null;
            }
            queue.pirateIndex++;
            if (queue.pirateIndex >= queue.piratePositionIds.length || !s.ships.some(x => queue.shipIds.includes(x.id) && x.status === 'awaiting-pirates')) {
                for (const pending of s.ships.filter(x => queue.shipIds.includes(x.id) && x.status === 'awaiting-pirates')) {
                    pending.status = boarding ? 'sailing' : 'failed';
                }
                s.phase = boarding ? 'PLACEMENT_3' : 'OUTBOUND_SETTLEMENT';
                s.pendingSpecial = null;
            }
            return;
        }
        case 'SettleOutbound': {
            at('OUTBOUND_SETTLEMENT');
            const owner = (id) => s.players.find(player => player.crew.some(c => c.id === id)).id;
            for (const ship of s.ships) {
                requireRule(ship.good && (ship.status === 'arrived' || ship.status === 'failed'), 'Unresolved voyage');
                const market = s.commodities[ship.good];
                const arrived = ship.status === 'arrived';
                const track = RULES.stockPrices;
                let index = track.indexOf(market.stockPrice);
                if (arrived) {
                    let prize = outboundPool(ship.good, market.spread, s.eventRevealed);
                    if (s.eventRevealed === 'market-' + ship.good) {
                        const dice = [1 + draw(s, 6, 'market:' + ship.id, rng), 1 + draw(s, 6, 'market:' + ship.id, rng)];
                        const sum = dice[0] + dice[1];
                        const change = sum >= 8 ? 18 : sum <= 5 ? -6 : 0;
                        prize += change;
                        s.events.push({ type: 'MarketResult', detail: ship.id + ' 商情 ' + dice.join(' + ') + '，整船調整 ' + change + ' 銀' });
                    }
                    const seats = s.positions.filter(x => x.shipId === ship.id && x.crewId).sort((a, b) => a.seat - b.seat);
                    seats.forEach((seat, i) => cash(s, owner(seat.crewId), splitDividend(prize, seats.length)[i], 'dividend', { shipId: ship.id, crewId: seat.crewId }));
                    index++;
                    market.consecutiveFailures = 0;
                }
                else if (++market.consecutiveFailures === 2 && s.ruleVersion !== '1.5') {
                    index--;
                    market.consecutiveFailures = 0;
                }
                if (s.ruleVersion === '1.5') {
                    const dutchFirst = s.eventRevealed === 'dutch' && arrivedShips(s)[0] === ship;
                    market.stockPrice = voyageStockQuote(market.stockPrice, arrived, market.consecutiveFailures, !!ship.pirateImpact, dutchFirst).price;
                }
                else
                    market.stockPrice = track[Math.max(0, Math.min(track.length - 1, index))];
                market.spread = Math.max(RULES.spreadFloor, market.spread + (arrived ? -1 : 1) * RULES.spreadStep);
            }
            const successes = s.ships.filter(x => x.status === 'arrived').length;
            let reimbursement = 0;
            for (const seat of s.positions) {
                if (!seat.crewId || (seat.kind !== 'port' && seat.kind !== 'dock'))
                    continue;
                const port = seat.kind === 'port';
                if (seat.seat > (port ? successes : s.ships.length - successes))
                    continue;
                const prize = RULES.betPrizes[seat.seat - 1] + (port ? s.effects.portBonus : s.effects.dockBonus);
                cash(s, owner(seat.crewId), prize, seat.kind, { positionId: seat.id, crewId: seat.crewId });
                if (!port)
                    reimbursement += prize;
            }
            const insurer = s.positions.find(x => x.kind === 'insurance')?.crewId;
            if (insurer && reimbursement)
                cash(s, owner(insurer), -reimbursement, 'reimbursement', { positionId: 'insurance', crewId: insurer });
            if (s.act === 2 && s.ruleVersion === '1.5') {
                for (const [rank, ship] of arrivedShips(s).entries()) {
                    const pool = [18, 12, 0][rank];
                    const seats = s.positions.filter(pos => pos.shipId === ship.id && pos.crewId).sort((a, b) => a.seat - b.seat);
                    for (const [i, seat] of seats.entries()) {
                        const source = { shipId: ship.id, crewId: seat.crewId };
                        if (pool)
                            cash(s, owner(seat.crewId), Math.floor(pool / seats.length) + Number(i < pool % seats.length), 'return', source);
                        if (rank === 0 && seat.seat === 1)
                            cash(s, owner(seat.crewId), 6, 'commission', source);
                    }
                }
                s.phase = 'SEASON_END';
                return;
            }
            s.phase = s.act === 2 ? 'RETURN_VOTING' : 'ANTI_SMUGGLING_PLACEMENT';
            return;
        }
        case 'CampChoice': {
            at('ANTI_SMUGGLING_PLACEMENT');
            const eligible = campActor(s);
            requireRule(Array.isArray(a.crewIds) && (eligible === p.id || (!eligible && !a.crewIds.length)), 'Wrong camp turn');
            requireRule(a.crewIds.length + s.campCrew.length <= 2 && new Set(a.crewIds).size === a.crewIds.length, 'Camp capacity');
            const fee = s.ruleVersion === '1.5' ? 3 : RULES.campCost;
            requireRule(s.ruleVersion !== '1.5' || a.crewIds.length <= 1, 'One camp token per player');
            requireRule(p.cash >= a.crewIds.length * fee || !a.crewIds.length, 'Insufficient camp funds');
            for (const id of a.crewIds) {
                const c = p.crew.find(c => c.id === id);
                if (s.ruleVersion === '1.5') {
                    const pos = s.positions.find(x => x.crewId === id && s.ships.some(ship => ship.id === x.shipId && ship.status === 'failed'));
                    requireRule(c && pos, 'Transfer a crew member from a failed ship');
                    pos.crewId = null;
                }
                else
                    requireRule(c?.status.kind === 'available', 'Unavailable camp crew');
                s.campCrew.push(id);
                c.status = { kind: 'placed', positionId: 'camp-' + s.campCrew.length };
                cash(s, p.id, -fee, 'camp', { ...(s.ruleVersion === '1.5' ? { crewId: id } : {}) });
            }
            if (eligible)
                s.campTurn = campOrder(s).findIndex(x => x.id === eligible) + 1;
            if (!campActor(s) || s.campCrew.length === 2)
                s.phase = 'RETURN_VOTING';
            return;
        }
        case 'PrepareReturns': {
            at('RETURN_VOTING');
            requireRule(!s.returnVotes.length, 'Returns already prepared');
            const ships = arrivedShips(s);
            s.returnVotes = ships.map(ship => ({ shipId: ship.id, round: 1, ballots: [], result: null, options: [],
                electorate: s.positions.filter(x => x.shipId === ship.id && x.crewId).sort((a, b) => a.seat - b.seat).map(x => ({ crewId: x.crewId, seat: x.seat, ownerId: s.players.find(p => p.crew.some(c => c.id === x.crewId)).id })) }));
            openVote(s);
            return;
        }
        case 'VoteReturnOption': {
            at('RETURN_VOTING');
            const v = s.returnVotes.find(x => !x.result);
            requireRule(v && a.shipId === v.shipId && v.options.includes(a.option), 'Invalid vote');
            requireRule(v.electorate.some(x => x.crewId === a.crewId && x.ownerId === p.id) && !v.ballots.some(x => x.crewId === a.crewId), 'One vote per actual crew');
            v.ballots.push({ crewId: a.crewId, option: a.option });
            if (v.ballots.length < v.electorate.length)
                return;
            const counts = v.options.map(option => v.ballots.filter(b => b.option === option).length);
            const leaders = v.options.filter((_, i) => counts[i] === Math.max(...counts));
            if (leaders.length > 1 && v.round === 1) {
                v.round = 2;
                v.ballots = [];
                return;
            }
            v.result = leaders.length === 1 ? leaders[0] : 'safe';
            if (v.result !== 'safe')
                s.returnCargoTaken.push(v.result);
            openVote(s);
            return;
        }
        case 'ResolveReturns': {
            at('RETURN_RESOLUTION');
            let failed = false;
            for (const vote of s.returnVotes) {
                const option = vote.result;
                requireRule(option, 'Incomplete vote');
                if (option === 'safe')
                    continue;
                const [threshold, first, third, stable] = RULES.returnTerms[option];
                const die = s.act === 2 ? null : draw(s, 6, 'return:' + vote.shipId, rng) + 1;
                const success = die === null || die >= threshold;
                const prize = s.act === 2 ? stable + s.effects.stableReturnAdjustment : s.act === 1 ? first : third;
                if (success && option === 'weapons' && s.act === 1)
                    s.weaponsSuccesses++;
                if (!success && s.ruleVersion === '1.5')
                    for (const id of s.campCrew) {
                        const officer = s.players.find(player => player.crew.some(c => c.id === id));
                        const gross = option === 'cloth' ? 8 : option === 'porcelain' ? 12 : die === 1 ? 20 : 16;
                        const deduction = 4 * vote.electorate.filter(seat => seat.ownerId === officer.id).length;
                        cash(s, officer.id, Math.max(0, gross - deduction), 'camp-prize', { crewId: id, shipId: vote.shipId });
                    }
                for (const [i, seat] of vote.electorate.entries()) {
                    if (success && option === 'weapons' && s.act === 1 && s.ruleVersion === '1.5') {
                        const player = s.players.find(x => x.id === seat.ownerId);
                        player.flags = (player.flags ?? 0) + 1;
                    }
                    if (success)
                        cash(s, seat.ownerId, Math.floor(prize / vote.electorate.length) + Number(i < prize % vote.electorate.length), 'return', { shipId: vote.shipId, crewId: seat.crewId });
                    else {
                        failed = true;
                        const crew = s.players.flatMap(p => p.crew).find(c => c.id === seat.crewId);
                        crew.status = { kind: 'detained', capturedSeason: s.season, releaseAfterSeason: s.season + 1, severe: option === 'weapons' && die === 1 };
                        s.positions.find(x => x.crewId === crew.id).crewId = null;
                    }
                }
            }
            if (s.ruleVersion === '1.5' && s.returnVotes.every(v => v.result === 'safe'))
                for (const id of s.campCrew)
                    cash(s, s.players.find(p => p.crew.some(c => c.id === id)).id, 3, 'camp-refund', { crewId: id });
            if (failed && s.ruleVersion !== '1.5')
                for (const id of s.campCrew)
                    cash(s, s.players.find(p => p.crew.some(c => c.id === id)).id, RULES.campPrize, 'camp-prize');
            s.phase = 'SEASON_END';
            return;
        }
        case 'RedeemCrew':
        case 'FinishRansom': {
            at('SEASON_END');
            requireRule(!s.ransomDone.includes(p.id) && redeemable(s, p.id).length, 'No pending ransom choice');
            if (a.type === 'FinishRansom') {
                s.ransomDone.push(p.id);
                return;
            }
            const c = redeemable(s, p.id).find(x => x.id === a.crewId);
            requireRule(c && p.cash >= s.effects.ransom, 'Cannot redeem');
            cash(s, p.id, -s.effects.ransom, 'ransom', { crewId: c.id });
            c.status = { kind: 'available' };
            return;
        }
        case 'EndSeason': {
            at('SEASON_END');
            requireRule(s.players.every(p => s.ransomDone.includes(p.id) || !redeemable(s, p.id).length), 'Pending ransom choice');
            for (const c of s.players.flatMap(p => p.crew))
                if (c.status.kind === 'detained' && c.status.releaseAfterSeason === s.season)
                    c.status = { kind: 'available' };
            if (s.season === 3)
                s.extendedSecondAct = s.weaponsSuccesses >= 2;
            const monopoly = s.players.some(p => GOODS.some(g => s.stocks.filter(x => x.ownerId === p.id && x.good === g).length === RULES.stocksPerGood));
            if (monopoly || s.season === (s.extendedSecondAct ? 8 : 7)) {
                s.finalWealth = s.players.map(p => {
                    if (p.flags)
                        cash(s, p.id, p.flags * 10, 'flag-award');
                    for (const c of p.crew)
                        if (c.status.kind === 'detained')
                            cash(s, p.id, -(c.status.severe ? RULES.severeFinalRansom : RULES.ransom), 'final-ransom', { crewId: c.id });
                    const owned = s.stocks.filter(x => x.ownerId === p.id);
                    const stocks = owned.reduce((sum, x) => sum + s.commodities[x.good].stockPrice, 0);
                    const mortgage = owned.filter(x => x.pledged).length * RULES.pledgeRedemption;
                    return { playerId: p.id, cash: p.cash, stocks, mortgage, total: p.cash + stocks - mortgage };
                });
                s.phase = 'FINAL_SETTLEMENT';
                return;
            }
            const nextAct = actForSeason(++s.season, s.extendedSecondAct);
            if (nextAct !== s.act) {
                s.act = nextAct;
                s.eventDeck = shuffle(s, eventCardsForAct(s.act, s.ruleVersion), 'act-event-deck', rng);
                s.eventDiscard = [];
                s.events.push({ type: 'ActDeckChanged', detail: eventCardsForAct(s.act, s.ruleVersion).join(',') });
            }
            s.auctionStarterId = s.captainId;
            s.captainId = null;
            s.auction = null;
            s.stockOptionUsed = false;
            for (const c of s.players.flatMap(p => p.crew))
                if (c.status.kind === 'placed')
                    c.status = { kind: 'available' };
            for (const ship of s.ships)
                Object.assign(ship, { good: null, lane: null, position: null, status: 'unassigned', dice: [], arrivalRound: null, arrivalMethod: null });
            if (s.ruleVersion === '1.5') {
                delete s.weather;
                delete s.firstPurchase;
                s.pirateBets = 0;
                for (const ship of s.ships) {
                    delete ship.pirateImpact;
                    delete ship.boardedPirates;
                }
                for (const player of s.players)
                    player.placements = 0;
            }
            s.positions = [];
            s.placementTurn = 0;
            s.campTurn = 0;
            s.campCrew = [];
            s.ransomDone = [];
            s.returnVotes = [];
            s.returnCargoTaken = [];
            s.eventRevealed = null;
            s.effects = defaultEffects();
            s.phase = 'SEASON_START';
            return;
        }
        default: throw new Rejection('ILLEGAL_ACTION', 'Unknown action');
    }
}
/** Authoritative state never goes to players. Failures return the identical original reference. */
export function applyAction(state, action, rng = seededRandom) {
    try {
        validateActionShape(action);
        if (action.expectedVersion !== state.version)
            throw new Rejection('STALE_VERSION', 'State version has changed');
        requireRule(state.players.some(p => p.id === action.actorId), 'Unknown actor');
        const next = structuredClone(state);
        // Snapshots saved by M02 predate return and endgame bookkeeping.
        next.campTurn ??= 0;
        next.campCrew ??= [];
        next.ransomDone ??= [];
        next.weaponsSuccesses ??= 0;
        next.finalWealth ??= null;
        next.version++;
        const eventStart = next.events.length;
        reduce(next, action, rng);
        next.actionLog.push(structuredClone(action));
        next.events.push({ type: action.type, actorId: action.actorId });
        return { ok: true, state: next, events: structuredClone(next.events.slice(eventStart)) };
    }
    catch (error) {
        if (error instanceof Rejection)
            return { ok: false, state, error: { code: error.code, message: error.message } };
        throw error;
    }
}
// A typed caller is convenient, but JSON arriving from a future host must also fail closed.
function validateActionShape(a) {
    requireRule(a && typeof a === 'object' && typeof a.type === 'string' && typeof a.actorId === 'string'
        && Number.isSafeInteger(a.expectedVersion), 'Malformed action envelope');
    switch (a.type) {
        case 'AssignShips':
            requireRule(Array.isArray(a.assignments) && a.assignments.every(x => x && typeof x === 'object'
                && typeof x.shipId === 'string' && typeof x.good === 'string' && typeof x.start === 'number'), 'Malformed assignments');
            break;
        case 'PlaceCrewOrPass':
            requireRule(a.placement === null || (a.placement && typeof a.placement === 'object'
                && typeof a.placement.crewId === 'string' && typeof a.placement.positionId === 'string'), 'Malformed placement');
            break;
        case 'BuyStockOrSkip':
            requireRule(a.stockId === null || typeof a.stockId === 'string', 'Malformed stock option');
            break;
        case 'PledgeStock':
        case 'RedeemPledgedStock':
            requireRule(typeof a.stockId === 'string', 'Malformed stock ID');
            break;
    }
}
// Old snapshots recorded completed subscriptions in accepted actions. Unknown provenance stays private.
function publicStockId(s, stock) {
    if (stock.source === 'initial' || !stock.ownerId)
        return null;
    if (stock.publicId)
        return stock.publicId;
    const purchase = s.actionLog.find(a => a.type === 'BuyStockOrSkip' && a.stockId === stock.id);
    return purchase ? 'purchase-' + (purchase.expectedVersion + 1) : null;
}
function marketOffers(s, good) {
    return s.stocks.filter(x => !x.ownerId && x.good === good).map((stock, i) => ({ offer: 'offer-' + good + '-' + (i + 1), stock }));
}
function visibleStocks(s, viewer) {
    return s.stocks.flatMap(stock => {
        const id = publicStockId(s, stock);
        const { good, ownerId, pledged } = stock;
        if (id)
            return [{ good, ownerId, pledged, id, publicId: id, source: 'subscription' }];
        return viewer && stock.ownerId === viewer ? [{ good, ownerId, pledged, id: stock.id, source: 'initial' }] : [];
    }).sort((a, b) => a.id.localeCompare(b.id));
}
/** Explicit allowlist: no seed, RNG cursor/log, deck order, action log or unrevealed bids. */
export function getPublicView(s) {
    return structuredClone({ ruleVersion: s.ruleVersion, version: s.version, season: s.season, act: s.act,
        phase: s.phase, mode: s.mode, players: s.players, stocks: visibleStocks(s), inventory: Object.fromEntries(GOODS.map(g => [g, marketOffers(s, g).length])), commodities: s.commodities,
        ships: s.ships, positions: s.positions, captainId: s.captainId, placementActorId: placementActor(s),
        ...(s.ruleVersion === '1.5' ? { weather: s.weather, pirateBets: s.pirateBets ?? 0 } : {}), eventRevealed: s.eventRevealed, effects: s.effects, ledger: s.ledger.map(({ id, version, season, playerId, delta, treasuryDelta, balance, reason, shipId, crewId, positionId }) => ({
            id, version, season, playerId, delta, treasuryDelta, balance, reason, ...(shipId ? { shipId } : {}), ...(crewId ? { crewId } : {}), ...(positionId ? { positionId } : {})
        })), treasury: s.treasury, events: s.events.map(({ type, actorId, detail }) => ({ type, ...(actorId ? { actorId } : {}),
            ...(type === 'EventRevealed' || type === 'ActDeckChanged' || type === 'MarketResult' ? { detail } : {}) })),
        campCrew: s.campCrew, campActorId: s.phase === 'ANTI_SMUGGLING_PLACEMENT' ? campActor(s) : null, gameEnded: !!s.finalWealth, weaponsSuccesses: s.weaponsSuccesses, pendingSpecial: s.pendingSpecial, returnVotes: s.returnVotes.map(v => ({ ...v, ballots: v.result ? v.ballots : [], submittedCrewIds: v.ballots.map(b => b.crewId) })), returnCargoTaken: s.returnCargoTaken,
        auction: s.auction ? { kind: s.auction.kind, turnId: s.auction.kind === 'public' ? s.auction.turnId : null,
            withdrawn: s.auction.withdrawn, publicHistory: s.auction.publicHistory,
            submittedPlayerIds: s.auction.sealedBids.map(b => b.actorId),
            bids: s.auction.revealed ? s.auction.sealedBids : [],
            highest: s.auction.kind === 'public' || s.auction.revealed ? s.auction.highest : null,
            revealed: s.auction.revealed } : null });
}
export function getPlayerView(s, playerId) {
    requireRule(s.players.some(p => p.id === playerId), 'Unknown viewer');
    return { ...getPublicView(s), stocks: visibleStocks(s, playerId), ownFinalWealth: structuredClone(s.finalWealth?.find(p => p.playerId === playerId) ?? null), selfId: playerId, ownSealedBid: s.auction?.sealedBids.find(b => b.actorId === playerId)?.amount ?? null };
}
/** Finite concrete actions plus parameter constraints for bidding and route selection. */
export function getLegalActions(s, actorId) {
    requireRule(s.players.some(p => p.id === actorId), 'Unknown actor');
    const candidates = [];
    const add = (payload) => candidates.push({ ...payload, actorId, expectedVersion: s.version });
    // Candidate validation uses the same reducer. It does not consume external random streams.
    const p = s.players.find(p => p.id === actorId);
    if (s.phase === 'SEASON_START')
        add({ type: 'StartSeason' });
    if (s.phase === 'EVENT_REVEAL')
        add({ type: s.eventRevealed ? 'BeginAuction' : 'RevealEvent' });
    if (s.phase === 'AUCTION' && s.auction?.kind === 'public')
        add({ type: 'WithdrawPublic' });
    if (s.phase === 'CAPTAIN_STOCK_OPTION') {
        candidates.push({ type: 'BuyStockOrSkip', stockId: null, actorId, expectedVersion: s.version });
        for (const good of GOODS)
            for (const { offer } of marketOffers(s, good))
                add({ type: 'BuyStockOrSkip', stockId: offer });
    }
    if (placementPhases.includes(s.phase)) {
        candidates.push({ type: 'PlaceCrewOrPass', placement: null, actorId, expectedVersion: s.version });
        for (const crew of p.crew.filter(c => c.status.kind === 'available'))
            for (const pos of availablePositions(s))
                candidates.push({ type: 'PlaceCrewOrPass', placement: { crewId: crew.id, positionId: pos.id }, actorId, expectedVersion: s.version });
    }
    for (const stock of visibleStocks(s, actorId).filter(x => x.ownerId === actorId))
        candidates.push({
            type: stock.pledged ? 'RedeemPledgedStock' : 'PledgeStock', stockId: stock.id, actorId, expectedVersion: s.version
        });
    if (s.phase === 'OUTBOUND_SETTLEMENT')
        add({ type: 'SettleOutbound' });
    if (s.phase === 'PILOT_LARGE' || s.phase === 'PILOT_SMALL') {
        const steps = s.ships.flatMap(ship => [-1, 1].map(delta => ({ shipId: ship.id, delta })));
        add({ type: 'ApplyPilotMoves', moves: [] });
        for (const first of steps) {
            add({ type: 'ApplyPilotMoves', moves: [first] });
            if (s.phase === 'PILOT_LARGE')
                for (const second of steps)
                    add({ type: 'ApplyPilotMoves', moves: [first, second] });
        }
    }
    if (s.pendingSpecial) {
        const q = s.pendingSpecial;
        for (const shipId of q.shipIds.filter(id => s.ships.some(ship => ship.id === id && ship.status === 'awaiting-pirates'))) {
            const crewId = s.positions.find(x => x.id === q.piratePositionIds[q.pirateIndex])?.crewId;
            if (s.phase === 'PIRATE_BOARDING' && crewId) {
                add({ type: 'PirateBoardOrDecline', shipId, crewId: null });
                for (const seat of s.positions.filter(x => x.shipId === shipId)) {
                    add({ type: 'PirateBoardOrDecline', shipId, crewId, seatId: seat.id });
                }
            }
            if (s.phase === 'PIRATE_TAKEOVER') {
                if (q.takeover?.shipId === shipId) {
                    for (const join of [false, true])
                        add({ type: 'PirateTakeoverDecision', shipId, enterPort: null, join });
                }
                else
                    for (const enterPort of [null, false, true])
                        add({ type: 'PirateTakeoverDecision', shipId, enterPort });
            }
        }
    }
    if (s.phase === 'SAIL_1' || s.phase === 'SAIL_2' || s.phase === 'SAIL_3')
        add({ type: 'Sail' });
    if (s.phase === 'ANTI_SMUGGLING_PLACEMENT') {
        add({ type: 'CampChoice', crewIds: [] });
        const free = s.ruleVersion === '1.5' ? p.crew : p.crew.filter(c => c.status.kind === 'available');
        for (const [i, c] of free.entries()) {
            add({ type: 'CampChoice', crewIds: [c.id] });
            for (const other of free.slice(i + 1))
                add({ type: 'CampChoice', crewIds: [c.id, other.id] });
        }
    }
    if (s.phase === 'RETURN_VOTING') {
        if (!s.returnVotes.length)
            add({ type: 'PrepareReturns' });
        const v = s.returnVotes.find(v => !v.result);
        if (v)
            for (const c of v.electorate.filter(c => c.ownerId === actorId))
                for (const option of v.options)
                    add({ type: 'VoteReturnOption', shipId: v.shipId, crewId: c.crewId, option });
    }
    if (s.phase === 'RETURN_RESOLUTION')
        add({ type: 'ResolveReturns' });
    if (s.phase === 'SEASON_END') {
        add({ type: 'EndSeason' });
        add({ type: 'FinishRansom' });
        for (const c of redeemable(s, actorId))
            add({ type: 'RedeemCrew', crewId: c.id });
    }
    const actions = candidates.filter(a => applyAction(s, a).ok);
    const auction = s.auction;
    const canBid = s.phase === 'AUCTION' && auction && (auction.kind === 'public' ? auction.turnId === actorId
        : !auction.sealedBids.some(b => b.actorId === actorId));
    return { actions,
        bid: canBid && (auction.kind === 'sealed' || p.cash > (auction.highest?.amount ?? 0))
            ? { type: auction.kind === 'public' ? 'BidPublic' : 'SubmitSealedBid',
                minimum: auction.kind === 'public' ? (auction.highest?.amount ?? 0) + 1 : RULES.minimumSealedBid, maximum: Math.max(0, p.cash) } : null,
        assignShips: s.phase === 'CAPTAIN_ASSIGN_SHIPS' && s.captainId === actorId ? {
            shipIds: s.ships.map(x => x.id), goods: [...GOODS], distinctGoods: true, maxStart: RULES.maxStart,
            maxStartTotal: RULES.maxStartTotal, confirmedMinimumStart: 1, orderDefinesLanes: true
        } : null,
        blocked: null };
}
/** Trusted host gateway for authenticated player input. Return only a player projection to clients. */
export function applyPlayerAction(state, actorId, action, rng = seededRandom) {
    const reject = () => ({ ok: false, state, error: { code: 'ILLEGAL_ACTION', message: 'Invalid player action' } });
    if (!action || action.actorId !== actorId)
        return reject();
    if (action.type === 'BuyStockOrSkip' && action.stockId !== null &&
        !GOODS.some(g => marketOffers(state, g).some(x => x.offer === action.stockId)))
        return reject();
    if ((action.type === 'PledgeStock' || action.type === 'RedeemPledgedStock') &&
        !visibleStocks(state, actorId).some(x => x.ownerId === actorId && x.id === action.stockId))
        return reject();
    return applyAction(state, action, rng);
}
