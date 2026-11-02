import {STORES,getAll,get,put,commit,allData,restoreData,journal,uid} from './db.js';
import {seed,codeAndName,decimal,numberValid,addUniqueOption,newMaterial} from './catalog.js';
import {qrSVG} from './qr.js';

const $=(s)=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{maximumFractionDigits:d});
const inputNumber=v=>String(v??'').replace('.',',');
const ts=x=>new Date(x).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});
const dt=()=>new Date().toISOString();
const groupNames={};
let data={},activeTab='lager',selectedShelf='R01',detail=null,mode=null,scannerStream=null,scannerTimer=null,detector=null;
const setView=(tab,extra={})=>{activeTab=tab;mode=null;Object.assign(extra);render()};
async function refresh(){const result=await Promise.all(STORES.map(getAll));data=Object.fromEntries(STORES.map((s,i)=>[s,result[i]]));}
const arr=s=>data[s]||[];
const by=(s,id)=>arr(s).find(x=>x.id===id);
const labelId=(id)=>{const x=by('smallboxes',id)||by('bigboxes',id)||by('wires',id)||by('slots',id);return x?.name||id};
const material=id=>by('materials',id);
const byPosition=(boxId,position)=>arr('smallboxes').find(s=>s.bigboxId===boxId&&s.position===position);
const occupant=slot=>arr('bigboxes').find(b=>b.slotId===slot)||arr('wires').find(w=>w.slotId===slot);
const smallLocation=s=>{const box=by('bigboxes',s.bigboxId);return `${box?.slotId||'ohne Regalplatz'} / ${s.bigboxId||'ohne Großbox'} · Fach ${s.position||'—'}`};
function status(m,quantity){if(!m)return'free';if(quantity<=0)return'empty';if(m.min>0&&quantity<=m.min)return'low';return'ok'}
const pill=(type,text)=>`<span class="pill ${type}">${esc(text)}</span>`;
const option=(id,label,selected)=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(label)}</option>`;
function notify(text,error=false){const el=$('#toast');el.textContent=text;el.className=error?'show error':'show';clearTimeout(notify.t);notify.t=setTimeout(()=>el.className='',4200)}
function journalAction(type,detail,other){return {store:'journal',value:journal(type,detail,other)}}
async function transact(actions,message){await commit(actions);await refresh();render();notify(message||'Gespeichert')}
const header=()=>`<header class="top"><div class="brand"><span class="brandmark">▦</span><div><strong>Lagerwerk</strong><small>Dein mobiles Materiallager</small></div></div><button class="iconbutton" data-action="scan" title="QR-Code scannen" aria-label="QR-Code scannen">▣</button></header>`;
const nav=()=>`<nav class="bottom-nav" aria-label="Hauptnavigation">${[['lager','▦','Lager'],['material','◈','Material'],['buchen','⊞','Buchen'],['bestand','▤','Bestände'],['mehr','⚙','Mehr']].map(([key,ic,label])=>`<button data-tab="${key}" class="${activeTab===key?'active':''}"><span>${ic}</span><small>${label}</small></button>`).join('')}</nav>`;
function render(){const app=$('#app');if(!app)return;app.innerHTML=header()+`<main class="content">${mode?renderMode():activeTab==='lager'?renderWarehouse():activeTab==='material'?renderMaterials():activeTab==='buchen'?renderBooking():activeTab==='bestand'?renderStocks():renderMore()}</main>`+nav();}
function pageTitle(title,subtitle,right=''){return `<div class="page-title"><div><h1>${title}</h1><p class="muted">${subtitle}</p></div>${right}</div>`}
function renderWarehouse(){
 const shelves=[...arr('shelves')].sort((a,b)=>a.id.localeCompare(b.id));
 const shelf=by('shelves',selectedShelf)||shelves[0];if(!shelf)return'<p>Kein Regal vorhanden</p>';
 const slots=arr('slots').filter(x=>x.shelfId===shelf.id).sort((a,b)=>a.index-b.index);
 const boxes=arr('bigboxes').filter(x=>x.slotId&&x.slotId.startsWith(shelf.id+'-'));
 return pageTitle('Lagerübersicht','Regal und Stellplatz auswählen',`<button class="button minor" data-action="scan">QR scannen</button>`)+
 `<section class="summary"><div><strong>${arr('shelves').length}</strong><small>Regale</small></div><div><strong>${arr('bigboxes').length}</strong><small>Großboxen</small></div><div><strong>${arr('smallboxes').length}</strong><small>Kleinboxen</small></div><div><strong>${arr('wires').length}</strong><small>Drahtgebinde</small></div></section>`+
 `<label class="field">Regal<select id="shelf-select">${shelves.map(x=>option(x.id,x.name,x.id===shelf.id?x.id:'' )).join('')}</select></label>`+
 `<div class="sectionhead"><h2>${esc(shelf.name)}</h2><span class="muted">${slots.length} Stellplätze</span></div><div class="slotgrid">${slots.map(slot=>{
  const x=occupant(slot.id);const s=x?stockForEntity(x):{state:'free',text:'frei'};
  return `<button class="slot ${s.state}" data-action="detail-slot" data-id="${esc(slot.id)}"><strong>${esc(slot.id.split('-').pop())}</strong><span>${esc(x?.id||'frei')}</span><small>${esc(s.text)}</small></button>`;
 }).join('')}</div>`+
 `<div class="legend"><span><i class="dot ok"></i> i. O.</span><span><i class="dot low"></i> niedrig</span><span><i class="dot empty"></i> leer</span><span><i class="dot free"></i> frei</span></div>`+
 `<div class="stack"><button class="button minor" data-action="mode" data-mode="move">↔ Umlagern / tauschen</button><button class="button minor" data-action="mode" data-mode="create-small">+ Kleinbox erfassen</button><button class="button minor" data-action="mode" data-mode="create-wire">+ Drahtrolle / Reststück erfassen</button></div>`;
}
function stockForEntity(x){
 if('capacity' in x){let parts=arr('smallboxes').filter(s=>s.bigboxId===x.id);if(!parts.length)return{state:'free',text:'unbefüllt'};let st=parts.map(s=>status(material(s.materialId),s.netG));return{state:st.every(t=>t==='empty')?'empty':st.includes('low')||st.includes('empty')?'low':'ok',text:`${parts.length}/${x.capacity} belegt`};}
 const m=material(x.materialId);return {state:status(m,x.lengthMm),text:`${fmt(x.lengthMm/1000)} m`};
}
function renderMaterials(){
 const q=($('#material-query')?.value||'');
 return pageTitle('Materialstamm','Sprechende Materialcodes aus gemeinsamen Attributen',`<button class="button primary" data-action="mode" data-mode="create-material">+ Neu</button>`)+
 `<input class="search" id="material-query" placeholder="Materialnummer oder Eigenschaft suchen …" autocomplete="off" value="${esc(window._materialQuery||'')}">`+
 `<div id="material-list">${renderMaterialList(window._materialQuery||'')}</div>`;
}
function renderMaterialList(q=''){
 const mats=arr('materials').filter(m=>`${m.code} ${m.name}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
 if(!mats.length)return'<div class="emptycard">Noch keine passenden Materialien. Lege dein erstes Material über „+ Neu“ an.</div>';
 return mats.map(m=>{const amount=total(m.id);return `<button class="list-card" data-action="detail-material" data-id="${esc(m.id)}"><div class="list-main"><strong>${esc(m.code)}</strong><small>${esc(m.name)}</small></div><div class="list-end">${pill(status(m,amount),formatAmount(m,amount))}<span class="chevron">›</span></div></button>`}).join('');
}
function total(id){let m=material(id);if(!m)return 0;return m.unit==='g'?arr('smallboxes').filter(x=>x.materialId===id).reduce((s,x)=>s+x.netG,0):arr('wires').filter(x=>x.materialId===id).reduce((s,x)=>s+x.lengthMm,0)}
const formatAmount=(m,q)=>m?.unit==='mm'?`${fmt(q/1000,3)} m`:`${fmt(q)} g`;
function renderBooking(){return pageTitle('Buchen & Prüfen','Behälter auswählen oder QR-Code scannen')+
 `<div class="action-grid"><button class="tile" data-action="scan"><span class="tile-icon">▣</span><strong>QR scannen</strong><small>Box, Stellplatz oder Rolle finden</small></button><button class="tile" data-action="mode" data-mode="weigh"><span class="tile-icon">⚖</span><strong>Gewicht buchen</strong><small>Entnahme, Zugang, Tara</small></button><button class="tile" data-action="mode" data-mode="wirebook"><span class="tile-icon">⌁</span><strong>Draht buchen</strong><small>Länge entnehmen / auffüllen</small></button><button class="tile" data-action="mode" data-mode="move"><span class="tile-icon">↔</span><strong>Umlagern</strong><small>Boxen oder Plätze tauschen</small></button></div>`+
 `<div class="sectionhead"><h2>Letzte Buchungen</h2></div>${journalCards(8)}`}
