import type {Plan} from './planner';
export async function executePlan(plan:Plan,runStep:(step:string)=>Promise<void>){ for(const s of plan.steps) await runStep(s.title); }
