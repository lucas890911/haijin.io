import {silverAmount} from "./silver.js";
const groupNames = {income:"經營收入", expense:"經營支出", investment:"股票投資", finance:"抵押融資",
  final:"終局專項", other:"其他金流"};
const actNames = {1:"海禁與軍需", 2:"反攻閩南", 3:"海疆危局"};
const politicalNames = {inspection:"沿海盤查", bribery:"暗中疏通"};
const weatherNames = {normal:"正常", typhoon:"颱風", tailwind:"順風"};
const signed = number => number > 0 ? "+" + number : String(number).replace("-", "−");
const money = number => silverAmount(String(number).replace("-", "−"));
const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
  ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[char]);

function metric(title, before, after) {
  const net = after - before;
  return '<div class="season-metric"><span>'+title+'</span><b class="season-delta" data-sign="'+Math.sign(net)+'">'+signed(net)+' 銀</b>'+
    '<small>'+money(before)+' → '+money(after)+'</small></div>';
}

function account(player, flowName) {
  return Object.entries(groupNames).map(([group,title]) => {
    const rows = player.rows.filter(row => row.group === group);
    if (!rows.length) return "";
    return '<details class="season-ledger-group"><summary>'+title+' · <b>'+signed(player.totals[group])+' 銀</b></summary><ol>'+
      rows.map(row => '<li data-ledger-id="'+esc(row.id)+'"><span>'+esc(row.category === "buyout" ? "官府包銷" : flowName(row))+
        (row.positionId ? " · "+esc(row.positionId) : row.shipId ? " · "+esc(row.shipId.replace("ship-","船 ")) : "")+
        (row.crewId ? " · "+esc(row.playerId+"-"+row.crewId.split("-").at(-1)) : "")+
        '</span><b>'+signed(row.delta)+' 銀</b><small>餘 '+money(row.balance)+'</small></li>').join("")+'</ol></details>';
  }).join("") || "<p>本季無現銀收支。</p>";
}

function personalHTML(personal, snapshot, goods, flowName) {
  if (!personal) return "";
  const {opening, closing} = personal;
  const player = snapshot.players.find(player => player.id === closing.playerId);
  const award = player.rows.filter(row => row.reason === "flag-award").reduce((total, row) => total + row.delta, 0);
  return '<section class="season-personal" data-viewer="'+esc(closing.playerId)+'"><h3>我的財務 · '+esc(closing.playerId)+' 席</h3>'+
    '<div class="season-metrics">'+metric("本季現銀淨變化",opening.cash,closing.cash)+
    metric("帳面資產參考變化",opening.bookValue,closing.bookValue)+'</div>'+
    '<p class="season-formula">帳面參考值＝現銀＋股票市值（含抵押股）−未贖抵押負擔；本數字不作季中排名。尚未發放的令旗賞銀與未付款的拘押不列入。</p>'+
    '<p>手上股票 '+money(closing.stockValue)+' · 未贖抵押負擔 '+money(closing.mortgage)+' · 拘押 '+closing.detained.length+' 枚</p>'+
    '<p>水師令旗 '+closing.flags+' 枚 · '+(snapshot.ending ? "已入帳賞銀 "+money(award) :
      "預計終局賞銀 "+money(closing.flags*10)+"（每枚 10 銀，尚未入帳）")+'</p>'+
    '<details class="season-equity"><summary>持股、抵押與拘押明細</summary><ul>'+
    closing.stocks.map((stock,index) => '<li>'+esc(goods[stock.good])+' · '+opening.stocks[index].count+' → '+stock.count+
      ' 張（抵押 '+stock.pledged+' 張） · 每張 '+money(stock.stockPrice)+' · 市值 '+money(stock.value)+'</li>').join("")+
    closing.detained.map(crew => '<li>棋子 '+esc(closing.playerId+"-"+crew.crewId.split("-").at(-1))+
      ' · '+(crew.severe?"軍武重押":"一般拘押")+' · '+(snapshot.ending?"終局扣款見現銀帳本":"第 "+crew.releaseAfterSeason+" 季結算後釋放")+'</li>').join("")+
    '</ul></details><details class="season-account"><summary>現銀收支明細 · '+player.rows.length+' 筆</summary>'+
    '<p class="season-audit">'+money(player.openingCash)+' ＋（'+signed(player.net)+' 銀）＝ '+money(player.closingCash)+
    (player.reconciled?" · 與帳本一致":" · 帳本待核對")+'</p>'+account(player,flowName)+'</details></section>';
}

