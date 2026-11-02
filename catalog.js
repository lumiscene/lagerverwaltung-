import {getAll,commit,journal,uid} from './db.js';
const attr=(id,name,values,kind='select')=>({id,name,kind,values:values.map(([code,label])=>({code,label}))});
const initialAttributes=[
 attr('material','Werkstoff',[['GL','Glas'],['AC','Acryl'],['WA','Wachs'],['CU','Kupfer'],['ES','Edelstahl'],['ME','Messing'],['AL','Aluminium'],['NY','Nylon']]),
 attr('size','Größe',[['10','10/0'],['12','12/0'],['6','6/0']]),
 attr('diameter','Durchmesser in mm',[],'decimal'),
 attr('form','Form',[['RU','Rund'],['ST','Stab'],['OV','Oval'],['TP','Tropfen'],['RH','Rhombus'],['MU','Muschel'],['HZ','Herz'],['BL','Blume'],['TW','Gedreht']]),
 attr('color','Farbe',[['W','Weiß'],['HGR','Hellgrün'],['GR','Grün'],['BL','Blau'],['BR','Braun'],['R','Rot'],['DBL','Dunkelblau'],['OR','Orange'],['RA','Rosa'],['GL','Gelb'],['HBL','Hellblau'],['AG','Silber'],['AU','Gold'],['CM','Creme'],['BG','Beige'],['KR','Kristall'],['GA','Grau'],['SW','Schwarz'],['HBR','Hellbraun'],['HGL','Hellgelb'],['LL','Lila'],['HLL','Helllila'],['DGR','Dunkelgrün'],['OGR','Olivgrün'],['CGE','Champagner'],['CT','Citrin'],['PR','Petrol'],['TS','Topas'],['RE','Rosé'],['SP','Saphir'],['AM','Amethyst'],['BGA','Blaugrau'],['RAU','Roségold'],['KBR','Kamelbraun'],['PRE','Pfirsich-Rosé']]),
 attr('transparency','Transparenz',[['O','Opak'],['T','Transparent']]),
 attr('coating','Coating / Oberfläche',[['MA','Matt'],['GZ','Glänzend'],['MT','Metallic'],['CL','Ceylon'],['IR','Iris'],['MM','Marmor'],['FR','Frost'],['WS','Wachs'],['LT','Lüster']]),
 attr('processing','Bearbeitung',[['FT','Facettiert'],['CR','Crackle']]),
 attr('lining','Einzug',[['SZ','Silber'],['CZ','Kupfer'],['K','Farbkern']]),
 attr('supplier','Händler',[['ME','MeNem']])
];
export async function seed(){
 if((await getAll('settings')).some(x=>x.id==='seeded'))return;
 const actions=[];for(const a of initialAttributes)actions.push({store:'attributes',value:a});
 const groups=[{id:'R',name:'Rocailles',attributes:[{id:'material',required:true},{id:'size',required:true},{id:'form',required:true},{id:'color',required:true},{id:'transparency',required:false},{id:'coating',required:false},{id:'processing',required:false},{id:'lining',required:false},{id:'supplier',required:false}],unit:'g'},
 {id:'DR',name:'Draht',attributes:[{id:'material',required:true},{id:'diameter',required:true},{id:'color',required:false},{id:'coating',required:false},{id:'supplier',required:false}],unit:'mm'}];
 for(const g of groups)actions.push({store:'groups',value:g});
 for(let i=1;i<=10;i++){
   const shelf=`R${String(i).padStart(2,'0')}`;actions.push({store:'shelves',value:{id:shelf,name:`Regal ${i}`,positions:8}});
   for(let j=1;j<=8;j++)actions.push({store:'slots',value:{id:`${shelf}-P${String(j).padStart(2,'0')}`,shelfId:shelf,index:j}});
 }
 for(let i=1;i<=15;i++){
   const shelf=Math.ceil(i/8);const pos=((i-1)%8)+1;
   actions.push({store:'bigboxes',value:{id:`G${String(i).padStart(3,'0')}`,name:`Großbox ${i}`,slotId:`R${String(shelf).padStart(2,'0')}-P${String(pos).padStart(2,'0')}`,capacity:15}});
 }
 actions.push({store:'settings',value:{id:'seeded',value:true}});
 actions.push({store:'journal',value:journal('Einrichtung','10 Regale, 80 Stellplätze und 15 leere Großboxen angelegt')});
 await commit(actions);
}
export const decimal=v=>Number(String(v).replace(',','.'));
export const numberValid=(v,min=0)=>String(v).trim()!==''&&Number.isFinite(decimal(v))&&decimal(v)>=min;
export function codeAndName(group,attributes,values){
 const segments=[group.id],labels=[];
 for(const spec of group.attributes){
   const a=attributes.find(x=>x.id===spec.id);if(!a)continue;
   const value=values[a.id];if(value===undefined||value===null||String(value).trim()===''){if(spec.required)throw Error(`${a.name} ist erforderlich.`);continue;}
   if(a.kind==='decimal'){
      const n=decimal(value);if(!Number.isFinite(n)||n<=0||n>100)throw Error(`${a.name}: ungültiger Wert.`);
      // 0,50 mm -> 050; 1,25 mm -> 125; immutable encoding at 0.01 mm resolution.
      if(Math.abs(n*100-Math.round(n*100))>1e-7)throw Error(`${a.name}: maximal zwei Nachkommastellen zulässig.`);
      segments.push(String(Math.round(n*100)).padStart(3,'0'));labels.push(`${a.name}: ${n.toLocaleString('de-DE')} mm`);
   }else{
      const option=a.values.find(x=>x.code===value);if(!option)throw Error(`Unbekannter Wert für ${a.name}.`);
      segments.push(option.code);labels.push(`${a.name}: ${option.label}`);
   }
 }
 return {code:segments.join('-'),name:`${group.name} · ${labels.join(' · ')}`};
}
export function addUniqueOption(attribute,code,label){if(!/^[A-Z0-9]{1,12}$/.test(code))throw Error('Kürzel: 1–12 Großbuchstaben/Ziffern.');if(attribute.values.some(v=>v.code===code))throw Error('Kürzel in dieser Eigenschaft bereits vergeben.');return {...attribute,values:[...attribute.values,{code,label}]}}
export const newMaterial=(group,code,name,values,min,desired)=>({id:uid('M'),groupId:group.id,code,name,values,unit:group.unit,min:Number(min||0),target:Number(desired||0),createdAt:new Date().toISOString()});
