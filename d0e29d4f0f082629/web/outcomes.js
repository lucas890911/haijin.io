const finishedPhases = new Set([
  "OUTBOUND_SETTLEMENT",
  "ANTI_SMUGGLING_PLACEMENT",
  "RETURN_VOTING",
  "RETURN_RESOLUTION",
  "SEASON_END",
  "FINAL_SETTLEMENT",
]);
export function recordOutcomes(previous, view) {
  const ships = view.ships;
  const failed = ships
    .filter((s) => s.status === "failed")
    .sort((a, b) => a.lane - b.lane);
  const dock =
    previous?.season === view.season
      ? previous.dock.filter((id) => failed.some((s) => s.id === id))
      : [];
  for (const s of failed) if (!dock.includes(s.id)) dock.push(s.id);
  // Same precedence as PrepareReturns: round, pilot arrivals, dice total, dispatch order.
  const pilot = (s) =>
    Number(
      !(
        s.arrivalMethod === "pilot" ||
        (!s.arrivalMethod && s.arrivalRound === 3 && s.dice.length < 3)
      ),
    );
  const total = (s) => s.dice.reduce((n, d) => n + d, 0);
  const port = ships
    .filter((s) => s.status === "arrived")
    .sort(
      (a, b) =>
        a.arrivalRound - b.arrivalRound ||
        pilot(a) - pilot(b) ||
        total(b) - total(a) ||
        a.lane - b.lane,
    )
    .map((s) => s.id);
  return {
    season: view.season,
    port,
    dock,
    ready: finishedPhases.has(view.phase) && port.length + dock.length === 3,
  };
}
export function resultLines(results, view) {
  const lines = [];
  for (const [kind, area] of [
    ["port", "入港區"],
    ["dock", "停泊區"],
  ]) {
    results[kind].forEach((id, i) => {
      const seat = view.positions.find(
        (p) => p.kind === kind && p.seat === i + 1,
      );
      lines.push(
        id.replace("ship-", "船 ") +
          (kind === "port" ? " 成功入港" : " 停泊") +
          "，進入" +
          area +
          "第 " +
          (i + 1) +
          " 位。",
      );
      const label = (kind === "port" ? "港口 " : "停泊 ") + (i + 1);
      if (!seat?.crewId) lines.push(label + " 無人下注，本次無人領獎。");
      else {
        lines.push(label + " 下注命中。");
        const paid = view.ledger?.find(
          (e) =>
            e.version === view.version &&
            e.reason === kind &&
            e.positionId === seat.id,
        );
        if (paid)
          lines.push(
            "玩家 " +
              paid.playerId +
              " 獲得" +
              (kind === "port" ? "港口" : "停泊") +
              "獎金 " +
              paid.delta +
              " 銀。",
          );
      }
    });
  }
  return lines;
}
