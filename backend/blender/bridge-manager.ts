export interface BlenderStatus{ connected:boolean; exePath?:string|null; }
export interface BridgeClient{ detect():Promise<string[]>; connect(p?:string):Promise<BlenderStatus>; disconnect():Promise<void>; status():BlenderStatus; exec(c:string):Promise<any>; snapshot():Promise<any>; }
