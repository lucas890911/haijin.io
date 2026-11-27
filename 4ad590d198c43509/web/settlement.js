import {silverAmount} from "./silver.js";
import {mountHistory} from './history-charts.js';
import {seasonCenter} from './season-center.js';
const names={dividend:"船員去程分紅","pirate-dividend":"海盜去程分紅",return:"回程分紅",port:"港口獎金",dock:"停泊獎金",insurance:"保險收入",reimbursement:"保險理賠","camp-prize":"緝私營賞金","camp-refund":"緝私退費","flag-pension":"軍功撫恤",commission:"皇商牌照","flag-award":"令旗賞銀","final-ransom":"強制贖金",ransom:"贖金",placement:"配置費",stock:"認購",auction:"船長標金",pledge:"抵押借款",redeem:"股票贖回",camp:"緝私轉職"};
export const flowName=f=>names[f.category]??f.category;
export function stagesFor(e,skip){
  if(skip)return [];
  const dice=e.presentation?.dice??[];
  if(e.type==='ResolveReturns' && dice.length){
    const byShip=dice.flatMap((d,index)=>[{kind:'roll',dice:[d],index},{kind:'reveal',dice:[d],index},{kind:'resolve',dice:[d],index},...(e.presentation.flows.filter(f=>f.shipId===d.shipId && f.delta && names[f.category]).map(flow=>({kind:'money',flow,index}))) ]);
    return [...byShip,...e.presentation.flows.filter(f=>!f.shipId && f.delta && names[f.category]).map(flow=>({kind:'money',flow}))];
  }
  const groups=e.type==='Sail'?[dice]:dice.map(d=>[d]);
  const phases=groups.filter(g=>g.length).flatMap(dice=>[{kind:'roll',dice},{kind:'reveal',dice}]);
  if(e.type==='Sail' && dice.length)phases.push({kind:'move',dice});
  for(const flow of e.presentation?.flows??[])if(flow.delta && names[flow.category])phases.push({kind:'money',flow});
  return phases;
}
const shipIcons={rice:"🌾",sugar:"🎋",sulfur:"🪨",deerskin:"🦌"};
const shipNames={rice:"稻米",sugar:"蔗糖",sulfur:"硫磺",deerskin:"鹿皮"};
function dieFace(value){
  const face=document.createElement("span");
  face.className="dice-face";
  if(value!=null)face.dataset.value=value;
  for(let i=0;i<9;i++)face.append(document.createElement("i"));
  return face;
}
export function sailFocus(frame,captain,before=frame,stage=null){
  const section=document.createElement("section");
  section.className="sail-focus"+(stage?" dice-overlay":"");
  section.dataset.sailStage=stage?.kind??"ready";
  const heading=document.createElement("h2");
  const phase=before.phase.match(/^SAIL_([123])$/);
  heading.textContent=(phase?"第 "+phase[1]+" 輪航行":"航行")+" · 擲骰者 "+captain;
  section.append(heading);
  const row=document.createElement("div");
  row.className="dice-row";
  for(const vessel of before.ships){
    const official=stage?.dice?.find(entry=>entry.shipId===vessel.id);
    const result=frame.ships.find(ship=>ship.id===vessel.id);
    const badge=document.createElement("div");
    badge.className="solid-dice"+(stage?.kind==="roll"&&official?" roll":"");
    badge.dataset.ship=vessel.id;
    const cargo=document.createElement("b");
    cargo.textContent="⛵ "+(shipIcons[vessel.good]??"")+" "+(shipNames[vessel.good]??"");
    badge.append(cargo);
    const rolling=stage?.kind==="roll";
    if(official?.values.length&&!rolling){
      for(const value of official.values)badge.append(dieFace(value));
    }else if(vessel.status==="sailing"){
      const face=dieFace(null);
      face.classList.add("pending-die");
      face.textContent=rolling?"…":"?";
      badge.append(face);
    }
    const description=document.createElement("small");
    const endpoint={arrived:"入港",failed:"停泊","awaiting-pirates":"第 13 格 · 海盜待判定"}[result.status]??result.position+" 格";
    description.textContent=official&&!rolling
      ? vessel.position+" 格 → "+official.values.join("＋")+" 點 → "+endpoint
      : vessel.status==="sailing" ? vessel.position+" 格" : endpoint;
    badge.append(description);
    row.append(badge);
  }
  section.append(row);
  return section;
}
export function animateSail(frame,stage){
  const before=frame.voyageBefore;
  if(!before || !stage.dice)return;
  for(const die of stage.dice){
    const old=before.ships.find(ship=>ship.id===die.shipId);
    const ship=frame.ships.find(ship=>ship.id===die.shipId);
    const token=document.querySelector('[data-token="'+die.shipId+'"]');
    if(!token||old?.position==null||ship?.position==null)continue;
    const target=token.getBoundingClientRect();
    const middle=rect=>[rect.left+rect.width/2,rect.top+rect.height/2];
    const [x,y]=middle(target);
    const start=Math.min(old.position,13),end=Math.min(ship.position,13);
    const direction=Math.sign(end-start);
    const steps=Array.from({length:Math.abs(end-start)+1},(_,i)=>start+i*direction);
    const points=steps.map(step=>document.querySelector('[data-lane="'+ship.id+'"] [data-step="'+step+'"]'))
      .filter(Boolean).map(cell=>middle(cell.getBoundingClientRect()));
    points.push([x,y]);
    if(points.length>1)token.animate(points.map(([left,top])=>({transform:"translate("+(left-x)+"px,"+(top-y)+"px)"})),
      {duration:stage.duration*.64,easing:"linear"});
  }
}
let cancelFlight;
export function clearCashFlight(){ cancelFlight?.(); }
function cashNodes(id){return document.querySelectorAll('.players [data-cash="'+id+'"]');}
function setRailCash(id,balance){
  for(const el of cashNodes(id))el.innerHTML=silverAmount(balance);
}
function visiblePoint(el){
  if(!el || getComputedStyle(el).visibility!=='visible')return null;
  const r=el.getBoundingClientRect();
  const x=r.x+r.width/2,y=r.y+r.height/2;
  if(!r.width||!r.height||!el.contains(document.elementFromPoint(x,y)))return null;
  return {x,y};
}
export function showStage(stage,frame,flows){
  if(!stage || stage.kind==="government")return;
  const bar=document.querySelector('.stream-summary');
  if(stage.sailing){
    const board=document.querySelector('.voyage-board');
    if(board){
      const focus=sailFocus(frame,stage.captain,frame.voyageBefore??frame,stage);
      focus.dataset.eventVersion=frame.version;
      board.prepend(focus);
      const line=bar.querySelector("p");
      if(line)line.textContent=stage.kind==="roll"?stage.captain+" 正在擲骰…":stage.dice.map(die=>{
        const vessel=frame.ships.find(ship=>ship.id===die.shipId);
        return (shipNames[vessel?.good]??die.shipId)+" "+die.values.join("＋")+" 點";
      }).join(" · ");
    }
    if(stage.kind==='move')animateSail(frame,stage);
    return;
  }
  if(stage.returning && stage.dice?.length){
    const target=document.querySelector(".return-roll");
    const die=stage.dice[0];
    if(target){
      target.dataset.returnStage=stage.kind;
      target.dataset.returnShip=die.shipId;
      const rolling=stage.kind==="roll";
      const ship=frame.ships.find(ship=>ship.id===die.shipId);
      const badge=document.createElement("div");
      badge.className="solid-dice"+(rolling?" roll":"");
      badge.dataset.ship=ship.id;
      const face=dieFace(rolling?null:die.values[0]);
      if(rolling){face.classList.add("pending-die");face.textContent="…";}
      badge.append(face);
      target.append(badge);
      const caption=document.createElement("strong");
      caption.className="return-result";
      caption.textContent=rolling?"回程走私擲骰中…":die.values[0]+" 點 · "+die.result;
      target.append(caption);
      bar.querySelector("p").textContent=caption.textContent;
      if(stage.kind==="resolve"){
        const returnFlows=flows.filter(flow=>flow.shipId===die.shipId&&flow.category==="return");
        const camp=flows.filter(flow=>flow.shipId===die.shipId&&flow.category==="camp-prize");
        const detail=document.createElement("div");
        if(returnFlows.length){
          const total=returnFlows.reduce((sum,flow)=>sum+flow.delta,0);
          const sum=document.createElement("strong");
          sum.className="return-total";
          sum.textContent="整船 "+total+" 銀";
          detail.append(sum);
          const payouts=document.createElement("div");
          payouts.className="return-payouts";
          const playerColors=["#af6346","#387c87","#79678e","#937523"];
          for(const flow of returnFlows){
            const unit=document.createElement("span");
            unit.className="return-pay";
            unit.style.setProperty("--color",playerColors[frame.players.findIndex(player=>player.id===flow.playerId)]);
            unit.textContent=flow.playerId+"-"+flow.crewId.split("-").at(-1)+" +"+flow.delta+" 銀";
            payouts.append(unit);
          }
          detail.append(payouts);
          if(frame.act===1&&die.result.startsWith("軍武")){
            const flag=document.createElement("strong");
            flag.className="return-flag";
            flag.textContent="水師令旗";
            const owners=document.createElement("div");
            owners.className="return-flag-gains";
            const announcement=[];
            for(const [index,player] of frame.players.entries()){
              const awards=returnFlows.filter(flow=>flow.playerId===player.id);
              if(!awards.length)continue;
              const owner=document.createElement("span");
              owner.className="return-flag-owner";
              owner.dataset.player=player.id;
              owner.style.setProperty("--color",playerColors[index]);
              owner.textContent="玩家 "+player.id+" · "+awards.length+" 枚";
              for(const {crewId} of awards){
                const token=document.createElement("i");
                token.dataset.crew=crewId;
                token.title=player.id+"-"+crewId.split("-").at(-1);
                token.textContent="⚑";
                owner.append(token);
              }
              owners.append(owner);
              announcement.push("玩家 "+player.id+" 獲得 "+awards.length+" 枚水師令旗");
            }
            detail.append(flag,owners);
            bar.querySelector("p").append(" · "+announcement.join("、"));
          }
        }else{
          target.classList.add("return-loss");
          detail.textContent="全船船員拘押。"+(die.result.includes("重押")?"軍武大失敗，禁止提前贖回。":"可於合法階段依當季贖金贖回。");
        }
        if(camp.length){
          const vote=frame.returnVotes.find(vote=>vote.shipId===die.shipId);
          const payouts=document.createElement("p");
          payouts.textContent="緝私營 · "+camp.map(flow=>flow.playerId+" 領 "+flow.delta+" 銀（本人船員 "+vote.electorate.filter(seat=>seat.ownerId===flow.playerId).length+" 枚，每枚扣 4 銀）").join("、");
          detail.append(payouts);
        }
        target.append(detail);
      }
    }
    return;
  }
  bar.querySelector('p')?.remove();
  if(stage.dice && stage.kind!=='move'){
    const row=document.createElement('div');row.className='dice-row';
    for(const d of stage.dice){
      const badge=document.createElement('span');badge.className='die '+stage.kind;badge.dataset.ship=d.shipId;
      if(frame.phase.startsWith('SAIL') || frame.voyageBefore?.phase?.startsWith('SAIL')){
        badge.className='solid-dice '+stage.kind;
        for(const value of d.values){const face=document.createElement('span');face.className='dice-face';face.dataset.value=stage.kind==='roll'?'5':value;for(let n=1;n<=9;n++){const dot=document.createElement('i');dot.dataset.dot=n;face.append(dot);}badge.append(face);}
        const label=document.createElement('small');label.textContent='船 '+d.shipId.split('-')[1]+(stage.kind==='roll'?'':' · '+d.values.join(' + ')+' 點 · '+d.result);badge.append(label);
      }else badge.textContent='船 '+d.shipId.split('-')[1]+'　'+(stage.kind==='roll'?'擲骰中':d.values.join(' + ')+' 點 · '+d.result);row.append(badge);
    }
    if(stage.dice.length && (frame.phase.startsWith('SAIL') || frame.voyageBefore?.phase?.startsWith('SAIL'))){const layer=document.createElement('div');layer.className='dice-overlay';const title=document.createElement('h3');title.textContent=stage.kind==='roll'?'擲骰中…':'正式骰點';layer.append(title,row);document.querySelector('.chart').prepend(layer);}else bar.prepend(row);
  }
  if(stage.kind!=='money')return;
  const f=stage.flow;
  const caption=document.createElement('p');caption.textContent=(f.shipId?f.shipId.replace('ship-','船 ')+' · ':'')+flowName(f)+' · '+f.playerId+' '+(f.delta>0?'+':'')+f.delta+' 銀';bar.prepend(caption);
  const playerPoint=[...cashNodes(f.playerId)].map(visiblePoint).find(Boolean);
  if(!playerPoint){setRailCash(f.playerId,f.balance);return;}
  const seat=f.positionId && document.querySelector('[data-pos="'+f.positionId+'"]');
  const crew=f.crewId && document.querySelector('[data-camp] [data-token="'+f.crewId+'"]');
  const vessel=f.shipId && document.querySelector('[data-token="'+f.shipId+'"]');
  const source=seat || (f.category.startsWith('camp') && crew) ||
    (f.category.includes('ransom') && document.querySelector('.prison')) || vessel;
  const seatPoint=visiblePoint(source) || visiblePoint(source?.querySelector?.('.circle')) ||
    visiblePoint(seat?.closest('.crew-dock'));
  if(seatPoint)source.classList.add('receipt-hit');
  const place=seatPoint??playerPoint;
  const [from,to]=f.delta<0?[playerPoint,place]:[place,playerPoint];
  const chip=document.createElement('span');chip.className='cash-flight';
  chip.textContent=(f.delta>0?'+':'−')+Math.abs(f.delta);chip.classList.toggle('loss',f.delta<0);chip.style.borderColor=['#af6346','#387c87','#79678e','#937523'][frame.players.findIndex(p=>p.id===f.playerId)];chip.title=flowName(f);
  chip.setAttribute('aria-label',chip.textContent+' 銀');
  chip.style.left=(from.x-19)+'px';chip.style.top=(from.y-19)+'px';document.body.append(chip);
  const motion=chip.animate([{transform:'none'},{transform:'translate('+(to.x-from.x)+'px,'+(to.y-from.y)+'px)'}],{duration:stage.duration*.78,fill:'forwards',easing:'cubic-bezier(.3,.05,.25,1)'});
  function finish(){
    motion.cancel();chip.remove();setRailCash(f.playerId,f.balance);
    window.removeEventListener('resize',finish);window.removeEventListener('scroll',finish,true);
    cancelFlight=undefined;
  }
  cancelFlight=finish;motion.onfinish=finish;
  window.addEventListener('resize',finish);window.addEventListener('scroll',finish,true);
}
export function summaryDialog(e,logs,ended,onClose,projection){
  const d=document.createElement('dialog');d.className='season-summary';
  const title=document.createElement('h2');title.textContent='第 '+e.season+' 季 · '+(ended?'終局結算':'季末結算');d.append(title);
  const list=document.createElement('div');list.className='summary-body';
  const events=logs.filter(x=>x.season===e.season && x.version<=e.version);
  for(const x of events.filter(x=>['PirateBoardOrDecline','PirateTakeoverDecision','SettleOutbound','ResolveReturns','RedeemCrew','EndSeason'].includes(x.type))){
    const block=document.createElement('details');block.open=false;
    const heading=document.createElement('summary');heading.textContent=({SettleOutbound:'去程、股票及包銷',ResolveReturns:'回程、緝私與令旗',EndSeason:'季末及終局',PirateBoardOrDecline:'海盜登船',PirateTakeoverDecision:'共同劫船',RedeemCrew:'贖回船員'}[x.type]??x.type);block.append(heading);
    for(const line of x.lines.slice(1)){const p=document.createElement('p');p.textContent=line;block.append(p);}list.append(block);
  }
  const snapshot=projection?.history?.public.seasons.find(season=>season.version===e.version);
  const mine=projection?.history?.personal;
  const personal=mine?.viewerId===projection?.viewerId?mine?.seasons.find(season=>season.version===e.version):null;
  let disposeTrends;
  if(snapshot){
    const content=document.createElement('div');content.className='season-center';
    content.innerHTML=seasonCenter(snapshot,personal,{...projection,flowName:row=>flowName(row)});
    const history=document.createElement('details');
    history.innerHTML='<summary>公開航海紀錄</summary>';history.append(list);
    const tabs=document.createElement("div");
    tabs.className="closeout-tabs";
    tabs.setAttribute("aria-label","季末結算內容");
    const overview=document.createElement("section");
    overview.className="closeout-overview";
    const details=document.createElement("section");
    const trends=document.createElement("section");
    const mainMetrics=content.querySelector(".season-metrics");
    if(mainMetrics){
      const title=document.createElement("h3");
      title.textContent=content.querySelector(".season-personal h3").textContent;
      overview.append(title,mainMetrics);
    }
    for(const selector of [".season-outcome",".season-public",".season-market",".season-events"]){
      const section=content.querySelector(selector);
      if(section)overview.append(section);
    }
    for(const reason of overview.querySelectorAll(".season-market article > details")){
      const name=reason.parentElement.querySelector("h4").textContent;
      reason.querySelector("summary").textContent=name+" · 行情變動原因";
      details.append(reason);
    }
    const personalDetail=content.querySelector(".season-personal");
    if(personalDetail)details.prepend(personalDetail);
    const publicDetail=content.ownerDocument.createElement("details");
    publicDetail.innerHTML="<summary>四席公開現銀與令旗</summary>";
    const publicPlayers=overview.querySelector(".season-public").cloneNode(true);
    publicDetail.append(publicPlayers);
    publicPlayers.querySelectorAll(".season-player").forEach(card=>{card.removeAttribute("data-seat");card.classList.remove("season-player");});
    details.append(publicDetail);
    details.append(history);
    const views=[["結算摘要",overview],["財務明細",details],...(projection.showHistory!==false?[["歷史趨勢",trends]]:[])];
    for(const [index,[label,section]] of views.entries()){
      const tab=document.createElement("button");
      tab.type="button";
      tab.textContent=label;
      tab.setAttribute("aria-pressed",String(index===0));
      tab.onclick=()=>{
        for(const [i,[,panel]] of views.entries()){
          panel.hidden=i!==index;
          tabs.children[i].setAttribute("aria-pressed",String(i===index));
        }
        if(section===trends&&!disposeTrends)disposeTrends=mountHistory(trends,projection,e.version,projection.review);
        content.scrollTop=0;
      };
      tabs.append(tab);
      section.hidden=index!==0;
    }
    content.replaceChildren(...views.map(([,section])=>section));
    d.classList.add('season-center-dialog');d.append(tabs,content);
  }else{
  const net=Object.fromEntries(['A','B','C','D'].map(id=>[id,0]));
  for(const x of events)for(const f of x.presentation?.flows??[])net[f.playerId]+=f.delta;
  const total=document.createElement('p');total.textContent='本季現銀淨變動　'+Object.entries(net).map(([p,v])=>p+' '+(v>=0?'+':'')+v+' 銀').join('　');d.append(total,list);
  }
  const button=document.createElement('button');button.id=onClose?'season-confirm':'season-review-close';button.className='primary';button.textContent=onClose?(ended?'查看終局排名':'確認並進入下一季'):'關閉季末回顧';button.onclick=()=>{d.close();d.remove();onClose?.();};d.append(button);
  if(onClose)d.oncancel=ev=>ev.preventDefault();
  d.onclose=()=>{disposeTrends?.();d.remove();};d.setAttribute('aria-labelledby','season-summary-title');title.id='season-summary-title';
  document.body.append(d);d.showModal();button.focus({preventScroll:true});
}