function journalCards(limit=40){return [...arr('journal')].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,limit).map(j=>`<div class="journal"><span class="journal-mark">●</span><div><strong>${esc(j.type)}</strong><p>${esc(j.detail)}</p><small>${ts(j.date)}</small></div></div>`).join('')||'<p class="muted">Noch keine Vorgänge</p>'}
function renderStocks(){
 const list=[...arr('materials')].map(m=>({...m,q:total(m.id)}));const low=list.filter(m=>m.min>0&&m.q<=m.min);
 return pageTitle('Bestände & Einkauf','Bestandskontrolle und Materialbedarf')+
 `<section class="summary"><div><strong>${list.length}</strong><small>Materialarten</small></div><div><strong>${low.length}</strong><small>Nachbestellen</small></div><div><strong>${list.filter(m=>m.q<=0).length}</strong><small>Leer</small></div></section>`+
 `<div class="sectionhead"><h2>Bestellvorschläge</h2></div>${low.length?low.map(m=>`<button class="list-card" data-action="detail-material" data-id="${esc(m.id)}"><div class="list-main"><strong>${esc(m.code)}</strong><small>${esc(m.name)}</small><small>Meldebestand ${formatAmount(m,m.min)} · Ziel ${formatAmount(m,m.target)}</small></div><div class="list-end">${pill(status(m,m.q),formatAmount(m,m.q))}<small>Vorschlag ${formatAmount(m,Math.max(0,m.target-m.q))}</small></div></button>`).join(''):'<div class="emptycard">Keine Bestellvorschläge bei den derzeit eingestellten Meldebeständen.</div>'}`+
 `<div class="sectionhead"><h2>Alle Bestände</h2></div>${list.map(m=>`<button class="list-card" data-action="detail-material" data-id="${esc(m.id)}"><div class="list-main"><strong>${esc(m.code)}</strong><small>${esc(m.name)}</small></div>${pill(status(m,m.q),formatAmount(m,m.q))}</button>`).join('')||'<p class="muted">Noch keine Materialien.</p>'}`;
}
function renderMore(){return pageTitle('Verwaltung','Struktur, Katalog, Sicherung und Historie')+
 `<div class="stack"><button class="list-card" data-action="mode" data-mode="create-shelf"><div class="list-main"><strong>Regal & Stellplätze hinzufügen</strong><small>Neue Regale mit beliebiger Stellplatzzahl</small></div><span>›</span></button><button class="list-card" data-action="mode" data-mode="create-big"><div class="list-main"><strong>Großbox hinzufügen</strong><small>Fächer und Regalposition definieren</small></div><span>›</span></button><button class="list-card" data-action="mode" data-mode="create-small"><div class="list-main"><strong>Kleinbox hinzufügen</strong><small>Tara und Fach festlegen</small></div><span>›</span></button><button class="list-card" data-action="mode" data-mode="create-wire"><div class="list-main"><strong>Drahtrolle oder Reststück hinzufügen</strong><small>Restlänge und Lagerposition</small></div><span>›</span></button><button class="list-card" data-action="mode" data-mode="catalog"><div class="list-main"><strong>Materialkatalog konfigurieren</strong><small>Klassen, Eigenschaften und Kürzel</small></div><span>›</span></button><button class="list-card" data-action="mode" data-mode="labels"><div class="list-main"><strong>QR-Etiketten</strong><small>QR-Codes zum Drucken</small></div><span>›</span></button><button class="list-card" data-action="mode" data-mode="backup"><div class="list-main"><strong>Sicherung / Wiederherstellung</strong><small>Vollständiger JSON-Export oder Import</small></div><span>›</span></button><button class="list-card" data-action="mode" data-mode="history"><div class="list-main"><strong>Vollständiges Journal</strong><small>Bestands- und Lagerbewegungen</small></div><span>›</span></button></div>`;
}
const field=(label,control,hint='')=>`<label class="field"><span>${label}</span>${control}${hint?`<small>${hint}</small>`:''}</label>`;
const input=(name,placeholder='',value='',type='text',props='')=>`<input name="${name}" type="${type}" placeholder="${esc(placeholder)}" value="${esc(value)}" ${props}>`;
const selectField=(name,opts,selected='')=>`<select name="${name}">${opts.map(o=>option(o.value,o.label,selected)).join('')}</select>`;
const saveForm=(action,fields,button='Speichern')=>`<form data-form="${action}" class="form stack">${fields}<button type="submit" class="button primary wide">${button}</button></form>`;
const boxOptions=(value='')=>[{value:'',label:'— Großbox wählen —'},...arr('bigboxes').map(x=>({value:x.id,label:`${x.id} · ${x.slotId||'ohne Stellplatz'}`}))];
const freePositions=boxId=>{const b=by('bigboxes',boxId);if(!b)return[];return Array.from({length:b.capacity},(_,i)=>i+1).filter(i=>!byPosition(boxId,i))};
const freeSlots=()=>arr('slots').filter(x=>!occupant(x.id)).map(x=>({value:x.id,label:x.id}));
const optionsSmall=()=>[{value:'',label:'— Kleinbox wählen —'},...arr('smallboxes').map(x=>({value:x.id,label:`${x.id} · ${material(x.materialId)?.code||'leer'} · ${x.bigboxId||'ohne Standort'}`}))];
const optionsWire=()=>[{value:'',label:'— Drahtgebinde wählen —'},...arr('wires').map(x=>({value:x.id,label:`${x.id} · ${material(x.materialId)?.code||'unbekannt'} · ${fmt(x.lengthMm/1000,3)} m`}))];
function screen(title,content,subtitle=''){return `<div class="screen-head"><button class="back" data-action="back">‹</button><div><h1>${esc(title)}</h1>${subtitle?`<p class="muted">${esc(subtitle)}</p>`:''}</div></div>${content}`}
function renderMode(){
 switch(mode){
 case 'create-shelf':return screen('Regal hinzufügen',saveForm('create-shelf',field('Regal-ID',input('id','R11','','text','required pattern="[A-Za-z0-9-]+"'))+field('Name',input('name','Regal 11','','text','required'))+field('Anzahl Stellplätze',input('positions','8','8','number','min="1" max="200" required'))));
 case 'create-big':return screen('Großbox hinzufügen',saveForm('create-big',field('Box-ID',input('id','G016','','text','required'))+field('Name',input('name','Großbox 16'))+field('Anzahl Kleinboxfächer',input('capacity','15','15','number','min="1" max="100" required'))+field('Freier Regalstellplatz',selectField('slotId',[{value:'',label:'Noch nicht zuordnen'},...freeSlots()]))));
 case 'create-small':return screen('Kleinbox erfassen',saveForm('create-small',field('Kleinbox-ID',input('id','K001','','text','required'))+field('Leergewicht / Tara in g',input('tara','z. B. 82,4','','text','inputmode="decimal" required'),'Taragewicht ist fest an diese physische Box gebunden.')+field('Großbox',selectField('bigboxId',boxOptions()),'Die Einteilung gilt für aktuell freie Fächer.')+field('Fachnummer',input('position','z. B. 4','','number','min="1"'))+field('Material',selectField('materialId',[{value:'',label:'Noch kein Material'},...arr('materials').filter(x=>x.unit==='g').map(m=>({value:m.id,label:m.code}))]))+field('Anfangsbestand Netto (g)',input('netG','0','0','text','inputmode="decimal" required'))));
 case 'create-wire':return screen('Drahtgebinde erfassen',saveForm('create-wire',field('Gebinde-ID',input('id','D001','','text','required'))+field('Gebindeart',selectField('kind',[{value:'Rolle',label:'Rolle'},{value:'Reststück',label:'Reststück'}]))+field('Drahtmaterial',selectField('materialId',[{value:'',label:'— Material auswählen —'},...arr('materials').filter(m=>m.unit==='mm').map(m=>({value:m.id,label:m.code}))]))+field('Restlänge in m',input('meters','z. B. 25,4','','text','inputmode="decimal" required'))+field('Freier Regalstellplatz',selectField('slotId',[{value:'',label:'Noch nicht zuordnen'},...freeSlots()]))));
 case 'create-material':return renderCreateMaterial();
 case 'weigh':return renderWeigh();
 case 'wirebook':return renderWireBook();
 case 'move':return renderMove();
 case 'catalog':return renderCatalog();
 case 'labels':return renderLabels();
 case 'backup':return renderBackup();
 case 'history':return screen('Buchungsjournal',journalCards(10000),'Chronologisch, neueste Vorgänge zuerst');
 case 'detail':return renderDetail();
 case 'scan':return screen('QR-Code scannen',`<div class="camera-wrap"><video id="scanner-video" autoplay muted playsinline></video><div class="scan-corners"></div></div><p class="muted">Kamera auf den QR-Code einer Kleinbox, Großbox, Drahtrolle oder eines Stellplatzes richten.</p><p id="scan-message" class="hint">Kamera wird gestartet …</p>${field('Alternativ Kennung manuell eingeben',input('manual','z. B. SMALL:K001'))}<button class="button minor wide" data-action="manual-scan">Kennung öffnen</button>`);
 default:return screen('Unbekannte Ansicht','');
 }
}
function renderCreateMaterial(){
 const groups=arr('groups'),g=by('groups',window._groupId||groups[0]?.id),attrs=arr('attributes');
 const gsel=field('Materialklasse',`<select id="group-select">${groups.map(x=>option(x.id,x.name,g?.id)).join('')}</select>`);
 if(!g)return screen('Material anlegen','<p class="muted">Erstelle zuerst eine Materialklasse im Katalog.</p>');
 const fields=g.attributes.map(spec=>{let a=attrs.find(x=>x.id===spec.id);if(!a)return'';let inputElement=a.kind==='decimal'?input('attr_'+a.id,'z. B. 0,5','','text',`${spec.required?'required':''} inputmode="decimal"`):selectField('attr_'+a.id,[{value:'',label:'— Nicht angegeben —'},...a.values.map(v=>({value:v.code,label:v.label}))]);return field(`${esc(a.name)} ${spec.required?'*':''}`,inputElement)}).join('');
 const unit=g.unit==='mm'?'m':'g';
 return screen('Material anlegen',gsel+saveForm('create-material',fields+`<div id="material-preview" class="result info">Materialcode wird aus den ausgewählten Eigenschaften gebildet.</div>`+field(`Meldebestand (${unit})`,input('min','0','0','text','inputmode="decimal"'))+field(`Zielbestand (${unit})`,input('target','0','0','text','inputmode="decimal"')),'Materialcode erstellen & speichern')+`<p class="hint">Nicht benötigte optionale Attribute bleiben leer. Identische Materialcodes werden nicht doppelt angelegt.</p>`,'Zentrale Eigenschaften – klassenspezifische Eingabemaske');
}
function renderWeigh(){
 let s=by('smallboxes',window._preselectSmall)||arr('smallboxes')[0];
 if(!arr('smallboxes').length)return screen('Gewicht buchen','<div class="emptycard">Noch keine Kleinboxen vorhanden. Lege zuerst eine Kleinbox mit Taragewicht an.</div><button class="button primary" data-action="mode" data-mode="create-small">Kleinbox anlegen</button>');
 return screen('Gewicht buchen',field('Kleinbox',`<select id="weigh-small">${optionsSmall().map(x=>option(x.value,x.label,s?.id)).join('')}</select>`)+`<div id="weigh-body">${renderWeighBody(s)}</div>`,'Bestandsdifferenz wird automatisch bestimmt');
}
function renderWeighBody(s){if(!s)return'';let m=material(s.materialId),prev=s.netG;
 return `<div class="metric-card"><small>${esc(m?.code||'Kein Material zugeordnet')}</small><strong>${fmt(prev)} g</strong><span>gespeicherter Nettobestand · Tara ${fmt(s.taraG)} g</span></div>`+
 saveForm('weigh',`<input type="hidden" name="smallId" value="${esc(s.id)}">`+field('Neues Bruttogewicht (g)',input('gross','z. B. 437,4','','text','inputmode="decimal" required'))+`<div id="weigh-result" class="result info">Bruttogewicht eingeben, dann wird eine Buchungsart vorgeschlagen.</div>`+field('Buchungsart',selectField('reason',[{value:'Entnahme',label:'Entnahme'},{value:'Zugang',label:'Zugang'},{value:'Inventurkorrektur',label:'Inventurkorrektur'},{value:'Tara-Korrektur',label:'Tara-Korrektur'}]))+field('Notiz (optional)',input('note','z. B. Verarbeitung / Inventur')),'Buchung bestätigen')+
 `<button class="button minor wide" data-action="mode" data-mode="edit-tara" data-id="${esc(s.id)}">Taragewicht separat korrigieren</button>`;
}
function renderWireBook(){let w=by('wires',window._preselectWire)||arr('wires')[0];if(!w)return screen('Draht buchen','<div class="emptycard">Noch keine Drahtrollen vorhanden.</div><button class="button primary" data-action="mode" data-mode="create-wire">Drahtgebinde anlegen</button>');
 return screen('Draht buchen',field('Rolle / Reststück',`<select id="book-wire">${optionsWire().map(x=>option(x.value,x.label,w.id)).join('')}</select>`)+`<div id="wire-body">${renderWireBody(w)}</div>`);
}
function renderWireBody(w){return `<div class="metric-card"><small>${esc(material(w.materialId)?.code||w.id)} · ${esc(w.kind)}</small><strong>${fmt(w.lengthMm/1000,3)} m</strong><span>verfügbare Länge</span></div>`+
 saveForm('wirebook',`<input type="hidden" name="wireId" value="${esc(w.id)}">`+field('Buchungsart',selectField('kind',[{value:'Entnahme',label:'Entnahme / zugeschnitten'},{value:'Zugang',label:'Zugang / Auffüllen'},{value:'Inventurkorrektur',label:'Inventurkorrektur – neue Gesamtlänge'}]))+field('Länge in Metern',input('meters','z. B. 2,75','','text','inputmode="decimal" required'))+field('Notiz',input('note','optional')),'Länge buchen');}
