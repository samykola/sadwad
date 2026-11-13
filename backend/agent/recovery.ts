export const DEFAULT_MAX_RETRIES=3; export const DEFAULT_TIMEOUT_MS=30000;
export function shouldRetry(a:number,max=DEFAULT_MAX_RETRIES){ return a<max; }
