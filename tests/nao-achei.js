/* WePill · "Não achei" e base própria (27/11/2026)
   Como rodar: node tests/nao-achei.js  (Playwright instalado) */
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT=path.join(__dirname,'..');const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.webp':'image/webp'};
const FAKE=`window.__calls=[];window.supabase={createClient(){return {auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},
 rpc:async(fn,a)=>{__calls.push([fn,a||{}]);if(fn==='remedios_extra_lista')return {data:[{codigo:'7890000000017',nome:'Xaropinho Teste',dose:'15 mg/5 ml',substancia:'cloridrato de ambroxol',cat:'remedio'},{codigo:'7890000000024',nome:'Losartix',dose:'50 mg',substancia:'losartana potássica',cat:'remedio'}],error:null};return {data:null,error:null}}}}};`;
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';if(p.endsWith('/supabase.js')){r.writeHead(200,{'content-type':'text/javascript'});return r.end(FAKE)}
  const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)});
let ok=0,fail=0;const t=async(n,fn)=>{try{await fn();ok++;console.log('  ✓',n)}catch(e){fail++;console.log('  ✗',n,'\n     ',e.message.split('\n')[0])}};const assert=(c,m)=>{if(!c)throw new Error(m)};
(async()=>{await new Promise(r=>srv.listen(0,r));const URL=`http://127.0.0.1:${srv.address().port}/app/`;const b=await chromium.launch();
  async function novo(){const ctx=await b.newContext({viewport:{width:390,height:844},locale:'pt-BR',serviceWorkers:'block'});const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
    await p.route(/jsdelivr|googleapis|gstatic/,r=>r.abort());await p.goto(URL);await p.waitForTimeout(600);
    await p.click('[data-onbskip]');await p.fill('#rg-nome','Ana');await p.fill('#rg-nasc','1960-05-05');await p.check('#rg-ok');await p.click('[data-regsave]');await p.waitForTimeout(500);await p.evaluate(()=>{try{stopRing()}catch(e){}});return {ctx,p}}
  const scan=(p,code)=>p.evaluate(c=>{const x=document.querySelector('#cam');x.innerHTML=camShell();x.classList.add('on');camDone=false;gotCode(c)},code);
  const calls=(p,fn)=>p.evaluate(f=>__calls.filter(c=>c[0]===f).map(c=>c[1]),fn);
  console.log('WePill · não achei');
  await t('Fostair: dose completa "100 mcg + 6 mcg"',async()=>{const {ctx,p}=await novo();const d=await p.evaluate(async()=>{await loadCmed();const h=CMED.ean['7896672201257'];return DB[cmedItem(h[0],h[1])].dose});assert(d==='100 mcg + 6 mcg','dose: '+d);await ctx.close()});
  await t('Código desconhecido: avisa a equipe e oferece foto e nome',async()=>{const {ctx,p}=await novo();await scan(p,'7899999999990');await p.waitForTimeout(2500);const tx=await p.innerText('#campanel');
    assert(tx.includes('Ainda não temos este código')&&tx.includes('Fotografar a frente da caixa')&&tx.includes('Digitar o nome'),'painel: '+tx.replace(/\n/g,' | '));
    const c=await calls(p,'pedir_remedio');assert(c.length===1&&c[0].p_codigo==='7899999999990'&&!c[0].p_foto,'pedido: '+JSON.stringify(c));assert(!p.errs.length,p.errs.join(';'));await ctx.close()});
  await t('Depois do "não achei", o item escolhido vai junto com o código',async()=>{const {ctx,p}=await novo();await scan(p,'7899999999990');await p.waitForTimeout(2500);await p.click('[data-camtype]');await p.waitForTimeout(500);
    await p.fill('#q','Pomada Caseira');await p.waitForTimeout(500);await p.click('[data-manual="remedio"]');await p.waitForTimeout(500);if(await p.isVisible('[data-sok]')){await p.click('[data-sok]');await p.waitForTimeout(400)}
    const c=await calls(p,'pedir_remedio');assert(c.length===2&&c[1].p_codigo==='7899999999990'&&/Pomada Caseira/.test(c[1].p_nome),'pedidos: '+JSON.stringify(c));await ctx.close()});
  await t('Código cadastrado pela equipe é achado no escaneamento',async()=>{const {ctx,p}=await novo();await scan(p,'7890000000017');await p.waitForTimeout(2600);const tx=await p.innerText('#campanel');
    assert(tx.includes('Xaropinho Teste')&&tx.includes('Base WePill'),'painel: '+tx.replace(/\n/g,' | '));assert(tx.includes('Combinações ainda não checadas'),'sem aviso de não checado');await ctx.close()});
  await t('Item da equipe com substância da base revisada tem combinações checadas',async()=>{const {ctx,p}=await novo();await scan(p,'7890000000024');await p.waitForTimeout(2600);const tx=await p.innerText('#campanel');
    assert(tx.includes('Losartix')&&!tx.includes('ainda não checadas'),'painel: '+tx.replace(/\n/g,' | '));await ctx.close()});
  await t('Busca pelo nome mostra os cadastrados pela equipe e adiciona',async()=>{const {ctx,p}=await novo();await p.click('#fab');await p.waitForTimeout(450);await p.fill('#q','xaropinho');await p.waitForTimeout(1200);
    const tx=await p.innerText('#results');assert(/cadastrados pela equipe wepill/i.test(tx)&&tx.includes('Xaropinho Teste'),'resultados: '+tx.slice(0,200).replace(/\n/g,' | '));
    await p.click('[data-xadd]');await p.waitForTimeout(500);if(await p.isVisible('[data-sok]')){await p.click('[data-sok]');await p.waitForTimeout(400)}
    const s=await p.evaluate(()=>S.list.map(id=>DB[id].nome));assert(s.includes('Xaropinho Teste'),'lista: '+s);await ctx.close()});
  await t('Item digitado sem código também vira pedido (para contar)',async()=>{const {ctx,p}=await novo();await p.click('#fab');await p.waitForTimeout(450);await p.fill('#q','Chá Milagroso');await p.waitForTimeout(500);await p.click('[data-manual="fito"]');await p.waitForTimeout(500);if(await p.isVisible('[data-sok]')){await p.click('[data-sok]');await p.waitForTimeout(400)}
    const c=await calls(p,'pedir_remedio');assert(c.length===1&&!c[0].p_codigo&&/Ch[aá] Milagroso/i.test(c[0].p_nome),'pedidos: '+JSON.stringify(c));await ctx.close()});
  await t('Alertas mostra "Para conferir" com botão do farmacêutico',async()=>{const {ctx,p}=await novo();await p.evaluate(async()=>{await loadCmed();const h=CMED.ean['7896672201257'];const id=cmedItem(h[0],h[1]);S.list.push(id);S.custom[id]=CUST[id];save();go('alertas')});await p.waitForTimeout(400);
    const tx=await p.innerText('#view');assert(tx.includes('ainda sem checagem')&&tx.includes('Enviar ao farmacêutico'),'alertas: '+tx.slice(0,200));const h=await p.getAttribute('.sev-unk a[href*="wa.me"]','href');assert(decodeURIComponent(h).includes('Fostair 100 mcg + 6 mcg'),'texto do WhatsApp: '+h);await ctx.close()});
  console.log(`\n${ok} passaram, ${fail} falharam`);await b.close();srv.close();process.exit(fail?1:0)})();