function renderMove(){const small=arr('smallboxes'),big=arr('bigboxes'),wires=arr('wires');
 return screen('Umlagern & tauschen',`<div class="notice">Erst Quelle und dann Ziel wählen. Belegte Ziele werden automatisch getauscht; leere Ziele werden einfach belegt. Die gesamte Aktion wird atomar gespeichert.</div>`+
 saveForm('move',field('Art des Vorgangs',selectField('type',[{value:'small',label:'Kleinboxen innerhalb/zwischen Großboxen'},{value:'outer',label:'Großbox oder Drahtgebinde am Regal'}]))+`<div id="move-fields">${renderMoveFields('small')}</div>`,'Umlagerung ausführen'));
}
function renderMoveFields(kind){if(kind==='small')return field('Quell-Kleinbox',selectField('source',[{value:'',label:'— Kleinbox auswählen —'},...arr('smallboxes').map(x=>({value:x.id,label:`${x.id} · ${smallLocation(x)}`}))]))+field('Ziel-Großbox',selectField('targetBox',boxOptions()))+field('Zielfach (1–Kapazität)',input('targetPosition','z. B. 2','','number','min="1" required'));
 return field('Quellbehälter',selectField('source',[{value:'',label:'— Behälter auswählen —'},...arr('bigboxes').map(x=>({value:x.id,label:`${x.id} · ${x.slotId||'ohne Platz'}`})),...arr('wires').map(x=>({value:x.id,label:`${x.id} · ${x.slotId||'ohne Platz'}`}))]))+field('Ziel-Stellplatz',selectField('targetSlot',[{value:'',label:'— Stellplatz wählen —'},...arr('slots').map(x=>({value:x.id,label:`${x.id} ${occupant(x.id)?'· '+occupant(x.id).id:'· frei'}`}))]));}
