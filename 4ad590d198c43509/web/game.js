import {bindPilotControls} from "./pilot-controls.js";
import {silverAmount,silverUnit,formatLiveAmounts} from "./silver.js";
import {focusTutorial} from "./tutorial-guide.js";
import {practiceControls,practiceProgress,practiceReport} from "./tutorial-match.js";
import {chapterCover} from "./story-covers.js";
import {chapterPrefs, readChapters} from './story-stage.js';
import {addHistoryEntry} from './history-charts.js';
import {finalResults,finalStage} from './final-stage.js';
import {achievementPresentation} from './season-history.js';
import {returnStage,campPanel,bindPrison,ransomPanel} from "./return-stage.js";
import {pirateDecision} from "./pirate-panel.js";
import {cargoIcons} from "./board.js";
import {activity,timeline,auctionCards,playerRail} from "./activity.js";
import {clearCashFlight,showStage,stagesFor,summaryDialog,flowName,returnFrame,sailFocus} from './settlement.js';
import { votePanel } from "./vote-panel.js";
import { boardHTML, betSummary, placementCost, placementDiscount } from "./board.js";
import { RULES } from "../dist/packages/shared/src/index.js";
const app = document.querySelector("#app"),
  error = document.querySelector("#error");
formatLiveAmounts(document.body);
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
  logs = [],
  seasonHistory = null;
