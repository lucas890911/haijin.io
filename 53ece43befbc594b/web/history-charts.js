import {silverIconUrl,silverUnit,silverAmount} from "./silver.js";
export function historyModel(history, viewer, through = Infinity) {
  if (!history?.public.baseline) return [];
  const own = history.personal?.viewerId === viewer ? history.personal : null;
  const records = own?.seasons ?? [];
  return [
    {season:0, boundary:history.public.baseline, personal:own?.baseline},
    ...history.public.seasons.filter(snapshot=>snapshot.version<=through).map(snapshot=>({
      season:snapshot.season,boundary:snapshot.closing,snapshot,
      personal:records.find(record=>record.version===snapshot.version)?.closing,
    })),
  ];
}

const personalKeys = {cash:"本人現銀",stockValue:"本人股票市值",bookValue:"本人帳面資產參考值"};

export function historySeries(points,mode,goods,colors) {
  const prices=mode==="stockPrice" || mode==="spread";
  const keys=mode==="cash"?points[0].boundary.players.map(player=>player.id):
    mode==="personal"?Object.keys(personalKeys):Object.keys(goods);
  return keys.map((key,index)=>({
    key, label:prices?goods[key]:mode==="personal"?personalKeys[key]:key+" 席",
    color:colors[index],pattern:dash[index],
    values:points.map(point=>prices?point.boundary.market[key]?.[mode]:mode==="personal"?
      point.personal?.[key]:point.boundary.players.find(player=>player.id===key)?.cash),
  }));
}

export const historyDomain = (series, mode) => {
  if(mode==="stockPrice")return [0,40];
  const values=series.flatMap(line=>line.values.filter(Number.isFinite));
  const min=Math.min(0,...values), max=Math.max(0,...values);
  return [min,min===max?1:max];
};

const esc = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const n = value => Number.isFinite(value)?String(value).replace("-","−"):"—";
const delta = value => value>0?"+"+value:n(value);
const modes={cash:"公開現銀",personal:"本人資產",stockPrice:"股票股價",spread:"去程價差"};
const dash=["","8 4","3 4","11 4 2 4"];

const chartLayout = {
  desktop: {width:590,height:207,left:48,right:558,top:20,bottom:160,silverX:10,silverY:13,seasonY:184,unitY:199,markY:195,hitTop:14,hitBottom:193},
  mobile: {width:360,height:218,left:45,right:314,top:44,bottom:165,silverX:16,silverY:18,seasonY:188,unitY:188,markY:202,hitTop:35,hitBottom:207},
};

function chart(points,lines,mode,selected,compact) {
  const {width,height,left,right,top,bottom,silverX,silverY,seasonY,unitY,markY,hitTop,hitBottom} =
    compact?chartLayout.mobile:chartLayout.desktop;
  const [min,max]=historyDomain(lines,mode);
  const x = season => left+(season-points[0].season)/(points.at(-1).season-points[0].season||1)*(right-left);
  const y = value => bottom-(value-min)/(max-min)*(bottom-top);
  const ticks=[...new Set([min,0,max])];
  const grid=ticks.map(value=>'<path d="M'+left+' '+y(value)+'H'+right+'" class="trend-grid"/><text data-y-tick x="'+(left-8)+'" y="'+
    (y(value)+4)+'" text-anchor="end">'+n(value)+'</text>').join("");
  const traces=lines.map(line=>{
    const known=points.map((p,i)=>[p.season,line.values[i]]).filter(([,value])=>Number.isFinite(value));
    const path=known.map(([season,value],i)=>(i&&known[i-1][0]===season-1?"L":"M")+x(season)+" "+y(value)).join("");
    return '<g stroke="'+line.color+'"><path d="'+path+'" fill="none" stroke-width="2.5" stroke-dasharray="'+line.pattern+'"/>'+
      known.map(([season,value])=>'<circle cx="'+x(season)+'" cy="'+y(value)+'" r="'+(season===selected?5:3)+
        '" fill="'+(season===selected?line.color:"#fffdf4")+'"></circle>').join("")+'</g>';
  }).join("");
  const marks=points.map(p=>{
    const notes = p.snapshot;
    const event = notes && (notes.ending==="monopoly" || (notes.season===3&&notes.extended) ||
      notes.players.some(player=>player.flagsGained>0) || Object.values(notes.outbound).some(ship=>ship.quote.pirate!==0));
    return '<g data-chart-season="'+p.season+'" class="trend-point"><rect x="'+(x(p.season)-(compact?15:17))+
    '" y="'+hitTop+'" width="'+(compact?30:34)+'" height="'+(hitBottom-hitTop)+'" fill="transparent"/><text data-x-tick x="'+x(p.season)+
    '" y="'+seasonY+'" text-anchor="middle">'+p.season+'</text>'+(event?'<circle cx="'+x(p.season)+'" cy="'+markY+'" r="3" fill="#a56b29"><title>公開重大事件</title></circle>':"")+'</g>';
  }).join("");
  return '<svg viewBox="0 0 '+width+' '+height+'" aria-hidden="true"><image data-axis="silver" href="'+silverIconUrl+'" x="'+silverX+'" y="'+(silverY-11)+'" width="16" height="11"/>'+grid+traces+marks+
    '<text data-axis="season" x="'+(width-(compact?6:5))+'" y="'+unitY+'" text-anchor="end">季</text></svg>';
}