function renderCatalog(){return screen('Materialkatalog',`<div class="sectionhead"><h2>Materialklassen</h2></div><div class="stack">${arr('groups').map(g=>`<div class="catalog-row"><strong>${esc(g.id)} · ${esc(g.name)}</strong><small>${g.attributes.map(a=>esc(by('attributes',a.id)?.name||a.id)).join(', ')}</small></div>`).join('')}</div>`+
 saveForm('new-group',field('Neue Klassenkennung',input('id','z. B. P','','text','required'))+field('Klassenname',input('name','z. B. Perlen','','text','required'))+field('Bestandseinheit',selectField('unit',[{value:'g',label:'Gramm – Schüttgut'},{value:'mm',label:'Millimeter – Längenmaterial'}]))+`<p class="muted">Eigenschaften auswählen:</p><div class="checks">${arr('attributes').map(a=>`<label><input type="checkbox" name="attributes" value="${esc(a.id)}"> ${esc(a.name)}</label>`).join('')}</div>`,'Materialklasse hinzufügen')+
 `<div class="sectionhead"><h2>Zentrale Attribute und Werte</h2></div>`+field('Eigenschaft bearbeiten',`<select id="catalog-attribute">${arr('attributes').map(x=>option(x.id,x.name)).join('')}</select>`)+`<div id="catalog-options">${renderOptions(arr('attributes')[0])}</div>`+
 saveForm('new-option',field('Kürzel',input('code','z. B. SM','','text','required'))+field('Bezeichnung',input('label','z. B. Smaragd','','text','required')),'Wert hinzufügen')+
 `<div class="sectionhead"><h2>Neue Eigenschaft</h2></div>`+saveForm('new-attribute',field('Interner Schlüssel',input('id','z. B. finish','','text','required'))+field('Anzeigename',input('name','z. B. Schliffart','','text','required')),'Eigenschaft anlegen')+
 `<p class="hint">Neue Eigenschaften können bei neuen Klassen direkt zugewiesen werden. Für bestehende Klassen ist die Bearbeitung der Zuordnung in dieser ersten Version noch nicht enthalten.</p>`);
}
function renderOptions(a){return `<div class="value-tags">${(a?.values||[]).map(x=>`<span>${esc(x.label)} <small>${esc(x.code)}</small></span>`).join('')||'<span>Noch keine Auswahlwerte</span>'}</div>`;}
function renderLabels(){const items=[...arr('slots').map(x=>({id:`SLOT:${x.id}`,label:x.id})),...arr('bigboxes').map(x=>({id:`BIG:${x.id}`,label:x.id})),...arr('smallboxes').map(x=>({id:`SMALL:${x.id}`,label:x.id})),...arr('wires').map(x=>({id:`WIRE:${x.id}`,label:x.id}))];
 return screen('QR-Etiketten',field('Etikett suchen',`<input id="label-filter" placeholder="z. B. K001 oder R01" autocomplete="off">`)+`<p class="hint">QR-Code enthält eine unveränderliche Behälter- oder Lagerplatzkennung. Er kann ohne Internet gescannt werden.</p><button class="button minor wide" data-action="print-labels">Sichtbare Etiketten drucken</button><div id="labels-grid" class="labels">${renderLabelTiles(items.slice(0,36))}</div>`);
}
function renderLabelTiles(items){return items.map(x=>`<div class="label-tile">${qrSVG(x.id,108)}<strong>${esc(x.label)}</strong><small>${esc(x.id)}</small></div>`).join('');}
function renderBackup(){return screen('Datensicherung',`<div class="notice"><strong>Lokale Datenbank</strong><br>Dein Bestand liegt ausschließlich im Speicher dieser App auf diesem Gerät. Browserdaten löschen oder eine andere Webadresse verwenden kann den Zugriff auf die Daten beenden. Sichere regelmäßig extern!</div>`+
 `<button class="button primary wide" data-action="export">⬇ Vollständiges Backup herunterladen</button><label class="field">Vorhandenes Backup importieren<input type="file" id="import-file" accept="application/json,.json"></label><button class="button danger wide" data-action="import">Backup vollständig wiederherstellen</button><p class="hint">Ein Import ersetzt ALLE aktuellen Daten. Das Journal gehört zum Backup. Die Datei enthält alle Materialstammdaten, Lagerplätze und Buchungen.</p><div class="catalog-row"><strong>Letzte externe Sicherung</strong><small>${esc(by('settings','lastBackup')?.value?ts(by('settings','lastBackup').value):'Noch keine Sicherung aus dieser App heruntergeladen')}</small></div>`);
}
function renderDetail(){const kind=window._detailKind,id=window._detailId;
 if(kind==='slot'){const slot=by('slots',id),x=occupant(id);return screen(`Stellplatz ${id}`,`<div class="metric-card"><small>${esc(slot?.shelfId||'')}</small><strong>${esc(x?.id||'Frei')}</strong><span>${x?'Aktuell belegt':'Keine Belegung'}</span></div>${x?`<button class="button primary wide" data-action="detail-entity" data-kind="${'capacity'in x?'big':'wire'}" data-id="${esc(x.id)}">Behälter öffnen</button>`:''}<button class="button minor wide" data-action="mode" data-mode="move">Umlagern / tauschen</button><div class="qr-center">${qrSVG('SLOT:'+id,168)}<small>${esc('SLOT:'+id)}</small></div>`)}
 if(kind==='big'){const b=by('bigboxes',id);if(!b)return screen('Nicht gefunden','');
 return screen(`Großbox ${b.id}`,`<div class="metric-card"><small>${esc(b.name||b.id)}</small><strong>${arr('smallboxes').filter(x=>x.bigboxId===b.id).length} / ${b.capacity}</strong><span>belegte Kleinboxfächer · ${esc(b.slotId||'nicht eingeordnet')}</span></div><div class="mini-grid">${Array.from({length:b.capacity},(_,i)=>{const s=byPosition(b.id,i+1);const state=s?status(material(s.materialId),s.netG):'free';return `<button class="slot ${state}" data-action="${s?'detail-entity':'mode'}" data-kind="small" data-id="${esc(s?.id||'')}" data-mode="create-small"><strong>${i+1}</strong><small>${esc(s?.id||'frei')}</small></button>`}).join('')}</div><button class="button minor wide" data-action="mode" data-mode="move">Großbox umlagern</button><div class="qr-center">${qrSVG('BIG:'+id,168)}<small>BIG:${esc(id)}</small></div>`);
 }
 if(kind==='small'){const s=by('smallboxes',id);if(!s)return screen('Nicht gefunden','');const m=material(s.materialId);
 return screen(`Kleinbox ${id}`,`<div class="metric-card"><small>${esc(m?.code||'Noch kein Material')}</small><strong>${fmt(s.netG)} g</strong><span>Netto · Tara ${fmt(s.taraG)} g</span></div><div class="catalog-row"><strong>Standort</strong><small>${esc(smallLocation(s))}</small></div><div class="catalog-row"><strong>Material</strong><small>${esc(m?.name||'nicht zugeordnet')}</small></div><div class="stack"><button class="button primary wide" data-action="start-weigh" data-id="${esc(id)}">Gewicht kontrollieren / buchen</button><button class="button minor wide" data-action="mode" data-mode="edit-tara" data-id="${esc(id)}">Taragewicht prüfen / ändern</button><button class="button minor wide" data-action="mode" data-mode="assign-small" data-id="${esc(id)}">Material zuordnen</button><button class="button minor wide" data-action="mode" data-mode="move">Umlagern / tauschen</button></div><div class="qr-center">${qrSVG('SMALL:'+id,168)}<small>SMALL:${esc(id)}</small></div>`);
 }
 if(kind==='wire'){const w=by('wires',id);if(!w)return screen('Nicht gefunden','');const m=material(w.materialId);
 return screen(`${w.kind} ${id}`,`<div class="metric-card"><small>${esc(m?.code||'')}</small><strong>${fmt(w.lengthMm/1000,3)} m</strong><span>Restlänge · ${esc(w.slotId||'nicht eingelagert')}</span></div><div class="catalog-row"><strong>Material</strong><small>${esc(m?.name||'unbekannt')}</small></div><div class="stack"><button class="button primary wide" data-action="start-wire" data-id="${esc(id)}">Länge buchen</button><button class="button minor wide" data-action="mode" data-mode="move">Umlagern / tauschen</button></div><div class="qr-center">${qrSVG('WIRE:'+id,168)}<small>WIRE:${esc(id)}</small></div>`);
 }
 if(kind==='material'){const m=by('materials',id);if(!m)return screen('Material nicht gefunden','');const entities=m.unit==='g'?arr('smallboxes').filter(x=>x.materialId===id):arr('wires').filter(x=>x.materialId===id);
 return screen(m.code,`<div class="catalog-row"><strong>${esc(m.name)}</strong><small>Interne ID: ${esc(m.id)}</small></div><div class="metric-card"><small>Aktueller Gesamtbestand</small><strong>${formatAmount(m,total(id))}</strong><span>Meldebestand ${formatAmount(m,m.min)} · Zielbestand ${formatAmount(m,m.target)}</span></div><div class="sectionhead"><h2>Lagerorte / Behälter</h2></div>${entities.map(x=>`<button class="list-card" data-action="detail-entity" data-kind="${m.unit==='g'?'small':'wire'}" data-id="${esc(x.id)}"><div class="list-main"><strong>${esc(x.id)}</strong><small>${esc(m.unit==='g'?smallLocation(x):x.slotId||'ohne Standort')}</small></div><strong>${m.unit==='g'?`${fmt(x.netG)} g`:`${fmt(x.lengthMm/1000,3)} m`}</strong></button>`).join('')||'<div class="emptycard">Noch kein Behälter zugeordnet.</div>'}<button class="button minor wide" data-action="mode" data-mode="set-min" data-id="${esc(m.id)}">Melde- und Zielbestand ändern</button>`);
 }
 return screen('Nicht gefunden','');
}
function renderSpecialMode(){if(mode==='edit-tara'){const s=by('smallboxes',window._editId);return screen('Taragewicht ändern',`<div class="notice">Die Tara-Änderung darf den Nettobestand nicht stillschweigend verändern. Prüfe danach den tatsächlichen Bestand durch eine neue Verwiegung.</div>`+saveForm('edit-tara',`<input type="hidden" name="id" value="${esc(s.id)}">`+field('Bisherige Tara',`<strong>${fmt(s.taraG)} g</strong>`)+field('Neues Taragewicht (g)',input('tara','',inputNumber(s.taraG),'text','inputmode="decimal" required'))+field('Begründung',input('note','z. B. Box gereinigt','','text','required')),'Tara korrigieren'))};
 if(mode==='assign-small'){const s=by('smallboxes',window._editId);return screen('Material zuordnen',`<div class="notice">Nur eine Materialart je Kleinbox. Ein bereits vorhandener Bestand darf nicht durch Umetikettieren einem anderen Material zugeschlagen werden.</div>`+saveForm('assign-small',`<input type="hidden" name="id" value="${esc(s.id)}">`+field('Material',selectField('materialId',[{value:'',label:'Keine Zuordnung'},...arr('materials').filter(x=>x.unit==='g').map(m=>({value:m.id,label:m.code}))],s.materialId||'')),'Zuordnung speichern'))};
 if(mode==='set-min'){const m=material(window._editId),u=m.unit==='mm'?'m':'g',v=x=>m.unit==='mm'?x/1000:x;return screen('Beschaffungsparameter',saveForm('set-min',`<input type="hidden" name="id" value="${esc(m.id)}">`+field('Meldebestand ('+u+')',input('min','',inputNumber(v(m.min)),'text','inputmode="decimal" required'))+field('Zielbestand ('+u+')',input('target','',inputNumber(v(m.target)),'text','inputmode="decimal" required')),'Grenzwerte speichern'))};
 return null;
}
const _renderMode=renderMode;
renderMode=function(){return renderSpecialMode()||_renderMode();};

