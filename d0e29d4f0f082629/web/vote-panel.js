import { RULES } from "../dist/packages/shared/src/index.js";
const names = {
  safe: "安全返航",
  cloth: "布匹",
  porcelain: "瓷器",
  weapons: "軍武",
};
export function votePanel(area, v, actions, submit) {
  const ballots = actions.filter((a) => a.type === "VoteReturnOption");
  if (!ballots.length) return false;
  const first = ballots[0],
    ballot = v.returnVotes.find((b) => b.shipId === first.shipId);
  const available = ballots.filter((a) => a.shipId === first.shipId);
  const crews = ballot.electorate
    .filter((c) => available.some((a) => a.crewId === c.crewId))
    .map((c) => c.crewId);
  const options = [...new Set(available.map((a) => a.option))];
  const title = (o) =>
    names[o] +
    (o === "safe"
      ? ""
      : v.act === 2
        ? " · 整船 " +
          (RULES.returnTerms[o][3] + v.effects.stableReturnAdjustment) +
          " 銀"
        : " · " + RULES.returnTerms[o][0] + " 點以上成功");
  const choices = options
    .map((o) => '<option value="' + o + '">' + title(o) + "</option>")
    .join("");
  const token = (id) => v.selfId + "-" + id.split("-").at(-1);
  area.innerHTML =
    '<section class="vote-panel"><h3>' +
    first.shipId.replace("ship-", "船 ") +
    "｜第 " +
    ballot.round + " · 已投 "+ballot.submittedCrewIds.length+"／"+ballot.electorate.length+" · 未投 "+(ballot.electorate.length-ballot.submittedCrewIds.length) +
    " 輪" +
    (ballot.round === 2 ? "重新投票" : "") +
    "</h3><p>你有 " +
    crews.length +
    " 枚待投棋子，可投 " +
    crews.length +
    ' 票。</p><label>共同選項<select id="vote-common">' +
    choices +
    '</select></label><details id="vote-split"><summary>分別投票</summary>' +
    crews
      .map(
        (id) =>
          "<label>" +
          token(id) +
          '<select data-vote-crew="' +
          id +
          '">' +
          choices +
          "</select></label>",
      )
      .join("") +
    '</details><div id="vote-preview" aria-live="polite"></div><button id="vote-confirm" class="primary">確認投出 ' +
    crews.length +
    " 票</button></section>";
  const common = area.querySelector("#vote-common"),
    split = area.querySelector("#vote-split"),
    individual = [...area.querySelectorAll("[data-vote-crew]")];
  function preview() {
    area.querySelector("#vote-preview").textContent = individual
      .map(
        (el) =>
          token(el.dataset.voteCrew) +
          " → " +
          names[split.open ? el.value : common.value],
      )
      .join("、");
  }
  common.onchange = () => {
    individual.forEach((el) => (el.value = common.value));
    preview();
  };
  split.ontoggle = preview;
  individual.forEach((el) => (el.onchange = preview));
  preview();
  area.querySelector("#vote-confirm").onclick = () =>
    submit({
      actorId: v.selfId,
      expectedVersion: v.version,
      season: v.season,
      shipId: first.shipId,
      round: ballot.round,
      votes: individual.map((el) => ({
        crewId: el.dataset.voteCrew,
        option: split.open ? el.value : common.value,
      })),
    });
  return true;
}
