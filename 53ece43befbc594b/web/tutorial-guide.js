const lessons = [
  ["玩家資產", "從玩家欄查看現銀和手下，展開資金資料可查抵押。市場列出四貨股價，起始秘密股票只在本人視圖可見。", "market"],
  ["開季與船長競標", "先看天氣與政經效果。公開競標可出價或 PASS，密封標金在正式揭曉前保密。得標船長可認股並安排商船。", "captain"],
  ["認股與配船", "船長通常可認購一張股票或放棄。藩庫徵調時可再選另一種商品。接著選三種貨與合法起點，確認派船。", "captain"],
  ["配置與下注", "從三艘船的選席入口，或港口、停泊、保險、海盜與大小領航選位。以盤面列出的不可選原因及確認窗的票面費、減免與實付為準。", "board"],
  ["航海與領航", "三輪航行各自結算骰點。前兩輪留意航程與海盜，第三輪擲骰前可能要領航。依畫面上的合法選項決定。", "pirates"],
  ["回程與緝私", "第一、三幕可依資格加入緝私營。實際入港船員逐票決定回程，走私失敗可能遭拘押。", "return"],
  ["季末與終局", "查當季現銀收支、資產與四貨股價走勢。正式財富排名在終局公布，水師令旗收入以帳本為準。", "scoring"],
];

function activity(view, legal, event) {
  const phase = event?.phase ?? view.phase;
  const has = type => legal?.actions.some(action => action.type === type);
  if (/^(SEASON_END|GAME_END)/.test(phase) || event?.type === "EndSeason" || view.gameEnded)
    return [6, "results", null, ".final-ranking, #stream"];
  if (phase === "AUCTION" || /^(SEASON_START|EVENT_REVEAL)$/.test(phase))
    return [1, "auction", legal?.bid || has("WithdrawPublic") ? "#bid, [data-action=WithdrawPublic]" : null, ".auction-grid, .season-event, #stream"];
  if (phase === "CAPTAIN_STOCK_OPTION")
    return [2, "stock", has("BuyStockOrSkip") ? "#actions .options" : null, ".activity-center"];
  if (phase === "CAPTAIN_ASSIGN_SHIPS")
    return [2, "dispatch", legal?.assignShips ? "#dispatch:enabled" : null, ".route-slot, .fleet"];
  if (phase.startsWith("PLACEMENT"))
    return [3, "placement", legal?.actions.some(action => action.placement)
      ? "[data-ship-seats]:enabled, [data-pos]:enabled" : null, ".voyage-board"];
  if (/^(SAIL_|PILOT_|PIRATE_)/.test(phase))
    return [4, "sail", has("Sail") ? "#roll-sail" : has("ApplyPilotMoves") ? ".arrow:enabled" : null, ".voyage-board"];
  if (phase === "OUTBOUND_SETTLEMENT" || /^(ANTI_SMUGGLING_|RETURN_)/.test(phase))
    return [5, "return", view.act !== 2 && (legal?.actions.some(action=>action.type==="CampChoice" && action.crewIds?.length) ||
      has("VoteReturnOption") || has("RedeemCrew"))
      ? ".vote-panel, .camp-controls, .return-prison" : null, ".return-stage, #stream"];
  return [0, "assets", null, ".players"];
}

function actionKey(action) {
  switch(action?.type) {
    case "BidPublic": case "SubmitSealedBid": case "WithdrawPublic": return "auction";
    case "BuyStockOrSkip": return "stock";
    case "AssignShips": return "dispatch";
    case "PlaceCrewOrPass": return action.placement ? "placement" : null;
    case "Sail": case "ApplyPilotMoves": case "PirateBoardOrDecline": case "PirateTakeoverDecision": return "sail";
    case "VoteReturnOption": case "RedeemCrew": return "return";
    case "CampChoice": return action.crewId || action.crewIds?.length ? "return" : null;
    default: return null;
  }
}

