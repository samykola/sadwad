import axios from 'axios';
export class DeepSeekProvider{ constructor(private c:{apiKey:string;model:string}){} async complete(m:{role:string;content:string}[]){ const r=await axios.post('https://api.deepseek.com/chat/completions',{model:this.c.model,messages:m},{headers:{Authorization:'Bearer '+this.c.apiKey}}); return r.data; } }