export function returnFrame(frame,event,stage){
  if(!frame?.voyageBefore || event.type!=='ResolveReturns' || stage?.index==null)return null;
  const previous=frame.voyageBefore;
  const done=new Set(event.presentation.dice.slice(0,stage.index+(stage.kind==='resolve'||stage.kind==='money'?1:0)).map(d=>d.shipId));
  const pending=new Set(previous.returnVotes.filter(v=>!done.has(v.shipId)).flatMap(v=>v.electorate.map(x=>x.crewId)));
  const successfulWeapons=new Set(previous.returnVotes.filter(vote=>vote.result==="weapons"&&done.has(vote.shipId)).map(vote=>vote.shipId));
  const awards=event.presentation.flows.filter(flow=>flow.category==="return"&&successfulWeapons.has(flow.shipId));
  return {...frame,positions:frame.positions.map(pos=>{const old=previous.positions.find(x=>x.id===pos.id);return pending.has(old?.crewId)?old:pos;}),
    players:frame.players.map((p,i)=>({...p,flags:frame.ruleVersion==="1.5"&&frame.act===1?(previous.players[i].flags??0)+awards.filter(flow=>flow.playerId===p.id).length:p.flags,crew:p.crew.map((c,j)=>pending.has(c.id)?previous.players[i].crew[j]:c)}))};
}
