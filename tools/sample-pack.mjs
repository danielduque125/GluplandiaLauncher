import fs from 'node:fs/promises';
import path from 'node:path';
import { json, download, digest, writeJson } from '../electron/services/io.js';
import { validateManifest } from '../electron/services/pack.js';
const output=path.resolve(process.argv[2]||'sample-pack');
await fs.mkdir(output,{recursive:true});
const files=[],versions=new Map();
async function add(projectId, versionId){
 const v=versionId?await json(`https://api.modrinth.com/v2/version/${versionId}`):(await json(`https://api.modrinth.com/v2/project/${projectId}/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%2226.2%22%5D`)).find(v=>v.version_type==='release');
 if(!v||!v.game_versions.includes('26.2')||!v.loaders.includes('fabric'))throw new Error(`No existe una versión publicada y compatible para ${projectId||versionId}.`);
 if(versions.has(v.project_id)){if(versions.get(v.project_id)!==v.id&&versionId)throw new Error('Dependencias incompatibles.');return;}
 versions.set(v.project_id,v.id);
 const f=v.files.find(f=>f.primary)||v.files[0];
 const local=path.join(output,'mods',f.filename);
 await download(f.url,local,{hash:f.hashes.sha1,algorithm:'sha1',size:f.size});
 files.push({id:v.project_id,name:v.name,path:`mods/${f.filename}`,url:f.url,sha256:await digest(local),size:f.size,required:true,source:{provider:'modrinth',projectId:v.project_id,versionId:v.id}});
 for(const dependency of v.dependencies||[])if(dependency.dependency_type==='required')await add(dependency.project_id,dependency.version_id);
}
for(const project of ['fabric-api','modmenu','sodium'])await add(project);
const manifest=validateManifest({schemaVersion:1,version:'0.1.0-sample',revision:1,minecraftVersion:'26.2',fabricVersion:'0.19.5',files});
await writeJson(path.join(output,'manifest.json'),manifest);
console.log('Manifiesto de muestra creado con descargas y hashes reales. Prueba el conjunto en Windows antes de distribuirlo.');
