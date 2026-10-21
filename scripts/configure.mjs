import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file=path.join(root,'.env');
const backend=path.join(root,'backend','.env');
if(fs.existsSync(file)){
 console.log('[CONFIG] Se conserva el .env existente.');
 if(!fs.existsSync(backend)){fs.copyFileSync(file,backend);console.log('[CONFIG] backend/.env creado desde .env.');}
 console.log('[CONFIG] Para Docker, comprobar POSTGRES_PASSWORD, JWT_SECRET y variables de DEPLOYMENT.md.');
 process.exit(0);
}
const defaults=fs.readFileSync(path.join(root,'.env.example'),'utf8');
const values=Object.fromEntries(defaults.split(/\r?\n/).filter(x=>/^[A-Z][A-Z0-9_]*=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
for(const key of ['COMPOSE_PROJECT_NAME','POSTGRES_VOLUME','WEB_PORT','POSTGRES_PORT','WEB_BIND_ADDRESS'])if(process.env[key])values[key]=process.env[key];
values.POSTGRES_PASSWORD=crypto.randomBytes(24).toString('hex');
values.JWT_SECRET=crypto.randomBytes(48).toString('hex');
values.ADMIN_PASSWORD=crypto.randomBytes(24).toString('base64url');
values.DATABASE_URL='postgresql://'+values.POSTGRES_USER+':'+values.POSTGRES_PASSWORD+'@localhost:'+values.POSTGRES_PORT+'/'+values.POSTGRES_DB+'?schema=public';
values.FRONTEND_URL='http://localhost:'+values.WEB_PORT;
values.WEBPAY_RETURN_URL=values.FRONTEND_URL+'/webpay/return';
values.CORS_ORIGIN=values.FRONTEND_URL+',http://localhost:5173';
const output=defaults.replace(/^([A-Z][A-Z0-9_]*)=.*$/gm,(_,key)=>key+'='+values[key]);
fs.writeFileSync(file,output,{mode:0o600,flag:'wx'});
if(!fs.existsSync(backend))fs.writeFileSync(backend,output,{mode:0o600,flag:'wx'});
console.log('[CONFIG] Configuración local creada. Contraseñas y JWT únicos guardados en .env (no se imprimen).');
console.log('[CONFIG] Credenciales de administrador: ADMIN_EMAIL y ADMIN_PASSWORD dentro de tu .env.');
console.log('[CONFIG] Continúa con: docker compose up --build -d');
console.log('[CONFIG] Tienda: '+values.FRONTEND_URL);
