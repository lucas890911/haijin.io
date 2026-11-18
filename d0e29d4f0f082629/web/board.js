import { RULES,outboundPool,splitDividend } from "../dist/packages/shared/src/index.js";
const labels = {
  ship: "船員",
  port: "港口",
  dock: "停泊",
  insurance: "保險",
  pirate: "海盜",
  pilot: "領航",
};
const goods = { rice: "稻米", sugar: "蔗糖", sulfur: "硫磺", deerskin: "鹿皮" };
const colors = { A: "#af6346", B: "#387c87", C: "#79678e", D: "#937523" };
const money = (n) => (n > 0 ? "+" : "") + n + " 銀";
export function arrival(s, modifier, event) {
  if (s.status === "arrived") return 1;
  if (s.status === "failed") return 0;
  if (s.position == null) return null;
  function roll(pos, n) {
    if (pos > RULES.finish) return 1;
    if (n === 3) return 0;
    let total = 0;
    for (let die=1;die<=6;die++){
      const next=pos+die+(n===0?modifier:0)+(n===2 && event==='navy-'+s.good?2:0);
      if(event!=='reef'||next!==8)total+=roll(next,n+1);
    }
    return total / 6;
  }
  return roll(s.position, s.dice.length);
}
export function shipProjection(v,p){
  const ship=v.ships.find(s=>s.id===p.shipId);
  const crew=v.positions.filter(x=>x.shipId===ship.id && (x.crewId || x.id===p.id)).sort((a,b)=>a.seat-b.seat);
  const pool=outboundPool(ship.good,v.commodities[ship.good].spread,v.eventRevealed);
  return {crew,pool,shares:splitDividend(pool,crew.length),market:v.eventRevealed==="market-"+ship.good};
}
function projections(v, p) {
  const odds = v.ships.map((s) => arrival(s, v.effects.firstSailModifier,v.eventRevealed));
  if (p.kind === "ship") {
    const s = v.ships.find((x) => x.id === p.shipId);
    const {pool,crew,shares}=shipProjection(v,p);
    return {
      prize: shares[crew.findIndex(x=>x.id===p.id)],
      chance: odds[v.ships.indexOf(s)],
      extra:
        (v.eventRevealed==='market-'+s.good?'以下為基礎收益，入港商情另擲 2D6（−6／0／+18） · ':'') + "全船 " +
        crew.length +
        " 人 · 獎金池 " +
        pool +
        " 銀 · 依席分紅 " +
        shares.join("／"),
    };
  }
  if (p.kind === "port" || p.kind === "dock") {
    let counts = [1];
    for (const q of odds) {
      const prob = p.kind === "port" ? q : 1 - q;
      const next = Array(counts.length + 1).fill(0);
      counts.forEach((w, i) => {
        next[i] += w * (1 - prob);
        next[i + 1] += w * prob;
      });
      counts = next;
    }
    return {
      prize: RULES.betPrizes[p.seat - 1] + v.effects[p.kind + "Bonus"],
      chance: counts.slice(p.seat).reduce((a, b) => a + b, 0),
    };
  }
  return p.kind === "insurance"
    ? { prize: v.effects.insuranceIncome, extra: "另須償付公庫實付停泊獎金" }
    : { extra: "收益由後續決策及航行結果決定" };
}
export function preview(v, p) {
  const q = projections(v, p);
  const player=v.players.find(x=>x.id===v.selfId);
  const cost = v.act===2 && player.flags && player.placements===2?0:Math.max(
    0,
    Math.min(p.cost, v.players.find((x) => x.id === v.selfId).cash),
  );
  return [
    labels[p.kind] + " " + p.seat,
    "標示 "+p.cost+" 銀 · 實付成本 " + cost + " 銀",
    v.act===2 && player.flags && player.placements===2?"水師令旗 · 第三次配置免費":"",
    "已配置 "+player.crew.filter(c=>c.status.kind==="placed").length+" 枚 · 可用 "+player.crew.filter(c=>c.status.kind==="available").length+"／"+player.crew.length+" 枚",
    q.prize != null
      ? "收入 " + q.prize + " 銀 · 扣除席費 " + money(q.prize - cost)
      : "",
    q.extra,
    q.chance != null ? "骰運命中率 " + (100 * q.chance).toFixed(1) + "%" : "",
    "此機率假設後續沒有其他玩家干預；實際結果可能因領航、海盜及玩家決策改變。",
  ]
    .filter(Boolean)
    .join("　");
}
export function boardHTML(v, legal) {
  const actions = legal?.actions ?? [];
  const results = v.outcomes?.ready ? v.outcomes : null;
  function seat(p) {
    const owner = v.players.find((q) => q.crew.some((c) => c.id === p.crewId));
    const enabled = actions.some((a) => a.placement?.positionId === p.id);
    const settled = v.ledger.some(
      (e) =>
        e.version === v.version &&
        ["dividend", "dock", "port", "reimbursement", "return"].includes(
          e.reason,
        ),
    );
    const prize = projections(v, p).prize;
    const unavailableShip =
      p.shipId && v.ships.find((s) => s.id === p.shipId)?.status !== "sailing";
    const reason = owner
      ? "已有棋子"
      : enabled
        ? "點選試放"
        : p.kind==="pirate" && v.pirateBets>=2?"本季海盜下注已滿 2／2":unavailableShip
          ? "船已結束航行"
          : !v.phase.startsWith("PLACEMENT")
            ? "目前不是配置輪"
            : "本席沒有可用棋子或合法付款方式";
    const income = v.ledger
      .filter(
        (e) =>
          ((e.crewId && e.crewId === p.crewId) || e.positionId === p.id) &&
          e.version === v.version &&
          e.reason !== "placement",
      )
      .reduce((n, e) => n + e.delta, 0);
    return (
      '<button class="bet" title="' +
      reason +
      '" data-pos="' +
      p.id +
      '" ' +
      (enabled ? "" : "disabled") +
      "><span>" +
      (p.kind === "pilot"
        ? p.id.endsWith("large")
          ? "大領航"
          : "小領航"
        : labels[p.kind] + p.seat) +
      '</span><span class="circle ' +
      (owner ? "taken" : "") +
      '" data-token="' +
      (p.crewId ?? "") +
      '" style="--color:' +
      colors[owner?.id] +
      '">' +
      (owner ? owner.id + "·" + p.crewId.split("-").at(-1) : p.cost) +
      "</span><small>" +
      (income
        ? money(income)
        : settled &&
            owner &&
            ["ship", "port", "dock", "insurance"].includes(p.kind)
          ? "實收 0 銀"
          : prize != null
            ? (v.eventRevealed==="market-"+v.ships.find(s=>s.id===p.shipId)?.good?"基準 ":"")+money(prize)
            : "戰術席") +
      "</small></button>"
    );
  }
  const group = (kind) =>
    v.positions
      .filter((p) => p.kind === kind)
      .map(seat)
      .join("");
  const arrow = (s, d) =>
    '<button class="arrow" data-ship="' +
    s.id +
    '" data-delta="' +
    d +
    '" disabled>' +
    (d < 0 ? "←" : "→") +
    "</button>";
  return (
    '<section class="chart"><small>臺灣海峽　／　商船航線</small>' +
    v.ships
      .map(
        (s, i) =>
          '<div class="voyage" data-lane="' +
          s.id +
          '"><b>船 ' +
          (i + 1) +
          "　" +
          (goods[s.good] ?? "等待派船") +
          "</b>　<small>" +
          ({
            arrived: "入港",
            failed: "停泊",
            sailing: "航行中",
            "awaiting-pirates": "海盜警戒",
          }[s.status] ?? "") +
          "　擲骰 " +
          s.dice.join(" · ") +
          (s.status === "arrived"
            ? "　已確定入港"
            : s.status === "failed"
              ? "　已確定停泊"
              : s.status === "awaiting-pirates"
                ? "　海盜待判定"
                : s.position != null
                  ? "　條件式到港 " +
                    (100 * arrival(s, v.effects.firstSailModifier,v.eventRevealed)).toFixed(1) +
                    "%"
                  : "") +
          '</small><div class="track">' +
          arrow(s, -1) +
          Array.from(
            { length: 13 },
            (_, j) =>
              '<span class="' +
              (j === 12 ? "watch" : "") +
              '">' +
              (!results && Math.min(s.position, 13) === j + 1
                ? '<i data-token="' + s.id + '">⛵</i>'
                : "") +
              (j + 1) +
              "</span>",
          ).join("") +
          arrow(s, 1) +
          "</div>" +
          v.positions
            .filter((p) => p.shipId === s.id)
            .map(seat)
            .join("") +
          "</div>",
      )
      .join("") +
    '<div class="stations"><section>' +
    group("pilot") +
    "</section><section>" +
    group("pirate") +
    '</section></div><small>到港率假設後續沒有玩家干預。第 13 格警戒 · 第二輪可登船，第三輪可劫持；領航抵達直接入港。</small></section><section class="card terminals">' +
    ["port", "dock"]
      .map((kind) => {
        const name = kind === "port" ? "入港區" : "停泊區";
        return (
          '<section class="berths ' +
          kind +
          '"><h3>' +
          name +
          "</h3>" +
          [1, 2, 3]
            .map((i) => {
              const id = results?.[kind][i - 1],
                position = v.positions.find(
                  (p) => p.kind === kind && p.seat === i,
                );
              const hit = id && v.settling;
              return (
                '<div class="berth ' +
                (hit ? "hit" : "") +
                '" data-berth="' +
                kind +
                "-" +
                i +
                '"><b>' +
                i +
                "</b><span>" +
                (id
                  ? '<i data-token="' +
                    id +
                    '">⛵</i> ' +
                    id.replace("ship-", "船 ") +
                    " · " +
                    goods[v.ships.find((s) => s.id === id).good]
                  : "空位") +
                "</span>" +
                (position
                  ? seat(position)
                  : "<small>" + labels[kind] + i + " · 待派船</small>") +
                "</div>"
              );
            })
            .join("") +
          "</section>"
        );
      })
      .join("") +
    '<section class="insurance ' +
    (v.settling &&
    v.ledger.some(
      (e) => e.version === v.version && e.reason === "reimbursement",
    )
      ? "hit"
      : "") +
    '"><h3>保險員</h3>' +
    group("insurance") +
    "<small>可能償付上限 " +
    v.positions
      .filter((p) => p.kind === "dock" && p.crewId)
      .reduce(
        (n, p) => n + RULES.betPrizes[p.seat - 1] + v.effects.dockBonus,
        0,
      ) +
    " 銀</small></section>" +
    '</section><section class="card"><b>緝私營</b> ' +
    [0, 1]
      .map(
        (i) =>
          '<button class="bet" data-camp="' +
          (i + 1) +
          '" ' +
          (actions.some(
            (a) =>
              a.type === "CampChoice" &&
              a.crewIds.length === i + 1 - v.campCrew.length &&
              a.crewIds.length,
          )
            ? ""
            : "disabled") +
          '><span class="circle ' +
          (v.campCrew[i] ? "taken" : "") +
          '" style="--color:' +
          colors[
            v.players.find((p) => p.crew.some((c) => c.id === v.campCrew[i]))
              ?.id
          ] +
          '" data-token="' +
          (v.campCrew[i] ?? "") +
          '">' +
          (v.campCrew[i]
            ? v.players.find((p) => p.crew.some((c) => c.id === v.campCrew[i]))
                .id +
              "·" +
              v.campCrew[i].split("-").at(-1)
            : v.ruleVersion==="1.5"?3:RULES.campCost) +
          "</span> ＋" +
          (v.ruleVersion==="1.5"?"8／12／16／20，依查獲船扣自己人":RULES.campPrize) +
          "</button>",
      )
      .join("　") +
    "　" +
    (v.act === 2 ? "第二幕不開放" : "去程結算後符合資格者可下注") +
    prison(v) + "<hr><b>回程貿易</b>　" +
    (v.returnVotes.length
      ? v.returnVotes
          .map(
            (b) =>
              b.shipId.replace("ship-", "船 ") +
              (b.result
                ? " · " +
                  {
                    safe: "安全返航",
                    cloth: "布匹",
                    porcelain: "瓷器",
                    weapons: "軍武",
                  }[b.result]
                : " · 第 " +
                  b.round +
                  " 輪 · " +
                  b.submittedCrewIds.length +
                  "/" +
                  b.electorate.length +
                  " 票"),
          )
          .join("　")
      : v.act===2 && results?results.port.map((id,i)=>id.replace("ship-","船 ")+" · 第 "+(i+1)+" 名 "+["瓷器 18","布匹 12","無配額"][i]).join("、")+"；第二幕無軍武走私":"等待入港船確認") +
    "</section>"
  );
}

function prison(v){return '<aside class="prison"><h3>囚禁區</h3><div class="prison-tokens">'+v.players.flatMap(p=>p.crew.filter(c=>c.status.kind==='detained').map(c=>{const d=v.detentions?.[c.id];const info=p.id+'-'+c.id.split('-').at(-1)+' · '+(d?.ship?.replace('ship-','船 ')??'拘押')+' · '+(c.status.severe?'軍武大失敗，不可提前贖回':'一般失敗，贖金 '+v.effects.ransom+' 銀')+' · 第 '+c.status.releaseAfterSeason+' 季末釋放';return '<details class="captive" style="--color:'+colors[p.id]+'"><summary title="'+info+'"><i data-token="'+c.id+'">'+p.id+'-'+c.id.split('-').at(-1)+'</i></summary><p>'+info+'</p></details>';})).join('')+'</div></aside>';}