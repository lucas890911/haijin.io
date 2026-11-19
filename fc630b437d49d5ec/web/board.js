import { RULES,outboundPool,splitDividend } from "../dist/packages/shared/src/index.js";
const labels = {
  ship: "船員",
  port: "港口",
  dock: "停泊",
  insurance: "保險",
  pirate: "海盜",
  pilot: "領航",
};
export const cargoIcons = {rice:"🌾",sugar:"🎋",sulfur:"🪨",deerskin:"🦌"};
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
      extra: "至少 "+p.seat+" 艘船"+(p.kind==="port"?"成功入港":"去程失敗")+"才命中",
      chance: counts.slice(p.seat).reduce((a, b) => a + b, 0),
    };
  }
  return p.kind === "insurance"
    ? { prize: v.effects.insuranceIncome, extra: "須償付公庫實際已付的停泊獎金；多席命中可能虧損，賠付超過現銀時照常扣款，現銀可能為負" }
    : { extra: "收益由後續決策及航行結果決定" };
}
const flagPlacement = (v,player) => v.ruleVersion==="1.5"&&v.act===2&&player.flags&&player.placements===2;

export function placementCost(v,position,player) {
  if(flagPlacement(v,player))return 0;
  return Math.max(0,Math.min(position.cost,player.cash));
}
export function placementDiscount(v,position,cost,candidates) {
  if(cost>=position.cost || !candidates.length)return null;
  const player=v.players.find(player=>player.id===v.selfId);
  if(flagPlacement(v,player))return "水師令旗 · 第二幕第三次成功配置免費";
  if(v.ruleVersion==="1.5"&&player.cash<0)return "負現銀 · 合法最低費席位免付";
  if(v.ruleVersion==="1.5"&&player.cash<position.cost)return "乞丐補助 · 公庫補足合法最低費席位差額";
  return "依本季合法配置效果調整";
}

