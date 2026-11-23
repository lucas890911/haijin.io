import {createSeasonHistory} from './season-history.js';
import {RULES} from "../dist/packages/shared/src/index.js";
import {checkpoint} from './checkpoint.js';
let priorBoard,detentions={};
import { recordOutcomes, resultLines } from "./outcomes.js";
import {
  SinglePlayerHost,
  submitVoteBatch,
  rationalNames,
} from "../dist/packages/simulation/src/index.js";
import { seededRandom, voyageStockQuote } from "../dist/packages/rules-engine/src/index.js";
let host,
  log = [],
  session = 0,
  frames = [],
  previousMarket,
  outcomes, seasonHistory, storyId;
const practice = self.name === "practice-season-one";
let queue=Promise.resolve();
let playerNames={};
function snapshot(from){
  return {from,save:host.saveForHost(),names:playerNames};
}
onmessage=({data})=>{queue=queue.then(()=>handle(data));};
async function handle(m) {
  let restored,from=log.length;
  frames = [];
  let batchNotice = "";
  try {
    if(practice && ["portable","resume","import","export","probe","ack-summary","pending-summary"].includes(m.type))return;
    if(practice && m.type!=="start" && log.at(-1)?.type==="EndSeason")return;
    if(m.type==="ack-summary" || m.type==="pending-summary"){
      const entry=log[m.type==="ack-summary"?m.seen-1:m.seen];
      if(host && session===m.session && entry?.type==="EndSeason"){
        try {await checkpoint(snapshot(m.seen));}
        catch {postMessage({warning:"季末確認未能寫入本機，請匯出存檔。"});}
      }
      return;
    }
    if (m.type==="probe") {
      try {postMessage({available:Boolean(await checkpoint())});}
      catch {postMessage({available:false,warning:"本機存檔無法使用，請定期匯出。"});}
      return;
    }
    if (m.type==="portable") {
      const payload=snapshot(m.seen);
      postMessage({request:m.request,portable:{format:"haijin-local-1",payload,digest:await checksum(payload)}});
      return;
    }
    if (["start","resume","import"].includes(m.type)) {
      if (m.type==="import") {
        const file=JSON.parse(await m.file.text());
        if(file.format!=="haijin-local-1")throw Error("存檔版本不相容");
        if(file.digest!==await checksum(file.payload))throw Error("存檔完整性檢查失敗");
        restored=file.payload;
        const {save,from}=restored;
        if(save?.format!=="m063-replay-1" || save.config?.ruleVersion!=="1.5")throw Error("主持端或規則版本不相容");
        if(!Number.isInteger(from)||from<0||from>save.checkpoint||save.config.seats?.join(",")!=="A,B,C,D")throw Error("存檔資料無效");
      }
      if(m.type==="resume"){restored=await checkpoint();if(!restored)throw Error("沒有本機存檔");}
      from=restored?.from??0;
      const seed = practice ? "m114-first-season-1" : crypto.randomUUID(),
        seats = ["A", "B", "C", "D"];
      let cursor = 0;
      const pick = (n) => seededRandom(seed + "setup", cursor++) % n;
      const humans = restored?[restored.save.config.human,...restored.save.config.additionalHumans]:m.humans;
      if (
        !Array.isArray(humans) ||
        !humans.length ||
        new Set(humans).size !== humans.length ||
        humans.some((x) => !seats.includes(x))
      )
        throw Error("請選擇真人席位");
      const bots = seats.filter((x) => !humans.includes(x)),
        pure = bots[pick(bots.length || 1)],
        emotions = {};
      const kinds = ["rational", "E01", "E02", "E03", "E04", "E05"];
      for (const id of bots.filter((x) => x !== pure)) {
        const kind = kinds[pick(kinds.length)];
        if (kind === "rational") continue;
        emotions[id] = { kind, intensity: 0.6 };
        if (kind === "E02") {
          emotions[id].policyVersion = "emotion-2-asset-targeting";
          emotions[id].targetId = seats.filter((x) => x !== id)[pick(3)];
          kinds.splice(kinds.indexOf(kind), 1);
        }
        if (kind === "E04")
          emotions[id].policyVersion = "emotion-e04-2-evidence";
      }
      session++;
      log = [];
      storyId = await checksum(["chapter-preference", restored?.save.config.seed ?? seed]);
      priorBoard=undefined;detentions={};
      previousMarket = undefined;
      outcomes = undefined;
      const config={
          seed,
          captainRolls:true,
          strategySeed: seed + "ai",
          seats,
          human: humans[0],
          additionalHumans: humans.slice(1),
          roles: seats.map(() => rationalNames[pick(3)]),
          emotions,
          mode: m.mode,
        };
      seasonHistory = createSeasonHistory(humans, RULES.pledgeRedemption, voyageStockQuote);
      const audit=(_action, view, step, auditDisplay) => {
          const wasReady = outcomes?.ready && outcomes.season === view.season;
          outcomes = recordOutcomes(outcomes, view);
          if (outcomes.ready && (!wasReady || step.type === "SettleOutbound"))
            step.lines.unshift(...resultLines(outcomes, view));
          if(step.type==="SettleOutbound" && view.act===2 && view.ruleVersion==="1.5")outcomes.port.forEach((id,i)=>step.lines.push(id.replace("ship-","船 ")+" 第 "+(i+1)+" 名 · "+(["瓷器 18","布匹 12","無配額 0"][i])+" 銀；依實際船員發放"));
          if (step.type === "SettleOutbound") {
            const paid = view.ledger.find(
              (e) => e.version === view.version && e.reason === "reimbursement",
            );
            if (paid) step.lines.unshift("保險員支付 " + -paid.delta + " 銀");
          }
          for(const p of view.players)for(const c of p.crew){
            if(c.status.kind!=='detained')delete detentions[c.id];
            else if(!detentions[c.id]){const vote=view.returnVotes.find(v=>v.electorate.some(x=>x.crewId===c.id));detentions[c.id]={ship:vote?.shipId,option:vote?.result,good:view.ships.find(ship=>ship.id===vote?.shipId)?.good};}
          }
          frames.push({
            detentions:{...detentions},
            voyageBefore:(step.presentation?.dice?.length || step.type==='EndSeason')?priorBoard:undefined,
            pirateBefore: step.type.startsWith("Pirate")
              ? priorBoard
              : undefined,
            outcomes,
            settling: step.type === "SettleOutbound",
            ...view,
            previousMarket,
            events: [],
            seasonNet: Object.fromEntries(
              view.players.map((p) => [
                p.id,
                view.ledger
                  .filter(
                    (e) =>
                      e.season === step.season &&
                      e.playerId === p.id &&
                      e.reason !== "initial",
                  )
                  .reduce((n, e) => n + e.delta, 0),
              ]),
            ),
            ledger: view.ledger.filter((e) => e.season === step.season),
          });
          const { pirateBefore,voyageBefore, ...display } = frames.at(-1);
          priorBoard = display;
          previousMarket = view.commodities;
          seasonHistory.observe(view, step, auditDisplay, outcomes.port);
          log.push({
            ...step,
            ...(step.type === "StartSeason" ? {opening: {
              act: view.act, season: view.season, successes: view.weaponsSuccesses,
              extended: auditDisplay.extendedSecondAct,
            }} : {}),
            controller:
              step.actor === null
                ? "system"
                : humans.includes(step.actor)
                  ? "human"
                  : "ai",
          });
        };
      host=restored?SinglePlayerHost.restore(restored.save,audit):new SinglePlayerHost(config,audit,
        practice ? ()=>log.at(-1)?.type==="EndSeason" : undefined);
      const labels=restored?.names??m.names??{};
      playerNames=Object.fromEntries(seats.map(id=>[id,typeof labels[id]==="string"?labels[id].slice(0,12):id]));
      if(restored)frames=frames.filter(f=>f.version>from);
    } else {
      if (!host || m.session !== session) throw Error("對局已更新");
      if (m.type === "export") {
        if (host.screen().status !== "finished") {
          postMessage({
            session,
            request: m.request,
            screen: projectedScreen(),
            log,
            error: "只能在終局匯出",
          });
          return;
        }
        postMessage({
          session,
          request: m.request,
          archive: { ...host.exportFinished(), ledger:host.exportFinished().ledger.map(entry=>{const flow=log.flatMap(e=>e.presentation?.flows??[]).find(f=>f.id===entry.id);return flow?.incomeClass?{...entry,incomeClass:flow.incomeClass}:entry;}), publicTimeline: log, outboundIncome:log.flatMap(e=>(e.presentation?.flows??[]).filter(f=>['pirate-dividend','dividend'].includes(f.category)).map(f=>({season:e.season,...f}))) },
        });
        return;
      }
      const batch =
        m.type === "vote-batch" ? submitVoteBatch(host, m.batch) : null;
      if (batch)
        batchNotice =
          "已投出 " +
          batch.submitted +
          " 票" +
          (batch.reason ? "；" + batch.reason : "");
      const result = batch
        ? {
            ok: batch.submitted > 0 || !batch.reason,
            reason: "已投出 " + batch.submitted + " 票；" + batch.reason,
          }
        : host.submit(m.action);
      if (!result.ok) {
        postMessage({
          session,
          request: m.request,
          error: result.reason,
          screen: projectedScreen(),
          log,
          frames,
        });
        return;
      }
    }
    if(!practice && (!restored || m.type==="import")){try{await checkpoint(snapshot(from));}catch{batchNotice+=" 本機自動存檔失敗，請匯出存檔";}}
    const screen = host.screen();
    screen.observation.detentions={...detentions};
    screen.observation.outcomes = outcomes;
    const finalStocks =
      screen.status === "finished"
        ? host.exportFinished().stocks.filter((s) => s.ownerId)
        : undefined;
    postMessage({
      session,
      request: m.request,
      screen,
      log,
      storyId,
      frames,
      seasonHistory: seasonHistory.forViewer(screen.observation.selfId),
      finalStocks,resumeAt:restored?from:undefined,
      names:playerNames,
      batchNotice,
    });
  } catch (e) {
    host = null;
    postMessage({
      session,
      request: m.request,
      error: "對局中斷：" + e.message,
      log: [],
    });
  }
};

async function checksum(payload) {
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(payload)));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}

function projectedScreen() {
  const screen = host.screen();
  screen.observation.outcomes = outcomes;
  return screen;
}
