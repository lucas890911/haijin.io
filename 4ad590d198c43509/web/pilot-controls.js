// Use the host's ordered action candidates for both pointer and touch controls.
export function pilotDestinations(ships, candidates, prefix, shipId) {
  const ship = ships.find(ship => ship.id === shipId);
  const origin = pilotPosition(ship, prefix);
  const byCell = new Map();
  for (const action of candidates) {
    const remainder = action.moves.slice(prefix.length);
    if (!remainder.length || !remainder.every(move => move.shipId === shipId) ||
        !prefix.every((step, i) => step.shipId === action.moves[i].shipId && step.delta === action.moves[i].delta)) continue;
    const cell = pilotPosition(ship, action.moves);
    if (cell === origin) continue;
    const previous = byCell.get(cell);
    if (!previous || previous.moves.length > action.moves.length) byCell.set(cell,action);
  }
  return [...byCell].map(([cell, action]) => ({cell, action}));
}

function pilotPosition(ship, moves) {
  return ship.position + moves.filter(move => move.shipId === ship.id).reduce((sum, move) => sum + move.delta, 0);
}

export function bindPilotControls(panel, board, view, candidates, actions, goods, label, submit) {
  const pass = candidates.find(action => !action.moves.length);
  const budget = Math.max(...candidates.map(action => action.moves.length));
  const ships = view.ships;
  const name = ship => goods[ship.good] + "船";
  const button = (text, click) => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = text;
    node.onclick = click;
    return node;
  };
  let chosen = pass, shipId;
  panel.className = "pilot-controls";
  panel.innerHTML = '<strong></strong><p class="pilot-status" aria-live="polite"></p><div class="pilot-ship-options"></div><div class="pilot-destination-options"></div><div class="pilot-buttons"></div>';
  panel.querySelector("strong").textContent = (view.phase === "PILOT_LARGE" ? "大領航員" : "小領航員") + " · " + view.selfId + " 席";
  const reset = button("重置", () => { chosen = pass; shipId = undefined; update(); });
  const decline = button("放棄領航", () => {
    const dialog = document.createElement("dialog");
    dialog.className = "bet-dialog pass-dialog";
    dialog.setAttribute("aria-label", "放棄領航");
    dialog.innerHTML = '<h2>放棄領航</h2><p>確認後將推進遊戲。</p><div class="bet-footer"></div>';
    const back = button("返回棋盤", () => dialog.close());
    back.dataset.passCancel = "";
    const proceed = button("確認放棄", () => { dialog.close(); submit(pass); });
    proceed.dataset.passConfirm = "";
    dialog.querySelector(".bet-footer").append(back, proceed);
    dialog.onclose = () => { dialog.remove(); decline.focus({preventScroll:true}); };
    panel.append(dialog);
    dialog.showModal();
  });
  decline.dataset.pilotPass = "";
  const confirm = button("確認領航", () => { if (chosen.moves.length) submit(chosen); });
  confirm.className = "primary";
  confirm.dataset.pilotConfirm = "";
  reset.dataset.pilotReset = "";
  panel.querySelector(".pilot-buttons").append(reset, decline, confirm);
  const funding = actions.filter(action => ["PledgeStock", "RedeemPledgedStock"].includes(action.type));
  if (funding.length) {
    const funds = document.createElement("details");
    funds.innerHTML = "<summary>股票與資金</summary>";
    for (const action of funding) funds.append(button(label(action, view), () => submit(action)));
    panel.append(funds);
  }
  function update(focusKey) {
    const prefix = chosen.moves;
    const selectShip = panel.querySelector(".pilot-ship-options");
    const selectDestination = panel.querySelector(".pilot-destination-options");
    selectShip.replaceChildren();
    selectDestination.replaceChildren();
    board.querySelectorAll(".pilot-cell-button,.pilot-ghost").forEach(node => node.remove());
    board.querySelectorAll(".pilot-target,.planned,.pilot-eligible,.pilot-origin,.pilot-selected").forEach(node => node.classList.remove("pilot-target","planned","pilot-eligible","pilot-origin","pilot-selected"));
    for (const ship of ships) {
      const track = board.querySelector('[data-lane="'+ship.id+'"] .track');
      const at = cell => track.querySelector('[data-step="'+cell+'"]');
      const current = pilotPosition(ship, prefix);
      if (prefix.some(move => move.shipId === ship.id)) {
        at(ship.position).classList.add("pilot-origin");
        const ghost = document.createElement("i");
        ghost.className = "pilot-ghost";
        ghost.setAttribute("aria-hidden","true");
        ghost.textContent = (current>ship.position?"↑":current<ship.position?"↓":"↔")+" ⛵";
        at(current).classList.add("planned");
        at(current).append(ghost);
      }
      const options = pilotDestinations(ships,candidates,prefix,ship.id);
      if (!options.length) continue;
      const select = () => { shipId = ship.id; update("ship-"+ship.id); };
      const shipButton = button(name(ship), select);
      shipButton.dataset.pilotShip = ship.id;
      shipButton.dataset.focusKey = "ship-"+ship.id;
      shipButton.setAttribute("aria-pressed", String(shipId === ship.id));
      selectShip.append(shipButton);
      const marker = button("選擇"+name(ship)+"，目前第 "+current+" 格", () => {
        shipId = ship.id;
        update("cell-"+ship.id);
      });
      marker.className = "pilot-cell-button pilot-ship-button";
      marker.dataset.pilotShip = ship.id;
      marker.dataset.focusKey = "cell-"+ship.id;
      marker.setAttribute("aria-pressed", String(shipId === ship.id));
      at(current).classList.add("pilot-eligible");
      at(current).append(marker);
      if (shipId !== ship.id) continue;
      at(current).classList.add("pilot-selected");
      for (const {action,cell} of options) {
        const preview = () => { chosen = action; update("confirm"); };
        const text = name(ship)+" → 第 "+cell+" 格";
        const target = button(text, preview);
        target.className = "pilot-cell-button pilot-target-button";
        target.dataset.pilotCell = cell;
        target.dataset.pilotSteps = action.moves.length - prefix.length;
        at(cell).classList.add("pilot-target");
        at(cell).append(target);
        const touch = button("第 "+cell+" 格", preview);
        touch.dataset.pilotCell = cell;
        touch.dataset.pilotSteps = target.dataset.pilotSteps;
        selectDestination.append(touch);
      }
    }
    if (!selectShip.childElementCount) selectShip.textContent = "已用完可調整額度";
    if (!selectDestination.childElementCount) selectDestination.textContent = prefix.length === budget ? "可確認或重置預覽" : "選船後顯示合法目標";
    confirm.dataset.focusKey = "confirm";
    confirm.disabled = reset.disabled = !prefix.length;
    const routes = ships.filter(ship => prefix.some(move => move.shipId === ship.id))
      .map(ship => name(ship)+" "+ship.position+" → "+pilotPosition(ship,prefix)+" 格");
    const prompt = selectDestination.childElementCount ? "選擇目標格" : "選擇商船";
    panel.querySelector(".pilot-status").textContent = (routes.join("、") || prompt) +
      " · 已調整 "+prefix.length+" 次 · 剩餘 "+(budget-prefix.length)+"／"+budget+" 格";
    if (focusKey) {
      const focus = [...panel.querySelectorAll("[data-focus-key]"),...board.querySelectorAll("[data-focus-key]")]
        .find(node => node.dataset.focusKey === focusKey);
      focus?.focus({preventScroll:true});
    }
  }
  update();
}
