import { RULES } from "../dist/packages/shared/src/index.js";
export const returnCargo={safe:["⚓","安全返航"],cloth:["🧵","布匹"],porcelain:["🏺","瓷器"],weapons:["⚔","軍武"]};

export function votePanel(area, view, actions, submit) {
  const first=actions.find(action=>action.type==="VoteReturnOption");
  if(!first)return false;
  const ballot=view.returnVotes.find(vote=>vote.shipId===first.shipId);
  const available=actions.filter(action=>action.type==="VoteReturnOption"&&action.shipId===first.shipId);
  const crews=ballot.electorate.filter(crew=>available.some(action=>action.crewId===crew.crewId));
  const choices=["safe","cloth","porcelain","weapons"];
  area.innerHTML='<section class="vote-panel"><h3>第 '+ballot.round+' 輪投票 · 已投 '+ballot.submittedCrewIds.length+'／'+ballot.electorate.length+
    '</h3>'+(ballot.round===2?'<p>回程投票平手，進入第二輪重新投票。</p>':'')+
    '<div class="vote-crew"></div><div class="return-options"></div><p id="vote-preview" aria-live="polite"></p>'+
    '<button id="vote-confirm" class="primary"></button></section>';
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
    for(const crew of crews){
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
      const targets=together?crews.map(crew=>crew.crewId):[active];
      button.disabled=!targets.every(crewId=>available.some(action=>action.crewId===crewId&&action.option===key));
      button.setAttribute("aria-pressed",String(targets.every(id=>picked.get(id)===key)));
      const explanation=view.returnCargoTaken?.includes(key)?"已被其他商船選用":key==="safe"?"免擲骰 · 0 銀 · 無拘押":
        view.act===2?"整船 "+(terms[3]+view.effects.stableReturnAdjustment)+" 銀":
        terms[0]+"～6 點成功 · 整船 "+terms[view.act===1?1:2]+" 銀 · 失敗全船拘押"+(key==="weapons"?"，1 點不可提前贖回":"");
      button.innerHTML="<b>"+icon+" "+name+"</b><small>"+explanation+"</small>";
      button.onclick=()=>{for(const id of targets)picked.set(id,key);refresh();};
      options.append(button);
    }
    area.querySelector("#vote-preview").textContent=crews.map(({crewId})=>view.selfId+"-"+crewId.split("-").at(-1)+" → "+(returnCargo[picked.get(crewId)]?.[1]??"未選")).join("　");
    confirm.disabled=crews.some(crew=>!picked.has(crew.crewId));
    confirm.textContent="確認投出 "+crews.length+" 票";
  }
  confirm.onclick=()=>{
    if(confirm.disabled)return;
    submit({actorId:view.selfId,expectedVersion:view.version,season:view.season,shipId:first.shipId,
      round:ballot.round,votes:crews.map(({crewId})=>({crewId,option:picked.get(crewId)}))});
  };
  refresh();
  return true;
}