function getForm(form){return Object.fromEntries(new FormData(form));}
function must(condition,message){if(!condition)throw Error(message)}
function parseId(s){s=String(s||'').trim().toUpperCase();must(/^[A-Z0-9-]{1,32}$/.test(s),'Kennung nur mit Buchstaben, Ziffern und Bindestrichen (max. 32 Zeichen).');return s}
async function handleForm(form){const type=form.dataset.form,p=getForm(form);
 if(type==='create-shelf'){
  const id=parseId(p.id);must(!by('shelves',id),'Regal-ID schon vergeben.');const n=Number(p.positions);must(Number.isInteger(n)&&n>=1&&n<=200,'Ungültige Stellplatzzahl');
  await transact([{store:'shelves',value:{id,name:p.name.trim(),positions:n}},...Array.from({length:n},(_,i)=>({store:'slots',value:{id:`${id}-P${String(i+1).padStart(2,'0')}`,shelfId:id,index:i+1}})),journalAction('Regal angelegt',`${id} · ${n} Stellplätze`)],'Regal angelegt');selectedShelf=id;mode=null;activeTab='lager';render();return;
 }
 if(type==='create-big'){
  const id=parseId(p.id);must(!by('bigboxes',id)&&!by('wires',id),'Kennung vergeben.');must(!p.slotId||(!occupant(p.slotId)&&by('slots',p.slotId)),'Stellplatz belegt oder ungültig');
  const cap=Number(p.capacity);must(Number.isInteger(cap)&&cap>0&&cap<=100,'Ungültige Kapazität');await transact([{store:'bigboxes',value:{id,name:p.name.trim()||id,slotId:p.slotId||null,capacity:cap}},journalAction('Großbox angelegt',`${id} · ${cap} Fächer`)],'Großbox gespeichert');mode=null;render();return;
 }
 if(type==='create-small'){
  const id=parseId(p.id);must(!by('smallboxes',id),'Kleinbox-ID schon vergeben.');must(numberValid(p.tara)&&numberValid(p.netG),'Tara und Bestand müssen gültig sein.');
  must(!!p.materialId||decimal(p.netG)===0,'Für einen positiven Anfangsbestand ist ein Material erforderlich.');
  const b=by('bigboxes',p.bigboxId);const pos=p.position===''?null:Number(p.position);
  if(b){must(Number.isInteger(pos)&&pos>=1&&pos<=b.capacity,'Fachnummer ungültig.');must(!byPosition(b.id,pos),'Fach ist bereits belegt.')}else must(!pos,'Ohne Großbox darf kein Fach angegeben werden.');
  must(!p.materialId||by('materials',p.materialId)?.unit==='g','Nur gewichtsgeführte Materialien möglich.');
  await transact([{store:'smallboxes',value:{id,taraG:decimal(p.tara),netG:decimal(p.netG),bigboxId:b?.id||null,position:pos,materialId:p.materialId||null}},journalAction('Kleinbox angelegt',`${id} · Tara ${p.tara} g · Netto ${p.netG} g`)],'Kleinbox gespeichert');mode=null;render();return;
 }
 if(type==='create-wire'){
  const id=parseId(p.id);must(!by('wires',id)&&!by('bigboxes',id),'Kennung vergeben.');must(by('materials',p.materialId)?.unit==='mm','Drahtmaterial auswählen.');must(numberValid(p.meters),'Ungültige Restlänge.');
  must(!p.slotId||(!occupant(p.slotId)&&by('slots',p.slotId)),'Stellplatz ist nicht frei.');
  const mm=Math.round(decimal(p.meters)*1000);must(mm>=0,'Länge ungültig');
  await transact([{store:'wires',value:{id,kind:p.kind,materialId:p.materialId,lengthMm:mm,slotId:p.slotId||null}},journalAction('Drahtgebinde angelegt',`${id} · ${fmt(mm/1000,3)} m`)],'Drahtgebinde gespeichert');mode=null;render();return;
 }
 if(type==='create-material'){
  const g=by('groups',window._groupId||arr('groups')[0]?.id);must(!!g,'Materialklasse fehlt');const vals={};for(const item of g.attributes){let v=p['attr_'+item.id];if(v!==undefined&&String(v).trim()!=='')vals[item.id]=v}
  const result=codeAndName(g,arr('attributes'),vals);must(!arr('materials').some(m=>m.code===result.code),'Materialcode existiert bereits.');
  must(numberValid(p.min)&&numberValid(p.target),'Melde-/Zielbestand ungültig');let multiplier=g.unit==='mm'?1000:1;
  const m=newMaterial(g,result.code,result.name,vals,Math.round(decimal(p.min)*multiplier*1000)/1000,Math.round(decimal(p.target)*multiplier*1000)/1000);
  must(m.target>=m.min,'Zielbestand muss mindestens dem Meldebestand entsprechen.');
  await transact([{store:'materials',value:m},journalAction('Material angelegt',`${m.code} · ${m.name}`,{materialId:m.id})],'Material angelegt');activeTab='material';mode=null;render();return;
 }
 if(type==='weigh'){
  const s=by('smallboxes',p.smallId);must(!!s,'Kleinbox nicht gefunden');must(!!s.materialId,'Der Kleinbox muss zunächst ein Material zugeordnet sein.');must(numberValid(p.gross),'Bruttogewicht ungültig');
  const net=Math.round((decimal(p.gross)-s.taraG)*1000)/1000;must(net>=0,'Bruttogewicht liegt unter Taragewicht');
  const delta=Math.round((net-s.netG)*1000)/1000;must(Math.abs(delta)>0.000001,'Bestand unverändert – keine Buchung erforderlich.');
  const suggested=delta<0?'Entnahme':'Zugang';const reason=p.reason||suggested;
  must(['Entnahme','Zugang','Inventurkorrektur'].includes(reason),'Für eine Tara-Korrektur bitte den eigenen Tara-Dialog verwenden.');
  if(reason==='Entnahme')must(delta<0,'Entnahme erfordert negativen Bestandsunterschied.');if(reason==='Zugang')must(delta>0,'Zugang erfordert positiven Bestandsunterschied.');
  if(Math.abs(delta)<5&&!window.confirm(`Die Abweichung ist ${fmt(Math.abs(delta))} g (< 5 g). Tara und Messung überprüft? Buchung trotzdem durchführen?`))return;
  if(!window.confirm(`${reason}: ${delta>0?'+':''}${fmt(delta)} g für ${s.id} buchen?`))return;
  await transact([{store:'smallboxes',value:{...s,netG:net}},journalAction(reason,`${s.id}: ${fmt(s.netG)} g → ${fmt(net)} g (${delta>0?'+':''}${fmt(delta)} g)${p.note?' · '+p.note:''}`,{entityId:s.id,materialId:s.materialId,quantityBefore:s.netG,quantityAfter:net,delta,unit:'g',grossG:decimal(p.gross),taraG:s.taraG})],'Gewichtsbuchung gespeichert');
  // Sequential workflow: remain on weighing page, next box can be selected.
  mode='weigh';render();return;
 }
 if(type==='wirebook'){
  const w=by('wires',p.wireId);must(!!w,'Drahtgebinde nicht gefunden');must(numberValid(p.meters),'Länge ungültig');const n=Math.round(decimal(p.meters)*1000);
  const next=p.kind==='Entnahme'?w.lengthMm-n:p.kind==='Zugang'?w.lengthMm+n:n;
  must(next>=0,'Entnahme größer als der Restbestand.');must(next<=1e12,'Menge zu groß.');must(next!==w.lengthMm,'Keine Bestandsänderung.');
  if(!window.confirm(`${p.kind}: ${fmt(w.lengthMm/1000,3)} m → ${fmt(next/1000,3)} m buchen?`))return;
  await transact([{store:'wires',value:{...w,lengthMm:next}},journalAction(p.kind,`${w.id}: ${fmt(w.lengthMm/1000,3)} m → ${fmt(next/1000,3)} m${p.note?' · '+p.note:''}`,{entityId:w.id,materialId:w.materialId,quantityBefore:w.lengthMm,quantityAfter:next,delta:next-w.lengthMm,unit:'mm'})],'Drahtlänge gespeichert');mode='wirebook';render();return;
 }
 if(type==='move'){
  if(p.type==='small'){
   const src=by('smallboxes',p.source),b=by('bigboxes',p.targetBox),pos=Number(p.targetPosition);
   must(!!src&&!!b,'Quelle und Ziel-Großbox angeben.');must(Number.isInteger(pos)&&pos>=1&&pos<=b.capacity,'Zielfach außerhalb der Großbox.');
   const dest=byPosition(b.id,pos);must(src.id!==dest?.id,'Quell- und Zielfach sind identisch.');
   if(dest)must(!!src.bigboxId&&!!src.position,'Tausch nur möglich, wenn die Quellbox bereits in einem Fach liegt.');
   if(!window.confirm(`${src.id} → ${b.id} Fach ${pos}${dest?' (Tausch mit '+dest.id+')':''}?`))return;
   const actions=[{store:'smallboxes',value:{...src,bigboxId:b.id,position:pos}}];if(dest)actions.push({store:'smallboxes',value:{...dest,bigboxId:src.bigboxId,position:src.position}});
   actions.push(journalAction(dest?'Kleinboxen getauscht':'Kleinbox umgelagert',`${src.id} → ${b.id}/${pos}${dest?' ↔ '+dest.id:''}`));
   await transact(actions,'Umlagerung gespeichert');
  }else{
   const src=by('bigboxes',p.source)||by('wires',p.source),slot=by('slots',p.targetSlot);
   must(!!src&&!!slot,'Quellbehälter und Ziel-Stellplatz angeben.');must(src.slotId!==slot.id,'Quell- und Zielplatz sind gleich.');
   const dest=occupant(slot.id);if(dest)must(!!src.slotId,'Tausch nur möglich, wenn der Quellbehälter selbst an einem Stellplatz steht.');
   if(!window.confirm(`${src.id} → ${slot.id}${dest?' (Tausch mit '+dest.id+')':''}?`))return;
   const srcStore='capacity'in src?'bigboxes':'wires';const actions=[{store:srcStore,value:{...src,slotId:slot.id}}];
   if(dest)actions.push({store:'capacity'in dest?'bigboxes':'wires',value:{...dest,slotId:src.slotId}});
   actions.push(journalAction(dest?'Lagerplätze getauscht':'Behälter umgelagert',`${src.id} → ${slot.id}${dest?' ↔ '+dest.id:''}`));await transact(actions,'Umlagerung gespeichert');
  }
  mode=null;render();return;
 }
 if(type==='new-group'){
  const id=parseId(p.id);must(!by('groups',id),'Klassenkennung bereits vergeben.');const selected=[...form.querySelectorAll('input[name="attributes"]:checked')].map(x=>x.value);
  must(selected.length>0,'Mindestens eine Eigenschaft auswählen.');const group={id,name:p.name.trim(),unit:p.unit,attributes:selected.map(x=>({id:x,required:false}))};
  await transact([{store:'groups',value:group},journalAction('Materialklasse angelegt',`${id} · ${group.name}`)],'Klasse hinzugefügt');mode='catalog';render();return;
 }
 if(type==='new-option'){
  const id=$('#catalog-attribute')?.value,a=by('attributes',id);must(!!a,'Eigenschaft auswählen.');must(a.kind==='select','Numerische Eigenschaften haben keine Auswahlliste.');
  const code=parseId(p.code),label=p.label.trim();must(label.length>0,'Bezeichnung angeben');const updated=addUniqueOption(a,code,label);await transact([{store:'attributes',value:updated},journalAction('Eigenschaftswert ergänzt',`${id}: ${code} = ${label}`)],'Wert hinzugefügt');mode='catalog';render();return;
 }
 if(type==='new-attribute'){
  const id=p.id.trim().toLowerCase();must(/^[a-z][a-z0-9_]{1,31}$/.test(id),'Schlüssel: Kleinbuchstaben, Ziffern und Unterstrich');must(!by('attributes',id),'Eigenschaft bereits vorhanden.');
  await transact([{store:'attributes',value:{id,name:p.name.trim(),kind:'select',values:[]}},journalAction('Eigenschaft angelegt',`${id} · ${p.name}`)],'Eigenschaft ergänzt');mode='catalog';render();return;
 }
 if(type==='edit-tara'){
  const s=by('smallboxes',p.id);must(!!s&&numberValid(p.tara),'Ungültiges Tara');must(!!p.note.trim(),'Grund für Tara-Korrektur erforderlich');const next=decimal(p.tara);
  must(next!==s.taraG,'Taragewicht ist unverändert.');
  await transact([{store:'smallboxes',value:{...s,taraG:next}},journalAction('Tara-Korrektur',`${s.id}: ${fmt(s.taraG)} g → ${fmt(next)} g · ${p.note}`,{entityId:s.id,taraBefore:s.taraG,taraAfter:next})],'Taragewicht geändert');window._detailKind='small';window._detailId=s.id;mode='detail';render();return;
 }
 if(type==='assign-small'){
  const s=by('smallboxes',p.id);must(!!s,'Kleinbox fehlt.');must(s.netG===0,'Materialwechsel nur bei Bestand 0 g.');must(!p.materialId||by('materials',p.materialId)?.unit==='g','Ungültiges Material');
  await transact([{store:'smallboxes',value:{...s,materialId:p.materialId||null}},journalAction('Materialzuordnung',`${s.id}: ${s.materialId||'ohne'} → ${p.materialId||'ohne'}`)],'Material zugeordnet');window._detailKind='small';window._detailId=s.id;mode='detail';render();return;
 }
 if(type==='set-min'){
  const m=material(p.id),multiplier=m?.unit==='mm'?1000:1;must(!!m&&numberValid(p.min)&&numberValid(p.target),'Ungültige Bestandswerte.');
  const min=Math.round(decimal(p.min)*multiplier*1000)/1000,target=Math.round(decimal(p.target)*multiplier*1000)/1000;must(target>=min,'Zielbestand muss mindestens so groß wie Meldebestand sein.');
  await transact([{store:'materials',value:{...m,min,target}},journalAction('Beschaffungsparameter geändert',m.code)],'Bestandsgrenzen gespeichert');window._detailKind='material';window._detailId=m.id;mode='detail';render();return;
 }
}
async function enterMode(next,id){stopScan();if(id)window._editId=id;mode=next;render();if(next==='scan')await startScan();if(next==='weigh')updateWeighHint();if(next==='create-material')updateMaterialPreview();}
function resolveQR(raw){const text=String(raw).trim();let match=/^(SLOT|BIG|SMALL|WIRE):(.+)$/i.exec(text);if(!match)return null;const kind={SLOT:'slot',BIG:'big',SMALL:'small',WIRE:'wire'}[match[1].toUpperCase()];let id=match[2].toUpperCase();return by(kind==='slot'?'slots':kind==='big'?'bigboxes':kind==='small'?'smallboxes':'wires',id)?{kind,id}:null;}
function openQR(raw){let value=resolveQR(raw);if(!value){notify('Kennung nicht gefunden. Bitte vollständigen QR-Inhalt eingeben.',true);return;}stopScan();window._detailKind=value.kind;window._detailId=value.id;mode='detail';render();}
async function startScan(){
 const message=$('#scan-message'),video=$('#scanner-video');if(!message||!video)return;
 if(!navigator.mediaDevices?.getUserMedia){message.textContent='Kamera nicht verfügbar. Nutze die manuelle Eingabe.';return}
 if(typeof BarcodeDetector==='undefined'){message.textContent='QR-Erkennung in diesem Browser nicht verfügbar. Bitte Chrome auf Android nutzen oder den Code manuell eingeben.';return}
 try{
  detector=new BarcodeDetector({formats:['qr_code']});scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  video.srcObject=scannerStream;await video.play();message.textContent='QR-Code in den Sucher halten.';
  const tick=async()=>{if(!scannerStream)return;try{const codes=await detector.detect(video);if(codes.length){openQR(codes[0].rawValue);return;}}catch(_){/* continue */}scannerTimer=setTimeout(tick,230)};tick();
 }catch(err){stopScan();message.textContent='Kamera konnte nicht geöffnet werden: '+err.message+'. Alternativ Kennung eingeben.';}
}
function stopScan(){clearTimeout(scannerTimer);scannerTimer=null;if(scannerStream){for(const track of scannerStream.getTracks())track.stop();scannerStream=null;}detector=null;}
function updateWeighHint(){const f=document.querySelector('form[data-form="weigh"]');if(!f)return;const s=by('smallboxes',f.elements.smallId.value),v=f.elements.gross.value,result=$('#weigh-result');if(!s||!result)return;
 if(!numberValid(v)){result.textContent='Bruttogewicht eingeben, dann wird eine Buchungsart vorgeschlagen.';result.className='result info';return}
 const net=Math.round((decimal(v)-s.taraG)*1000)/1000,delta=Math.round((net-s.netG)*1000)/1000;
 if(net<0){result.textContent='Fehler: Bruttogewicht liegt unter der Tara.';result.className='result danger';return}
 const reason=delta<0?'Entnahme':delta>0?'Zugang':'Keine Änderung';f.elements.reason.value=delta<0?'Entnahme':delta>0?'Zugang':'Inventurkorrektur';
 result.textContent=`Neuer Nettobestand: ${fmt(net)} g · Differenz: ${delta>0?'+':''}${fmt(delta)} g · Vorschlag: ${reason}${Math.abs(delta)>0&&Math.abs(delta)<5?' · Achtung: < 5 g, Tara/Messung überprüfen!':''}`;
 result.className='result '+(Math.abs(delta)>0&&Math.abs(delta)<5?'warn':delta===0?'info':delta<0?'warn':'success');
}
async function exportBackup(){const d=await allData(),payload={format:'lagerwerk-backup',version:1,createdAt:dt(),stores:d},blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`lagerwerk-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 await put('settings',{id:'lastBackup',value:dt()});await refresh();render();notify('Backup-Datei erstellt. Bitte außerhalb des Browsers sicher ablegen.');
}
async function importBackup(){let file=$('#import-file')?.files[0];must(!!file,'Bitte Sicherungsdatei auswählen.');must(file.size<25*1024*1024,'Sicherungsdatei ist zu groß.');const payload=JSON.parse(await file.text());
 must(window.confirm('ACHTUNG: Alle aktuellen Lagerdaten werden vollständig ersetzt. Vorher eigenes Backup erstellt?'),'Import abgebrochen');await restoreData(payload);await refresh();mode=null;activeTab='lager';render();notify('Sicherung wiederhergestellt.');
}
// Event delegation: forms and buttons survive re-rendering.
document.addEventListener('submit',async e=>{const form=e.target.closest('form[data-form]');if(!form)return;e.preventDefault();try{await handleForm(form)}catch(err){notify(err.message||String(err),true)}});
document.addEventListener('click',async e=>{
 const tab=e.target.closest('[data-tab]');if(tab){stopScan();activeTab=tab.dataset.tab;mode=null;render();return}
 const target=e.target.closest('[data-action]');if(!target)return;const {action,id,kind}=target.dataset;
 try{
  if(action==='back'){stopScan();mode=null;render();return}
  if(action==='mode'){await enterMode(target.dataset.mode,id);return}
  if(action==='detail-slot'){stopScan();window._detailKind='slot';window._detailId=id;mode='detail';render();return}
  if(action==='detail-material'){stopScan();window._detailKind='material';window._detailId=id;mode='detail';render();return}
  if(action==='detail-entity'){stopScan();window._detailKind=kind;window._detailId=id;mode='detail';render();return}
  if(action==='start-weigh'){window._preselectSmall=id;await enterMode('weigh');return}
  if(action==='start-wire'){window._preselectWire=id;await enterMode('wirebook');return}
  if(action==='scan'){await enterMode('scan');return}
  if(action==='manual-scan'){openQR($('input[name="manual"]').value);return}
  if(action==='export'){await exportBackup();return}
  if(action==='import'){await importBackup();return}
  if(action==='print-labels'){window.print();return}
 }catch(err){notify(err.message||String(err),true)}
});
function updateMaterialPreview(){
 const f=document.querySelector('form[data-form="create-material"]'),out=$('#material-preview');if(!f||!out)return;
 const group=by('groups',window._groupId||arr('groups')[0]?.id);if(!group)return;
 const values={};for(const a of group.attributes){const v=f.elements['attr_'+a.id]?.value;if(v)values[a.id]=v;}
 try{const result=codeAndName(group,arr('attributes'),values);out.textContent=result.code+' — '+result.name;out.className='result success';}
 catch(err){out.textContent='Materialcode-Vorschau: '+err.message;out.className='result info';}
}
document.addEventListener('change',e=>{
 const t=e.target;
 if(t.id==='shelf-select'){selectedShelf=t.value;render()}
 if(t.id==='group-select'){window._groupId=t.value;render();updateMaterialPreview()}
 if(t.id==='weigh-small'){window._preselectSmall=t.value;$('#weigh-body').innerHTML=renderWeighBody(by('smallboxes',t.value));updateWeighHint()}
 if(t.id==='book-wire'){window._preselectWire=t.value;$('#wire-body').innerHTML=renderWireBody(by('wires',t.value))}
 if(t.name==='type'&&t.closest('form[data-form="move"]')){$('#move-fields').innerHTML=renderMoveFields(t.value)}
 if(t.id==='catalog-attribute'){$('#catalog-options').innerHTML=renderOptions(by('attributes',t.value))}
 if(t.closest('form[data-form="create-material"]'))updateMaterialPreview();
});
document.addEventListener('input',e=>{
 if(e.target.name==='gross'&&e.target.closest('form[data-form="weigh"]'))updateWeighHint();
 if(e.target.closest('form[data-form="create-material"]'))updateMaterialPreview();
 if(e.target.id==='material-query'){window._materialQuery=e.target.value;$('#material-list').innerHTML=renderMaterialList(e.target.value)}
 if(e.target.id==='label-filter'){const q=e.target.value.toUpperCase().trim();const items=[...arr('slots').map(x=>({id:`SLOT:${x.id}`,label:x.id})),...arr('bigboxes').map(x=>({id:`BIG:${x.id}`,label:x.id})),...arr('smallboxes').map(x=>({id:`SMALL:${x.id}`,label:x.id})),...arr('wires').map(x=>({id:`WIRE:${x.id}`,label:x.id}))].filter(x=>(x.id+' '+x.label).includes(q)).slice(0,q?150:36);$('#labels-grid').innerHTML=renderLabelTiles(items)}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopScan()});
async function boot(){try{await seed();await refresh();render();if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(console.warn);if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});}catch(err){$('#app').innerHTML=`<main class="startup"><h1>Datenbank nicht verfügbar</h1><p>${esc(err.message)}</p><p>Starte die App über HTTPS und erlaube den lokalen Browserspeicher.</p></main>`}}
boot();