function table(points,lines) {
  return '<table class="trend-table"><caption>精確數值 '+silverUnit+'</caption><thead><tr><th scope="col">季</th>'+
    lines.map(line=>'<th scope="col">'+esc(line.label)+'</th>').join("")+'</tr></thead><tbody>'+
    points.map((p,i)=>'<tr data-trend-season="'+p.season+'"><th scope="row">'+p.season+'</th>'+
      lines.map(line=>'<td>'+(Number.isFinite(line.values[i])?silverAmount(n(line.values[i])):'—')+'</td>').join("")+'</tr>').join("")+'</tbody></table>';
}

function overview(point, projection, closeout) {
  const {snapshot,boundary,personal}=point;
  const goods=projection.goods;
  const own=projection.history.personal;
  const opening=snapshot&&own?.viewerId===projection.viewerId?own.seasons.find(row=>row.version===snapshot.version)?.opening:null;
  return '<h3>'+(snapshot?"第 "+point.season+" 季":"第 0 季 · 開局基準")+'</h3>'+
    (snapshot?'<p>第 '+snapshot.act+' 幕 · '+esc(({normal:"正常",typhoon:"颱風",tailwind:"順風"})[snapshot.weather]??"—")+
      ' · '+esc(projection.cards[snapshot.event]??snapshot.event)+'</p>':'')+
    '<div class="trend-balances">'+boundary.players.map((p,i)=>{
      const row=snapshot?.players.find(row=>row.id===p.id);
      return '<div style="--trend-color:'+projection.colors[i]+'"><b>'+esc(p.id)+' 席</b><strong>'+n(p.cash)+' 銀</strong>'+
        (row?'<small>本季 '+delta(row.net)+' 銀'+(row.flagsGained?' · 令旗 +'+row.flagsGained:'')+'</small>':'')+'</div>';
    }).join("")+'</div>'+
    (personal?'<p>'+esc(projection.viewerId)+' 席本人帳面資產參考值 '+n(personal.bookValue)+' 銀'+(opening?'（'+delta(personal.bookValue-opening.bookValue)+'）':'')+
      ' · 股票市值 '+n(personal.stockValue)+' 銀</p>':'')+
    '<details class="trend-market"><summary>四商品與公開庫存</summary><ul>'+Object.entries(boundary.market).map(([good,row])=>{
      const previous=snapshot?.opening.market[good], sail=snapshot?.outbound[good];
      return '<li><b>'+esc(goods[good])+'</b> · 股價 '+silverAmount(n(row.stockPrice))+(previous?'（'+delta(row.stockPrice-previous.stockPrice)+'）':'')+
        ' · 去程價差 '+silverAmount(n(row.spread))+(previous?'（'+delta(row.spread-previous.spread)+'）':'')+' · 庫存 '+row.inventory+' 張'+
        (snapshot?' · '+(sail?sail.status==="arrived"?"入港":"停泊":"未出航")+(sail?.quote.pirate?" · 海盜影響股價":""):'')+'</li>';
    }).join("")+'</ul></details>'+
    (snapshot?.events.length?'<details><summary>公開重大事件（'+snapshot.events.length+'）</summary><ul>'+
      snapshot.events.map(line=>'<li>'+esc(line)+'</li>').join("")+'</ul></details>':'')+
    (snapshot?.ending==="monopoly"?'<p>股票獨佔提前終局</p>':snapshot?.season===3&&snapshot.extended?'<p>軍備支援達標 · 延長至八季</p>':'')+
    (snapshot&&closeout?'<button type="button" data-history-review>查看唯讀結算</button>':'');
}

export function addHistoryEntry(parent,projection,through,onReview) {
  const points=historyModel(projection.history,projection.viewerId,through);
  if(!points.length)return;
  const entry=document.createElement("button");
  entry.type="button";entry.className="history-entry";entry.textContent="歷史回顧／市場走勢";
  entry.onclick=()=>openHistory(points,projection,onReview);
  parent.append(entry);
}

