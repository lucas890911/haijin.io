import {RULES} from "../dist/packages/shared/src/index.js";
import {cargoIcons} from "./board.js";
import {returnCargo} from "./vote-panel.js";

const goods={rice:"稻米",sugar:"蔗糖",sulfur:"硫磺",deerskin:"鹿皮"};
const palette={A:"#af6346",B:"#387c87",C:"#79678e",D:"#937523"};
const tokenName=(owner,id)=>owner+"-"+id.split("-").at(-1);
function ownerOf(view,id){
  return view.players.find(player=>player.crew.some(crew=>crew.id===id))?.id;
}
function chip(view,id){
  const owner=ownerOf(view,id);
  return owner?'<span class="return-chip" style="--color:'+palette[owner]+'" data-token="'+id+'">'+tokenName(owner,id)+'</span>':"";
}
function shipCrew(view,shipId){
  const vote=view.returnVotes.find(vote=>vote.shipId===shipId);
  return vote?.electorate??view.positions.filter(pos=>pos.shipId===shipId && pos.crewId).sort((a,b)=>a.seat-b.seat);
}
function shipTitle(ship){
  return (cargoIcons[ship.good]??"⛵")+" "+(goods[ship.good]??"商船");
}
export function returnStage(view, {focusId,playback=false}={}){
  const votes=view.returnVotes;
  const port=view.outcomes?.port??votes.map(vote=>vote.shipId);
  const focused=view.ships.find(ship=>ship.id===(focusId??votes.find(vote=>!vote.result)?.shipId??port[0]));
  const focusedVote=votes.find(vote=>vote.shipId===focused?.id);
  const returnChoice=focusedVote?.result&&returnCargo[focusedVote.result];
  const camp=view.phase==="ANTI_SMUGGLING_PLACEMENT";
  const rank=id=>port.indexOf(id)+1;
  const summaries=view.ships.map(ship=>{
    const vote=votes.find(vote=>vote.shipId===ship.id);
    return '<article data-ship="'+ship.id+'" data-rank="'+rank(ship.id)+'"><b>'+shipTitle(ship)+'</b><small>'+
      (rank(ship.id)?"入港第 "+rank(ship.id)+" 名":"停泊")+
      (vote?.result?" · "+returnCargo[vote.result][1]:vote?" · 已投 "+vote.submittedCrewIds.length+"／"+vote.electorate.length:"")+'</small></article>';
  }).join("");
  return '<section class="return-stage" aria-label="回程主舞台"><h2>'+(camp?"緝私營轉職":"回程貿易")+'</h2><div class="return-ships">'+summaries+'</div>'+
    (camp?'<div class="return-focus"><h3>誤期商船</h3>'+view.ships.filter(ship=>ship.status==="failed").map(ship=>
      '<p>'+shipTitle(ship)+' '+shipCrew(view,ship.id).map(seat=>chip(view,seat.crewId)).join("")+'</p>').join("")+'</div>':
      focused?'<article class="return-focus" data-ship="'+focused.id+'"><h3>⛵ '+shipTitle(focused)+' · 入港第 '+rank(focused.id)+' 名</h3>'+(returnChoice?'<p class="return-choice">'+returnChoice.join(" ")+'</p>':"")+
        '<div class="return-crew">'+(shipCrew(view,focused.id).map(seat=>'<span>第 '+seat.seat+' 席 '+(view.players.some(player=>player.crew.some(crew=>crew.id===seat.crewId&&crew.status.kind==="detained"))?"🔒":chip(view,seat.crewId))+'</span>').join("")||"空船")+'</div></article>':"")+
    (view.act===2 && !camp?government(view,port):'')+'<div class="return-roll"></div>'+((!camp || playback) && view.campCrew.length?'<div class="return-camp" data-camp="status"><b>緝私營</b> '+view.campCrew.map(id=>chip(view,id)).join("")+'</div>':"")+prison(view)+'</section>';
}