const practice = new URLSearchParams(location.search).get("mode")==="practice";
const worker = new Worker(new URL("./worker.js",import.meta.url), { type: "module", name: practice?"practice-season-one":"classic" });
const tutorial = focusTutorial(app,document.querySelector("#tutorial-toggle"),document.querySelector("header nav a").href);
let offerTutorial=false;
function send(data) {
  if(data.type==="start" || data.type==="resume" || data.type==="import"){
    tutorial.reset();
    offerTutorial=data.type==="start";
  } else if(current) tutorial.sending(data,current.observation);
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
  batchNoticeScope,
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
  return new Map([...app.querySelectorAll("[data-token]:not([data-token=''])")].map(el=>{
    const rect=el.getBoundingClientRect();
    const rail=el.matches(".homepiece") && !rect.width
      ? el.closest(".box")?.querySelector(".mini-player") : null;
    return [el.dataset.token,rail?.getBoundingClientRect() ?? rect];
  }));
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
function headline(e) {
  return e?.lines.find(line=>!/^當季船長 [A-D]$/.test(line)) ?? types[e?.type] ?? "";
}
export function streamHTML(e) {
  const content = e.lines.map((l) => "<p>" + localized(l) + "</p>").join("");
  return (
    '<article class="stream-summary"><b>' +
    (e.actor ? who(e.actor)+(e.controller==="ai"?"（AI）":"") : "系統") +
    " · " +
    (types[e.type] ?? esc(e.type)) +
    "</b><p>" +
    localized(headline(e)) +
    "</p><details><summary>展開" +
    (e.confirm ? "結算對帳" : "事件詳情") +
    '</summary><div class="stream-detail">' +
    content +
    "</div></details></article>"
  );
}
function seasonProjection(){
  const projection = {history: seasonHistory, viewerId: current.observation.selfId, cards:card, goods, colors};
  return {...projection, review(version){
    const event=logs.find(entry=>entry.version===version&&entry.type==="EndSeason");
    if(event)summaryDialog(event,logs,current.status==="finished"&&event===logs.at(-1),undefined,
      {...projection,showHistory:false});
  }};
}
let storyPreferences;

function showReference(title, opener, fill, confirm) {
  const dialog=document.createElement("dialog");
  dialog.className="table-reference";
  dialog.setAttribute("aria-label",title);
  const heading=document.createElement("h2");
  heading.textContent=title;
  const body=document.createElement("div");
  body.className="reference-body";
  fill(body);
  const close=document.createElement("button");
  close.type="button";
  close.className="primary";
  close.textContent=confirm?"確認事件，繼續":"關閉";
  if(confirm){
    close.id="next";
    dialog.oncancel=event=>event.preventDefault();
  }
  close.onclick=()=>{dialog.close();dialog.remove();confirm?.();};
  dialog.onclose=()=>{
    dialog.remove();
    if(opener?.isConnected)(opener.getClientRects().length?opener:gameMenu).focus({preventScroll:true});
  };
  dialog.append(heading,body,close);
  document.body.append(dialog);
  dialog.showModal();
  close.focus({preventScroll:true});
  return dialog;
}
const chapterButton = document.querySelector("#chapters");
const gameMenu=document.querySelector("#game-menu");
const headerNav=document.querySelector("header nav");
const gameHeader=headerNav.parentElement;
const headerSeason=document.createElement("span");
headerSeason.className="header-season";
gameMenu.before(headerSeason);
function motionPreference(){
  const label=document.createElement("label");
  const preference=document.createElement("input");
  preference.type="checkbox";
  preference.checked=reduced;
  preference.onchange=()=>{
    reduced=preference.checked;
    const original=app.querySelector("#motion");
    if(original)original.checked=reduced;
  };
  label.append(preference," 減少動畫");
  return label;
}
gameMenu.onclick=()=>{
  const dialog=showReference("遊戲選單",gameMenu,body=>{
    body.append(headerNav);
    const settings=document.createElement("label");
    settings.textContent="播放設定 ";
    const speedPicker=document.createElement("select");
    speedPicker.setAttribute("aria-label","播放速度");
    for(const value of ["標準","快速","逐步","略過動畫"])speedPicker.add(new Option(value,value,false,value===speed));
    speedPicker.onchange=()=>{speed=speedPicker.value;};
    settings.append(speedPicker);
    body.append(settings,motionPreference());
  });
  const controller=new AbortController();
  const restore=()=>{controller.abort();gameMenu.after(headerNav);};
  headerNav.addEventListener("click",event=>{
    if(!event.target.closest("button,a"))return;
    restore();
    dialog.close();
    dialog.remove();
  },{capture:true,signal:controller.signal});
  dialog.addEventListener("close",restore,{once:true});
};
function reachedChapters(limit) {
  const chapters = [];
  for (const event of logs.slice(0,limit)) {
    if (event.opening && chapters.at(-1)?.act !== event.opening.act) chapters.push(event.opening);
  }
  return chapters;
}
chapterButton.onclick = () => {
  const chapters = reachedChapters(seen);
  if(chapters.length && !app.inert && !document.querySelector("dialog[open]")) {
    readChapters(chapters,0,true,reduced,storyPreferences,()=>(chapterButton.getClientRects().length?chapterButton:gameMenu).focus({preventScroll:true}));
  }
};
function play() {
  clearTimeout(timer);
  if (seen >= logs.length) {
    render();
    return;
  }
  const e = logs[seen];
  const frame = frames.find((f) => f.version === e.version);
  if (e.opening && storyPreferences && !storyPreferences.value.skip &&
      storyPreferences.value.read < e.opening.act && reachedChapters(seen).at(-1)?.act !== e.opening.act) {
    render(frame);
    readChapters(reachedChapters(seen+1),e.opening.act===1?0:e.opening.act,false,reduced,storyPreferences,()=>{
      storyPreferences.value.read=e.opening.act;
      storyPreferences.save();
      play();
      document.querySelector("#next")?.focus({preventScroll:true});
    });
    return;
  }
  if(e.type==="RevealEvent" && (storyPreferences?.value.eventRead??0)<e.season){
    render(frame);
    const source=document.querySelector(".season-event > div");
    const briefing=showReference("本季商情",null,body=>{
      body.insertAdjacentHTML("beforeend",chapterCover(0)+'<p class="briefing-season">第 '+e.act+' 幕 ／ 第 '+e.season+' 貿易季</p>');
      body.append(...(source?[...source.cloneNode(true).childNodes]:[]));
    },()=>{
      if(storyPreferences){storyPreferences.value.eventRead=e.season;storyPreferences.save();}
      seen++;play();
    });
    briefing.classList.add("season-briefing");
    briefing.querySelector(".briefing-season").after(briefing.querySelector("h2"));
    briefing.querySelector("#next").textContent="確認商情 · 繼續";
    return;
  }
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
  if(e.type==="SettleOutbound" && frame?.ruleVersion==="1.5" && frame.act===2){
    sequence.push({kind:"government"});
  }
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
  const presentationFrame=returnFrame(frame,e,stage) ?? (
    pirate && pirateStage < 2 && frame?.pirateBefore
      ? frame.pirateBefore
      : ((stage && e.type!=="SettleOutbound" && ["roll","reveal"].includes(stage.kind)) || (e.type==="EndSeason" && !stage)) && frame?.voyageBefore ? frame.voyageBefore : frame);
  const pendingFlows=sequence.slice(pirateStage).flatMap(item=>item.flow?[item.flow]:[]);
  const displayFrame=pendingFlows.length?{...presentationFrame,players:presentationFrame.players.map(player=>{
    const next=pendingFlows.find(flow=>flow.playerId===player.id);
    return next?{...player,cash:next.balance-next.delta}:player;
  })}:presentationFrame;
  render(displayFrame,stage);
  document.querySelector("#stream").innerHTML =
    '<section class="playback card"><div class="stream-events">' +
    (seen
      ? "<small>上一筆 · " +
        localized(headline(logs[seen - 1])) +
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
  if(speed!=="略過動畫" && !(e.type==="Sail" && stage?.kind==="move"))animateTokens(old);
  const sailTimes={roll:700,reveal:1250,move:1650};
  const duration=speed==="快速"?180:e.type==="Sail"?(sailTimes[stage?.kind]??850):850;
  if(stage)showStage({...stage,duration,sailing:e.type==="Sail",returning:e.type==="ResolveReturns"&&frame.ruleVersion==="1.5",captain:names[frame.captainId]||frame.captainId},frame,e.presentation.flows);
  if(e.type==="EndSeason" && !stage){
    document.querySelector("#next").remove();
    document.querySelector("#skip").remove();
    worker.postMessage({type:"pending-summary",session,seen});
    summaryDialog(e,logs,current.status==="finished" && seen===logs.length-1,()=>{
    if(practice){
      const skipped=tutorial.skipped();
      tutorial.reset();chapterButton.hidden=true;
      document.querySelector('.record-opener').hidden=true;
      practiceReport(app,logs,seasonHistory,skipped,()=>seasonProjection().review(e.version));
      return;
    }
    seen++;worker.postMessage({type:"ack-summary",session,seen});pirateStage=0;play();
  },seasonProjection());
    if(practice)document.querySelector("#season-confirm").textContent="查看練習結果";
    return;}
  document.querySelector("#next").onclick = advance;
  if(stage?.kind==="government"){
    const next=document.querySelector("#next");
    next.textContent="確認官府包銷";
    next.onclick=()=>{seen++;pirateStage=0;play();};
  }
  document.querySelector("#skip").disabled = e.confirm;
  document.querySelector("#skip").onclick = () => {
    seen++;
    pirateStage = 0;
    while (seen < logs.length && !logs[seen].confirm && !logs[seen].opening && logs[seen].type!=="RevealEvent") seen++;
    play();
  };
  document.querySelector("#speed").onchange = (ev) => {
    speed = ev.target.value;
    if(stage?.kind==="money" && speed!=="略過動畫")advance();
    else play();
  };
  if(stage?.kind==="government")return;
  if(stage && speed!=="逐步"){timer=setTimeout(advance,duration);return;}
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
  document.querySelector("#save-file").hidden=practice || !data.screen;
  const incoming = data.screen?.observation;
  batchNotice = data.batchNotice ?? "";
  batchNoticeScope = incoming && {version:incoming.version, phase:incoming.phase, season:incoming.season};
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
  if(data.storyId)storyPreferences=chapterPrefs(data.storyId);
  logs = data.log ?? [];
  finalStocks = data.finalStocks ?? [];
  if(data.seasonHistory || !data.screen)seasonHistory = data.seasonHistory ?? null;
  if (current) play();
  else setup();
  error.textContent = data.error ?? "";
};
function setup() {
  tutorial.reset();
  offerTutorial=false;
  chapterButton.hidden=true;
  document.querySelector(".record-opener").hidden=true;
  gameMenu.hidden=true;
  headerSeason.textContent="";
  gameHeader.querySelector(".table-context")?.remove();
  positionGameLayout=()=>{};
  positionPass=()=>{};
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
  document.querySelector("#resume").insertAdjacentHTML("afterend",'<p><a href="?mode=practice">新手教學對局 →</a><br><small>進行一季練習，可重新開始，正式存檔獨立保留。重新整理會重開練習。</small></p>');
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
      return types[a.type] + " · " + (good??"股票") + (stock?" · 第 "+(v.stocks.filter(item=>item.ownerId===v.selfId&&item.good===stock.good).indexOf(stock)+1)+" 張":"");
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
const mobileBoard=matchMedia("(max-width:760px)");
let positionGameLayout=()=>{};
let positionPass=()=>{};
mobileBoard.addEventListener("change",()=>{positionGameLayout();positionPass();});

function render(frame,stage) {
  renderGame(frame,stage);
  if(practice)practiceProgress(logs.slice(0,frame?seen+1:logs.length),tutorial.skipped());
  tutorial.render(frame ?? current.observation,frame ? null : current.legal,frame ? logs[seen] : null,logs);
  if(!frame && offerTutorial){offerTutorial=false;if(practice)tutorial.begin();else tutorial.offer();}
}

function renderGame(frame,stage) {
  chapterButton.hidden=false;
  chapterButton.disabled=Boolean(frame);
  clearCashFlight();
  gameHeader.querySelector(".table-context")?.remove();
  positionPass=()=>{};
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
  const weatherName={normal:"正常",typhoon:"颱風",tailwind:"順風"}[v.weather]??"—";
  const politicalName=v.eventRevealed?card[v.eventRevealed]??v.eventRevealed:"尚未揭示";
  const signedEffect=amount=>amount>0?"+"+amount:String(amount);
  const publicEffects=(reveal?.lines.slice(1)??[]).filter(line=>!/^本季(?:天氣|事件)/.test(line));
  const weatherEffect=/^(首輪航行修正|港口獎金加成|停泊獎金加成|保險初始收入)/;
  const moneyEffect=/^(港口獎金加成|停泊獎金加成|保險初始收入|一般贖金|穩定回程獎金修正)：/;
  const eventCard=(kind,name,lines)=>'<article class="season-brief-card" data-source="'+kind+'"><small>'+
    (kind==="天氣"?"☀ ":"⚑ ")+kind+'事件</small><h3>'+esc(name)+'</h3>'+
    (lines.length?lines.map(line=>'<p>'+esc(localized(line)+(moneyEffect.test(line)?" 銀":""))+'</p>').join(""):'<p>維持基本規則。</p>')+'</article>';
  const legacyWeather=v.eventRevealed==="typhoon"||v.eventRevealed==="tailwind";
  const eventSummary=v.eventRevealed?'<details class="season-event"><summary>天氣 '+esc(weatherName)+' · 政經 '+esc(politicalName)+'</summary>'+
    '<div class="season-brief">'+eventCard("天氣",weatherName,publicEffects.filter(line=>weatherEffect.test(line)&&!legacyWeather))+
    eventCard("政經",politicalName,publicEffects.filter(line=>!weatherEffect.test(line)||legacyWeather))+'</div></details>':"";
  const active=stage?.kind==="government"?"return":activity(event?.phase??v.phase);
  const returning=!done && v.ruleVersion==="1.5" && (active==="return" || (active==="closing" && v.ships.some(ship=>ship.good)));
  const chart=done?'<section class="final-stage" aria-label="正式終局"></section>':returning?returnStage(v,{playback:!!frame,focusId:stage?.dice?.[0]?.shipId??stage?.flow?.shipId}):active==="auction"?auctionCards(v,who,colors,event?.actor??self):active==="dispatch"?'<details class="fleet" open><summary>配置商船</summary><div class="route-slot"></div></details>':active==="stock"?'':active==="event"?'':boardHTML(v,legal);
  const market =
    '<div class="market-strip" aria-label="商品行情：股價與價差">' +
    Object.entries(v.commodities)
      .map(
        ([k, c]) =>
          '<button type="button" data-market="'+k+'" aria-label="'+goods[k]+'，股價 '+c.stockPrice+
          ' 銀，價差 '+c.spread+' 銀'+(!v.inventory[k]?'，售罄':'')+'">'+
          '<span class="market-name">'+cargoIcons[k]+' '+goods[k]+'</span> <b>'+silverAmount(c.stockPrice)+
          '</b> <small>／ '+silverAmount(signedEffect(c.spread))+'</small>'+
          (!v.inventory[k]?'<span class="market-sold" title="售罄" aria-hidden="true">×</span>':'')+'</button>',
      )
      .join("") +
    "</div>";
  app.innerHTML =
    '<details class="progress-menu"><summary title="查看遊戲進程">流程</summary>'+timeline(active)+'</details><label class="motion"><input id="motion" type="checkbox" ' +
    (reduced ? "checked" : "") +
    '> 減少動畫</label><section id="stream"><button type="button" class="voyage-headline" aria-label="查看最新航海動態"><b>航海動態</b> ' +
    (seen ? localized(headline(logs[seen - 1])) : "") +
    '</button></section><div class="table-context">'+eventSummary+'<div class="banner"><div><span class="tag">第 ' +
    v.act +
    " 幕</span>　第 " +
    v.season +
    " 貿易季</div><b>" +
    phase +
    '</b></div></div>'+market+'<div class="layout activity-layout"><div class="players">' +
    '<div class="card"><h2>玩家資產</h2><div class="grid">' +
    v.players
      .map(
        (p, i) =>
          '<div class="box" style="--color:' +
          colors[i] +
          '">' +
          '<section class="player-assets"><h3>' + p.id +
          " · " +
          who(p.id) + "</h3>" +
          (v.captainId === p.id ? " ⚓ 本季船長" : "") +
          '<strong data-cash="' +p.id+ '">' +
          silverAmount(p.cash) +
          "</strong>" +
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
          " 枚</section><section class=\"player-records\"><h3>操作與收支</h3><details><summary>棋子狀態</summary>" +
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
          "</details></section>" +
          "</div>",
      )
      .join("") +
    '</div></div></div><section class="activity-center" data-activity="'+active+'">' +
    chart +
    '</section><aside class="panel"><div class="card"><small class="caption">' +
    (frame
      ? "事件播放"
      : done
        ? "排名"
        : "輪到 " + self + " 席 · " + who(self)) +
    "</small><h2>" +
    phase +
    '</h2><p role="status">' +
    esc(!frame && batchNoticeScope?.version === v.version && batchNoticeScope.phase === v.phase && batchNoticeScope.season === v.season
      ? (v.phase === "RETURN_VOTING" ? batchNotice : batchNotice.replace(/^已投出 \d+ 票(?:；[^ ]*)? */, "")) : "") +
    '</p><div id="actions"></div></div><details class="card"><summary>本季收支</summary><div class="log">' +
    v.ledger
      .filter((e) => e.season === v.season)
      .map(
        (e) =>
          who(e.playerId) +
          "　" +
          (e.delta > 0 ? "+" : "") +
          e.delta +
          " 銀　" +
          ('<span data-entry="'+e.id+'">'+esc(e.reason==="initial"?"開局現銀":e.reason)+'</span>'),
      )
      .join("<br>") +
    '</div></details><details class="card"><summary>航海紀錄 · ' +
    (frame ? seen + 1 : logs.length) +
    '</summary><div class="log">' +
    historyHTML(logs.slice(0,frame?seen+1:logs.length)) +
    "</div></details></aside></div>";
  app.querySelector(".activity-layout").classList.add("main-stage");
  playerRail(app,event?.actor??self,v);
  const context=app.querySelector(".table-context");
  const stageLabel=context.querySelector(".banner");
  headerSeason.textContent="第 "+v.act+" 幕 · 第 "+v.season+" 季";
  const progressMenu=app.querySelector(".progress-menu");
  const progressLabel=progressMenu.querySelector("summary");
  const phaseHeading=stageLabel.querySelector(":scope > b");
  if(active==="voyage"&&v.phase.startsWith("PLACEMENT"))phaseHeading.prepend("去程 · ");
  progressLabel.replaceChildren(phaseHeading);
  stageLabel.prepend(progressMenu);
  const stream=app.querySelector("#stream");
  positionGameLayout=()=>{
    if(mobileBoard.matches)gameHeader.append(context);
    else stream.before(context);
    const board=app.querySelector(".voyage-board:not(.pilot-board)");
    const aids=board?.querySelector(".voyage-aids");
    if(aids){
      if(mobileBoard.matches)board.querySelector(".dock-zone").append(aids);
      else board.append(aids);
    }
  };
  positionGameLayout();
  stream.append(app.querySelector(".motion"));
  const latest=app.querySelector(".voyage-headline");
  latest.onclick=()=>showReference("最新航海動態",latest,body=>{
    if(seen)body.innerHTML=streamHTML(logs[seen-1]);
    body.append(motionPreference());
  });
  const references=[...app.querySelectorAll(".panel > details")];
  const recordOpener=document.querySelector(".record-opener");
  recordOpener.hidden=false;
  gameMenu.hidden=false;
  recordOpener.onclick=()=>showReference("對局紀錄",recordOpener,body=>{
    body.append(...references.map(section=>section.cloneNode(true)));
    for(const button of body.querySelectorAll("[data-review]"))button.onclick=()=>{
      const e=logs.find(x=>x.version===Number(button.dataset.review));
      summaryDialog(e,logs,e===logs.at(-1)&&done,undefined,seasonProjection());
    };
    const projection=seasonProjection();
    addHistoryEntry(body,projection,v.version,projection.review,{label:"市場走勢",mode:"stockPrice"});
    addHistoryEntry(body,projection,v.version,projection.review,{label:"歷史財務",mode:"personal"});
  });
  references.forEach(section=>section.remove());
  for(const button of app.querySelectorAll("[data-market]"))button.onclick=()=>{
    const good=button.dataset.market;
    const quote=v.commodities[good];
    const own=v.stocks.filter(stock=>stock.ownerId===self&&stock.good===good);
    showReference(goods[good]+"｜本季行情",button,body=>{
      body.innerHTML='<p>股票股價 '+silverAmount(quote.stockPrice)+' · 去程價差 '+silverAmount(signedEffect(quote.spread))+
        '</p><p>公開認購庫存 '+v.inventory[good]+' 張</p><p>本人持股 '+own.length+' 張 · 抵押 '+
        own.filter(stock=>stock.pledged).length+' 張</p>';
      if(v.previousMarket?.[good]){
        const previous=v.previousMarket[good];
        body.insertAdjacentHTML("beforeend",'<p>前次行情：股價 '+silverAmount(previous.stockPrice)+' · 價差 '+silverAmount(signedEffect(previous.spread))+'</p>');
      }
      const reason=logs.filter(entry=>entry.season===v.season&&entry.version<=v.version)
        .flatMap(entry=>entry.lines).findLast(line=>line.startsWith(goods[good]+" ")&&line.includes("股價"));
      if(reason){
        const explanation=document.createElement("p");
        explanation.textContent=localized(reason);
        body.append(explanation);
      }
      const projection=seasonProjection();
      addHistoryEntry(body,projection,v.version,projection.review,{label:"市場走勢",mode:"stockPrice"});
    });
  };
  if(app.querySelector(".voyage-board")){
    app.querySelector(".activity-layout").classList.add("voyage-layout","main-stage");
  }
  const slot=app.querySelector('.route-slot');
  if(slot && legal?.assignShips)slot.append(app.querySelector('#actions'));
  if(["auction","stock","dispatch"].includes(active)){
    const layout=app.querySelector(".activity-layout");
    layout.classList.add("main-stage");
    const center=layout.querySelector(".activity-center");
    const panel=layout.querySelector(".panel");
    const actions=panel.querySelector("#actions");
    if(actions){
      if(active==="auction" && !frame){
        actions.classList.add("auction-controls");
        center.querySelector(".auction-grid").before(actions);
      }else if(!center.contains(actions)) center.append(actions);
    }
    const notice=panel.querySelector('[role="status"]');
    if(notice?.textContent)center.prepend(notice);
    panel.remove();
  }
  const board=app.querySelector(".voyage-board");
  if(board && active==="voyage"){
    const center=board.parentElement;
    const panel=app.querySelector(".panel");
    const control=panel.firstElementChild;
    control.classList.add("voyage-controls");
    board.after(control);
    if(frame)control.hidden=true;
    else if(v.phase.startsWith("PLACEMENT"))control.classList.add("placement-focus");
    panel.remove();
  }
  if(returning || done){
    const layout=app.querySelector(".activity-layout");
    layout.classList.add("main-stage",done?"final-layout":"return-layout");
    if(done)layout.querySelector(".players").remove();
    const panel=layout.querySelector(".panel");
    const actions=panel.querySelector("#actions");
    layout.querySelector(done?".final-stage":".return-stage").append(actions);
    panel.firstElementChild.remove();
    panel.remove();
  }
  const history=logs.slice(0,frame?seen+1:logs.length);
  const flowById=new Map(history.flatMap(e=>(e.presentation?.flows??[]).map(f=>[f.id,f])));
  for(const section of references)for(const el of section.querySelectorAll("[data-entry]")){
    const flow=flowById.get(el.dataset.entry);
    if(flow)el.textContent=flowName(flow);
  }
  app.querySelectorAll('[data-entry]').forEach(el=>{const flow=flowById.get(el.dataset.entry);if(flow)el.textContent=flowName(flow);});
  const area = document.querySelector("#actions");
  document.querySelector("#motion").onchange = (e) => {
    reduced = e.target.checked;
  };
  for(const b of app.querySelectorAll("[data-review]"))b.onclick=()=>{const e=logs.find(x=>x.version===Number(b.dataset.review));summaryDialog(e,logs,e===logs.at(-1)&&done,undefined,seasonProjection());};
  for(const b of app.querySelectorAll('[data-find]'))b.onclick=()=>{const el=app.querySelector('[data-token="'+b.dataset.find+'"]');el?.scrollIntoView({block:'nearest'});el?.animate([{outline:'4px solid #da8c21'},{outline:'0 solid transparent'}],800);};
  if (frame) return;
  const sail=legal?.actions?.find(a=>a.type==="Sail");
  if(sail){
    const focus=sailFocus(v,names[v.captainId]||v.captainId);
    const roll=document.createElement("button");
    roll.type="button";
    roll.id="roll-sail";
    roll.className="primary";
    roll.textContent="擲骰航行";
    roll.onclick=()=>send({type:"action",action:sail});
    focus.append(roll);
    app.querySelector(".voyage-board").prepend(focus);
    area.closest(".voyage-controls")?.setAttribute("hidden","");
    return;
  }
  if (done) {
    const last = seasonHistory?.public.seasons.at(-1);
    const result = finalResults(current.wealth,v,finalStocks,last);
    area.innerHTML = finalStage(result,{
      who,goods,esc,colors:Object.fromEntries(ids.map((id,index)=>[id,colors[index]])),
      achievements:achievementPresentation,
    });
    const projection=seasonProjection();
    addHistoryEntry(area.querySelector(".final-history-slot"),projection,v.version,projection.review);
    document.querySelector("#export").onclick = () =>
      worker.postMessage({ type: "export", session, request: ++request });
    document.querySelector("#again").onclick = setup;
    return;
  }
  const offers = new Set();
  const actions = legal.actions.filter((a) => {
      if (legal.bid && a.type === "WithdrawPublic") return false;
      if (returning && a.type === "RedeemCrew") return false;
      if (a.type !== "BuyStockOrSkip" || !a.stockId) return true;
      const good = a.stockId.split("-")[1];
      if (offers.has(good)) return false;
      offers.add(good);
      return true;
    }),
    env = { actorId: self, expectedVersion: v.version };
  if(v.phase==="CAPTAIN_STOCK_OPTION")for(const [g,n] of Object.entries(v.inventory))if(!offers.has(g)){const note=document.createElement("p");note.textContent=goods[g]+" · "+(!n?"售罄":v.players.find(p=>p.id===self).cash<Math.max(5,v.commodities[g].stockPrice)?"現銀不足":"本次不可重複認購");area.before(note);}
  const sendAction = (a) => send({ type: "submit", action: a });
  if(returning){
    const open=bindPrison(app,v,legal.actions,sendAction,action=>label(action,v));
    if(ransomPanel(area,v,legal.actions,open))return;
  }
  if(v.ruleVersion==="1.5"&&v.phase==="ANTI_SMUGGLING_PLACEMENT"){
    campPanel(area,v,actions,sendAction);
    return;
  }
  if (
    votePanel(area, v, actions, (batch) => send({ type: "vote-batch", batch }))
  )
    return;
  if (legal.bid) {
    const b = legal.bid,
      sealed = b.type === "SubmitSealedBid";
    const pass = legal.actions.find(action=>action.type==="WithdrawPublic");
    area.innerHTML =
      '<div class="auction-quote"><p>' +
      (sealed
        ? "秘密出價，四席提交後揭曉。"
        : "最高標：" +
          (v.auction.highest
            ? who(v.auction.highest.actorId) +
              " " +
              silverAmount(v.auction.highest.amount)
            : "尚無出價")) +
      "</p><p>下一個合法出價 <b>"+silverAmount(b.minimum)+"</b></p></div>" +
      (!sealed
        ? '<details class="auction-history"><summary>出價紀錄</summary><small>' +
          v.auction.publicHistory
            .map((x) => who(x.actorId) + " " + (x.amount ?? "PASS"))
            .join("　") +
          "</small></details>"
        : "") +
      '<div class="auction-entry"><label for="amount">標金 '+silverUnit+'</label><button id="minus">−</button> <input id="amount" type="number" min="' +
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
      '"></div><div class="auction-submit"><button id="bid" class="primary">確認出價</button>'+
      (pass?'<button data-action="WithdrawPublic">PASS</button>':'')+'</div>';
    if(pass)area.querySelector('[data-action="WithdrawPublic"]').onclick=()=>sendAction(pass);
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
            '<div data-ship="'+id+'">' +
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
            '</select> 起點 <input class="start" type="number" min="1" max="5" value="3"></div>',
        )
        .join("") +
      '<button id="dispatch" class="primary">確認派船</button>';
    const cargoIcons={deerskin:"🦌",sugar:"🎋",sulfur:"🪨",rice:"🌾"};
    const rows=[...area.querySelectorAll("div[data-ship]")];
    rows.forEach((row,index)=>{
      const select=row.querySelector("select"),start=row.querySelector("input");
      row.className="cargo-deck";
      const hull=document.createElement("button");
      hull.type="button";hull.className="hull";
      const controls=document.createElement("div");
      controls.className="deck-controls";
      const cargo=document.createElement("div"),track=document.createElement("div");
      cargo.className="cargo-options";track.className="start-track";
      for(const [key,name] of Object.entries(goods)){
        const b=document.createElement("button");b.type="button";b.dataset.good=key;b.textContent=cargoIcons[key]+" "+name;
        b.onclick=()=>{select.value=key;validateRoute()};cargo.append(b);
      }
      for(let i=1;i<=5;i++){
        const b=document.createElement("button");b.type="button";b.textContent=i;b.setAttribute("aria-label","起點 "+i);
        b.onclick=()=>{start.value=i;validateRoute()};track.append(b);
      }
      controls.append(cargo,track);select.hidden=start.hidden=true;
      row.replaceChildren(hull,controls,select,start);
      controls.id = "deck-controls-"+index;
      hull.setAttribute("aria-controls", controls.id);
      hull.onclick = () => rows.forEach(deck=>setExpanded(deck,deck===row));
      setExpanded(row,index===0);
    });
    function setExpanded(row,expanded){
      row.classList.toggle("expanded",expanded);
      row.querySelector(".hull").setAttribute("aria-expanded",String(expanded));
    }
    function validateRoute() {
      const g = [...area.querySelectorAll(".good")].map((el) => el.value);
      const starts = [...area.querySelectorAll(".start")].map((el) =>
        Number(el.value),
      );
      for (const el of area.querySelectorAll(".good"))
        for (const opt of el.options)
          opt.disabled = g.includes(opt.value) && el.value !== opt.value;
      rows.forEach((row,i)=>{
        row.querySelector(".hull").textContent=cargoIcons[g[i]]+" "+goods[g[i]]+" · 起點 "+starts[i];
        for(const b of row.querySelectorAll("[data-good]")){
          b.disabled=g.includes(b.dataset.good)&&b.dataset.good!==g[i];b.setAttribute("aria-pressed",String(b.dataset.good===g[i]));
        }
        for(const b of row.querySelectorAll(".start-track button"))b.setAttribute("aria-pressed",String(Number(b.textContent)===starts[i]));
      });
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
  const pirates=actions.filter(action=>action.type==="PirateBoardOrDecline" || action.type==="PirateTakeoverDecision");
  if(pirates.length){
    const {shell,dialog,shipIds}=pirateDecision(v,pirates,sendAction,id=>names[id]||"玩家 "+id,colors);
    area.append(shell);
    for(const shipId of shipIds)app.querySelector('[data-lane="'+shipId+'"]')?.classList.add("pirate-target");
    const notice=document.createElement("b");
    notice.textContent="海盜抉擇中… · "+shipIds.length+" 艘候選船";
    app.querySelector("#stream").append(notice);
    dialog.showModal();
    return;
  }
  const pilotActions = actions.filter(action => action.type === "ApplyPilotMoves");
  if (pilotActions.length) {
    const board = app.querySelector(".voyage-board");
    const panel = document.createElement("section");
    const layout=board.closest(".voyage-layout");
    layout.classList.add("pilot-layout");
    board.classList.add("pilot-board");
    board.before(panel);
    const stations=document.createElement("details");
    stations.className="pilot-stations";
    stations.innerHTML="<summary>港口、停泊、海盜與領航席</summary>";
    board.append(board.querySelector(".voyage-aids"));
    for(const node of board.querySelectorAll(":scope > :is(.port,.dock-zone,.pirate-reef,.voyage-aids)")) stations.append(node);
    board.after(stations);
    area.closest(".voyage-controls")?.setAttribute("hidden","");
    bindPilotControls(panel,board,v,pilotActions,actions,goods,label,sendAction);
    if(mobileBoard.matches){
      const boardTop=board.getBoundingClientRect().top;
      const controlsBottom=panel.querySelector(".pilot-buttons").getBoundingClientRect().bottom;
      if(innerHeight<=680){
        layout.scrollIntoView({block:"start",behavior:"instant"});
      }else if(controlsBottom>innerHeight && controlsBottom-boardTop<=innerHeight){
        window.scrollBy({top:Math.ceil(controlsBottom-innerHeight),behavior:"instant"});
      }else if(boardTop<0 || controlsBottom>innerHeight){
        layout.scrollIntoView({block:"start",behavior:"instant"});
      }
    }
    return;
  }
  if (actions.length) {
    const compact = legal.assignShips || legal.bid;
    const box = document.createElement(compact?"details":"div");
    box.innerHTML =
      '<div class="options"></div><details class="funds"><summary>資金操作</summary></details><p id="trial" aria-live="polite">請選擇行動</p><button id="cancel">取消</button> <button class="primary" id="confirm" disabled>確認行動</button>';
    if(compact)box.insertAdjacentHTML("afterbegin","<summary>其他合法操作</summary>");
    if(v.phase.startsWith("PLACEMENT")){
      box.classList.add("placement-controls");
      const funds=box.querySelector(".funds");
      const finance=document.createElement("section");
      finance.className="funds finance-controls";
      finance.innerHTML="<b>股票與資金</b>";
      const cash=document.createElement("small");
      cash.textContent="現銀 "+v.players.find(player=>player.id===self).cash+" 銀";
      finance.append(cash);
      funds.remove();
      box.append(finance);
    }
    area.append(box);
    let selected = null;
    const seatAmounts = [...app.querySelectorAll("[data-pos] small")].map(
      (el) => [el, el.textContent],
    );
    const betDialog=document.createElement("dialog");
    betDialog.className="bet-dialog";
    betDialog.setAttribute("aria-labelledby","bet-title");
    area.append(betDialog);
    const placementCandidates=id=>actions.filter(action=>action.placement?.positionId===id);
    let betOpener;
    betDialog.onclose=()=>betOpener?.focus({preventScroll:true});
    function showBet(position,candidates,shipSeats,opener,crewId){
      if(opener)betOpener=opener;
      const quote=betSummary(v,position);
      const good=v.ships.find(ship=>ship.id===position.shipId)?.good;
      const marketEffect=good?(reveal?.lines??[]).find(line=>line.startsWith(goods[good]+"價差 ")):null;
      const adjustments=[quote.adjustment,marketEffect].filter(Boolean).join(" · ");
      const signed=value=>silverAmount((value<0?"−":value>0?"+":"")+Math.abs(value));
      const insurance=position.kind==="insurance";
      const shipBet=position.kind==="ship";
      const estimate=shipBet?'<p class="bet-projection"><b>依目前船員配置試算</b> · 試放後 '+quote.crew+' 枚船員<br>整船'+(quote.market?"基準":"獎金")+" "+silverAmount(quote.pool)+'。'+
        (quote.market?"入港才擲商情骰，分紅與淨收益會變動。":"")+"後續船員或海盜變動也可能改變分紅。</p>":"";
      const discount=placementDiscount(v,position,quote.cost,candidates);
      const outcome=quote.prize==null||insurance?"":'<p>'+(quote.market?"基準淨收益":"命中淨收益")+' <b>'+signed(quote.prize-quote.cost)+
        '</b> · 未命中 '+(quote.cost?signed(-quote.cost):"損失 0 銀")+'</p>';
      betDialog.innerHTML='<h2 id="bet-title">'+quote.title+'</h2>'+
        (shipSeats?'<fieldset class="ship-seat-picker"><legend>選擇船員席位</legend><div></div></fieldset>':'')+'<div class="bet-totals">'+
        '<div><small>實際支付</small><strong>'+signed(-quote.cost)+'</strong></div>'+
        '<div><small>'+(insurance?"立即收入":shipBet?(quote.market?"成功分紅（基準）":"成功分紅（試算）"):"命中領取")+'</small><strong>'+
        (quote.prize==null?"依後續結果":signed(quote.prize))+'</strong></div></div>'+
        (discount?'<p class="bet-discount">票面 '+position.cost+' 銀 · 減免 '+(position.cost-quote.cost)+' 銀 · 實付 '+quote.cost+' 銀<br>'+esc(discount)+'</p>':'')+
        '<p id="bet-condition" class="bet-condition">'+quote.condition+'</p>'+estimate+outcome+
        (candidates.length>1?'<fieldset><legend>選擇手下</legend><div class="bet-crew"></div></fieldset>':"")+
        (adjustments?'<p class="bet-adjustment">'+esc(adjustments)+'</p>':'')+
        '<details class="bet-breakdown"><summary>詳細規則與當季事件</summary><section><h3>當季事件影響</h3><p class="bet-effect"></p></section>'+
        '<section><h3>結算規則</h3><p class="bet-settlement"></p></section>'+
        '<section><h3>風險與機率</h3><p class="bet-risk"></p></section></details>'+
        '<div class="bet-footer"><button id="bet-cancel" type="button">取消</button> <button id="bet-confirm" class="primary" type="button">確認下注</button></div>';
      betDialog.querySelector(".bet-effect").textContent="天氣 "+weatherName+" · 政經 "+politicalName+"。 "+(adjustments||"本季無額外修正");
      betDialog.querySelector(".bet-settlement").textContent=[quote.timing,quote.condition,quote.details].filter(Boolean).join(" ");
      betDialog.querySelector(".bet-risk").textContent=insurance?quote.condition:
        "未獲收入時支出 "+quote.cost+" 銀。"+(quote.chance==null?"":"條件式機率 "+(100*quote.chance).toFixed(1)+"%；假設後續無玩家干預。");
      let chosen=candidates.find(action=>action.placement.crewId===crewId)??candidates[0];
      let activeSeat;
      if(shipSeats)for(const seat of shipSeats){
        const options=placementCandidates(seat.id);
        const button=document.createElement("button");
        button.type="button";
        button.dataset.chooseSeat=seat.id;
        button.disabled=!options.length;
        button.setAttribute("aria-pressed",String(seat.id===position.id));
        const price=options.length?placementCost(v,seat,v.players.find(player=>player.id===self)):seat.cost;
        button.textContent="第 "+seat.seat+" 席 · "+price+" 銀"+(seat.crewId?" · 已占":options.length?"":" · 不可用");
        button.onclick=()=>showBet(seat,options,shipSeats,undefined,chosen?.placement.crewId);
        betDialog.querySelector(".ship-seat-picker > div").append(button);
        if(seat.id===position.id)activeSeat=button;
      }
      for(const candidate of candidates.length>1?candidates:[]){
        const chip=document.createElement("button");
        chip.type="button";
        chip.textContent=self+"·"+piece(candidate.placement.crewId);
        chip.setAttribute("aria-pressed",String(candidate===chosen));
        chip.onclick=()=>{
          chosen=candidate;
          for(const option of betDialog.querySelectorAll(".bet-crew button"))option.setAttribute("aria-pressed",String(option===chip));
        };
        betDialog.querySelector(".bet-crew").append(chip);
      }
      if(!chosen)betDialog.querySelector(".bet-condition").textContent="本席沒有可用的手下或合法付款方式。";
      const confirm=betDialog.querySelector("#bet-confirm");
      confirm.disabled=!chosen;
      confirm.onclick=()=>{if(chosen){betDialog.close();sendAction(chosen);}};
      betDialog.querySelector("#bet-cancel").onclick=()=>betDialog.close();
      betDialog.style.setProperty("--crew-color",colors[v.players.findIndex(player=>player.id===self)]);
      if(!betDialog.open)betDialog.showModal();
      activeSeat?.focus({preventScroll:true});
    }
    function reset() {
      box.querySelector(".pieces")?.remove();
      selected = null;
      for (const [el, amount] of seatAmounts) el.textContent = amount;
      app
        .querySelectorAll(".planned")
        .forEach((el) => el.classList.remove("planned"));
      box.querySelector("#confirm").disabled = true;
      box.querySelector("#trial").textContent = "請選擇行動";
      app
        .querySelectorAll(".trial")
        .forEach((el) => el.classList.remove("trial"));
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
    box.querySelector("#cancel").onclick = reset;
    box.querySelector("#confirm").onclick = () => {
      if (selected) sendAction(selected);
    };
    const pass=actions.find(a=>a.type==="PlaceCrewOrPass"&&!a.placement);
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
        if(a===pass&&mobileBoard.matches){
          const confirm=document.createElement("dialog");
          confirm.className="bet-dialog pass-dialog";
          confirm.setAttribute("aria-label",label(a,v));
          confirm.innerHTML='<h2>'+label(a,v)+'</h2><p>確認後將推進遊戲。</p><div class="bet-footer">'+
            '<button type="button" data-pass-cancel autofocus>返回棋盤</button>'+
            '<button type="button" class="primary" data-pass-confirm>確認放棄</button></div>';
          confirm.querySelector("[data-pass-cancel]").onclick=()=>confirm.close();
          confirm.querySelector("[data-pass-confirm]").onclick=()=>{confirm.close();sendAction(a);};
          confirm.onclose=()=>{confirm.remove();button.focus({preventScroll:true});};
          app.append(confirm);
          confirm.showModal();
          return;
        }
        reset();
        choose(a, button);
      };
      if(a===pass){
        const options=box.querySelector(".options");
        const placementBar=document.createElement("div");
        placementBar.className="mobile-placement-bar";
        const prompt=document.createElement("span");
        prompt.textContent="玩家 "+self+" · "+phase;
        placementBar.append(prompt);
        positionPass=()=>{
          const mobile=mobileBoard.matches;
          button.classList.toggle("quick-pass",mobile);
          if(mobile&&board){
            board.after(placementBar);
            placementBar.append(button);
          }else{
            options.prepend(button);
            placementBar.remove();
          }
        };
        positionPass();
      }
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
    for(const entry of app.querySelectorAll("[data-ship-seats]")){
      entry.onclick=()=>{
        reset();
        const seats=v.positions.filter(seat=>seat.shipId===entry.dataset.shipSeats);
        const first=seats.find(seat=>placementCandidates(seat.id).length);
        if(first)showBet(first,placementCandidates(first.id),seats,entry);
      };
    }
    for (const el of app.querySelectorAll("[data-pos]:not(:disabled)")) {
      el.onclick = () => {
        reset();
        const candidates=placementCandidates(el.dataset.pos);
        const position=v.positions.find(candidate=>candidate.id===el.dataset.pos);
        showBet(position,candidates,undefined,el);
      };
    }
  }
}
if(practice){
  practiceControls();
  send({type:"start",humans:["A"],names,mode:"hybrid"});
}else setup();
