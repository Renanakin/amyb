import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
const require=createRequire(import.meta.url);
function run(file,args=[]){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[file,...args],{stdio:'inherit',env:process.env});
  child.on('error',reject);
  child.on('exit',code=>code===0?resolve():reject(new Error('Preparación falló con código '+code)));
 });
}
try {
 if(process.env.NODE_ENV==='production'&&process.env.INIT_DEMO_DATA==='true')throw new Error('INIT_DEMO_DATA debe ser false en producción.');
 await run(require.resolve('prisma/build/index.js'),['migrate','deploy','--schema','prisma/schema.prisma']);
 const prisma=new PrismaClient();
 try{
  if(process.env.INIT_DEMO_DATA==='true'){
   const count=await prisma.product.count();
   if(count===0){
    console.log('[INICIO] Base vacía: se carga el catálogo de demostración solicitado.');
    await run('dist-seed/seed.js');await run('dist-seed/seed-precios.js');
   }else console.log('[INICIO] Catálogo existente conservado; no se ejecuta seed.');
  }
  if(process.env.INIT_ADMIN==='true'){
   if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD)throw new Error('INIT_ADMIN requiere ADMIN_EMAIL y ADMIN_PASSWORD.');
   const existing=await prisma.user.findUnique({where:{email:process.env.ADMIN_EMAIL.toLowerCase()}});
   if(!existing)await run('dist-seed/seed-admin.js');
   else console.log('[INICIO] Cuenta existente conservada; no se modifica su contraseña ni su rol.');
  }
 }finally{await prisma.$disconnect();}
 const server=spawn(process.execPath,['dist/index.js'],{stdio:'inherit',env:process.env});
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.kill(signal));
 server.on('error',error=>{console.error(error.message);process.exit(1);});
 server.on('exit',code=>process.exit(code??1));
}catch(error){console.error('[INICIO]',error.message);process.exit(1);}