export function campPanel(area,view,actions,submit){
  const choices=actions.filter(action=>action.type==="CampChoice");
  const eligible=choices.filter(action=>action.crewIds.length===1);
  const pass=choices.find(action=>!action.crewIds.length);
  area.innerHTML='<section class="camp-controls"><h3>緝私營 · '+view.campCrew.length+'／2</h3><div class="camp-slots"></div>'+
    (!eligible.length?'<p>目前沒有合法轉職選項。須有本季誤期船員、3 銀及空席。</p>':"")+'</section>';
  const slots=area.querySelector(".camp-slots");
  for(let i=0;i<2;i++){
    const id=view.campCrew[i];
    if(id){slots.insertAdjacentHTML("beforeend",chip(view,id));continue;}
    const button=document.createElement("button");
    button.textContent="⛺ 第 "+(i+1)+" 席 · −3 銀";
    button.disabled=i!==view.campCrew.length||!eligible.length;
    button.dataset.camp=i+1;
    button.onclick=()=>{
      const dialog=document.createElement("dialog");
      dialog.className="bet-dialog camp-dialog";
      dialog.innerHTML='<h2>緝私營｜第 '+(i+1)+' 席</h2><div class="bet-totals camp-fee"><div><small>轉職成本</small><strong>−3 銀</strong></div></div>'+
        '<dl class="camp-awards"><div><dt>布匹失敗</dt><dd>8 銀</dd></div><div><dt>瓷器失敗</dt><dd>12 銀</dd></div><div><dt>軍武一般失敗</dt><dd>16 銀</dd></div><div><dt>軍武大失敗</dt><dd>20 銀</dd></div></dl>'+
        '<p class="camp-deduction"><b>查獲自己船員，每枚 −4 銀</b>。各船獨立計算，最低 0。</p><p>全季無人走私退還本金。有人走私且全部成功，無獎金也不退費。</p><h3>選擇誤期棋子</h3>'+
        '<div class="camp-crew"></div><div class="bet-footer"><button data-camp-cancel>取消</button><button class="primary" data-camp-confirm disabled>確認轉職</button></div>';
      const confirm=dialog.querySelector("[data-camp-confirm]");
      let chosen;
      for(const action of eligible){
        const selector=document.createElement("button");
        selector.innerHTML=chip(view,action.crewIds[0]).replace(/ data-token="[^"]*"/g,"");
        selector.setAttribute("aria-pressed","false");
        selector.onclick=()=>{
          dialog.querySelectorAll(".camp-crew button").forEach(button=>button.setAttribute("aria-pressed",String(button===selector)));
          chosen=action;confirm.disabled=false;
        };
        dialog.querySelector(".camp-crew").append(selector);
      }
      confirm.onclick=()=>{if(chosen){dialog.close();submit(chosen);}};
      dialog.querySelector("[data-camp-cancel]").onclick=()=>dialog.close();
      dialog.onclose=()=>dialog.remove();
      area.append(dialog);
      dialog.showModal();
    };
    slots.append(button);
  }
  if(pass){
    const button=document.createElement("button");
    button.dataset.action="CampChoice";
    button.textContent="放棄緝私轉職";
    button.onclick=()=>submit(pass);
    area.append(button);
  }
}

function prison(view){
  const detained=view.players.flatMap(player=>player.crew.filter(crew=>crew.status.kind==="detained"));
  if(!detained.length)return "";
  return '<section class="return-prison prison"><h3>囚禁區</h3><div class="prison-tokens">'+detained.map(crew=>
    '<button class="captive" data-ransom-crew="'+crew.id+'">'+chip(view,crew.id)+'<small>'+(crew.status.severe?"軍武重押":"一般拘押")+'</small></button>'
  ).join("")+'</div></section>';
}

