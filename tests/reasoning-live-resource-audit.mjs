// Read-only: fetch the host's public module graph and this plugin's executable.
// Does not open a browser, read chat/session data, or change runtime state.
import fs from 'node:fs';
import crypto from 'node:crypto';
const origin='http://127.0.0.1:19387', id='dsh-reasoning-slider';
const response=await fetch(origin+'/plugins/events',{signal:AbortSignal.timeout(5000)});
if(!response.ok){console.log(JSON.stringify({graphStatus:response.status}));process.exit(1);}
const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',graph;
try{
  while(!graph){
    const {done,value}=await reader.read();if(done)break;
    buffer+=decoder.decode(value,{stream:true});
    for(let end;(end=buffer.indexOf('\n\n'))>=0;){
      const block=buffer.slice(0,end);buffer=buffer.slice(end+2);
      const data=block.split('\n').find(line=>line.startsWith('data: '));if(!data)continue;
      const frame=JSON.parse(data.slice(6));if(frame.type==='graph')graph=frame.graph;
    }
  }
}finally{await reader.cancel();}
const rows=graph?.entries??graph?.modules??[];
const row=rows.find(row=>row.id===id);
if(!row){console.log(JSON.stringify({keys:Object.keys(graph??{}),pluginPresent:false}));process.exit(1);}
const url=new URL(row.url,origin+'/');
if(url.origin!==origin||!url.pathname.startsWith('/plugins/'))throw Error('Unexpected plugin resource URL');
const script=await fetch(url,{signal:AbortSignal.timeout(5000)}),body=await script.text();
const local=fs.readFileSync('packages/dsh-reasoning-slider/lib/client.js','utf8');
const prepared=local.replace(/(?:\r?\n)?\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n)?$/,'').trimEnd();
console.log(JSON.stringify({pluginPresent:true,revision:row.rev,resourceStatus:script.status,
  bytes:Buffer.byteLength(body),localBytes:Buffer.byteLength(local),includesExactCurrentCode:body.includes(prepared),
  localSHA256:crypto.createHash('sha256').update(local).digest('hex'),
  hasSharedMotion:body.includes('function useSliderMotion('),hasShader:body.includes('const ULTRA_FRAGMENT'),
  hasOldModelHeading:body.includes('dsh-reasoning-menu-heading'),cacheControl:script.headers.get('cache-control')},null,2));
if(script.ok&&body.includes(prepared))fs.writeFileSync('.scratch/reasoning-currently-served.js',body);
