/* WePill · base revisada ampliada (v111): grupos de substâncias e combinações
   Como rodar: node tests/base-combinacoes.js */
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT=path.join(__dirname,'..');const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.webp':'image/webp'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)});
let ok=0,fail=0;const t=async(n,fn)=>{try{await fn();ok++;console.log('  ✓',n)}catch(e){fail++;console.log('  ✗',n,'\n     ',e.message.split('\n')[0])}};const assert=(c,m)=>{if(!c)throw new Error(m)};
(async()=>{await new Promise(r=>srv.listen(0,r));const URL=`http://127.0.0.1:${srv.address().port}/app/`;const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},locale:'pt-BR',serviceWorkers:'block'});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.route(/supabase|jsdelivr|googleapis|gstatic/,r=>r.abort());await p.goto(URL);await p.waitForTimeout(600);await p.evaluate(()=>loadCmed());
  /* acha na CMED o primeiro produto cuja substância contém o texto e devolve o id do item */
  const item=sub=>p.evaluate(s=>{for(let i=0;i<CMED.p.length;i++){if(nrm(CMED.p[i][1]).includes(s))return cmedItem(i,0)}return null},sub);
  const par=(x,y)=>p.evaluate(([a,b])=>alerts([a,b]).map(o=>o.sev+': '+o.t),[x,y]);
  console.log('WePill · base de combinações');
  await t('Fostair (formoterol + beclometasona) agora é checado',async()=>{const id=await p.evaluate(()=>{const h=CMED.ean['7896672201257'];return cmedItem(h[0],h[1])});assert(!(await p.evaluate(i=>unkOf(i),id)),'ainda não checado')});
  await t('Propranolol + bombinha (formoterol) avisa',async()=>{const f=await p.evaluate(()=>{const h=CMED.ean['7896672201257'];return cmedItem(h[0],h[1])});const a=await par(await item('PROPRANOLOL'),f);assert(a.some(x=>/bombinha/.test(x)),JSON.stringify(a))});
  await t('Clonazepam + tramadol é grave',async()=>{const a=await par(await item('CLONAZEPAM'),await item('TRAMADOL'));assert(a.some(x=>x.startsWith('grave')),JSON.stringify(a))});
  await t('Rivaroxabana + nimesulida é grave',async()=>{const a=await par(await item('RIVAROXABANA'),await item('NIMESULIDA'));assert(a.some(x=>x.startsWith('grave')),JSON.stringify(a))});
  await t('Sertralina + tramadol: mostra só o aviso específico',async()=>{const a=await par(await item('SERTRALINA'),await item('TRAMADOL'));assert(a.length===1&&a[0].startsWith('grave'),JSON.stringify(a))});
  await t('Losartana (base) + espironolactona (CMED) avisa potássio',async()=>{const a=await par('losartana',await item('ESPIRONOLACTONA'));assert(a.some(x=>/Potássio/.test(x)),JSON.stringify(a))});
  await t('Losartana + varfarina não inventa alerta',async()=>{const a=await par('losartana','varfarina');assert(a.length===0,JSON.stringify(a))});
  await t('Alendronato + cálcio pede para separar',async()=>{const a=await par(await item('ALENDRONATO'),'calcio');assert(a.some(x=>/alendronato/.test(x)),JSON.stringify(a))});
  await t('Item já guardado no celular ganha a base nova ao abrir',async()=>{await p.evaluate(()=>{const h=CMED.ean['7896672201257'];const id=cmedItem(h[0],h[1]);const d=JSON.parse(JSON.stringify(CUST[id]));d.db.base=null;const s=JSON.parse(localStorage.getItem('medlist-v2')||'{}');s.custom={[id]:d};s.list=[id];localStorage.setItem('medlist-v2',JSON.stringify(s))});
    await p.reload();await p.waitForTimeout(700);const u=await p.evaluate(()=>S.list.map(unkOf));assert(u.length===1&&u[0]===false,JSON.stringify(u))});
  await t('Sem erros de JavaScript',async()=>assert(!errs.length,errs.join('; ')));
  console.log(`\n${ok} passaram, ${fail} falharam`);await b.close();srv.close();process.exit(fail?1:0)})();
