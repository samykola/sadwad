export function verifyObject(snapshot:any,name:string){ const o=(snapshot?.scene?.objects||[]).find((x:any)=>x.name===name); return o?{ok:true}:{ok:false,reason:'Object '+name+' not found'}; }
