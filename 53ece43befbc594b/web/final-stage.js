export function finalResults(wealth, view, stocks, ending) {
  const ordered = [...wealth].sort((a,b) => b.total-a.total);
  return {
    reason: ending?.ending === "monopoly" ? "集齊同一商品五張股票 · 提前終局" :
      ending?.extended ? "軍備支援達標 · 八季完結" : view.season === 7 ? "七季完結" : "正式終局",
    season: view.season,
    players: ordered.map(row => {
      const player = view.players.find(player=>player.id===row.playerId);
      const own = stocks.filter(stock => stock.ownerId === row.playerId);
      const closing = view.ledger.filter(entry => entry.playerId === row.playerId &&
        ["flag-award","final-ransom"].includes(entry.reason));
      return {...row, rank: 1+ordered.findIndex(item=>item.total===row.total), gap: ordered[0].total-row.total,
        flags: player?.flags??0,
        award: closing.filter(entry=>entry.reason==="flag-award").reduce((total,entry)=>total+entry.delta,0),
        fees: closing.filter(entry=>entry.reason==="final-ransom").map(entry=>({
          ...entry, severe: player?.crew?.find(crew=>crew.id===entry.crewId)?.status.severe,
        })),
        before: closing.length ? closing[0].balance-closing[0].delta : row.cash,
        shares: Object.entries(view.commodities).map(([good,{stockPrice}])=>{
          const held=own.filter(stock=>stock.good===good);
          return {good,price:stockPrice,count:held.length,pledged:held.filter(stock=>stock.pledged).length};
        }),
      };
    }),
  };
}

export function assetScale(players) {
  const min = Math.min(0,...players.map(p=>Math.min(0,p.cash)-p.mortgage));
  const max = Math.max(0,...players.map(p=>Math.max(0,p.cash)+p.stocks));
  const percent = value => (value-min)/(max-min||1)*100;
  return {min,max,percent,zero:percent(0),segments(p) {
    return [
      {kind:"cash",from:Math.min(0,p.cash),to:Math.max(0,p.cash)},
      {kind:"stocks",from:Math.max(0,p.cash),to:Math.max(0,p.cash)+p.stocks},
      {kind:"mortgage",from:Math.min(0,p.cash)-p.mortgage,to:Math.min(0,p.cash)},
    ];
  }};
}

const number = n => String(n).replace("-","−");
import {silverAmount,silverUnit} from "./silver.js";
const silver = n => silverAmount(number(n));

export function finalStage(result, {who, goods, colors, esc, achievements}) {
  const label = p => '<span class="final-seat" style="--seat:'+colors[p.playerId]+'">'+esc(p.playerId)+'</span> '+who(p.playerId);
  const winners = result.players.filter(p=>p.rank===1);
  const scale=assetScale(result.players);
  const table=result.players.map(p=>'<tr data-seat="'+esc(p.playerId)+'" data-final-values="'+
    [p.cash,p.stocks,-p.mortgage,p.total].join(",")+'"><td>'+p.rank+'</td><th scope="row">'+label(p)+'</th>'+
    '<td>'+silver(p.cash)+'</td><td>'+silver(p.stocks)+'</td><td>'+silver(-p.mortgage)+'</td>'+
    '<td><strong>'+silver(p.total)+'</strong></td><td>'+silver(p.gap)+'</td></tr>').join("");
  const bars=result.players.map(p=>'<div class="final-bar" data-seat="'+esc(p.playerId)+'"><b>'+esc(p.playerId)+'</b>'+
    '<div class="final-track" aria-hidden="true" style="--zero:'+scale.zero+'%">'+
    scale.segments(p).filter(s=>s.from!==s.to).map(s=>'<i class="'+s.kind+'" style="left:'+scale.percent(s.from)+
      '%;width:'+(scale.percent(s.to)-scale.percent(s.from))+'%"></i>').join("")+'</div>'+
    '<strong>'+silver(p.total)+'</strong>'+
    '<small>現銀 '+silver(p.cash)+' · 股票 '+silver(p.stocks)+' · 抵押 '+silver(-p.mortgage)+'</small></div>').join("");
  const detail=result.players.map(p=>'<details data-final-detail="'+esc(p.playerId)+'"><summary>'+label(p)+' · '+silver(p.total)+
    '</summary><p data-final-formula="'+[p.cash,p.stocks,p.mortgage,p.total].join(",")+'">終局現銀 '+number(p.cash)+
    ' ＋ 股票市值 '+number(p.stocks)+' − 未贖抵押 '+p.mortgage+' ＝ <strong>'+silver(p.total)+'</strong></p>'+
    '<div class="final-detail-grid"><div><h4>股票</h4><ul>'+p.shares.map(s=>'<li>'+esc(goods[s.good])+' '+s.count+
    ' 張 × '+s.price+' 銀 ＝ '+silver(s.count*s.price)+(s.pledged?'（含抵押 '+s.pledged+' 張）':'')+'</li>').join("")+
    '</ul></div><div><h4>終局現銀明細</h4><p>終局調整前 '+silver(p.before)+'</p>'+
    '<p>水師令旗 '+p.flags+' 枚 · 每枚賞銀 10 銀<br>實發 '+silver(p.award)+'，已入現銀。</p>'+
    '<p>強制贖金 '+silver(p.fees.reduce((sum,e)=>sum-e.delta,0))+'，已從現銀扣除。</p>'+
    (p.fees.length?'<ul>'+p.fees.map(e=>'<li>棋子 '+esc(e.crewId?.split("-").at(-1)??"未註記")+
      (e.severe===true?' · 軍武重押':e.severe===false?' · 一般拘押':'')+' · '+silver(e.delta)+'</li>').join("")+'</ul>':'')+'</div></div></details>').join("");
  return '<section class="final-hero"><p>第 '+result.season+' 季 · '+result.reason+'</p><h2>'+
    (winners.length===1?"勝利者":"並列第一")+' <span>'+winners.map(label).join("、")+
    '</span></h2><strong>'+silver(winners[0].total)+'</strong><div class="final-history-slot"></div></section>'+
    '<div class="final-overview"><section><h3>正式排名 <small>'+silverUnit+'</small></h3>'+
    '<table class="final-ranking"><thead><tr><th scope="col">名次</th><th scope="col">玩家</th><th scope="col">現銀</th>'+
    '<th scope="col">股票</th><th scope="col">抵押</th><th scope="col">財富</th><th scope="col" title="與第一名的財富差距">差距</th></tr></thead><tbody>'+table+
    '</tbody></table></section><section aria-label="現銀、股票與未贖抵押比較"><h3>資產構成</h3>'+
    '<p class="final-legend"><span class="cash">現銀</span><span class="stocks">股票</span><span class="mortgage">未贖抵押</span>'+
    '右側數字為正式財富</p><div class="final-axis" aria-hidden="true"><span>'+silver(scale.min)+'</span>'+
    (scale.min<0&&scale.max>0?'<span style="left:'+scale.zero+'%">0</span>':'')+'<span>'+silver(scale.max)+'</span></div>'+
    bars+'</section></div><section class="final-details"><h3>財富構成明細</h3>'+detail+'</section>'+
    '<section data-achievements="'+achievements.status+'" hidden aria-label="成就與稱號"></section>'+
    '<div class="final-tools"><button id="again" class="primary">另開新局</button>'+
    '<button id="export">下載終局研究 JSON</button><p id="export-notice">僅供終局研究，含私密資料（重播種子、暗股及完整選票），請勿在對局中分享。資料保存在本機，下載由您主動觸發。</p></div>';
}
