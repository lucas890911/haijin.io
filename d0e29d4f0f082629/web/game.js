import {showStage,stagesFor,summaryDialog,flowName,returnFrame} from './settlement.js';
import { votePanel } from "./vote-panel.js";
import { boardHTML, preview,shipProjection } from "./board.js";
import { RULES } from "../dist/packages/shared/src/index.js";
const app = document.querySelector("#app"),
  error = document.querySelector("#error");
const ids = ["A", "B", "C", "D"],
  colors = ["#af6346", "#387c87", "#79678e", "#937523"];
const goods = { deerskin: "鹿皮", sugar: "蔗糖", sulfur: "硫磺", rice: "稻米" },
  cargo = {
    safe: "安全返航",
    cloth: "布匹",
    porcelain: "瓷器",
    weapons: "軍武",
  };
const names = {},
  people = new Set(["A"]);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const who = (id) => (id ? esc(names[id] || id) : "公庫");
const card = {
  typhoon: "颱風來襲",
  tailwind: "順風順水",
  "market-deerskin":"鹿皮商情","market-sugar":"蔗糖商情","market-rice":"稻米商情","market-sulfur":"硫磺商情","extra-stock":"藩庫徵調","dutch":"荷蘭商館競購","reef":"澎湖暗礁","navy-sulfur":"水師徵用令（硫磺）","navy-rice":"水師徵用令（稻米）",
  "sugar-harvest": "蔗糖豐收",
  "rice-shortage": "稻米短缺",
  "deerskin-demand": "鹿皮需求",
  "sulfur-demand": "硫磺需求",
  surplus: "貨物過剩",
  merchants: "商賈雲集",
  inspection: "海防嚴查",
  bribery: "疏通關節",
  prosperity: "商路興盛",
  abundance: "貨源充裕",
};
const types = {
  StartSeason: "開季",
  RevealEvent: "翻事件牌",
  BeginAuction: "開始競標",
  BidPublic: "公開喊價",
  WithdrawPublic: "退出競標",
  SubmitSealedBid: "提交秘密標金",
  BuyStockOrSkip: "認購股票",
  AssignShips: "安排航線",
  PlaceCrewOrPass: "配置手下",
  PledgeStock: "抵押股票",
  RedeemPledgedStock: "贖回股票",
  ApplyPilotMoves: "領航",
  PirateBoardOrDecline: "海盜登船",
  PirateTakeoverDecision: "整船劫持",
  VoteReturnOption: "回程投票",
  CampChoice: "緝私營",
  RedeemCrew: "贖回手下",
  FinishRansom: "不再贖回，結束本季",
  Sail: "擲骰航行",
  SettleOutbound: "去程結算",
  PrepareReturns: "準備回程",
  ResolveReturns: "回程結算",
  EndSeason: "季末結算",
};
const phases = {
  AUCTION: "船長競標",
  CAPTAIN_STOCK_OPTION: "船長認股",
  CAPTAIN_ASSIGN_SHIPS: "安排航線",
  PIRATE_BOARDING: "海盜登船",
  PIRATE_TAKEOVER: "整船劫持",
  PILOT_LARGE: "大領航",
  PILOT_SMALL: "小領航",
  ANTI_SMUGGLING_PLACEMENT: "緝私營",
  SAIL_1:"第一輪航行",SAIL_2:"第二輪航行",SAIL_3:"第三輪航行",
  RETURN_VOTING: "回程投票",
  SEASON_END: "贖回與結算",
};
const pos = (id) =>
  id
    ?.replace("pilot-large", "大領航")
    .replace("pilot-small", "小領航")
    .replace("insurance", "保險員")
    .replace("pirate-", "海盜 ")
    .replace("port-", "港口 ")
    .replace("dock-", "停泊 ")
    .replace("camp-", "緝私 ")
    .replace(/ship-(\d)-seat-(\d)/, "船 $1・席 $2");
const ship = (id) => id?.replace("ship-", "船 "),
  piece = (id) => id?.split("-").at(-1);
let session,
  request = 0,
  current,
  logs = [];
const worker = new Worker(new URL("./worker.js",import.meta.url), { type: "module" });
function send(data) {
  error.textContent = "";
  document.querySelector("#save-file").disabled=true;
  app.inert = true;
  worker.postMessage({ ...data, session, request: ++request });
}
worker.onerror = (e) => {
  app.textContent = "無法載入遊戲主機。請重新整理。";
  error.textContent = e.message;
};
let batchNotice = "",
  pirateStage = 0,
  lastSettlement = null,
  frames = [],
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches,
  seen = 0,
  timer,
  speed = "標準",
  finalStocks = [];
const localized = (line) =>
  esc(
    line
      .replace(
        /ship-\d-seat-\d|port-\d|dock-\d|pirate-\d|pilot-large|pilot-small|insurance/g,
        (x) => pos(x),
      )
      .replace(
        /sugar-harvest|rice-shortage|deerskin-demand|sulfur-demand|surplus|merchants|typhoon|tailwind|inspection|bribery|prosperity|abundance/g,
        (x) => card[x],
      ),
  ).replace(/船 ([123])/g,(_,n)=>'<span class="ship-label" data-ship="ship-'+n+'">船 '+n+'</span>');