export function betSummary(v,position) {
  const quote=projections(v,position);
  const cost=placementCost(v,position,v.players.find(player=>player.id===v.selfId));
  const ship=v.ships.find(ship=>ship.id===position.shipId);
  const title=({
    ship:()=>goods[ship.good]+"｜船員第 "+position.seat+" 席",
    port:()=>"港口下注｜第 "+position.seat+" 席",
    dock:()=>"停泊下注｜第 "+position.seat+" 席",
    insurance:()=>"保險員",
    pirate:()=>"海盜｜第 "+position.seat+" 席",
    pilot:()=>position.id.endsWith("large")?"大領航員":"小領航員",
  })[position.kind]();
  const conditions={
    ship:"商船成功入港，依實際船員及席位分紅。",
    port:quote.extra,
    dock:quote.extra,
    insurance:quote.extra+"。",
    pirate:"擲骰後停在第 13 格才可能觸發。第二輪可登船，第三輪可劫船，依正式海盜優先權處理。",
    pilot:"第三次擲骰前調整船位，"+(position.id.endsWith("large")?"最多兩次，每次 ±1 格。":"可調整一次 ±1 格。"),
  };
  const details=position.kind==="ship"?quote.extra:null;
  const adjust=(label,amount)=>amount?label+" "+money(amount):null;
  const adjustments={
    port:adjust("港口獎金",v.effects.portBonus),
    dock:adjust("停泊獎金",v.effects.dockBonus),
    insurance:adjust("保險立即收入",v.effects.insuranceIncome-RULES.insuranceIncome),
    ship:ship && v.eventRevealed==="navy-"+ship.good ? adjust("整船分紅",outboundPool(ship.good,0,v.eventRevealed)-outboundPool(ship.good,0,null)) : null,
  };
  const market=ship && v.eventRevealed==="market-"+ship.good;
  const timing=position.kind==="insurance"?"配置後立即領取，去程結算時賠付。":
    ["ship","port","dock"].includes(position.kind)?"去程結算時判定與派彩。":conditions[position.kind];
  return {title,cost,prize:quote.prize,condition:conditions[position.kind],details,chance:quote.chance,
    adjustment:adjustments[position.kind]??(market?"入港才擲兩骰，整船 −6／0／+18 銀":null),timing};

}
export function preview(v, p) {
  const q = projections(v,p);
  const player=v.players.find(x=>x.id===v.selfId);
  const cost=placementCost(v,p,player);
  return [
    labels[p.kind] + " " + p.seat + (p.shipId?" · "+goods[v.ships.find(s=>s.id===p.shipId)?.good]:""),
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
  const results = v.outcomes ?? {port:[],dock:[]};
  const berthed=new Set([...results.port,...results.dock]);
  function seat(p) {
    const owner = v.players.find((q) => q.crew.some((c) => c.id === p.crewId));
    const enabled = actions.some((a) => a.placement?.positionId === p.id);
    const player=v.players.find(candidate=>candidate.id===v.selfId);
    const cost=enabled&&player?placementCost(v,p,player):p.cost;
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
      '<button class="bet board-seat seat-'+p.kind+'" aria-label="'+labels[p.kind]+" "+p.seat+"，"+cost+" 銀"+(owner?'，'+owner.id+' 占用':'')+'" title="' +
      reason +
      '" data-pos="' +
      p.id +
      '" ' +
      (enabled ? "" : "disabled") +
      "><span>" +
      (p.kind === "pilot"
        ? p.id.endsWith("large")
          ? "大領航員"
          : "小領航員"
        : p.kind==="insurance"?"保險":labels[p.kind] + p.seat) +
      '</span><span class="circle ' +
      (owner ? "taken" : "") +
      '" data-token="' +
      (p.crewId ?? "") +
      '" style="--color:' +
      colors[owner?.id] +
      '">' +
      (p.kind==="ship" ? "" : owner ? owner.id : cost ? "−"+cost : "0") +
      "</span><small>" +
      (income
        ? money(income)
        : settled &&
            owner &&
            ["ship", "port", "dock", "insurance"].includes(p.kind)
          ? "實收 0 銀"
          : prize != null
            ? (v.eventRevealed==="market-"+v.ships.find(s=>s.id===p.shipId)?.good?"基準 ":"")+money(prize)
            : p.kind==="pilot" ? (p.id.endsWith("large")?"±2 格":"±1 格") : "戰術席") +
      "</small></button>"
    );
  }
  const group = (kind) =>
    v.positions
      .filter((p) => p.kind === kind)
      .map(seat)
      .join("");
  const hasPilot = actions.some(action=>action.type==="ApplyPilotMoves");
  const arrow = (s,d) => !hasPilot ? "" :
    '<button class="arrow" data-ship="'+s.id+'" data-delta="'+d+'" aria-label="'+(d<0?"後退":"前進")+'" disabled><span class="across">'+(d<0?"←":"→")+'</span><span class="upright">'+(d<0?"↓":"↑")+'</span></button>';
  const shipMark = s => '<i class="ship-marker" data-token="'+s.id+'" title="'+(goods[s.good]??"商船")+'">⛵</i>';
  const terminal = kind => '<section class="berths '+kind+'"><h3>'+(kind==="port"?"港口":"停泊")+'</h3><div class="berth-list">'+[1,2,3].map(rank=>{
    const ship=v.ships.find(s=>s.id===results[kind][rank-1]);
    const position=v.positions.find(p=>p.kind===kind&&p.seat===rank);
    return '<div class="berth'+(ship&&v.settling?' hit':'')+'" data-berth="'+kind+'-'+rank+'"><div class="result-space" aria-label="結果泊位 '+rank+'">'+
      (ship?shipMark(ship):'<span>'+rank+'</span>')+'</div>'+(position?seat(position):'')+'</div>';
  }).join("")+'</div></section>';
  return (
    '<section class="chart voyage-board" data-phase="'+v.phase+'" data-settling="'+Boolean(v.settling)+'" aria-label="去程航道">'+
    '<div class="dock-zone">'+terminal("dock")+'<section class="dock-insurance" aria-label="保險">'+group("insurance")+'</section></div>'+terminal("port")+
    '<div class="voyage-lanes">'+v.ships.map(s=>{
      const name=goods[s.good]??"等待派船";
      const status={arrived:"已確定入港",failed:"已確定停泊","awaiting-pirates":"海盜待判定"}[s.status];
      const chance=status || (s.position==null?"等待派船":"條件式到港 "+(100*arrival(s,v.effects.firstSailModifier,v.eventRevealed)).toFixed(1)+"%");
      const seats=v.positions.filter(p=>p.shipId===s.id);
      const entry=seats.some(p=>actions.some(a=>a.placement?.positionId===p.id))
        ?'<button type="button" class="ship-seat-entry" data-ship-seats="'+s.id+'" aria-label="'+name+'船員選席"><span>選席</span></button>':"";
      return '<div class="voyage" data-lane="'+s.id+'" aria-label="'+name+'"><div class="crew-dock">'+
        '<span class="cargo-mark" title="'+name+' · '+chance+'" aria-label="'+name+'">'+(cargoIcons[s.good]??"⛵")+'</span>'+
        '<div class="crew-circles">'+seats.map(seat).join("")+'</div>'+
        '<small class="voyage-status" title="'+chance+'">'+(status??s.dice.join(" · "))+'</small>'+entry+'</div>'+
        '<div class="track">'+Array.from({length:13},(_,index)=>{
          const cell=index+1;
          return '<span class="lane-cell'+(cell===13?" watch":"")+'" data-step="'+cell+'" style="--step:'+cell+'" aria-label="第 '+cell+' 格">'+
            (!berthed.has(s.id)&&Math.min(s.position,13)===cell?shipMark(s):"")+'</span>';
        }).join("")+arrow(s,-1)+arrow(s,1)+'</div></div>';
    }).join("")+
    '<div class="course-axis">'+Array.from({length:13},(_,i)=>'<span style="--step:'+(i+1)+'">'+(i+1)+'</span>').join("")+'</div></div>'+
    '<section class="pirate-reef" aria-label="海盜席位">'+group("pirate")+'</section>'+
    '<section class="voyage-aids" aria-label="航運輔助">'+group("pilot")+'</section>'+
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