const quickHint = {
  auction: "查看當季事件，再確認出價或選擇 PASS。",
  stock: "選擇可購買的股票，或放棄認購。",
  dispatch: "選擇三種貨物與起點，再確認派船。",
  placement: "點選選席或下注位，查看實付費用再確認。",
  sail: "按畫面上的合法按鈕擲骰或領航。",
  return: "按畫面上的合法選項投票、轉職或贖回。",
};

function overlaps(box, left, top, width, height) {
  return box.left < left + width && box.right > left && box.top < top + height && box.bottom > top;
}

export function focusTutorial(app, button, rulesURL) {
  const card = document.createElement("aside");
  card.className = "tutorial-card";
  card.setAttribute("aria-label", "操作教學");
  card.hidden = true;
  const dock=document.createElement("div");
  dock.className="tutorial-dock";
  dock.append(card);
  app.before(dock);
  const frame = document.createElement("div");
  frame.className = "tutorial-focus";
  frame.setAttribute("aria-hidden", "true");
  frame.hidden = true;
  document.body.append(frame);
  const safeArea = document.createElement("div");
  safeArea.className = "tutorial-safe-area";
  const hint = document.createElement("aside");
  hint.className = "tutorial-hint";
  hint.setAttribute("aria-label", "目前教學提示");
  hint.hidden = true;
  const hintCopy = document.createElement("div");
  const hintTitle = document.createElement("strong");
  const hintText = document.createElement("span");
  const detailsButton = document.createElement("button");
  detailsButton.type = "button";
  detailsButton.textContent = "完整說明";
  hintCopy.append(hintTitle,hintText);
  hint.append(hintCopy,detailsButton);
  safeArea.append(hint);
  document.body.append(safeArea);
  const completed = new Set(), skipped = new Set();
  let mode = "off", state, browsing, pending, latest, schedule = 0, target;
  let resize, dialogs;
  const mobile = matchMedia("(max-width: 760px)");

  function visible(element) {
    if (!element.checkVisibility({visibilityProperty:true})) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function viewport() {
    const safe = safeArea.getBoundingClientRect();
    const view = window.visualViewport;
    const left = view?.offsetLeft ?? 0;
    const top = view?.offsetTop ?? 0;
    return {
      left:Math.max(safe.left,left)+8,
      top:Math.max(safe.top,top)+8,
      right:Math.min(safe.right,left+(view?.width ?? innerWidth))-8,
      bottom:Math.min(safe.bottom,top+(view?.height ?? innerHeight))-8,
    };
  }
  function move(element, left, top) {
    element.style.left=left+"px";
    element.style.top=top+"px";
  }
  function visibleControls(box) {
    return [...document.querySelectorAll("header, #stream, #app :is(button,input,select,textarea):enabled, #app summary, #app a[href]")]
      .filter(visible).map(el=>el.getBoundingClientRect())
      .filter(rect=>overlaps(rect,box.left,box.top,box.right-box.left,box.bottom-box.top));
  }
  function floatBeside(bounds, anchor, obstacles) {
    const {width,height}=card.getBoundingClientRect();
    const {left,top,right,bottom}=bounds;
    if (!anchor || width>right-left || height>bottom-top) return false;
    const centerX=(anchor.left+anchor.right-width)/2;
    const centerY=(anchor.top+anchor.bottom-height)/2;
    const clampX=x=>Math.max(left,Math.min(x,right-width));
    const clampY=y=>Math.max(top,Math.min(y,bottom-height));
    const gap=12;
    const points = [
      ...[anchor.right+gap,anchor.left-width-gap].flatMap(x=>[centerY,anchor.top,anchor.bottom-height].map(y=>[x,clampY(y)])),
      ...[anchor.bottom+gap,anchor.top-height-gap].flatMap(y=>
        [centerX,anchor.left,anchor.right-width,right-width,left].map(x=>[clampX(x),y])),
    ];
    // Fit after adjacent controls such as the dispatch panel's disclosure rows.
    const nearbyRows=obstacles.flatMap(box=>[box.bottom+gap,box.top-height-gap])
      .filter(y=>y>=anchor.bottom+gap && y-anchor.bottom<=110 ||
        y+height<=anchor.top-gap && anchor.top-y-height<=110)
      .sort((a,b)=>Math.max(a-anchor.bottom,anchor.top-a-height)-Math.max(b-anchor.bottom,anchor.top-b-height));
    for (const y of nearbyRows)
      for (const x of [centerX,anchor.left,anchor.right-width]) points.push([clampX(x),y]);
    const point=points.find(([x,y])=>x>=left && y>=top && x+width<=right && y+height<=bottom &&
      !obstacles.some(box=>overlaps(box,x-4,y-4,width+8,height+8)));
    if (!point) return false;
    move(card,...point);
    return true;
  }
  function pinHint(bounds, obstacles) {
    const available=bounds.right-bounds.left;
    if (available<220) return;
    hint.hidden=false;
    hint.style.width=Math.min(available,380)+"px";
    const {width,height}=hint.getBoundingClientRect();
    const left=(bounds.left+bounds.right-width)/2;
    const bottom=bounds.bottom-height;
    const candidates=[bottom,bounds.top,...obstacles.map(box=>box.top-height-8)].sort((a,b)=>b-a);
    const top=candidates.find(y=>y>=bounds.top && y<=bottom &&
      !obstacles.some(box=>overlaps(box,left-4,y-4,width+8,height+8)));
    hint.hidden=top==null;
    if (!hint.hidden) move(hint,left,top);
  }
  function position(initial=false) {
    schedule = 0;
    const suspended = app.inert || Boolean(document.querySelector("dialog[open]"));
    hint.hidden = true;
    card.classList.toggle("tutorial-suspended",suspended);
    frame.hidden = true;
    if (suspended || card.hidden) return;
    const bounds=viewport();
    const anchor=()=>target?.isConnected && visible(target) ? target.getBoundingClientRect() : null;
    let rect=anchor();
    const inView=rect && overlaps(rect,bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top);
    const obstacles=visibleControls(bounds);
    if (rect) obstacles.push(rect);
    const floating=card.classList.contains("tutorial-floating");
    const placed=floating && inView && floatBeside(bounds,rect,obstacles);
    // Only choose in-flow layout when rendering content, never during a scroll or resize.
    if (initial && floating && !placed) {
      card.classList.remove("tutorial-floating");
      // A full-width action may have no spare space beside it. Keep the
      // explanation just after the button so the control itself stays put.
      if (target?.matches("#dispatch, #roll-sail, #bid")) {
        target.after(card);
        card.classList.add("tutorial-local");
      }
      rect=anchor();
    }
    card.classList.toggle("tutorial-offscreen",!initial && floating && !placed);
    const cardRect=card.getBoundingClientRect();
    if(mode==="active" && ((!initial && floating && !placed) || cardRect.top<bounds.top || cardRect.bottom>bounds.bottom))
      pinHint(bounds,obstacles);
    if (!rect) return;
    const x=Math.max(bounds.left,rect.left), y=Math.max(bounds.top,rect.top);
    const right=Math.min(bounds.right,rect.right), bottom=Math.min(bounds.bottom,rect.bottom);
    if(right<=x || bottom<=y || !target.contains(document.elementFromPoint((x+right)/2,(y+bottom)/2))) return;
    move(frame,x,y);
    frame.style.width=(right-x)+"px";
    frame.style.height=(bottom-y)+"px";
    frame.hidden=false;
  }
  function reposition() {
    if(!schedule) schedule=requestAnimationFrame(()=>position());
  }
  function viewportResized() {
    if (mobile.matches && target?.matches("button") && document.activeElement===target &&
        !document.querySelector("dialog[open]"))
      target.scrollIntoView({block:"center",behavior:"instant"});
    reposition();
  }
  function stopTracking() {
    resize?.disconnect();
    dialogs?.disconnect();
    removeEventListener("scroll", reposition, true);
    removeEventListener("resize", viewportResized);
    mobile.removeEventListener("change", deviceChanged);
    document.removeEventListener("keydown", escapeGuide);
    visualViewport?.removeEventListener("resize",reposition);
    visualViewport?.removeEventListener("scroll",reposition);
    cancelAnimationFrame(schedule);
    schedule=0;
    frame.hidden=true;
    frame.removeAttribute("style");
    hint.hidden=true;
    hint.removeAttribute("style");
    card.classList.remove("tutorial-floating","tutorial-offscreen","tutorial-suspended","tutorial-local");
    card.removeAttribute("style");
    if (card.parentNode!==dock) dock.append(card);
  }
  function track() {
    resize=new ResizeObserver(reposition);
    resize.observe(app);
    if(target) resize.observe(target);
    dialogs=new MutationObserver(records=>{
      if(records.some(({target})=>target!==card && target!==frame && !card.contains(target) && !safeArea.contains(target))) reposition();
    });
    dialogs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["open","hidden","inert"]});
    addEventListener("scroll",reposition,{capture:true,passive:true});
    addEventListener("resize",viewportResized);
    mobile.addEventListener("change",deviceChanged);
    document.addEventListener("keydown",escapeGuide);
    visualViewport?.addEventListener("resize",reposition);
    visualViewport?.addEventListener("scroll",reposition);
  }
  function deviceChanged(){paint();}
  function paint(focusSelector) {
    const focused=focusSelector ?? document.activeElement?.dataset.tutorialControl;
    stopTracking();
    button.textContent=mode==="paused"?"繼續教學":mode==="active"?"暫停教學":"教學";
    if (mode === "off" || mode === "paused" || !state) {
      card.hidden=true;
      return;
    }
    const [current,key,controls,fallback]=activity(state.view,state.legal,state.event);
    const index=browsing ?? current;
    const [title,description,rule]=lessons[index];
    const interactive=mode==="active" && index===current && !state.event &&
      controls && !completed.has(key) && !skipped.has(key);
    const candidates = interactive ? [...app.querySelectorAll(controls)].filter(visible) : [];
    // A ship's larger mobile entry precedes individual seats on short screens.
    target = candidates.find(el=>mobile.matches && el.hasAttribute("data-ship-seats")) ??
      candidates[0] ?? (index===current ? [...app.querySelectorAll(fallback)].find(visible) :
        index===0 ? [...app.querySelectorAll(".players")].find(visible) : undefined);
    const watching=state.event?.controller==="ai"?"此動作由 AI 執行。" :
      index===current && !state.event && !controls && [1,2,3,4,5].includes(index) ?
        "此時沒有本步的合法操作，可先閱讀說明。" : "目前可先閱讀說明。";
    const copy=index===5 && state.view.act===2 ?
      "第二幕是官府包銷。依入港順位發放回程收益，本幕沒有回程投票、走私擲骰與緝私營。" : description;
    hintTitle.textContent=title;
    hintText.textContent=interactive && candidates.length ? quickHint[key] : latest ?
      "操作完成 · "+latest : index===5 && state.view.act===2 ? "本幕依入港順位包銷，無須投票。" : watching;
    // Rule URL comes from the existing route, including the Pages build prefix.
    card.innerHTML = mode==="offer"
      ? '<h2>一起熟悉棋盤？</h2><p>在本局操作，隨時暫停或關閉提示。</p><div><button data-tutorial-control="begin">開始操作教學</button><button data-tutorial-control="close">直接遊玩</button></div>'
      : `<div class="tutorial-heading"><h2>${title}</h2><span>${index+1}／${lessons.length}</span></div>
         <p>${copy}</p><p class="tutorial-status" role="status">${latest ? "操作完成 · "+latest+"。 " : ""}${interactive && candidates.length ? "請在棋盤確認合法操作。" : watching}</p>
         <div class="tutorial-controls">
           <button data-tutorial-control="back" ${index===0?"disabled":""}>上一個說明</button>
           ${interactive && candidates.length ? '<button data-tutorial-control="skip">略過這步</button>' :
             `<button data-tutorial-control="next" ${index===6?"disabled":""}>下一步</button>`}
           ${target?'<button data-tutorial-control="locate">查看位置</button>':""}
           <button data-tutorial-control="restart">從頭重看</button>
           <button data-tutorial-control="close">關閉教學</button>
           <a data-tutorial-rules>規則</a>
         </div>`;
    const link=card.querySelector("[data-tutorial-rules]");
    if(link){link.href=rulesURL+"#"+rule;link.target="_blank";link.rel="noopener";}
    if(mode==="offer") target=undefined;
    card.dataset.lesson=String(index+1);
    card.hidden=false;
    card.classList.toggle("tutorial-floating",!mobile.matches && mode==="active" && Boolean(target));
    track();
    position(true);
    if(focused && !card.hidden && !card.classList.contains("tutorial-suspended")) {
      const replacement=card.querySelector(`[data-tutorial-control="${focused}"]:enabled`);
      (replacement ?? button).focus({preventScroll:true});
    }
  }
  detailsButton.onclick=()=>{
    if (card.classList.contains("tutorial-floating")){
      card.classList.remove("tutorial-floating","tutorial-offscreen");
      card.removeAttribute("style");
    }
    card.scrollIntoView({block:"center",behavior:"instant"});
    card.querySelector("button:enabled")?.focus({preventScroll:true});
    position();
  };
  button.onclick=()=>{
    mode=mode==="active"?"paused":"active";
    paint(mode==="active"?"locate":undefined);
  };
  card.onclick=({target:clicked})=>{
    const control=clicked.closest("[data-tutorial-control]")?.dataset.tutorialControl;
    if(!control) return;
    const [index,key]=activity(state.view,state.legal,state.event);
    if(control==="locate"){
      target?.scrollIntoView({block:"center",behavior:"instant"});
      if(target?.matches("button:not(:disabled), input, select, a[href]")) target.focus({preventScroll:true});
      reposition();
      return;
    }
    if(control==="close") {mode="off";button.focus({preventScroll:true});}
    if(control==="begin") {mode="active";browsing=0;}
    if(control==="restart") browsing=0;
    if(control==="skip") {skipped.add(key);browsing=null;}
    if(control==="back") browsing=Math.max(0,(browsing??index)-1);
    if(control==="next"){
      const next=(browsing??index)+1;
      browsing=next===index?undefined:next;
    }
    paint();
  };
  function escapeGuide(event){
    if(event.key!=="Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    mode="paused";
    paint();
    button.focus({preventScroll:true});
  }
  return {
    reset() {
      stopTracking();
      completed.clear();skipped.clear();
      state=browsing=pending=latest=undefined;
      mode="off";card.hidden=true;button.hidden=true;
    },
    begin(){mode="active";paint();},
    skipped(){return new Set(skipped);},
    offer(){if(mode==="off"){mode="offer";paint();}},
    sending(data, view) {
      if(!data.action && !data.batch) return;
      const action=data.batch ? {...data.batch,type:"VoteReturnOption"} : data.action;
      const key=actionKey(action);
      pending=mode==="active" && action && key ? {key,type:action.type,actor:view.selfId,version:view.version+1} : null;
    },
    render(view,legal,event,logs) {
      state={view,legal,event};
      button.hidden=false;
      if(pending && !event) {
        if(logs.some(entry=>entry.version===pending.version && entry.actor===pending.actor &&
          entry.type===pending.type && entry.controller==="human")){
          completed.add(pending.key);
          latest=lessons[activityKeyIndex[pending.key]][0];
          browsing=undefined;
        }
        pending=null;
      }
      paint();
    },
  };
}

const activityKeyIndex={auction:1,stock:2,dispatch:2,placement:3,sail:4,return:5};
