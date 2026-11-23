import {pirateStockPreview} from "../dist/packages/rules-engine/src/index.js";
import {cargoIcons} from "./board.js";

const cargoNames={rice:"稻米",sugar:"蔗糖",sulfur:"硫磺",deerskin:"鹿皮"};

export function pirateDecision(view,actions,submit,playerName,colors){
  const shell=document.createElement("section");
  shell.className="pirate-panel";
  const boarding=view.phase==="PIRATE_BOARDING";
  const title=boarding?"海盜登船":"海盜劫船";
  const dialog=document.createElement("dialog");
  dialog.className="pirate-dialog bet-dialog";
  dialog.setAttribute("aria-label",title);
  const open=button(title+" · 開啟決策",()=>dialog.showModal());
  shell.append(open,dialog);
  const shipIds=[...new Set(actions.map(a=>a.shipId))];
  const queue=view.pendingSpecial;
  let target,selected,selectedSeat;

  function node(tag,text,className){
    const el=document.createElement(tag);
    if(text)el.textContent=text;
    if(className)el.className=className;
    return el;
  }
  function button(text,activate){
    const el=node("button",text);
    el.type="button";
    el.onclick=activate;
    return el;
  }
  function owner(seat){
    return view.players.find(player=>player.crew.some(crew=>crew.id===seat?.crewId));
  }
  function seats(shipId){
    return view.positions.filter(seat=>seat.shipId===shipId).sort((a,b)=>a.seat-b.seat);
  }
  function crewCircles(ship,options=[]){
    const row=node("div",null,"pirate-circles");
    for(const seat of seats(ship.id)){
      const player=owner(seat);
      const action=options.find(candidate=>candidate.seatId===seat.id);
      const description="第 "+seat.seat+" 席，"+(player?playerName(player.id):"空席");
      const protectedSeat=ship.boardedPirates?.includes(seat.crewId)&&!action;
      const circle=action
        ? button(player?.id??String(seat.seat),()=>{selected=action;selectedSeat=seat;render();})
        : node("span",player?.id??String(seat.seat));
      circle.classList.add("pirate-circle");
      if(player)circle.style.setProperty("--occupant",colors[view.players.indexOf(player)]);
      circle.title=description+(protectedSeat?" · 已登船海盜，本席不可替換":"");
      circle.setAttribute("aria-label",circle.title);
      if(protectedSeat)circle.classList.add("protected");
      row.append(circle);
    }
    return row;
  }
  function choose(action,seat){
    selected=action;
    selectedSeat=seat;
    render();
  }
  function stockText(action){
    const quote=view.ruleVersion==="1.5"&&pirateStockPreview(view,action.shipId,action.enterPort);
    if(!quote)return "";
    const signed=value=>value>0?"+"+value:String(value);
    const first=quote.possibilities[0];
    const last=quote.possibilities.at(-1);
    return "股價 "+quote.previous+" → "+first.price+(first.price===last.price?"":"～"+last.price)+" 銀。"+
      "航行 "+signed(first.voyage)+"，海盜 −5"+(quote.alreadyApplied?"（已標記海盜影響，僅扣一次）":"")+
      (last.bonus?"，荷蘭商館 "+(first.bonus?"+5":"首艘入港時 +5"):"")+"。合併後裁切至 0～40。";
  }
  function render(){
    dialog.replaceChildren(node("h2",title),
      node("p",playerName(view.selfId)+" · 第 "+((queue?.pirateIndex??0)+1)+" 位行動 · 第 13 格 "+shipIds.length+" 艘候選船"));
    const choices=node("div",null,"pirate-targets");
    for(const id of shipIds){
      const ship=view.ships.find(candidate=>candidate.id===id);
      const card=node("article");
      card.dataset.ship=id;
      const cargo=cargoNames[ship.good];
      const pick=button("⛵ "+cargoIcons[ship.good]+" "+cargo,()=>{
        target=id;selected=null;selectedSeat=null;render();
      });
      pick.dataset.pirateTarget=id;
      pick.setAttribute("aria-pressed",String(target===id));
      card.append(pick,crewCircles(ship));
      choices.append(card);
    }
    dialog.append(choices);
    if(target){
      const ship=view.ships.find(candidate=>candidate.id===target);
      const options=actions.filter(item=>item.shipId===target);
      const cargo=cargoNames[ship.good];
      if(boarding){
        dialog.append(node("h3","選擇"+cargo+"船席位"),crewCircles(ship,options));
        if(ship.boardedPirates?.some(id=>seats(ship.id).some(seat=>seat.crewId===id&&!options.some(action=>action.seatId===seat.id))))
          dialog.append(node("p","有盾標記的登船海盜席受保護，不能替換。"));
      }
      if(!boarding && options.some(item=>item.enterPort!==null)){
        dialog.append(node("p","原船員全部退回，海盜占第 1 席。第二幕適用水師令旗軍功撫恤。"));
        const decisions=node("div",null,"pirate-destinations");
        for(const action of options.filter(item=>item.enterPort!==null)){
          const card=button("",()=>choose(action));
          card.dataset.destination=action.enterPort?"port":"dock";
          card.setAttribute("aria-pressed",String(selected===action));
          card.append(node("strong",action.enterPort?"入港":"停泊"),
            node("span",action.enterPort?"依實際船員分紅，保留回程資格。":"去程失敗，沒有船運分紅及回程資格。"),
            node("small",stockText(action)));
          decisions.append(card);
        }
        dialog.append(decisions);
      }
      if(options.some(item=>item.join!==undefined)){
        dialog.append(node("p","第一海盜已決定"+(queue.takeover.enterPort?"入港":"停泊")+"。只能加入空席或放棄加入。"));
      }
      for(const action of options.filter(item=>boarding?!item.crewId:item.enterPort===null)){
        const label=boarding?"等待第三輪":action.join===true?"加入空席":action.join===false?"放棄加入":"放棄劫持";
        const control=button(label,()=>choose(action));
        control.dataset.pirateChoice=String(action.join??"pass");
        control.setAttribute("aria-pressed",String(selected===action));
        dialog.append(control);
      }
    }
    const status=node("p",null,"pirate-selection");
    status.setAttribute("aria-live","polite");
    if(selectedSeat){
      const player=owner(selectedSeat);
      const cargo=cargoNames[view.ships.find(ship=>ship.id===target).good];
      status.textContent=player
        ?"確定擠下"+playerName(player.id)+"，取代"+cargo+"船第 "+selectedSeat.seat+" 席？"
        :"確定加入"+cargo+"船第 "+selectedSeat.seat+" 席？";
      const after=crewCircles(view.ships.find(ship=>ship.id===target));
      const occupied=after.children[selectedSeat.seat-1];
      occupied.textContent=view.selfId;
      occupied.style.setProperty("--occupant",colors[view.players.findIndex(player=>player.id===view.selfId)]);
      dialog.append(status,node("small","登船後預覽"),after);
    }else{
      status.textContent=selected?"已選擇，確認後送出。":"請先選擇候選船及行動。";
      dialog.append(status);
    }
    const footer=node("div",null,"bet-footer");
    const confirm=button("確認海盜決策",()=>{dialog.close();submit(selected)});
    confirm.className="primary";
    confirm.id="pirate-confirm";
    confirm.disabled=!selected;
    footer.append(button("返回棋盤",()=>dialog.close()),confirm);
    dialog.append(footer);
  }
  render();
  return {shell,dialog,shipIds};
}
