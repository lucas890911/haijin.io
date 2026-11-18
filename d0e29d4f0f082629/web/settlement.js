const names={dividend:"船員去程分紅","pirate-dividend":"海盜去程分紅",return:"回程分紅",port:"港口獎金",dock:"停泊獎金",insurance:"保險收入",reimbursement:"保險理賠","camp-prize":"緝私營賞金","camp-refund":"緝私退費","flag-pension":"軍功撫恤",commission:"皇商牌照","flag-award":"令旗賞銀","final-ransom":"強制贖金",ransom:"贖金",placement:"配置費",stock:"認購",auction:"船長標金",pledge:"抵押借款",redeem:"股票贖回",camp:"緝私轉職"};
export const flowName=f=>names[f.category]??f.category;
export function stagesFor(e,skip){
  if(skip)return [];
  const dice=e.presentation?.dice??[];
  if(e.type==='ResolveReturns' && dice.length){
    const byShip=dice.flatMap((d,index)=>[{kind:'roll',dice:[d],index},{kind:'reveal',dice:[d],index},{kind:'resolve',dice:[d],index},...(e.presentation.flows.filter(f=>f.shipId===d.shipId && f.delta && names[f.category]).map(flow=>({kind:'money',flow,index}))) ]);
    return [...byShip,...e.presentation.flows.filter(f=>!f.shipId && f.delta && names[f.category]).map(flow=>({kind:'money',flow}))];
  }
  const groups=e.type==='Sail'?[dice]:dice.map(d=>[d]);
  const phases=groups.filter(g=>g.length).flatMap(dice=>[{kind:'roll',dice},{kind:'reveal',dice}]);
  if(e.type==='Sail' && dice.length)phases.push({kind:'move',dice});
  for(const flow of e.presentation?.flows??[])if(flow.delta && names[flow.category])phases.push({kind:'money',flow});
  return phases;
}
export function showStage(stage,frame,flows){
  if(!stage)return;
  const bar=document.querySelector('.stream-summary');
  bar.querySelector('p')?.remove();
  if(stage.dice && stage.kind!=='move'){
    const row=document.createElement('div');row.className='dice-row';
    for(const d of stage.dice){
      const badge=document.createElement('span');badge.className='die '+stage.kind;badge.dataset.ship=d.shipId;
      if(frame.phase.startsWith('SAIL') || frame.voyageBefore?.phase?.startsWith('SAIL')){
        badge.className='solid-dice '+stage.kind;
        for(const value of d.values){const face=document.createElement('span');face.className='dice-face';face.dataset.value=stage.kind==='roll'?'5':value;for(let n=1;n<=9;n++){const dot=document.createElement('i');dot.dataset.dot=n;face.append(dot);}badge.append(face);}
        const label=document.createElement('small');label.textContent='船 '+d.shipId.split('-')[1]+(stage.kind==='roll'?'':' · '+d.values.join(' + ')+' 點 · '+d.result);badge.append(label);
      }else badge.textContent='船 '+d.shipId.split('-')[1]+'　'+(stage.kind==='roll'?'擲骰中':d.values.join(' + ')+' 點 · '+d.result);row.append(badge);
    }
    if(stage.dice.length && (frame.phase.startsWith('SAIL') || frame.voyageBefore?.phase?.startsWith('SAIL'))){const layer=document.createElement('div');layer.className='dice-overlay';const title=document.createElement('h3');title.textContent=stage.kind==='roll'?'擲骰中…':'正式骰點';layer.append(title,row);document.querySelector('.chart').prepend(layer);}else bar.prepend(row);
  }
  if(stage.kind!=='money')return;
  const f=stage.flow;
  const caption=document.createElement('p');caption.textContent=(f.shipId?f.shipId.replace('ship-','船 ')+' · ':'')+flowName(f)+' · '+f.playerId+' '+(f.delta>0?'+':'')+f.delta+' 銀';bar.prepend(caption);
  for(const p of frame.players){
    const upcoming=flows.slice(flows.indexOf(f)).find(x=>x.playerId===p.id);
    const cash=document.querySelector('[data-cash="'+p.id+'"]');
    if(cash && upcoming)cash.textContent=(upcoming.balance-upcoming.delta)+' 銀';
  }
  const cash=document.querySelector('[data-cash="'+f.playerId+'"]');
  const vessel=f.shipId && document.querySelector('[data-token="'+f.shipId+'"]');
  vessel?.classList.add('receipt-hit');
  const source=document.querySelector(f.category.startsWith('camp')?'[data-camp]':f.category.includes('ransom')?'.prison':f.positionId?'[data-pos="'+f.positionId+'"]':f.shipId?'[data-token="'+f.shipId+'"]':'.chart')??bar;
  source.classList.add('receipt-hit');
  const chip=document.createElement('span');chip.className='cash-flight';
  chip.textContent=(f.delta>0?'+':'−')+Math.abs(f.delta);chip.classList.toggle('loss',f.delta<0);chip.style.borderColor=['#af6346','#387c87','#79678e','#937523'][frame.players.findIndex(p=>p.id===f.playerId)];chip.title=flowName(f);
  const from=source.getBoundingClientRect(),to=cash.getBoundingClientRect();
  chip.style.left=from.x+'px';chip.style.top=from.y+'px';document.querySelector('#app').append(chip);
  const motion=chip.animate([{transform:'none'},{transform:'translate('+(to.x-from.x)+'px,'+(to.y-from.y)+'px)'}],{duration:stage.duration*.78,fill:'forwards',easing:'cubic-bezier(.3,.05,.25,1)'});
  const resized=()=>{motion.cancel();cash.textContent=f.balance+' 銀';chip.remove();};
  window.addEventListener('resize',resized,{once:true});
  motion.onfinish=()=>{window.removeEventListener('resize',resized);cash.textContent=f.balance+' 銀';cash.animate([{transform:'scale(1.1)',color:'#967024'},{transform:'none'}],250);chip.remove();};
}
export function summaryDialog(e,logs,ended,onClose){
  const d=document.createElement('dialog');d.className='season-summary';
  const title=document.createElement('h2');title.textContent='第 '+e.season+' 季 · '+(ended?'終局結算':'季末結算');d.append(title);
  const list=document.createElement('div');list.className='summary-body';
  const events=logs.filter(x=>x.season===e.season && x.version<=e.version);
  for(const x of events.filter(x=>['PirateBoardOrDecline','PirateTakeoverDecision','SettleOutbound','ResolveReturns','RedeemCrew','EndSeason'].includes(x.type))){
    const block=document.createElement('details');block.open=false;
    const heading=document.createElement('summary');heading.textContent=({SettleOutbound:'去程、股票及包銷',ResolveReturns:'回程、緝私與令旗',EndSeason:'季末及終局',PirateBoardOrDecline:'海盜登船',PirateTakeoverDecision:'共同劫船',RedeemCrew:'贖回船員'}[x.type]??x.type);block.append(heading);
    for(const line of x.lines.slice(1)){const p=document.createElement('p');p.textContent=line;block.append(p);}list.append(block);
  }
  const net=Object.fromEntries(['A','B','C','D'].map(id=>[id,0]));
  for(const x of events)for(const f of x.presentation?.flows??[])net[f.playerId]+=f.delta;
  const total=document.createElement('p');total.textContent='本季現銀淨變動　'+Object.entries(net).map(([p,v])=>p+' '+(v>=0?'+':'')+v+' 銀').join('　');d.append(total,list);
  const button=document.createElement('button');button.id='season-confirm';button.className='primary';button.textContent=ended?'確認終局明細':'確認結算';button.onclick=()=>{d.close();d.remove();onClose?.();};d.append(button);
  d.oncancel=ev=>ev.preventDefault();document.body.append(d);d.showModal();button.focus();
}

export function returnFrame(frame,event,stage){
  if(!frame?.voyageBefore || event.type!=='ResolveReturns' || stage?.index==null)return null;
  const previous=frame.voyageBefore;
  const done=new Set(event.presentation.dice.slice(0,stage.index+(stage.kind==='resolve'||stage.kind==='money'?1:0)).map(d=>d.shipId));
  const pending=new Set(previous.returnVotes.filter(v=>!done.has(v.shipId)).flatMap(v=>v.electorate.map(x=>x.crewId)));
  return {...frame,positions:frame.positions.map(pos=>{const old=previous.positions.find(x=>x.id===pos.id);return pending.has(old?.crewId)?old:pos;}),
    players:frame.players.map((p,i)=>({...p,crew:p.crew.map((c,j)=>pending.has(c.id)?previous.players[i].crew[j]:c)}))};
}
