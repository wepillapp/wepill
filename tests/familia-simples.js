/* WePill · Família simples (v84): servidor falso, testa o fluxo da tela. Rodar: node tests/familia-simples.js */
const {chromium}=require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');const OUT=process.argv[2]||require('os').tmpdir();
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';let f=path.join(ROOT,p);if(p.endsWith('/supabase.js'))f=path.join(__dirname,'fake-supabase.js');if(!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'application/octet-stream'});fs.createReadStream(f).pipe(r)});
(async()=>{await new Promise(r=>srv.listen(0,r));const base=`http://127.0.0.1:${srv.address().port}/app/`;const b=await chromium.launch();let fails=0;const A=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok',m)};
 async function page(url){const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,locale:'pt-BR',serviceWorkers:'block'});const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.route(/jsdelivr|googleapis|gstatic/,r=>r.abort());await p.goto(url);await p.waitForTimeout(700);return p}
 async function reg(p,nome){await p.click('[data-onbskip]');await p.fill('#rg-nome',nome);await p.fill('#rg-nasc','1981-05-05');await p.check('#rg-ok');await p.click('[data-regsave]');await p.waitForTimeout(500)}
 // titular
 let p=await page(base);await reg(p,'Jack Alcântara');await p.evaluate(()=>openFam());await p.waitForTimeout(800);
 A(await p.isVisible('#famemail')&&await p.isVisible('#faminv'),'tela inicial mostra e-mail e convite');A(!(await p.isVisible('#fampass')),'sem campo de senha');await p.screenshot({path:OUT+'/1-inicio.png'});
 await p.fill('#famemail','jack@exemplo.com');await p.click('[data-famsend]');await p.waitForTimeout(500);A(await p.isVisible('#famotp'),'tela do código');await p.screenshot({path:OUT+'/2-codigo.png'});
 await p.fill('#famotp','11111111');await p.click('[data-famverify]');await p.waitForTimeout(500);A((await p.textContent('#famsheet')).includes('Código errado'),'código errado avisa');
 await p.fill('#famotp','12345678');await p.click('[data-famverify]');await p.waitForTimeout(900);
 const calls=await p.evaluate(()=>__calls);A(calls.some(c=>c.startsWith('rpc:criar_familia')),'família criada sozinha');
 A(await p.isVisible('[data-faminvite]'),'botão convidar');A((await p.textContent('[data-faminvite]')).includes('1 vaga'),'limite 3 pessoas: '+(await p.textContent('[data-faminvite]')));
 await p.click('[data-faminvite]');await p.waitForTimeout(500);const inv=await p.textContent('.faminv');A(inv.includes('482 913'),'código formatado');
 const wa=await p.getAttribute('.faminv a','href');A(decodeURIComponent(wa).includes('convite=482913')&&decodeURIComponent(wa).includes('482 913'),'mensagem do WhatsApp');
 A(await p.isVisible('[data-famrm]'),'botão remover');await p.screenshot({path:OUT+'/3-familia-convite.png',fullPage:false});
 await p.evaluate(()=>$('#sheetBody').scrollTop=999);await p.screenshot({path:OUT+'/3b-familia-convite-fim.png'});
 await p.click('[data-famrm]');A((await p.textContent('[data-famrm]')).includes('Toque de novo'),'remover pede confirmação');await p.click('[data-famrm]');await p.waitForTimeout(400);A((await p.evaluate(()=>__calls)).some(c=>c.startsWith('rpc:remover_membro')),'remover chama servidor');
 A(!p.errs.length,'sem erros: '+p.errs.join('|'));
 // convidado pelo link
 p=await page(base+'?convite=482913');await reg(p,'Lorenzo');await p.waitForTimeout(1200);
 A(await p.isVisible('#faminv'),'abre a Família sozinho após cadastro');A((await p.inputValue('#faminv'))==='482 913','código preenchido');await p.screenshot({path:OUT+'/4-convidado.png'});
 await p.click('[data-famjoin]');await p.waitForTimeout(900);const c2=await p.evaluate(()=>__calls);A(c2.includes('anon')&&c2.some(c=>c.includes('aceitar_convite')),'entrou sem cadastro');
 A((await p.textContent('#famsheet')).includes('Lorenzo'),'aparece na família');A(!(await p.isVisible('[data-famout]')),'convidado não vê "Sair da conta"');A(!(await p.isVisible('[data-famrm]')),'membro não remove');
 await p.screenshot({path:OUT+'/5-convidado-dentro.png'});A(!p.errs.length,'sem erros: '+p.errs.join('|'));
 // código errado digitado
 p=await page(base);await reg(p,'Karen');await p.evaluate(()=>openFam());await p.waitForTimeout(700);await p.fill('#faminv','111 222');await p.click('[data-famjoin]');await p.waitForTimeout(700);
 A((await p.textContent('#famsheet')).includes('Código não encontrado'),'código errado avisa');A(await p.isVisible('#faminv'),'pode tentar de novo');
 await b.close();srv.close();console.log(fails?fails+' falhas':'tudo ok')})();
