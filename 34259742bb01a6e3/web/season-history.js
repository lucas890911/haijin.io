// Display snapshots are rebuilt by replay in the trusted worker.
/** @typedef {{achievementId:string, title:string, description:string, unlockSeason:number,
 * evidence:string[], icon?:string, rarity?:string}} Achievement */
export const achievementPresentation = Object.freeze({
  status: "inactive", achievements: /** @type {readonly Achievement[]} */ (Object.freeze([])), displayTitle: null,
});

const groups = {
  dividend: "income", "pirate-dividend": "income", return: "income", buyout: "income",
  port: "income", dock: "income", insurance: "income", "camp-prize": "income", "camp-refund": "income",
  commission: "income", "flag-pension": "income",
  auction: "expense", placement: "expense", reimbursement: "expense", camp: "expense", ransom: "expense",
  stock: "investment", pledge: "finance", redeem: "finance",
  "flag-award": "final", "final-ransom": "final",
};

function market(view) {
  return Object.fromEntries(Object.entries(view.commodities).map(([good, {stockPrice, spread}]) =>
    [good, {stockPrice, spread, inventory: view.inventory[good]}]));
}

function personalAssets(view, pledgeRedemption) {
  const player = view.players.find(player => player.id === view.selfId);
  const stocks = Object.entries(view.commodities).map(([good, {stockPrice}]) => {
    const owned = view.stocks.filter(stock => stock.ownerId === view.selfId && stock.good === good);
    return {good, stockPrice, count: owned.length, pledged: owned.filter(stock => stock.pledged).length,
      value: owned.length * stockPrice};
  });
  const stockValue = stocks.reduce((sum, stock) => sum + stock.value, 0);
  const mortgage = stocks.reduce((sum, stock) => sum + stock.pledged, 0) * pledgeRedemption;
  return {playerId: view.selfId, cash: player.cash, stocks, stockValue, mortgage, flags: player.flags ?? 0,
    detained: player.crew.filter(crew => crew.status.kind === "detained")
      .map(crew => ({crewId: crew.id, severe: crew.status.severe, releaseAfterSeason: crew.status.releaseAfterSeason})),
    bookValue: player.cash + stockValue - mortgage};
}

function boundary(view) {
  return {version: view.version, market: market(view),
    players: view.players.map(({id, cash, flags}) => ({id, cash, flags: flags ?? 0}))};
}

function majorEvents(step) {
  const categories = ["ResolveReturns", "PirateTakeoverDecision", "RedeemCrew", "EndSeason"];
  if (categories.includes(step.type)) {
    return step.lines.filter(line => /軍武|令旗|回到手中|被拘押|劫持|軍備支援|下一季|本局結束|進入第/.test(line)
      && !/終局現銀|現有令旗/.test(line));
  }
  if (step.type === "PlaceCrewOrPass") return step.lines.filter(line => line.startsWith("水師令旗發動"));
  return [];
}

/** Only public values and the selected viewer's aggregates leave the worker. */
export function createSeasonHistory(humans, pledgeRedemption, stockQuote) {
  let opening, openingAssets, baseline, personalBaseline, metadata, outbound, period;
  const publicSeasons = [];
  const privateSeasons = new Map(humans.map(id => [id, []]));
  const readAssets = viewFor => new Map(humans.map(id => [id, personalAssets(viewFor(id), pledgeRedemption)]));

  return {
    observe(view, step, {humanView, extendedSecondAct}, port) {
      if (view.ruleVersion !== "1.5") return;
      if (!opening) {
        opening = boundary(view);
        openingAssets = readAssets(humanView);
        baseline = {...opening, season: 0};
        personalBaseline = openingAssets;
      }
      if (step.type === "RevealEvent") {
        metadata = {act: view.act, weather: view.weather, event: view.eventRevealed};
        outbound = {};
        period = [];
      }
      if (step.type === "SettleOutbound") {
        const marketReports = step.presentation.dice;
        outbound = Object.fromEntries(view.ships.map(ship => {
          const dutchFirst = metadata.event === "dutch" && port[0] === ship.id;
          const failureCount = view.commodities[ship.good].consecutiveFailures;
          const quote = stockQuote(opening.market[ship.good].stockPrice, ship.status === "arrived", failureCount, Boolean(ship.pirateImpact), dutchFirst);
          return [ship.good, {
            status: ship.status, failureCount, quote,
            marketReport: marketReports.find(die => die.shipId === ship.id)?.result ?? null,
            navyRequisition: ship.status === "arrived" && metadata.event === "navy-" + ship.good,
          }];
        }));
      }
      if (!period) return;
      period.push(step);
      if (step.type !== "EndSeason") return;

      const closing = boundary(view);
      const closingAssets = readAssets(humanView);
      const flows = new Map(period.flatMap(event => event.presentation.flows.map(flow =>
        [flow.id, flow.category])));
      const entries = view.ledger.filter(entry => entry.season === step.season && entry.reason !== "initial")
        .map(entry => {
          const flow = flows.get(entry.id);
          const category = entry.reason === "return" && metadata.act === 2 ? "buyout" : flow ?? entry.reason;
          return {...entry, category, group: groups[category] ?? "other"};
        });
      const players = closing.players.map(player => {
        const start = opening.players.find(candidate => candidate.id === player.id);
        const rows = entries.filter(entry => entry.playerId === player.id);
        const totals = {income:0, expense:0, investment:0, finance:0, final:0, other:0};
        for (const row of rows) totals[row.group] += row.delta;
        const net = rows.reduce((sum, row) => sum + row.delta, 0);
        return {id: player.id, openingCash: start.cash, closingCash: player.cash, net, flags: player.flags,
          flagsGained: player.flags - start.flags, rows, totals, reconciled: start.cash + net === player.cash};
      });
      const events = [...new Set(period.flatMap(majorEvents))];
      const extended = extendedSecondAct;
      const ending = view.gameEnded ? (step.season < (extended ? 8 : 7) ? "monopoly" : "scheduled") : null;

      publicSeasons.push({...metadata, season: step.season, version: step.version, opening,
        closing, outbound, players, events, weaponsSuccesses: view.weaponsSuccesses,
        extended: step.season >= 3 ? extended : null, ending});
      for (const [id, history] of privateSeasons) {
        history.push({version: step.version, opening: openingAssets.get(id), closing: closingAssets.get(id)});
      }
      opening = closing;
      openingAssets = closingAssets;
    },
    forViewer(viewerId) {
      const seasons = privateSeasons.get(viewerId) ?? [];
      return structuredClone({
        schema: "haijin-season-history-1", public: {baseline, seasons: publicSeasons},
        personal: personalBaseline?.has(viewerId) ? {viewerId, baseline: personalBaseline.get(viewerId), seasons} : null,
      });
    },
  };
}