export function bindPrison(root,view,actions,submit,actionLabel){
  const finish=view.phase==="SEASON_END"&&actions.find(action=>action.type==="FinishRansom");
  const open=id=>{
    const player=view.players.find(player=>player.crew.some(crew=>crew.id===id));
    const crew=player.crew.find(crew=>crew.id===id);
    const source=view.detentions?.[id];
    const redeem=actions.find(action=>action.type==="RedeemCrew"&&action.crewId===id);
    const ownRansom=finish&&player.id===view.selfId&&!crew.status.severe&&crew.status.capturedSeason===view.season;
    const dialog=document.createElement("dialog");
    dialog.className="bet-dialog ransom-dialog";
    dialog.innerHTML='<h2>'+tokenName(player.id,id)+'｜拘押紀錄</h2><p>'+
      (source?.ship?source.ship.replace("ship-","船 ")+" · ":"")+
      (source?.good?goods[source.good]+" · ":"")+(returnCargo[source?.option]?.[1]??"")+'</p><p>'+
      (crew.status.severe?"軍武大失敗 · 不可提前贖回":"一般拘押 · 當季贖金 "+view.effects.ransom+" 銀")+
      '</p><p>第 '+crew.status.releaseAfterSeason+' 季回程結算完成後釋放。'+
      (crew.status.severe?"終局仍被拘押時，強制贖金 "+RULES.severeFinalRansom+" 銀。":"")+
      '</p>'+(player.id===view.selfId?'<p>本人現銀 '+player.cash+' 銀</p>':"")+
      (ownRansom&&!redeem?'<p class="ransom-reason">'+(player.cash<view.effects.ransom?"現銀不足，無法支付當季贖金。":"此棋子目前無法贖回。")+'</p>':"")+
      '<div class="bet-footer"><button data-close>關閉</button><button data-redeem class="primary" disabled>贖回船員</button></div>';
    const confirm=dialog.querySelector("[data-redeem]");
    confirm.disabled=!redeem;
    if(!redeem)confirm.title=crew.status.severe?"軍武重押不可提前贖回":"目前沒有此棋子的合法贖回行動";
    confirm.onclick=()=>{if(redeem){dialog.close();submit(redeem);}};
    if(ownRansom){
      const finance=actions.filter(action=>["PledgeStock","RedeemPledgedStock"].includes(action.type));
      if(actionLabel&&finance.length){
        const funds=document.createElement("details");
        funds.className="ransom-finance";
        funds.innerHTML="<summary>股票資金操作</summary>";
        funds.open=!redeem;
        for(const action of finance){
          const button=document.createElement("button");
          button.dataset.ransomFinance=action.type;
          button.textContent=actionLabel(action)+" · "+(action.type==="PledgeStock"? "+"+RULES.pledgeIncome : "−"+RULES.pledgeRedemption)+" 銀";
          button.onclick=()=>{dialog.close();submit(action);};
          funds.append(button);
        }
        dialog.querySelector(".bet-footer").before(funds);
      }else if(actionLabel&&!redeem){
        const note=document.createElement("p");
        note.textContent="目前沒有可用的股票資金操作，仍可結束贖回。";
        dialog.querySelector(".bet-footer").before(note);
      }
      const defer=document.createElement("button");
      defer.dataset.finishRansom="";
      defer.textContent="本季不再贖回";
      defer.onclick=()=>{dialog.close();submit(finish);};
      confirm.before(defer);
    }
    dialog.querySelector("[data-close]").onclick=()=>dialog.close();
    dialog.onclose=()=>dialog.remove();
    root.append(dialog);
    dialog.showModal();
  };
  for(const button of root.querySelectorAll("[data-ransom-crew]"))button.onclick=()=>open(button.dataset.ransomCrew);
  return open;
}

export function ransomPanel(area,view,actions,open){
  const finish=actions.find(action=>action.type==="FinishRansom");
  if(view.phase!=="SEASON_END"||!finish)return false;
  const player=view.players.find(player=>player.id===view.selfId);
  const next=actions.find(action=>action.type==="RedeemCrew")?.crewId??
    player.crew.find(crew=>crew.status.kind==="detained"&&!crew.status.severe&&crew.status.capturedSeason===view.season)?.id;
  if(!next)return false;
  area.innerHTML='<section class="ransom-stage"><h3>贖回船員</h3><p>本季贖金 '+view.effects.ransom+
    ' 銀／枚 · 你的現銀 '+player.cash+' 銀</p><button type="button" class="primary" data-open-ransom>處理本季贖回</button></section>';
  area.querySelector("[data-open-ransom]").onclick=()=>open(next);
  return true;
}

function government(view,port){
  const quotas=[["🏺","瓷器","整船 18 銀"],["🧵","布匹","整船 12 銀"],["⚓","無配額","0 銀"]];
  const cards=quotas.map(([icon,cargo,pool],index)=>{
    const shipId=port[index];
    const ship=view.ships.find(candidate=>candidate.id===shipId);
    if(!ship)return '<article class="quota-card quota-unused"><small>第 '+(index+1)+' 名 · 無入港船</small><strong>'+icon+" "+cargo+'</strong><b>未分配</b></article>';
    const crew=shipCrew(view,shipId);
    const rows=view.ledger.filter(entry=>entry.season===view.season&&entry.shipId===shipId&&["return","commission"].includes(entry.reason));
    return '<details class="quota-card" data-ship="'+shipId+'"><summary><small>第 '+(index+1)+' 名 · '+shipTitle(ship)+'</small>'+
      '<strong>'+icon+' '+cargo+'</strong><b>'+pool+'</b><span>'+(crew.length?crew.length+' 枚船員 · 查看分紅':'空船 · 占配額')+'</span></summary>'+
      (crew.length?crew.map(seat=>{
        const dividends=rows.filter(row=>row.crewId===seat.crewId);
        return '<p>第 '+seat.seat+' 席 '+chip(view,seat.crewId).replace(/ data-token="[^"]*"/g,"")+' '+(dividends.map(row=>
          (row.reason==="commission"?"皇商牌照 ":"分紅 ")+row.delta+" 銀").join(" · ")||"無分紅")+'</p>';
      }).join(""):'<p>空船仍占此順位。無船員分紅，未發皇商牌照。</p>')+
      (index===0 && crew.length && !rows.some(row=>row.reason==="commission")?'<p>第 1 席無實際船員，未發皇商牌照。</p>':"")+'</details>';
  }).join("");
  return '<section class="government-return"><h3>第二幕 · 官府包銷</h3><div class="quota-grid">'+cards+'</div></section>';
}
