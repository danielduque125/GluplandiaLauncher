import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, writeJson, httpsUrl } from '../electron/services/io.js';
import { validateManifest } from '../electron/services/pack.js';
const [source, baseUrl, version, revision, fabric = '0.19.5'] = process.argv.slice(2);
if (!source || !baseUrl || !version || !revision) throw new Error('Uso npm run pack:build -- ./pack https://dominio/pack/1.0.0 1.0.0 1 0.19.5');
httpsUrl(baseUrl);
const files=[];
const options=JSON.parse(await fs.readFile(path.join(source,'pack-options.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return '{}';throw e;}));
async function walk(relative){
 const directory=path.join(source,relative);
 for(const entry of await fs.readdir(directory,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){
  const name=`${relative}/${entry.name}`;
  if(entry.isSymbolicLink())throw new Error('No se permiten enlaces simbólicos.');
  if(entry.isDirectory()){await walk(name);continue;}
  const file=path.join(source,name),stat=await fs.stat(file);
  files.push({id:name,name:options[name]?.name||entry.name,path:name,url:`${baseUrl.replace(/\/$/,'')}/${name.split('/').map(encodeURIComponent).join('/')}`,sha256:await digest(file),size:stat.size,required:options[name]?.required!==false});
 }
}
for(const area of ['mods','config','resourcepacks','shaderpacks'])await walk(area);
files.sort((a,b)=>a.path.localeCompare(b.path));
const manifest=validateManifest({schemaVersion:1,version,revision:Number(revision),minecraftVersion:'26.2',fabricVersion:fabric,files});
await writeJson(path.join(source,'manifest.json'),manifest);
console.log(`Creado ${path.join(source,'manifest.json')} con ${files.length} archivos verificados.`);
