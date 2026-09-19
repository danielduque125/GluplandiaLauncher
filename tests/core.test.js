import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { offlineProfile } from '../electron/services/offline.js';
import { validateManifest, syncPack, fetchManifest } from '../electron/services/pack.js';
import { digest, safePath, download, matches } from '../electron/services/io.js';
import { rulesPass, expandArgs, mergeMetadata, mavenPath } from '../electron/services/game.js';
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const file = (relative='mods/test.jar',text='correcto') => ({id:relative,name:'Prueba',path:relative,url:'https://pack.example/test.jar',sha256:hash(text),size:Buffer.byteLength(text),required:true});
const manifest = files => ({schemaVersion:1,version:'1.0.0',revision:1,minecraftVersion:'26.2',fabricVersion:'0.19.5',files});
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'gluplandia-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
function mockFetch(t, handler){const old=globalThis.fetch;globalThis.fetch=handler;t.after(()=>{globalThis.fetch=old;});}
test('UUID offline coincide con Java y distingue mayúsculas',()=>{
 assert.equal(offlineProfile('Notch').uuid,'b50ad385-829d-3141-a216-7e7d7539ba7f');
 assert.deepEqual(offlineProfile('Alex'),offlineProfile('Alex'));
 assert.notEqual(offlineProfile('Alex').uuid,offlineProfile('alex').uuid);
 for(const name of ['', 'ab','a/b','nombre con espacios','a'.repeat(17)])assert.throws(()=>offlineProfile(name));
});
test('El manifiesto rechaza escapes de Windows, colisiones y versión incorrecta',()=>{
 for(const value of ['../escape.jar','mods/../escape.jar','mods/a:stream.jar','mods\\escape.jar','mods/CON.jar','mods/x./a.jar','/mods/a.jar','mods/a?.jar'])assert.throws(()=>validateManifest(manifest([file(value)])));
 assert.throws(()=>validateManifest({...manifest([]),minecraftVersion:'1.21.1'}));
 assert.throws(()=>validateManifest(manifest([file('mods/A.jar'),file('mods/a.jar')])));
 assert.throws(()=>validateManifest(manifest([{...file(),url:'http://example.org/file'}])));
 assert.throws(()=>validateManifest(manifest([{...file(),size:-1}])));
});
test('No atraviesa enlaces simbólicos',async t=>{
 const root=await temporary(t);await fs.mkdir(path.join(root,'outside'));await fs.symlink(path.join(root,'outside'),path.join(root,'mods'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(safePath(root,'mods/a.jar'));
});
test('Una descarga corrupta nunca reemplaza el archivo existente',async t=>{
 const root=await temporary(t),out=path.join(root,'file.jar');await fs.writeFile(out,'viejo');
 mockFetch(t,async()=>new Response('erroneo'));
 await assert.rejects(download('https://example.org/file',out,{hash:hash('correcto'),size:8}));
 assert.equal(await fs.readFile(out,'utf8'),'viejo');assert.deepEqual(await fs.readdir(root),['file.jar']);
});
test('No descarga un archivo cuyo hash y tamaño ya coinciden',async t=>{
 const root=await temporary(t),out=path.join(root,'file');await fs.writeFile(out,'correcto');
 mockFetch(t,()=>{throw new Error('No debe descargar');});
 assert.equal(await download('https://example.org/file',out,{hash:hash('correcto'),size:8}),false);
});
test('Rechaza redirecciones HTTPS a HTTP',async t=>{
 const root=await temporary(t);mockFetch(t,async()=>new Response(null,{status:302,headers:{location:'http://example.org/file'}}));
 await assert.rejects(download('https://example.org/file',path.join(root,'file'),{hash:hash('correcto')}));
});
test('Cancela una descarga sin crear archivos parciales',async t=>{
 const root=await temporary(t);const controller=new AbortController();controller.abort();
 await assert.rejects(download('https://example.org/file',path.join(root,'file'),{hash:hash('correcto'),signal:controller.signal}));
 assert.deepEqual(await fs.readdir(root),[]);
});
test('Sincroniza, repara y elimina solo los archivos registrados',async t=>{
 const temp=await temporary(t),root=path.join(temp,'instance'),stateDir=path.join(temp,'state');
 mockFetch(t,async()=>new Response('correcto'));
 const run=files=>syncPack({root,stateDir,manifest:manifest(files)});
 await run([file()]);assert.equal(await digest(path.join(root,'mods/test.jar')),hash('correcto'));
 await fs.writeFile(path.join(root,'mods/personal.jar'),'personal');
 await fs.writeFile(path.join(root,'mods/test.jar'),'corrupto');
 await run([file()]);assert.equal(await fs.readFile(path.join(root,'mods/test.jar'),'utf8'),'correcto');
 await run([]);assert.equal(await fs.readFile(path.join(root,'mods/personal.jar'),'utf8'),'personal');
 await assert.rejects(fs.access(path.join(root,'mods/test.jar')));
 assert.ok((await fs.readdir(path.join(stateDir,'backups'))).length>=2);
});
test('Un fallo de descarga no modifica el pack instalado',async t=>{
 const temp=await temporary(t),root=path.join(temp,'instance'),stateDir=path.join(temp,'state');await fs.mkdir(path.join(root,'mods'),{recursive:true});await fs.writeFile(path.join(root,'mods/test.jar'),'viejo');
 mockFetch(t,async()=>new Response('bad'));
 await assert.rejects(syncPack({root,stateDir,manifest:manifest([file()])}));
 assert.equal(await fs.readFile(path.join(root,'mods/test.jar'),'utf8'),'viejo');
});
test('Opcionales solo se instalan por elección y se retiran después',async t=>{
 const temp=await temporary(t),root=path.join(temp,'instance'),stateDir=path.join(temp,'state');mockFetch(t,async()=>new Response('correcto'));
 const f={...file(),required:false},m=manifest([f]);
 await syncPack({root,stateDir,manifest:m});await assert.rejects(fs.access(path.join(root,f.path)));
 await syncPack({root,stateDir,manifest:m,optionalIds:[f.id]});assert.ok(await matches(path.join(root,f.path),f.sha256));
 await syncPack({root,stateDir,manifest:m});await assert.rejects(fs.access(path.join(root,f.path)));
});
test('Se recupera de un journal interrumpido sin borrar archivos personales',async t=>{
 const temp=await temporary(t),root=path.join(temp,'instance'),stateDir=path.join(temp,'state');
 await fs.mkdir(path.join(root,'mods'),{recursive:true});await fs.mkdir(stateDir,{recursive:true});
 await fs.writeFile(path.join(root,'mods/old.jar'),'old');await fs.writeFile(path.join(stateDir,'managed.json'),JSON.stringify({pending:'2',files:[file('mods/old.jar')]}));
 mockFetch(t,async()=>new Response('correcto'));
 await syncPack({root,stateDir,manifest:manifest([file()])});await assert.rejects(fs.access(path.join(root,'mods/old.jar')));assert.ok(await matches(path.join(root,'mods/test.jar'),hash('correcto')));
});
test('Firma del manifiesto y protección contra revisiones repetidas o antiguas',async t=>{
 const stateDir=await temporary(t);const keys=crypto.generateKeyPairSync('ed25519');
 let raw=Buffer.from(JSON.stringify({...manifest([]),revision:2}));
 let signature=crypto.sign(null,raw,keys.privateKey).toString('base64');
 mockFetch(t,async url=>new Response(url.endsWith('.sig')?signature:raw));
 const config={manifestUrl:'https://pack.example/manifest.json',manifestPublicKey:keys.publicKey.export({format:'pem',type:'spki'}),releaseMode:true};
 await fetchManifest(config,stateDir);
 raw=Buffer.from(JSON.stringify({...manifest([]),version:'changed',revision:2}));signature=crypto.sign(null,raw,keys.privateKey).toString('base64');await assert.rejects(fetchManifest(config,stateDir));
 raw=Buffer.from(JSON.stringify({...manifest([]),revision:1}));signature=crypto.sign(null,raw,keys.privateKey).toString('base64');await assert.rejects(fetchManifest(config,stateDir));
 raw=Buffer.from(JSON.stringify({...manifest([]),revision:3}));await assert.rejects(fetchManifest(config,stateDir));
});
test('Reglas de SO y arquitectura filtran bibliotecas nativas',()=>{
 assert.equal(rulesPass([{action:'allow',os:{name:'linux'}}]),false);
 assert.equal(rulesPass([{action:'allow',os:{arch:'x86'}}]),false);
 assert.equal(rulesPass([{action:'allow',os:{name:'windows'}}]),true);
 assert.equal(rulesPass([{action:'allow',features:{is_demo_user:true}}]),false);
});
test('Los argumentos mantienen pares y valores repetidos legítimos',()=>{
 assert.deepEqual(expandArgs(['--one','${x}','--two','${x}'],{x:'value'},{}),['--one','value','--two','value']);
 assert.throws(()=>expandArgs(['${unknown}'],{},{}));
});
test('La herencia Fabric concatena argumentos y reemplaza bibliotecas por coordenadas',()=>{
 const merged=mergeMetadata({libraries:[{name:'org.test:a:1'}],arguments:{jvm:['base'],game:['--username','${auth_player_name}']},assetIndex:{id:'1'},javaVersion:{majorVersion:25}}, {libraries:[{name:'org.test:a:2'}],arguments:{jvm:['fabric']}});
 assert.deepEqual(merged.arguments.jvm,['base','fabric']);assert.deepEqual(merged.arguments.game,['--username','${auth_player_name}']);assert.equal(merged.libraries.length,1);assert.equal(merged.libraries[0].name,'org.test:a:2');assert.equal(merged.javaVersion.majorVersion,25);
 assert.equal(mavenPath('org.lwjgl:lwjgl:3.3.3:natives-windows'),'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar');
});

import { plainDescription } from '../electron/services/status.js';

test('El MOTD del servidor se convierte a texto limpio', () => {
 assert.equal(plainDescription({text:'§6Gluplandia ',extra:[{text:'§7Dungeons'}]}),'Gluplandia Dungeons');
 assert.equal(plainDescription('§aPortal   abierto'),'Portal abierto');
});
