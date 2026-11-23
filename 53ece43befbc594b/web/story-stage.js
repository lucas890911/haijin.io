import {chapterCover} from "./story-covers.js";

// The chapter reader has no reference to the host, its commands or its random stream.
const titles = ["國姓渡海", "海禁與軍需", "反攻閩南", "海疆危局"];
const captions = ["國破山河在，孤帆渡海來", "海禁森嚴，商舶難通", "閩海烽煙再起", "潮迴風急，商路未歇"];
const paragraphs = [
  ["1644 年，北京陷落。明廷失去北方都城，南明的抗清烽火仍在南方延續。",
   "1661 年，鄭成功率舟師東渡，進攻荷蘭東印度公司在大員的據點。1662 年，熱蘭遮城守軍投降，公司撤出臺灣。",
   "鄭氏以臺灣為基地經營海上商路。水師的糧餉要靠船載來，海商的家業也繫在這一趟潮水上。"],
  ["水師要糧，軍需待運。海口雖有巡船，商人仍得決定，返航時要讓哪一批貨登船。"],
  ["十七世紀七〇年代，鄭經乘三藩之亂西進，參與閩南戰事。這一幕借取西征背景：軍需日盛，官府開始統籌船運。"],
  ["西征戰事漸歇，海疆風雲更急。封鎖與追緝再至。最後兩季，你要冒險再走一船，還是先保全家業？"],
];
function rules(page, opening) {
  if (!page) return "競標船長、配置手下、出航、回程。終局以正式財富決定名次。";
  if (page === 1) return "回程開放走私與緝私營。軍武走私成功可得水師令旗；第一幕軍武成功次數決定本局是否延長。";
  if (page === 3) return "最後兩季恢復回程走私與緝私營。軍武成功入港後的回程整船收益提高。";
  const outcome = opening.extended ? "本局延長為八季，第二幕為第 4～6 季。" : "本局維持七季，第二幕為第 4～5 季。";
  return "第一幕軍武走私成功 " + opening.successes + " 次。" + outcome +
    " 官府包銷取代回程投票與走私擲骰，緝私營暫停。持旗者每季第三次成功的一般配置免費；船員被海盜踢下時，公庫補償該枚船員實付的船位費。";
}

const memory = new Map();
export function chapterPrefs(id) {
  const key = "haijin.chapters.1." + id;
  let value = memory.get(key);
  if (!value) {
    try { value = JSON.parse(localStorage.getItem(key)); } catch {}
    value ||= {read:0, skip:false};
    memory.set(key,value);
  }
  return {value, save(){try {localStorage.setItem(key,JSON.stringify(value));} catch {}}};
}

export function floatingReader(onClose) {
  const focus = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "chapter-reader";
  dialog.setAttribute("aria-labelledby","chapter-title");
  dialog.onclose = () => {dialog.remove(); if(focus?.isConnected)focus.focus(); onClose();};
  document.body.append(dialog);
  return dialog;
}

export function readChapters(openings, first, review, reduced, prefs, done) {
  const dialog = floatingReader(done);
  dialog.classList.toggle("still",reduced);
  const last = openings.at(-1).act;
  function show(page) {
    const opening = openings.find(o=>o.act === (page || 1));
    dialog.dataset.chapter=page;
    const label = page ? "第 " + page + " 幕　／　第 " + opening.season + " 貿易季" : "歷史序章　／　1644—1662";
    dialog.innerHTML = '<div class="chapter-paper">'+chapterCover(page)+'<article><small class="chapter-time">'+label+'</small><h2 id="chapter-title">'+titles[page]+'</h2><div class="chapter-narration"><h3>'+captions[page]+'</h3>'+
      paragraphs[page].map(p=>'<p>'+p+'</p>').join('')+'</div><aside>'+rules(page,opening)+'</aside></article></div><footer>'+
      (review && page ? '<button data-back>上一章</button>' : '')+
      (!review ? '<button data-story-skip>本局略過劇情</button>' : '')+
      '<button data-continue class="primary">'+(page < last ? "下一章" : "繼續遊戲")+'</button></footer>';
    dialog.querySelector("[data-continue]").onclick=()=> page<last ? show(page+1) : dialog.close();
    const back=dialog.querySelector("[data-back]");
    if(back)back.onclick=()=>show(page-1);
    const skip=dialog.querySelector("[data-story-skip]");
    if(skip)skip.onclick=()=>{prefs.value.skip=true;prefs.save();dialog.close();};
    dialog.querySelector("[data-continue]").focus();
  }
  show(first);
  dialog.showModal();
}