export function eventHTML(e) {
  return (
    '<article class="step ' +
    ({ PirateTakeoverDecision: "takeover", PirateBoardOrDecline: "boarding" }[
      e.type
    ] ?? "") +
    '"><small>第 ' +
    e.act +
    " 幕　／　第 " +
    e.season +
    " 季　／　紀錄 " +
    e.version +
    "</small><h2>" +
    (e.actor
      ? who(e.actor) + (e.controller === "ai" ? "（AI）" : "")
      : "系統") +
    " · " +
    (types[e.type] ?? esc(e.type)) +
    "</h2>" +
    e.lines.map((l) => "<p>" + localized(l) + "</p>").join("") +
    "</article>"
  );
}
function tokenRects() {
  return new Map(
    [...app.querySelectorAll("[data-token]:not([data-token=''])")].map((el) => [
      el.dataset.token,
      el.getBoundingClientRect(),
    ]),
  );
}
function animateTokens(old) {
  if (reduced) return;
  for (const el of app.querySelectorAll("[data-token]")) {
    const prev = old.get(el.dataset.token);
    if (!prev) continue;
    const now = el.getBoundingClientRect(),
      dx = prev.x - now.x,
      dy = prev.y - now.y;
    if ((dx || dy) && prev.width && now.width)
      el.animate(
        [
          { transform: "translate(" + dx + "px," + dy + "px)" },
          { transform: "none" },
        ],
        { duration: speed === "快速" ? 150 : 600, easing: "ease-out" },
      );
  }
}
export function streamHTML(e) {
  const content = e.lines.map((l) => "<p>" + localized(l) + "</p>").join("");
  return (
    '<article class="stream-summary"><b>' +
    (e.actor ? who(e.actor)+(e.controller==="ai"?"（AI）":"") : "系統") +
    " · " +
    (types[e.type] ?? esc(e.type)) +
    "</b><p>" +
    localized(e.lines[0] ?? "") +
    "</p><details><summary>展開" +
    (e.confirm ? "結算對帳" : "事件詳情") +
    '</summary><div class="stream-detail">' +
    content +
    "</div></details></article>"
  );
}
function play() {
  clearTimeout(timer);
  if (seen >= logs.length) {
    render();
    return;
  }
  const e = logs[seen];
  const frame = frames.find((f) => f.version === e.version);
  const pirate =
    ["PirateBoardOrDecline", "PirateTakeoverDecision"].includes(e.type) &&
    e.lines.some((l) => l.startsWith("原船員"));
  const stages = pirate
    ? [
        e.lines[0],
        e.lines.find((l) => l.startsWith("原船員")),
        e.lines.filter((l) => l.includes("被移離")).join("、") ||
          "確認船員位置",
        e.lines.find((l) => l.startsWith("目前船員")),
      ]
    : [];
  const sequence=stagesFor(e,reduced || speed==="略過動畫");
  const stage=sequence[pirateStage];
  const advance = () => {
    if(stage){pirateStage++;play();return;}
    if (pirate && pirateStage < 3) pirateStage++;
    else {
      pirateStage = 0;
      seen++;
    }
    play();
  };
  const old = tokenRects();
  if (e.confirm && e.type!=='EndSeason') lastSettlement = frame;
  render(returnFrame(frame,e,stage) ?? (
    pirate && pirateStage < 2 && frame?.pirateBefore
      ? frame.pirateBefore
      : ((stage && e.type!=="SettleOutbound" && ["roll","reveal"].includes(stage.kind)) || (e.type==="EndSeason" && !stage)) && frame?.voyageBefore ? frame.voyageBefore : frame),
  );
  document.querySelector("#stream").innerHTML =
    '<section class="playback card"><div class="stream-events">' +
    (seen
      ? "<small>上一筆 · " +
        localized(logs[seen - 1].lines[0] ?? "") +
        "</small>"
      : "") +
    streamHTML(
      pirate
        ? { ...e, lines: [stages[pirateStage] ?? e.lines[0], ...e.lines] }
        : e,
    ) +
    '</div><label>播放速度 <select id="speed">' +
    ["標準", "快速", "逐步","略過動畫"]
      .map(
        (x) =>
          "<option " + (x === speed ? "selected" : "") + ">" + x + "</option>",
      )
      .join("") +
    '</select></label><button class="primary" id="next">' +
    (e.confirm ? "確認結算" : "下一步") +
    '</button><button id="skip">略過其他過場</button></section>';
  if(speed!=="略過動畫")animateTokens(old);
  const duration=speed==="快速"?180:850;
  if(stage && stage.kind!=="money"){
    const future=sequence.slice(pirateStage).flatMap(s=>s.flow?[s.flow]:[]);
    for(const p of frame.players){
      const next=future.find(f=>f.playerId===p.id);
      const el=app.querySelector('[data-cash="'+p.id+'"]');
      if(el && next)el.textContent=(next.balance-next.delta)+" 銀";
    }
  }
  if(stage)showStage({...stage,duration},frame,e.presentation.flows);
  if(e.type==="EndSeason" && !stage){
    worker.postMessage({type:"pending-summary",session,seen});
    summaryDialog(e,logs,current.status==="finished" && seen===logs.length-1,()=>{
    seen++;worker.postMessage({type:"ack-summary",session,seen});pirateStage=0;play();
  });return;}
  document.querySelector("#next").onclick = advance;
  document.querySelector("#skip").disabled = e.confirm;
  document.querySelector("#skip").onclick = () => {
    seen++;
    pirateStage = 0;
    while (seen < logs.length && !logs[seen].confirm) seen++;
    play();
  };
  document.querySelector("#speed").onchange = (ev) => {
    speed = ev.target.value;
    play();
  };
  if(stage && (speed!=="逐步" || e.type==="Sail")){timer=setTimeout(advance,duration);return;}
  if (!e.confirm && (speed !== "逐步" || e.type==="Sail"))
    timer = setTimeout(advance, speed==="略過動畫"?0:speed === "快速" ? 180 : pirate ? 2200 : 1500);
}
let hasSave=false;
document.querySelector("#save-file").onclick=()=>send({type:"portable",seen});
worker.onmessage = ({ data }) => {
  if(data.warning)error.textContent=data.warning;
  if ("available" in data) {
    hasSave=data.available;
    const resume=document.querySelector("#resume");
    if(resume)resume.disabled=!hasSave;
    const start=document.querySelector("#start");
    if(start)start.disabled=false;
    const file=document.querySelector("#load-file");
    if(file)file.disabled=false;
    if(data.warning)error.textContent=data.warning;
    return;
  }
  if (data.request !== request) return;
  app.inert = false;
  document.querySelector("#save-file").disabled=false;
  if (data.portable) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(data.portable)],{type:"application/json"}));
    const link=document.createElement("a");
    link.href=url;link.download="海禁-私人對局存檔.json";link.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
    return;
  }
  document.querySelector("#save-file").hidden=!data.screen;
  batchNotice = data.batchNotice ?? "";
  frames = data.frames ?? [];
  if (data.archive) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data.archive, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "海禁-終局研究-" + session + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return;
  }
  if (data.session !== session) {
    seen = data.resumeAt??0;

    pirateStage = 0;
    lastSettlement = null;
  }
  session = data.session;
  if(data.names)Object.assign(names,data.names);
  current = data.screen;
  logs = data.log ?? [];
  finalStocks = data.finalStocks ?? [];
  if (current) play();
  else setup();
  error.textContent = data.error ?? "";
};
function setup() {
  app.innerHTML =
    '<section class="setup"><div class="chart"><small>臺灣海峽　／　本地四人桌遊</small><h1>海禁</h1><p>競逐船長，安排商船，橫渡十三格航道。</p></div><div class="grid"><div class="card"><h2>選擇席位</h2><p class="muted">勾選真人席位，其餘由電腦操作。</p>' +
    ids
      .map(
        (id, i) =>
          '<div class="row"><label><input class="person" type="checkbox" value="' +
          id +
          '" ' +
          (i === 0 ? "checked" : "") +
          "> " +
          id +
          ' 席</label><input aria-label="' +
          id +
          ' 席暱稱" type="text" maxlength="12" value="玩家 ' +
          id +
          '"></div>',
      )
      .join("") +
    '</div><div class="card"><h2>開局設定</h2><label>船長競標<select id="mode"><option value="hybrid">混合競標</option><option value="public">全程公開</option><option value="sealed">全程秘密</option></select></label><button class="primary" id="start">開始對局 →</button><button id="resume">恢復本機對局</button></div></div></section>';
  document.querySelector("#start").textContent="開始新遊戲";
  document.querySelector("#resume").textContent="繼續上一局";
  document.querySelector("#start").disabled=document.querySelector("#resume").disabled=true;
  document.querySelector("#resume").insertAdjacentHTML("afterend",'<label>匯入私人存檔<input id="load-file" type="file" accept=".json,application/json"></label><small>存檔含秘密資訊，請自行保管。</small>');
  worker.postMessage({type:"probe"});
  document.querySelector("#load-file").disabled=true;
  document.querySelector("#load-file").onchange=({target})=>{
    const file=target.files[0];target.value="";
    if(!file)return;
    if(file.size>4*1024*1024){error.textContent="存檔超過 4 MiB";return;}
    if(!hasSave||confirm("匯入成功後將取代本機對局。繼續？"))send({type:"import",file});
  };
  document.querySelector("#resume").onclick=()=>send({type:"resume"});
  document.querySelector("#start").onclick = () => {
    if(hasSave&&!confirm("開始新遊戲將取代本機對局。繼續？"))return;
    people.clear();
    for (const row of app.querySelectorAll(".row")) {
      const input = row.querySelector(".person");
      names[input.value] =
        row.querySelector("[type=text]").value.trim() || input.value;
      if (input.checked) people.add(input.value);
    }
    if (!people.size) {
      error.textContent = "請至少選一名真人";
      return;
    }
    send({
      type: "start",
      humans: [...people],
      names,
      mode: document.querySelector("#mode").value,
    });
  };
}
function label(a, v) {
  const stock = v.stocks.find((s) => s.id === a.stockId),
    good = goods[stock?.good ?? a.stockId?.split("-")[1]];
  switch (a.type) {
    case "PlaceCrewOrPass":
      return a.placement
        ? "棋子 " +
            piece(a.placement.crewId) +
            " → " +
            pos(a.placement.positionId)
        : "放棄本輪配置";
    case "BuyStockOrSkip":
      return a.stockId
        ? "認購 " +
            good +
            " · " +
            Math.max(5, v.commodities[a.stockId.split("-")[1]].stockPrice) +
            " 銀 · 庫存 " +
            v.inventory[a.stockId.split("-")[1]]
        : "放棄認購";
    case "RedeemPledgedStock":
    case "PledgeStock":
      return types[a.type] + " · " + good + " (" + a.stockId + ")";
    case "ApplyPilotMoves":
      return (
        a.moves
          .map(
            (m) =>
              ship(m.shipId) + " " + (m.delta > 0 ? "+" : "") + m.delta + " 格",
          )
          .join("、") || "放棄領航"
      );
    case "PirateBoardOrDecline":
      return (
        ship(a.shipId) + " · " + (a.crewId ? "登船 " + pos(a.seatId) : "等待")
      );
    case "PirateTakeoverDecision":
      if(a.join!==undefined)return ship(a.shipId)+" · "+(a.join?"加入第一海盜的空席":"放棄加入");
      return (
        ship(a.shipId) +
        " · " +
        (a.enterPort === null
          ? "放棄劫持"
          : a.enterPort
            ? "劫持並入港"
            : "劫持不入港")
      );
    case "CampChoice":
      return a.crewIds.length
        ? "緝私營 · 棋子 " + a.crewIds.map(piece).join("、")
        : "放棄緝私";
    case "VoteReturnOption":
      return (
        ship(a.shipId) + " · 棋子 " + piece(a.crewId) + " 投 " + cargo[a.option]
      );
    case "RedeemCrew":
      return "支付 " + v.effects.ransom + " 銀贖回一枚棋子 " + piece(a.crewId);
    default:
      return types[a.type] ?? a.type;
  }
}
function moneyDelta(view, p) {
  const net = view.ledger
    .filter(
      (e) =>
        e.playerId === p.id &&
        e.season === view.season &&
        e.reason !== "initial",
    )
    .reduce((n, e) => n + e.delta, 0);
  const signed = (n) =>
    '<span class="' +
    (n < 0 ? "expense" : "income") +
    '">' +
    (n >= 0 ? "+" : "") +
    n +
    " 銀</span>";
  const delta = lastSettlement?.ledger
    .filter((e) => e.playerId === p.id && e.version === lastSettlement.version)
    .reduce((n, e) => n + e.delta, 0);
  return (
    '<div class="balance">' +
    (delta == null
      ? ""
      : "最近結算（第 " +
        lastSettlement.season +
        " 季）" +
        signed(delta) +
        "<br>") +
    "本季累計 " +
    signed(net) +
    "</div>"
  );
}
function historyHTML(events){
  const seasons=new Map();
  for(const e of [...events].reverse()){
    if(!seasons.has(e.season))seasons.set(e.season,new Map());
    const phases=seasons.get(e.season);const key=phases.get(e.phase)??[];key.push(e);phases.set(e.phase,key);
  }
  return [...seasons].map(([n,phasesInSeason])=>'<details><summary>第 '+n+' 季</summary>'+[...phasesInSeason].map(([phase,entries])=>'<details><summary>'+esc(phases[phase]??types[entries[0].type])+'</summary>'+entries.map(e=>eventHTML(e)+(e.type==='EndSeason'?'<button data-review="'+e.version+'">回看結算</button>':'')).join('')+'</details>').join('')+'</details>').join('');
}
function render(frame) {
  const v = frame ?? current.observation,
    self = v.selfId,
    legal = frame ? null : current.legal,
    done = !frame && current.status === "finished";
  const event = frame ? logs[seen] : null;
  const phase = event
    ? types[event.type]
    : done
      ? "終局結算"
      : (phases[v.phase] ?? "第 " + v.phase.slice(-1) + " 輪配置");
  const reveal = logs.find(
    (e) =>
      e.type === "RevealEvent" &&
      e.season === v.season &&
      e.version <= v.version,
  );
  const eventNotes = reveal?.lines.slice(1).map(localized).join(" · ") ?? "";
  const chart = boardHTML(v, legal);
  const market =
    '<div class="market">' +
    Object.entries(v.commodities)
      .map(
        ([k, c]) =>
          '<div class="box">' +
          goods[k] +
          "<strong>" +
          (v.previousMarket && v.previousMarket[k].stockPrice !== c.stockPrice
            ? v.previousMarket[k].stockPrice + " → "
            : "") +
          c.stockPrice +
          " <small>銀</small></strong>價差 " +
          (v.previousMarket && v.previousMarket[k].spread !== c.spread
            ? v.previousMarket[k].spread + " → "
            : "") +
          (c.spread >= 0 ? "+" : "") +
          c.spread +
          "</div>",
      )
      .join("") +
    "</div>";
  app.innerHTML =
    '<label class="motion"><input id="motion" type="checkbox" ' +
    (reduced ? "checked" : "") +
    '> 減少動畫</label><section id="stream"><b>航海動態</b> ' +
    (seen ? localized(logs[seen - 1]?.lines[0] ?? "") : "") +
    '</section><div class="banner"><div><span class="tag">第 ' +
    v.act +
    " 幕</span>　第 " +
    v.season +
    " 貿易季</div><b>" +
    phase +
    '</b></div><div class="layout"><div>' +
    '<div class="card"><h2>玩家資產</h2><div class="grid">' +
    v.players
      .map(
        (p, i) =>
          '<div class="box" style="--color:' +
          colors[i] +
          '">' +
          p.id +
          " · " +
          who(p.id) +
          (v.captainId === p.id ? " ⚓ 本季船長" : "") +
          '<strong data-cash="' +p.id+ '">' +
          p.cash +
          " 銀</strong>" +
          moneyDelta(v, p) + "<p>水師令旗 "+(p.flags??0)+" 枚 · 終局賞銀 "+((p.flags??0)*10)+" 銀</p>" +
          p.crew
            .filter((c) => c.status.kind === "available")
            .map(
              (c) =>
                '<i class="homepiece" data-token="' +
                c.id +
                '">' +
                p.id +
                piece(c.id) +
                (c.status.kind === "detained" ? " 囚" : "") +
                "</i>",
            )
            .join(" ") +
          "<br>閒置 " +
          p.crew.filter((c) => c.status.kind === "available").length +
          " 枚<details><summary>棋子狀態</summary>" +
          p.crew
            .map(
              (c) =>
                '<button type="button" data-find="'+c.id+'">棋 '+
                piece(c.id) +
                " · " +
                (c.status.kind === "available"
                  ? "可用"
                  : c.status.kind === "placed"
                    ? pos(c.status.positionId)
                    : c.status.severe
                      ? "重押"
                      : "拘押")+"</button>",
            )
            .join("<br>") +
          "</details><details><summary>個人收支</summary>" +
          v.ledger
            .filter((e) => e.playerId === p.id)
            .map(
              (e) =>
                "第 " +
                e.season +
                " 季 · " +
                ('<span data-entry="'+e.id+'">'+esc(e.reason)+'</span>') +
                " " +
                e.delta +
                " 銀",
            )
            .join("<br>") +
          "</details>公開股 " +
          v.stocks
            .filter((s) => s.ownerId === p.id && s.source === "subscription")
            .map((s) => goods[s.good])
            .join(" ") +
          "</div>",
      )
      .join("") +
    "</div></div></div><section>" +
    chart +
    market +
    '</section><aside class="panel"><div class="card"><small class="caption">' +
    (frame
      ? "事件播放"
      : done
        ? "排名"
        : "輪到 " + self + " 席 · " + who(self)) +
    "</small><h2>" +
    phase +
    '</h2><p role="status">' +
    esc(batchNotice) +
    '</p><div id="actions"></div></div><div class="card"><b>當季事件</b><p>' +
    (v.weather?({normal:"正常",typhoon:"颱風",tailwind:"順風"}[v.weather]+"｜"):"") + (card[v.eventRevealed] ?? "等待揭示") +
    "<br>" +
    eventNotes +
    "</p><p>第一幕軍武成功 " +
    v.weaponsSuccesses +
    "/2</p>" + (v.ruleVersion==="1.5"?"<p>本季海盜剩餘 "+(2-v.pirateBets)+" 次</p>":"")+"<b>本人持股</b><p>" +
    v.stocks
      .filter((s) => s.ownerId === self)
      .map((s) => goods[s.good] + (s.pledged ? "（抵押）" : ""))
      .join("、") +
    '</p></div><details class="card"><summary>本季收支</summary><div class="log">' +
    v.ledger
      .filter((e) => e.season === v.season)
      .map(
        (e) =>
          who(e.playerId) +
          "　" +
          (e.delta > 0 ? "+" : "") +
          e.delta +
          " 銀　" +
          ('<span data-entry="'+e.id+'">'+esc(e.reason)+'</span>'),
      )
      .join("<br>") +
    '</div></details><details class="card"><summary>航海紀錄 · ' +
    (frame ? seen + 1 : logs.length) +
    '</summary><div class="log">' +
    historyHTML(logs.slice(0,frame?seen+1:logs.length)) +
    "</div></details></aside></div>";
  const history=logs.slice(0,frame?seen+1:logs.length);
  const flowById=new Map(history.flatMap(e=>(e.presentation?.flows??[]).map(f=>[f.id,f])));
  app.querySelectorAll('[data-entry]').forEach(el=>{const flow=flowById.get(el.dataset.entry);if(flow)el.textContent=flowName(flow);});
  const area = document.querySelector("#actions");
  document.querySelector("#motion").onchange = (e) => {
    reduced = e.target.checked;
  };
  for(const b of app.querySelectorAll("[data-review]"))b.onclick=()=>{const e=logs.find(x=>x.version===Number(b.dataset.review));summaryDialog(e,logs,e===logs.at(-1)&&done);};
  for(const b of app.querySelectorAll('[data-find]'))b.onclick=()=>{const el=app.querySelector('[data-token="'+b.dataset.find+'"]');el?.scrollIntoView({block:'nearest'});el?.animate([{outline:'4px solid #da8c21'},{outline:'0 solid transparent'}],800);};
  if (frame) return;
  const sail=legal?.actions?.find(a=>a.type==="Sail");
  if(sail){area.innerHTML='<button class="primary" id="roll-sail">擲骰航行</button>';area.firstChild.onclick=()=>send({type:"action",action:sail});return;}
  if (done) {
    const sorted = [...current.wealth].sort((a, b) => b.total - a.total);
    area.innerHTML =
      sorted
        .map((w) => {
          const rank = 1 + sorted.filter((x) => x.total > w.total).length;
          const shares = finalStocks.filter((s) => s.ownerId === w.playerId);
          const shareCounts = Object.keys(goods)
            .map(
              (g) =>
                goods[g] +
                " " +
                shares.filter((s) => s.good === g).length +
                " 張，市值 "+shares.filter(s=>s.good===g).length*v.commodities[g].stockPrice+" 銀",
            )
            .join("、");
          const income = Object.entries(
            v.ledger
              .filter(
                (e) =>
                  e.playerId === w.playerId &&
                  e.delta > 0 &&
                  e.reason !== "initial" &&
                  e.reason !== "pledge",
              )
              .reduce((s, e) => {
                const category=flowById.get(e.id)?.category??e.reason;
                s[category] = (s[category] ?? 0) + e.delta;
                return s;
              }, {}),
          ).sort((a, b) => b[1] - a[1])[0];
          const award=v.ledger.filter(e=>e.playerId===w.playerId && e.reason==="flag-award").reduce((n,e)=>n+e.delta,0);
          const fees = v.ledger.filter(
            (e) => e.reason === "final-ransom" && e.playerId === w.playerId,
          );
          return (
            '<details class="result" open><summary>第 ' +
            rank +
            " 名　" +
            who(w.playerId) +
            "　" +
            w.total +
            " 銀</summary><p>現銀 " +
            w.cash +
            " ＋ 股票 " +
            w.stocks +
            " − 抵押負擔 " +
            w.mortgage +
            " ＝ " +
            w.total +
            "</p>" +
            "結算前現銀 "+(w.cash-award-fees.reduce((n,e)=>n+e.delta,0))+" · 令旗賞銀 +"+award+" 銀<br>" + shareCounts +
            "<br>" +
            shares
              .map(
                (s) =>
                  goods[s.good] +
                  " " +
                  v.commodities[s.good].stockPrice +
                  " 銀" +
                  (s.pledged ? "（抵押）" : ""),
              )
              .join("、") +
            "<p>現銀已含終局拘押扣款 " +
            fees.reduce((n, e) => n - e.delta, 0) +
            " 銀</p>" +
            fees
              .map(
                (e) =>
                  "棋子 " +
                  (piece(e.crewId) ?? "（舊紀錄未註記）") +
                  " 終局強制贖回：" +
                  e.delta +
                  " 銀",
              )
              .join("、") +
            (income
              ? "<p>最大收入來源：" +
                ({
                  dividend: "一般船員去程分紅","pirate-dividend":"海盜去程分紅",
                  return: "回程分紅",
                  insurance: "保險",
                  port: "港口",
                  dock: "停泊",
                  "camp-prize": "緝私營",
                }[income[0]] ?? income[0]) +
                " " +
                income[1] +
                " 銀</p>"
              : "") +
            "</details>"
          );
        })
        .join("") +
      '<p id="export-notice">僅供終局研究，含私密資料（重播種子、暗股及完整選票），請勿在對局中分享。資料保存在本機，下載由您主動觸發。</p><button id="export" class="primary">下載終局研究 JSON</button><button id="again">另開新局</button>';
    document.querySelector("#export").onclick = () =>
      worker.postMessage({ type: "export", session, request: ++request });
    document.querySelector("#again").onclick = setup;
    return;
  }
  const offers = new Set();
  const actions = legal.actions.filter((a) => {
      if (a.type !== "BuyStockOrSkip" || !a.stockId) return true;
      const good = a.stockId.split("-")[1];
      if (offers.has(good)) return false;
      offers.add(good);
      return true;
    }),
    env = { actorId: self, expectedVersion: v.version };
  if(v.phase==="CAPTAIN_STOCK_OPTION")for(const [g,n] of Object.entries(v.inventory))if(!offers.has(g)){const note=document.createElement("p");note.textContent=goods[g]+" · "+(!n?"售罄":v.players.find(p=>p.id===self).cash<Math.max(5,v.commodities[g].stockPrice)?"現銀不足":"本次不可重複認購");area.before(note);}
  const sendAction = (a) => send({ type: "submit", action: a });
  if (
    votePanel(area, v, actions, (batch) => send({ type: "vote-batch", batch }))
  )
    return;
  if (legal.bid) {
    const b = legal.bid,
      sealed = b.type === "SubmitSealedBid";
    area.innerHTML =
      "<p>" +
      (sealed
        ? "秘密出價，四席提交後揭曉。"
        : "最高標：" +
          (v.auction.highest
            ? who(v.auction.highest.actorId) +
              " " +
              v.auction.highest.amount +
              " 銀"
            : "尚無出價")) +
      "</p>" +
      (!sealed
        ? "<small>" +
          v.auction.publicHistory
            .map((x) => who(x.actorId) + " " + (x.amount ?? "PASS"))
            .join("　") +
          "</small>"
        : "") +
      '<label>標金（銀）</label><button id="minus">−</button> <input id="amount" type="number" min="' +
      b.minimum +
      '" max="' +
      b.maximum +
      '" value="' +
      b.minimum +
      '"> <button id="plus">＋</button><input id="range" aria-label="標金滑桿" type="range" min="' +
      b.minimum +
      '" max="' +
      b.maximum +
      '" value="' +
      b.minimum +
      '"><button id="bid" class="primary">確認出價</button>';
    const amount = area.querySelector("#amount"),
      range = area.querySelector("#range");
    range.oninput = () => (amount.value = range.value);
    amount.oninput = () => (range.value = amount.value);
    for (const [sel, delta] of [
      ["#minus", -1],
      ["#plus", 1],
    ])
      area.querySelector(sel).onclick = () =>
        (amount.value = range.value =
          Math.max(
            b.minimum,
            Math.min(b.maximum, Number(amount.value) + delta),
          ));
    area.querySelector("#bid").onclick = () => {
      if (amount.value !== "" && amount.reportValidity())
        sendAction({ ...env, type: b.type, amount: Number(amount.value) });
    };
  }
  if (legal.assignShips) {
    area.innerHTML =
      '<p class="muted">依派船順序選三種不同貨物，起點合計最多 9。</p>' +
      legal.assignShips.shipIds
        .map(
          (id, i) =>
            "<label>" +
            ship(id) +
            '<select class="good">' +
            Object.keys(goods)
              .map(
                (g, j) =>
                  '<option value="' +
                  g +
                  '" ' +
                  (j === i ? "selected" : "") +
                  ">" +
                  goods[g] +
                  "</option>",
              )
              .join("") +
            '</select> 起點 <input class="start" type="number" min="1" max="5" value="3"></label>',
        )
        .join("") +
      '<button id="dispatch" class="primary">確認派船</button>';
    function validateRoute() {
      const g = [...area.querySelectorAll(".good")].map((el) => el.value);
      const starts = [...area.querySelectorAll(".start")].map((el) =>
        Number(el.value),
      );
      for (const el of area.querySelectorAll(".good"))
        for (const opt of el.options)
          opt.disabled = g.includes(opt.value) && el.value !== opt.value;
      const reason =
        new Set(g).size !== 3
          ? "三艘船必須配置不同貨物"
          : starts.some((n) => !Number.isInteger(n) || n < 1 || n > 5)
            ? "各船起點須為 1～5 的整數"
            : starts.reduce((a, b) => a + b) > 9
              ? "三船起點合計不可超過 9"
              : "";
      area.querySelector("#dispatch").disabled = !!reason;
      error.textContent = reason;
    }
    area.oninput = validateRoute;
    validateRoute();
    area.querySelector("#dispatch").onclick = () =>
      sendAction({
        ...env,
        type: "AssignShips",
        assignments: legal.assignShips.shipIds.map((shipId, i) => ({
          shipId,
          good: area.querySelectorAll(".good")[i].value,
          start: Number(area.querySelectorAll(".start")[i].value),
        })),
      });
  }
  if (v.phase === "RETURN_VOTING") {
    const ballot = v.returnVotes.find((b) => !b.result);
    if (ballot) {
      const hint = document.createElement("p");
      hint.textContent =
        ship(ballot.shipId) +
        " · 第 " +
        ballot.round +
        " 輪 · 已投 " +
        ballot.submittedCrewIds.length +
        "/" +
        ballot.electorate.length +
        " 枚。" +
        ballot.options
          .filter((o) => o !== "safe")
          .map(
            (o) =>
              cargo[o] +
              (v.act === 2
                ? " 穩定返航，整船 " +
                  RULES.returnTerms[o][3] +
                  (v.effects.stableReturnAdjustment
                    ? " → " +
                      (RULES.returnTerms[o][3] +
                        v.effects.stableReturnAdjustment) +
                      "（" +
                      card[v.eventRevealed] +
                      "）"
                    : "") +
                  " 銀"
                : " " + RULES.returnTerms[o][0] + " 點以上成功"),
          )
          .join("、") +
        (v.act === 2 ? "" : "。失敗時全船拘押，軍武骰 1 不可提前贖回。");
      area.append(hint);
    }
  }
  if (v.phase === "SEASON_END") {
    const held = v.players
      .find((p) => p.id === self)
      .crew.filter((c) => c.status.kind === "detained");
    const hint = document.createElement("p");
    hint.textContent = held
      .map(
        (c) =>
          "棋子 " +
          piece(c.id) +
          "：" +
          (c.status.severe
            ? "重押，不可提前贖回"
            : c.status.capturedSeason === v.season
              ? "贖回一枚 " +
                (v.effects.ransom !== RULES.ransom
                  ? card[v.eventRevealed] + " " + RULES.ransom + " → "
                  : "") +
                v.effects.ransom +
                " 銀"
              : "持續拘押"),
      )
      .join("、");
    area.append(hint);
  }
  if (actions.length) {
    const box = document.createElement("div");
    box.innerHTML =
      '<div class="options"></div><details class="funds"><summary>資金操作</summary></details><p id="trial" aria-live="polite">請選擇行動</p><button id="cancel">取消</button> <button class="primary" id="confirm" disabled>確認行動</button>';
    area.append(box);
    let selected = null,
      moves = [];
    const seatAmounts = [...app.querySelectorAll("[data-pos] small")].map(
      (el) => [el, el.textContent],
    );
    const pilot = actions.filter((a) => a.type === "ApplyPilotMoves");
    const arrows = [...app.querySelectorAll(".arrow")];
    function reset() {
      box.querySelector(".pieces")?.remove();
      selected = null;
      moves = [];
      for (const [el, amount] of seatAmounts) el.textContent = amount;
      app
        .querySelectorAll(".planned")
        .forEach((el) => el.classList.remove("planned"));
      box.querySelector("#confirm").disabled = true;
      box.querySelector("#trial").textContent = "請選擇行動";
      app
        .querySelectorAll(".trial")
        .forEach((el) => el.classList.remove("trial"));
      updateArrows();
    }
    function choose(a, button, description) {
      selected = a;
      app
        .querySelectorAll(".trial")
        .forEach((el) => el.classList.remove("trial"));
      button?.classList.add("trial");
      box.querySelector("#confirm").disabled = false;
      box.querySelector("#trial").textContent = description ?? label(a, v);
    }
    function updateArrows() {
      for (const arrow of arrows) {
        const step = {
          shipId: arrow.dataset.ship,
          delta: Number(arrow.dataset.delta),
        };
        const next = [...moves, step];
        const match = pilot.find(
          (a) =>
            a.moves.length === next.length &&
            a.moves.every(
              (m, i) =>
                m.shipId === next[i].shipId && m.delta === next[i].delta,
            ),
        );
        arrow.disabled = !match;
        arrow.onclick = () => {
          moves = match.moves;
          app
            .querySelectorAll(".planned")
            .forEach((el) => el.classList.remove("planned"));
          for (const s of v.ships.filter((s) =>
            moves.some((m) => m.shipId === s.id),
          )) {
            const target =
              s.position +
              moves
                .filter((m) => m.shipId === s.id)
                .reduce((sum, m) => sum + m.delta, 0);
            app
              .querySelector('[data-lane="' + s.id + '"] .track')
              .children[target].classList.add("planned");
          }
          const route = v.ships
            .filter((s) => moves.some((m) => m.shipId === s.id))
            .map(
              (s) =>
                ship(s.id) +
                " " +
                s.position +
                " → " +
                (s.position +
                  moves
                    .filter((m) => m.shipId === s.id)
                    .reduce((n, m) => n + m.delta, 0)),
            );
          choose(
            match,
            arrow,
            route.join("、") + " · 已調整 " + moves.length + " 次",
          );
          updateArrows();
        };
      }
    }
    updateArrows();
    box.querySelector("#cancel").onclick = reset;
    box.querySelector("#confirm").onclick = () => {
      if (selected) sendAction(selected);
    };
    for (const a of actions.filter((a) => !a.placement && !a.moves?.length)) {
      const button = document.createElement("button");
      button.textContent = label(a, v);
      button.dataset.action = a.type;
      box
        .querySelector(
          ["RedeemPledgedStock", "PledgeStock"].includes(a.type)
            ? ".funds"
            : ".options",
        )
        .append(button);
      button.onclick = () => {
        reset();
        choose(a, button);
      };
    }
    for (const el of app.querySelectorAll("[data-camp]:enabled")) {
      el.onclick = () => {
        reset();
        const count = Number(el.dataset.camp) - v.campCrew.length;
        const candidates = actions.filter(
          (a) => a.type === "CampChoice" && a.crewIds.length === count,
        );
        const pieces = document.createElement("div");
        pieces.className = "pieces";
        box.querySelector("#trial").before(pieces);
        for (const a of candidates) {
          const button = document.createElement("button");
          button.textContent = label(a, v);
          button.onclick = () =>
            choose(
              a,
              el,
              label(a, v) +
                " · 費用 " +
                count * (v.ruleVersion==="1.5"?3:RULES.campCost) +
                " 銀 · 命中實收 " +
                (v.ruleVersion==="1.5"?"每船 8／12／16／20 減自己船員扣款":count * RULES.campPrize) +
                " 銀",
            );
          pieces.append(button);
        }
        pieces.firstChild?.click();
      };
    }
    for (const el of app.querySelectorAll("[data-pos]:not(:disabled)")) {
      el.onclick = () => {
        const a = actions.find(
          (a) => a.placement?.positionId === el.dataset.pos,
        );
        reset();
        const position = v.positions.find((p) => p.id === el.dataset.pos);
        const description =
          preview(v, position) +
          (eventNotes
            ? " · " +
              card[v.eventRevealed] +
              "：" +
              reveal.lines.slice(1).join(" · ")
            : "");
        if (position.shipId) {
          const {crew:seats,pool,shares,market}=shipProjection(v,position);
          seats.forEach((p, i) => {
            app.querySelector('[data-pos="' + p.id + '"] small').textContent =
              (market?"基準試算 ＋":"試算 ＋") +
              shares[i] +
              " 銀";
          });
        }
        const pieces = document.createElement("div");
        pieces.className = "pieces";
        box.querySelector("#trial").before(pieces);
        for (const candidate of actions.filter(
          (x) => x.placement?.positionId === el.dataset.pos,
        )) {
          const chip = document.createElement("button");
          chip.textContent = "棋子 " + piece(candidate.placement.crewId);
          chip.onclick = () =>
            choose(candidate, el, label(candidate, v) + " · " + description);
          pieces.append(chip);
        }
        choose(a, el, label(a, v) + " · " + description);
      };
    }
  }
}
setup();