function marketHTML(snapshot, goods) {
  return '<section class="season-market"><h3>商品市場</h3><div class="season-goods">'+Object.entries(snapshot.closing.market).map(([good,close]) => {
    const open = snapshot.opening.market[good];
    const log = snapshot.outbound[good];
    const reasons = log ? [
      (log.status === "arrived" ? "成功入港" : "去程失敗 · 第 "+log.failureCount+" 次連續失敗")+" "+signed(log.quote.voyage),
      log.quote.pirate !== 0 && "海盜登船／劫持 "+signed(log.quote.pirate),
      log.quote.bonus !== 0 && "荷蘭商館首船 "+signed(log.quote.bonus),
      open.stockPrice+log.quote.voyage+log.quote.pirate+log.quote.bonus !== close.stockPrice && "股價達上下限",
      log.marketReport && log.marketReport.replace(/^ship-\d+ /,"")+"（僅本季整船分紅）",
      log.navyRequisition && "水師徵用令影響本季整船分紅",
    ].filter(Boolean) : ["未出航"];
    return '<article data-season-good="'+esc(good)+'"><h4>'+esc(goods[good])+'</h4><dl><div><dt>股票股價</dt><dd>'+
      open.stockPrice+' → '+close.stockPrice+' 銀 <b>('+signed(close.stockPrice-open.stockPrice)+')</b></dd></div>'+
      '<div><dt>去程商品價差</dt><dd>'+signed(open.spread)+' → '+signed(close.spread)+' 銀 <b>('+signed(close.spread-open.spread)+')</b></dd></div>'+
      '<div><dt>公開庫存</dt><dd>'+open.inventory+' → '+close.inventory+' 張</dd></div></dl><p>'+esc(reasons.join(" · "))+'</p></article>';
  }).join("")+'</div></section>';
}

export function seasonCenter(snapshot, personal, {cards, goods, flowName, colors}) {
  const playerCards = snapshot.players.map((player,index) =>
    '<article class="season-player" data-seat="'+esc(player.id)+'" style="--season-player:'+colors[index]+'"><h4>'+esc(player.id)+' 席</h4>'+
    metric("現銀",player.openingCash,player.closingCash)+
    '<small>令旗 '+player.flags+' 枚（本季 '+signed(player.flagsGained)+'）</small></article>').join("");
  const events = snapshot.events;
  const outcome = snapshot.ending === "monopoly" ? "股票獨佔提前終局" : snapshot.ending ? "正式終局" :
    snapshot.season === 3 ? (snapshot.extended ? "軍備支援達標 · 延長至八季" : "軍備支援未達標 · 七季") : "";
  return '<p class="season-context">第 '+snapshot.act+' 幕 · '+esc(actNames[snapshot.act])+' ｜ '+esc(weatherNames[snapshot.weather])+
    ' ｜ '+esc(politicalNames[snapshot.event] ?? cards[snapshot.event] ?? snapshot.event)+' ｜ 結算完成</p>'+
    (outcome ? '<p class="season-outcome">'+outcome+'</p>' : '')+
    '<section class="season-public"><h3>公開現銀</h3><div class="season-players">'+playerCards+'</div></section>'+
    '<div class="season-columns">'+personalHTML(personal,snapshot,goods,flowName)+marketHTML(snapshot,goods)+'</div>'+
    '<details class="season-events"><summary>本季重大事件 · '+events.length+' 筆</summary>'+
    (events.length?'<ul>'+events.map(line=>'<li>'+esc(line)+'</li>').join("")+'</ul>':"<p>本季無額外重大事件。</p>")+'</details>';
}
