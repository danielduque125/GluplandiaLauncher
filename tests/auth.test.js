import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MicrosoftAuth } from '../electron/services/auth.js';
async function setup(t, enabled=true) {
 const stateDir=await fs.mkdtemp(path.join(os.tmpdir(),'gluplandia-auth-'));t.after(()=>fs.rm(stateDir,{recursive:true,force:true}));
 const secureStorage={isEncryptionAvailable:()=>enabled,encryptString:s=>Buffer.from(s).map(x=>x^57),decryptString:b=>Buffer.from(b).map(x=>x^57).toString()};
 return {stateDir,auth:new MicrosoftAuth({clientId:'11111111-1111-1111-1111-111111111111',stateDir,secureStorage,openExternal:async()=>{},progress:()=>{}})};
}
test('No guarda refresh tokens si el cifrado no está disponible',async t=>{
 const {auth,stateDir}=await setup(t,false);await assert.rejects(auth.save('secret'));assert.deepEqual(await fs.readdir(stateDir),[]);
});
test('Guardar y cerrar sesión usa exclusivamente el adaptador cifrado',async t=>{
 const {auth,stateDir}=await setup(t);await auth.save('secret');assert.equal(await auth.load(),'secret');assert.notEqual(await fs.readFile(path.join(stateDir,'microsoft-token.bin'),'utf8'),'secret');await auth.logout();assert.equal(await auth.load(),null);
});
test('Refresh recorre Xbox, XSTS, entitlements y perfil sin devolver refresh token',async t=>{
 const {auth}=await setup(t);await auth.save('refresh-old');
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);const urls=[];
 globalThis.fetch=async(url,options)=>{
  urls.push(url);
  if(url.endsWith('/token')){assert.equal(options.body.get('refresh_token'),'refresh-old');return Response.json({access_token:'msa',refresh_token:'refresh-new'});}
  if(url.includes('/user/authenticate')){assert.equal(JSON.parse(options.body).Properties.RpsTicket,'d=msa');return Response.json({Token:'xbl'});}
  if(url.includes('/xsts/authorize'))return Response.json({Token:'xsts',DisplayClaims:{xui:[{uhs:'userhash',xid:'123'}]}});
  if(url.includes('login_with_xbox'))return Response.json({access_token:'mc-token'});
  if(url.includes('entitlements'))return Response.json({items:[{name:'game_minecraft'}]});
  if(url.endsWith('/minecraft/profile'))return Response.json({id:'a'.repeat(32),name:'Explorer'});
  throw new Error('Endpoint inesperado');
 };
 const session=await auth.refresh();assert.equal(session.mode,'microsoft');assert.equal(session.name,'Explorer');assert.equal(session.accessToken,'mc-token');assert.equal(session.refresh_token,undefined);assert.equal(await auth.load(),'refresh-new');assert.equal(urls.length,6);
});
test('Un fallo de red no borra la sesión guardada',async t=>{
 const {auth}=await setup(t);await auth.save('refresh');const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);globalThis.fetch=async()=>{throw new Error('network');};await assert.rejects(auth.refresh());assert.equal(await auth.load(),'refresh');
});
test('Sin entitlement no concede un perfil Microsoft ni hace fallback offline',async t=>{
 const {auth}=await setup(t);const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
 globalThis.fetch=async url=>Response.json(url.includes('entitlements')?{items:[]}:url.includes('login_with_xbox')?{access_token:'mc'}:{Token:'token',DisplayClaims:{xui:[{uhs:'hash'}]}});
 await assert.rejects(auth.minecraft('msa'),/derecho de acceso/);
});
