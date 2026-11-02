// Offline QR-Erzeugung: Kazuhiko Arase QRCode (MIT), gebündelt in vendor/qr-bundle.js.
export function qrSVG(text,pixels=224){
 if(typeof window.QRCodeMaker!=='function')throw Error('QR-Modul nicht verfügbar');
 const q=new window.QRCodeMaker(0,1);q.addData(text);q.make();const count=q.getModuleCount(),quiet=4,total=count+quiet*2;
 let paths='';for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(q.isDark(y,x))paths+=`M${x+quiet},${y+quiet}h1v1h-1z`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pixels}" height="${pixels}" shape-rendering="crispEdges" aria-label="QR-Code"><rect width="${total}" height="${total}" fill="#fff"/><path fill="#111" d="${paths}"/></svg>`;
}
