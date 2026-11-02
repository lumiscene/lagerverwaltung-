export const STORES = ['groups','attributes','materials','shelves','slots','bigboxes','smallboxes','wires','journal','settings'];
const NAME='lagerwerk-local-v1', VERSION=1;
let handle;
export const uid=(prefix)=>`${prefix}-${crypto.randomUUID()}`;
export function openDB(){
  if(handle) return Promise.resolve(handle);
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(NAME,VERSION);
    req.onupgradeneeded=()=>{const db=req.result; for(const store of STORES) if(!db.objectStoreNames.contains(store)) db.createObjectStore(store,{keyPath:'id'});};
    req.onsuccess=()=>{handle=req.result;handle.onversionchange=()=>{handle.close();handle=null};resolve(handle)};
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('Datenbank ist in einer anderen App-Ansicht geöffnet.'));
  });
}
export const reqPromise=req=>new Promise((ok,no)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error)});
export async function getAll(store){const db=await openDB();return reqPromise(db.transaction(store,'readonly').objectStore(store).getAll())}
export async function get(store,id){const db=await openDB();return reqPromise(db.transaction(store,'readonly').objectStore(store).get(id))}
export async function commit(actions){
  if(!actions.length)return;
  const db=await openDB();const stores=[...new Set(actions.map(x=>x.store))];
  return new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');let failure;
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||failure||new Error('Transaktion abgebrochen'));
    tx.onerror=()=>{failure=tx.error};
    for(const a of actions){const s=tx.objectStore(a.store);if(a.del)s.delete(a.id);else s.put(a.value)};
  });
}
export async function put(store,value){return commit([{store,value}])}
export async function allData(){let output={}; for(const s of STORES)output[s]=await getAll(s);return output;}
export async function restoreData(data){
  if(!data||data.format!=='lagerwerk-backup'||data.version!==1||!data.stores||STORES.some(s=>!Array.isArray(data.stores[s])))throw new Error('Ungültige oder nicht unterstützte Sicherungsdatei.');
  for(const s of STORES){const ids=new Set();for(const x of data.stores[s]){if(!x||typeof x.id!=='string'||ids.has(x.id))throw new Error('Ungültige Einträge in '+s);ids.add(x.id)}}
  const db=await openDB();return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORES,'readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Import fehlgeschlagen'));
    for(const s of STORES){const store=tx.objectStore(s);store.clear();for(const v of data.stores[s])store.put(v)}
  });
}
export function journal(type,detail,other={}){return {id:uid('J'),date:new Date().toISOString(),type,detail,...other}}
