const FORBIDDEN=[/\bimport os\b/,/\bsubprocess\b/,/\bshutil\.rmtree\b/];
export function validateScript(c:string){ for(const p of FORBIDDEN) if(p.test(c)) return {ok:false,reason:'Forbidden: '+p}; return {ok:true}; }
