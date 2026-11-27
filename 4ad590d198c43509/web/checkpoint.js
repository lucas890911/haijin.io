// Only the host worker opens this store; the UI receives public frames and the active player view.
let database;
function openDatabase(){return database ??= new Promise((resolve,reject)=>{
  const req=indexedDB.open("haijin-classic-local",1);
  req.onupgradeneeded=()=>req.result.createObjectStore("host");
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
export async function checkpoint(value){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("host",value?"readwrite":"readonly");
    const store=tx.objectStore("host");
    const req=value?store.put(value,"game"):store.get("game");
    tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
  });
}
