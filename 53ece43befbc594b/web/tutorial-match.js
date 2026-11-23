// The practice route owns a fresh worker. Navigation discards its entire session.
export function practiceControls(){
  const bar=document.createElement("section");
  bar.className="practice-bar";
  bar.innerHTML='<strong>第一季練習 · 玩家 A</strong><button type="button">重新開始本季</button><button type="button">結束練習</button><details><summary>練習進度</summary><ul></ul></details>';
  document.querySelector("header").after(bar);
  const [restart,exit]=bar.querySelectorAll("button");
  restart.onclick=()=>{if(confirm("從相同開局重練？本次練習進度會清除。"))location.reload();};
  exit.onclick=()=>{if(confirm("結束練習並返回正式遊戲選單？"))location.assign(location.pathname);};
}

const objectives=[
  ["船長競標",["BidPublic","WithdrawPublic"]],
  ["認購或放棄",["BuyStockOrSkip"]],
  ["決定航線",["AssignShips"]],
  ["配置或保留手下",["PlaceCrewOrPass"]],
  ["商船航行",["Sail"]],
  ["去程結算",["SettleOutbound"]],
  ["船員回程投票",["VoteReturnOption"]],
];

const guideKeys=["auction","stock","dispatch","placement","sail",null,"return"];
const explanations={
  "已親自完成":"主持端已接受你的操作。",
  "旁觀學習":"你可從航海紀錄回看其他席位或系統的處理。",
  "略過":"你略過了這段教學，可在重練時再看。",
  "本局未遇到":"本局沒有出現這個步驟。",
};
export function practiceProgress(log,skipped,finished=false){
  const rows=objectives.map(([label,types],i)=>{
    const steps=log.filter(e=>types.includes(e.type));
    const status=steps.some(e=>e.controller==="human")?"已親自完成":skipped.has(guideKeys[i])?"略過":steps.length?"旁觀學習":finished?"本局未遇到":"尚未學習";
    return finished ? '<li class="practice-outcome" data-status="'+status+'"><h3>'+label+'</h3><strong>'+status+'</strong><small>'+explanations[status]+'</small></li>'
      : "<li>"+label+" · <strong>"+status+"</strong></li>";
  }).join("");
  if(!finished)document.querySelector(".practice-bar ul").innerHTML=rows;
  return rows;
}

const signed=value=>value>0?"+"+value:String(value).replace("-","−");

export function practiceReport(app,log,history,skipped,review){
  const cash=history.public.seasons[0].players.find(p=>p.id==="A");
  const assets=history.personal.seasons[0];
  const rows=practiceProgress(log,skipped,true);
  const sum=(...reasons)=>cash.rows.filter(row=>reasons.includes(row.reason)).reduce((total,row)=>total+row.delta,0);
  const human=log.filter(step=>step.controller==="human");
  const finance='帳本記錄經營收入 '+signed(cash.totals.income)+'、支出 '+signed(cash.totals.expense)+'、股票投資 '+signed(cash.totals.investment)+'、抵押融資 '+signed(cash.totals.finance)+' 銀。帳面變動也反映持股市值與抵押負擔。';
  const captain=human.some(step=>step.type==="AssignShips")
    ? '本季標金 '+signed(sum("auction"))+' 銀。重練時可比較不同出價，衡量派船權與手頭現銀。'
    : '本季由 AI 派船。重練時可試試較高的合法出價，再衡量剩餘現銀夠不夠配置。';
  const crew=human.some(step=>step.type==="VoteReturnOption")
    ? '船員配置帳目 '+signed(sum("placement"))+' 銀，回程入帳 '+signed(sum("return"))+' 銀。回程由同船船員共同投票，可在紀錄中回看結果。'
    : '本局你沒有回程投票。下次可試著選擇合法船員席，觀察船員入港後如何取得投票資格。';
  app.innerHTML='<section class="practice-result card"><small>第一幕 · 第一季</small><h1>練習完成</h1>'+
    '<div class="practice-metrics"><p>現銀 <b>'+cash.openingCash+' → '+cash.closingCash+' 銀</b> '+signed(cash.net)+'</p>'+
    '<p>帳面資產 <b>'+assets.opening.bookValue+' → '+assets.closing.bookValue+' 銀</b> '+signed(assets.closing.bookValue-assets.opening.bookValue)+'</p></div>'+
    '<nav><a href="?mode=practice">再練一次</a><a href="?">返回正式遊戲</a><button type="button" data-practice-review>查看正式季末明細</button></nav>'+
    '<h2>本季回饋</h2><ul class="practice-feedback"><li>'+finance+'</li><li>'+captain+'</li><li>'+crew+'</li></ul>'+
    '<h2>學習成果</h2><ul class="practice-outcomes">'+rows+'</ul><details><summary>本季實際決策與結算</summary><ol></ol></details></section>';
  app.querySelector("[data-practice-review]").onclick=review;
  const list=app.querySelector("ol");
  for(const entry of log){
    const row=document.createElement("li");
    row.textContent=(entry.actor ? "玩家 "+entry.actor+" · " : "")+entry.lines.join(" · ");
    list.append(row);
  }
  app.querySelector("h1").tabIndex=-1;
  app.querySelector("h1").focus();
}
