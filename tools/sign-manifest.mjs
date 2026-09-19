import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const [mode,file,key]=process.argv.slice(2);
if(mode==='keygen'){
 if(!file)throw new Error('Indica un prefijo fuera del repositorio.');
 const pair=crypto.generateKeyPairSync('ed25519');
 await fs.writeFile(`${file}.private.pem`,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
 await fs.writeFile(`${file}.public.pem`,pair.publicKey.export({type:'spki',format:'pem'}),{flag:'wx'});
 console.log('Claves creadas. Guarda la clave privada fuera del repositorio.');
}else if(mode==='sign'&&file&&key){
 const signature=crypto.sign(null,await fs.readFile(file),await fs.readFile(key));
 await fs.writeFile(`${file}.sig`,signature.toString('base64')+'\n');
 console.log('Firma creada sobre los bytes exactos del manifiesto.');
}else throw new Error('Uso npm run pack:sign -- keygen PREFIJO o npm run pack:sign -- sign manifest.json private.pem');