function openHistory(points,projection,onReview) {
  const dialog=document.createElement("dialog");
  dialog.className="trend-dialog";
  dialog.setAttribute("aria-labelledby","trend-title");
  dialog.innerHTML='<h2 id="trend-title">歷史回顧</h2><div class="trend-scroll"><div class="trend-controls">'+
    '<label>趨勢 <select data-trend-mode>'+Object.entries(modes).filter(([key])=>key!=="personal"||points.some(p=>p.personal))
      .map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join("")+'</select></label>'+
    '<label>區間 <select data-trend-range><option value="all">全部</option><option value="recent">最近三季</option></select></label>'+
    '<label class="trend-season">季別 <input type="range" min="0" max="'+(points.length-1)+'" value="'+(points.length-1)+
    '" data-trend-slider><output></output></label></div>'+
    '<div class="trend-legend"></div><p class="trend-reading" aria-live="polite"></p><div class="trend-plot"></div>'+
    '<details class="trend-data"><summary>完整數值表</summary><div></div></details><section class="trend-overview"></section></div>'+
    '<form method="dialog"><button class="primary">關閉歷史</button></form>';
  const find=selector=>dialog.querySelector(selector);
  const slider=find("[data-trend-slider]"), mode=find("[data-trend-mode]"), range=find("[data-trend-range]");
  const legend=find(".trend-legend");
  const plot=find(".trend-plot");
  const hidden=new Map();
  const compact=matchMedia("(max-width:680px)");
  let chartState;
  const drawPlot=()=>{plot.innerHTML=chart(...chartState,compact.matches);};
  const displayed=()=>range.value==="recent"?points.slice(-3):points;
  const select=season=>{
    const index=points.findIndex(p=>p.season===season);
    if(index>=0&&Number(slider.value)!==index){slider.value=index;draw();}
  };
  function draw() {
    const visible=displayed(), point=points[Number(slider.value)];
    const all=historySeries(visible,mode.value,projection.goods,projection.colors);
    const lines=all.filter(line=>!hidden.get(mode.value)?.has(line.key));
    const index=visible.indexOf(point);
    const previous=points[Number(slider.value)-1];
    const earlier=previous&&historySeries([previous],mode.value,projection.goods,projection.colors);
    find("output").textContent="第 "+point.season+" 季";
    slider.setAttribute("aria-valuetext","第 "+point.season+" 季");
    find(".trend-reading").textContent=lines.length?lines.map(line=>{
      const amount=line.values[index], before=earlier?.find(row=>row.key===line.key)?.values[0];
      return line.label+" "+(Number.isFinite(amount)?n(amount)+" 銀":"—")+(Number.isFinite(amount)&&Number.isFinite(before)?"（"+delta(amount-before)+"）":"");
    }).join(" · "):"選擇至少一條曲線以顯示圖表。";
    chartState=[visible,lines,mode.value,point.season];
    drawPlot();
    find(".trend-data > div").innerHTML=table(visible,lines);
    const detail=find(".trend-overview");
    detail.innerHTML=overview(point,projection,onReview);
    const review=detail.querySelector("[data-history-review]");
    if(review)review.onclick=()=>onReview(point.snapshot.version);
  }
  function filterControls() {
    if(!hidden.has(mode.value))hidden.set(mode.value,new Set());
    const skipped=hidden.get(mode.value);
    legend.innerHTML=historySeries(displayed(),mode.value,projection.goods,projection.colors)
      .map(line=>'<label style="--trend-color:'+line.color+'"><input type="checkbox" value="'+esc(line.key)+'" '+
        (skipped.has(line.key)?"":"checked")+'>'+esc(line.label)+'</label>').join("");
    legend.onchange=({target})=>{if(target.checked)skipped.delete(target.value);else skipped.add(target.value);draw();};
    draw();
  }
  slider.oninput=draw;
  mode.onchange=filterControls;
  range.onchange=()=>{
    slider.min=points.length-displayed().length;
    if(Number(slider.value)<Number(slider.min))slider.value=slider.min;
    draw();
  };
  plot.onclick=plot.onpointerover=event=>{
    const mark=event.target.closest("[data-chart-season]");
    if(mark&&(event.type==="click"||event.pointerType==="mouse"))select(Number(mark.dataset.chartSeason));
  };
  compact.addEventListener("change",drawPlot);
  dialog.onclose=()=>{compact.removeEventListener("change",drawPlot);dialog.remove();};
  document.body.append(dialog);
  filterControls();
  dialog.showModal();
}
