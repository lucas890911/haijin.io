// Amounts come from the caller's projected game data, including its sign.
export function silverAmount(value) {
  return '<span class="silver-amount">'+value+silverUnitWithSpace+'</span>';
}

export const silverIconUrl = new URL("./silver-ingot.png", import.meta.url).href;
export const silverUnit = '<span class="silver-unit" title="銀兩">銀</span>';
const silverUnitWithSpace = silverUnit.replace(">銀", "> 銀");
const amountPattern = /([+−–-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?) *(銀)(?!兩)/g;

// Format composed event and action sentences after their text has been rendered.
export function formatLiveAmounts(root) {
  const selector = "script,style,select,textarea,svg,.silver-amount,.silver-unit";
  function format(node) {
    if (!node.parentElement || !node.parentElement.closest("#app, dialog") ||
        node.parentElement.closest(selector)) return;
    const text = node.data;
    const matches = [...text.matchAll(amountPattern)];
    if (!matches.length) return;
    const fragment = document.createDocumentFragment();
    let start = 0;
    for (const match of matches) {
      fragment.append(text.slice(start, match.index));
      const amount = document.createElement("span");
      amount.className = "silver-amount";
      amount.textContent = match[1];
      amount.insertAdjacentHTML("beforeend", silverUnit);
      amount.lastChild.textContent = match[0].slice(match[1].length);
      fragment.append(amount);
      start = match.index + match[0].length;
    }
    fragment.append(text.slice(start));
    node.replaceWith(fragment);
  }
  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) return format(node);
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches(selector)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const leaves = [];
    while (walker.nextNode()) leaves.push(walker.currentNode);
    leaves.forEach(format);
  }
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") format(record.target);
      else for (const node of record.addedNodes) visit(node);
    }
  }).observe(root, {subtree:true,childList:true,characterData:true});
}
