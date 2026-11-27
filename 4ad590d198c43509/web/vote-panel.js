import {silverAmount} from "./silver.js";
import { RULES, splitDividend } from "../dist/packages/shared/src/index.js";
export const returnCargo={safe:["⚓","安全返航"],cloth:["🧵","布匹"],porcelain:["🏺","瓷器"],weapons:["⚔","軍武"]};

const pips={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function dieFace(face){
  return '<svg class="vote-die" viewBox="0 0 24 24" aria-hidden="true" data-face="'+face+'"><rect x="1" y="1" width="22" height="22" rx="4"/>'+
    pips[face].map(index=>'<circle cx="'+(6+6*(index%3))+'" cy="'+(6+6*Math.floor(index/3))+'" r="1.7"/>').join("")+'</svg>';
}

export function votePanel(area, view, actions, submit) {
  const first=actions.find(action=>action.type==="VoteReturnOption");
  if(!first)return false;
  const ballot=view.returnVotes.find(vote=>vote.shipId===first.shipId);
  const available=actions.filter(action=>action.type==="VoteReturnOption"&&action.shipId===first.shipId);
  const crews=ballot.electorate.filter(crew=>available.some(action=>action.crewId===crew.crewId));
  const choices=["safe","cloth","porcelain","weapons"];
  area.innerHTML='<section class="vote-panel"><h3>第 '+ballot.round+' 輪投票 · 已投 '+ballot.submittedCrewIds.length+'／'+ballot.electorate.length+
    '</h3>'+(ballot.round===2?'<p>回程投票平手，進入第二輪重新投票。</p>':'')+
    '<div class="vote-crew"></div><div class="return-options"></div><p class="vote-ransom">一般拘押可按每枚 '+silverAmount(view.effects.ransom)+' 提前贖回。</p><div class="vote-submit"><p id="vote-preview" aria-live="polite"></p>'+
    '<button id="vote-confirm" class="primary"></button></div></section>';
  const picked=new Map();
  let active=crews[0].crewId;
  let together=true;
  const crewControls=area.querySelector(".vote-crew");
  const options=area.querySelector(".return-options");
  const confirm=area.querySelector("#vote-confirm");

  function refresh(){
    crewControls.replaceChildren();
    const group=document.createElement("button");
    group.textContent="同票 · "+crews.length+" 枚";
    group.setAttribute("aria-pressed",String(together));
    group.onclick=()=>{together=true;refresh();};
    if(crews.length>1)crewControls.append(group);
    for(const crew of crews.length>1?crews:[]){
      const button=document.createElement("button");
      button.textContent=view.selfId+"-"+crew.crewId.split("-").at(-1);
      button.setAttribute("aria-pressed",String(!together&&active===crew.crewId));
      button.onclick=()=>{together=false;active=crew.crewId;refresh();};
      crewControls.append(button);
    }
    options.replaceChildren();
    for(const key of choices){
      const [icon,name]=returnCargo[key];
      const terms=RULES.returnTerms[key];
      const button=document.createElement("button");
      button.dataset.voteOption=key;
      button.className="return-option";
      const targets=together?crews.map(crew=>crew.crewId):[active];
      button.disabled=!targets.every(crewId=>available.some(action=>action.crewId===crewId&&action.option===key));
      button.setAttribute("aria-pressed",String(targets.every(id=>picked.get(id)===key)));
      const threshold=terms?.[0];
      const dice=threshold!=null && view.act!==2;
      const faces=dice?Array.from({length:7-threshold},(_,index)=>threshold+index):[];
      const pool=terms?(view.act===2?terms[3]+view.effects.stableReturnAdjustment:terms[view.act===1?1:2]):0;
      const shares=splitDividend(pool,ballot.electorate.length);
      const personal=ballot.electorate.reduce((sum,seat,index)=>sum+(seat.ownerId===view.selfId?shares[index]:0),0);
      const odds=dice?(100*faces.length/6).toFixed(1)+"%":"免擲骰";
      const diceRow=dice?'<span class="vote-dice" role="img" aria-label="'+faces.join('、')+' 點成功">'+faces.map(dieFace).join("")+'</span>':"";
      const ordinary=key==="weapons"?"2～"+(threshold-1)+" 點":"1"+(threshold>2?"～"+(threshold-1):"")+" 點";
      const risk=dice?ordinary+"：全船拘押。"+
        (key==="weapons"?"1 點重押，不可提前贖回。":""):"無拘押";
      button.innerHTML='<b class="vote-cargo">'+icon+" "+name+' <span class="vote-check" aria-hidden="true">✓</span></b>'+
        '<span class="vote-personal"><small>成功時個人分紅</small><strong>'+silverAmount(personal)+'</strong></span>'+
        '<span class="vote-odds"><b>'+odds+'</b>'+diceRow+'</span>'+
        '<small>整船 '+silverAmount(pool)+'</small><small>'+risk+'</small>'+
        (button.disabled?"<small>"+(view.returnCargoTaken?.includes(key)?"已被其他商船選用":"目前不可選")+"</small>":"");
      button.onclick=()=>{
        for(const id of targets)picked.set(id,key);
        refresh();
        options.querySelector('[data-vote-option="'+key+'"]').focus({preventScroll:true});
        if(!confirm.disabled){
          confirm.scrollIntoView({block:"nearest",behavior:"instant"});
        }
      };
      options.append(button);
    }
    area.querySelector("#vote-preview").textContent=crews.length===1||!picked.size?"":crews.map(({crewId})=>view.selfId+"-"+crewId.split("-").at(-1)+" → "+(returnCargo[picked.get(crewId)]?.[1]??"未選")).join("　");
    confirm.disabled=crews.some(crew=>!picked.has(crew.crewId));
    const chosen=[...new Set(picked.values())];
    confirm.textContent=(crews.length===1?"確認投票":"確認投出 "+crews.length+" 票")+(chosen.length===1&&!confirm.disabled?" · "+returnCargo[chosen[0]][1]:"");
  }
  confirm.onclick=()=>{
    if(confirm.disabled)return;
    submit({actorId:view.selfId,expectedVersion:view.version,season:view.season,shipId:first.shipId,
      round:ballot.round,votes:crews.map(({crewId})=>({crewId,option:picked.get(crewId)}))});
  };
  refresh();
  return true;
}
