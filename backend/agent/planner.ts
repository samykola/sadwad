export interface PlanStep{ id:string; title:string; description:string; }
export interface Plan{ goal:string; steps:PlanStep[]; }
export function parsePlan(raw:string):Plan|null{ try{ const j=raw.trim().replace(/^```[a-z]*\n?|```$/g,''); const p=JSON.parse(j); if(p.goal&&Array.isArray(p.steps)) return p; }catch{} return null; }
