const groups=[
  ["event","開季",/^(SEASON_START|EVENT_REVEAL)$/],
  ["auction","競標",/^AUCTION$/],
  ["stock","認股",/^CAPTAIN_STOCK_OPTION$/],
  ["dispatch","配船",/^CAPTAIN_ASSIGN_SHIPS$/],
  ["voyage","去程",/^(PLACEMENT_|SAIL_|PIRATE_|PILOT_)/],
  ["outbound","去程結算",/^OUTBOUND_SETTLEMENT$/],
  ["return","回程",/^(ANTI_SMUGGLING_|RETURN_)/],
  ["closing","結算",/^(SEASON_END|FINAL_SETTLEMENT)$/]
];
export function activity(phase){
  return groups.find(([, ,pattern])=>pattern.test(phase))?.[0]??"voyage";
}
export function timeline(active){
  return '<ol class="progress" aria-label="遊戲進程">'+groups.map(([id,title])=>
    '<li'+(id===active?' aria-current="step"':'')+'>'+title+'</li>').join('')+'</ol>';
}
export function auctionCards(view,who,colors,actor){
  const auction = view.auction;
  const sealed = auction?.kind === "sealed";
  return '<section class="auction-table"><h2>船長競標</h2><div class="auction-grid">'+view.players.map((player,i)=>{
    const bid = sealed ? null : auction?.publicHistory.filter(entry=>entry.actorId===player.id).at(-1);
    const acting = (actor??auction?.turnId)===player.id;
    const passed = auction?.withdrawn.includes(player.id) || bid?.amount===null;
    const leading = !sealed && auction?.highest?.actorId===player.id;
    const status = [acting && "行動中",leading && "最高標",passed && "PASS"].filter(Boolean).join(" · ");
    const bidLabel = sealed ? "密封出價" : "目前出價";
    const bidValue = sealed
      ? auction.submittedPlayerIds.includes(player.id) ? "已提交" : "待提交"
      : passed ? "已退出" : bid ? bid.amount+" 銀" : "—";
    return '<article class="'+(acting?'calling':'')+'" style="--color:'+colors[i]+'">'+
      '<div class="auction-identity"><span>'+player.id+'</span><h3>'+who(player.id)+'</h3></div>'+
      (status?'<p class="auction-status">'+status+'</p>':'')+
      '<dl><div><dt>'+bidLabel+'</dt><dd>'+bidValue+'</dd></div>'+
      '<div><dt>現銀</dt><dd>'+player.cash+' 銀</dd></div></dl></article>';
  }).join('')+'</div></section>';
}
export function playerRail(layout,actor,view){
  for(const card of layout.querySelectorAll('.players .grid > .box')){
    const id=card.querySelector('[data-cash]').dataset.cash;
    const player=view.players.find(player=>player.id===id);
    const button=document.createElement('button');
    const acting=id===actor;
    const available=player.crew.filter(crew=>crew.status.kind==="available").length;
    button.className='mini-player';
    button.innerHTML='<span class="mini-seat">'+id+'</span><strong>'+player.cash+' 銀</strong>'+
      '<small>手下 '+available+'</small>'+
      (view.captainId===id?'<small class="mini-state" title="本季船長">⚓ 船長</small>':'')+
      (acting?'<small class="mini-state">行動中</small>':'');
    button.setAttribute("aria-label",id+" 席公開資產，"+player.cash+" 銀，可用手下 "+available+(acting?"，行動中":""));
    card.classList.toggle('acting',acting);
    button.onclick=()=>{
      const dialog=document.createElement('dialog');
      const info=card.cloneNode(true);
      info.querySelector('.mini-player').remove();
      const close=document.createElement('button');
      close.textContent='返回棋盤';close.onclick=()=>dialog.close();
      dialog.append(info,close);document.body.append(dialog);
      dialog.onclose=()=>dialog.remove();dialog.showModal();
    };
    const details=document.createElement("div");
    details.className="player-detail";
    details.append(...card.childNodes);
    card.replaceChildren(button,details);
  }
}
