import {silverAmount} from "./silver.js";
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
      : passed ? "已退出" : bid ? silverAmount(bid.amount) : "—";
    return '<article class="'+(acting?'calling':'')+'" style="--color:'+colors[i]+'">'+
      '<div class="auction-identity"><span>'+player.id+'</span><h3>'+who(player.id)+'</h3></div>'+
      (status?'<p class="auction-status">'+status+'</p>':'')+
      '<dl><div><dt>'+bidLabel+'</dt><dd>'+bidValue+'</dd></div>'+
      '<div><dt>現銀</dt><dd>'+silverAmount(player.cash)+'</dd></div></dl></article>';
  }).join('')+'</div></section>';
}
const stockGoods=[
  ["deerskin","🦌","鹿皮"], ["sugar","🎋","蔗糖"], ["sulfur","🪨","硫磺"], ["rice","🌾","稻米"],
];

function stockRows(view,id){
  const own=view.selfId===id;
  const visible=view.stocks.filter(stock=>stock.ownerId===id && (own || stock.source==="subscription"));
  if(!own && !visible.length) return [];
  return stockGoods.map(([good,icon,label])=>{
    const shares=visible.filter(stock=>stock.good===good);
    return {icon,label,count:shares.length,pledged:shares.filter(stock=>stock.pledged).length,
      price:view.commodities[good].stockPrice};
  });
}

function stockSection(rows,own){
  const title=own?"我的股票與抵押":"公開認購與抵押";
  return '<section class="player-stocks"><h3>'+title+'</h3>'+
    (rows.length?'<ul>'+rows.map(({icon,label,count,pledged,price})=>
      '<li class="player-stock-row"><span><span aria-hidden="true">'+icon+'</span> '+label+
      '</span><b data-share-count>'+count+'</b><span>張 · 抵押 '+pledged+' 張</span><small>每股 '+price+' 銀</small></li>').join("")+
      '</ul>':'<p>目前沒有公開認購。</p>')+'</section>';
}

export function playerRail(layout,actor,view){
  for(const card of layout.querySelectorAll('.players .grid > .box')){
    const id=card.querySelector('[data-cash]').dataset.cash;
    const player=view.players.find(player=>player.id===id);
    const button=document.createElement('button');
    const acting=id===actor;
    const captain=view.captainId===id;
    const own=view.selfId===id;
    const available=player.crew.filter(crew=>crew.status.kind==="available").length;
    const rows=stockRows(view,id);
    const summary=own?rows.map(({icon,label,count,pledged})=>{
      const meaning=label+" "+count+" 張，抵押 "+pledged+" 張";
      return '<span title="'+meaning+'" aria-label="'+meaning+'"><span aria-hidden="true">'+icon+'</span> '+count+
        (pledged?'<small aria-hidden="true">🔒'+pledged+'</small>':'')+'</span>';
    }).join(""):"";
    button.className='mini-player';
    button.type="button";
    button.setAttribute("aria-haspopup","dialog");
    button.innerHTML='<span class="mini-identity"><span class="mini-seat">'+id+'</span>'+
      (captain?'<span title="本季船長" aria-label="本季船長"> ⚓</span>':'')+'</span>'+
      '<strong data-cash="'+id+'" title="現銀">'+silverAmount(player.cash)+'</strong>'+
      '<small title="可用手下">手下 '+available+'</small>'+
      '<small class="mini-state">'+(acting?"行動中":"&nbsp;")+'</small>'+
      '<span class="mini-stock"'+(own?' data-own aria-label="我的股票與抵押"':' aria-hidden="true"')+'>'+summary+'</span>';
    card.classList.toggle('acting',acting);
    button.onclick=()=>{
      if(document.querySelector('dialog[open]'))return;
      const dialog=document.createElement('dialog');
      dialog.className="player-detail-dialog";
      dialog.setAttribute("aria-labelledby","player-dialog-title");
      const title=document.createElement("h2");
      title.id="player-dialog-title";
      title.textContent=id+" 席資產";
      const close=document.createElement('button');
      close.type="button";
      close.textContent='返回棋盤';
      close.onclick=()=>dialog.close();
      const header=document.createElement("div");
      header.className="player-dialog-heading";
      header.append(title,close);
      const info=details.cloneNode(true);
      info.className="player-dialog-info";
      info.style.setProperty("--color",card.style.getPropertyValue("--color"));
      info.querySelectorAll("[data-token]").forEach(el=>el.removeAttribute("data-token"));
      info.addEventListener("click",event=>{
        const target=event.target.closest("[data-find]");
        if(!target)return;
        dialog.close();
        details.querySelector('[data-find="'+target.dataset.find+'"]')?.click();
      });
      dialog.append(header,info);
      layout.append(dialog);
      dialog.onclose=()=>{
        dialog.remove();
        if(button.isConnected)button.focus({preventScroll:true});
      };
      dialog.showModal();
      close.focus({preventScroll:true});
    };
    const details=document.createElement("div");
    details.className="player-detail";
    details.append(...card.childNodes);
    details.querySelector(".player-records").insertAdjacentHTML("beforebegin",stockSection(rows,own));
    card.replaceChildren(button,details);
  }
}
