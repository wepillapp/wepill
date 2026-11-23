/* WePill · testes de regressão da auditoria de 21/11/2026
   Como rodar (na pasta do repositório):  node tests/regressao.js
   Precisa do Node e do Playwright (npm i -D playwright && npx playwright install chromium). */
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT=path.join(__dirname,'..');const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.gz':'application/gzip','.webp':'image/webp'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)});
let ok=0,fail=0;const t=async(nome,fn)=>{try{await fn();ok++;console.log('  ✓',nome)}catch(e){fail++;console.log('  ✗',nome,'\n     ',e.message.split('\n')[0])}};
const assert=(c,m)=>{if(!c)throw new Error(m)};
const BR=t=>new Date(t+'-03:00');
(async()=>{await new Promise(r=>srv.listen(0,r));const URL=`http://127.0.0.1:${srv.address().port}/app/`;const b=await chromium.launch();
  async function novo(hora='2026-11-21T07:00:00',opts={}){const ctx=await b.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block',...opts});
    const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.clock.install({time:BR(hora)});await p.route(/supabase|jsdelivr|googleapis|gstatic/,r=>r.abort());await p.goto(URL);await p.waitForTimeout(600);return {ctx,p}}
  async function cadastrar(p,nome='Teste'){await p.click('[data-onbskip]');await p.fill('#rg-nome',nome);await p.fill('#rg-nasc','1960-05-05');await p.check('#rg-ok');await p.click('[data-regsave]');await p.waitForTimeout(500)}
  async function addManual(p,nome,cat='remedio'){await p.click('#fab');await p.waitForTimeout(450);await p.fill('#q',nome);await p.waitForTimeout(400);await p.click(`[data-manual="${cat}"]`);await p.waitForTimeout(450);if(await p.isVisible('[data-sok]')){await p.click('[data-sok]');await p.waitForTimeout(500)}}
  const st=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('medlist-v2')));

  console.log('WePill · regressão');
  await t('WP-03 usuário novo começa com lista vazia e sem perfil de exemplo',async()=>{const {ctx,p}=await novo();await cadastrar(p,'Ana Teste');const s=await st(p);
    assert(s.list.length===0,'lista tem '+s.list.length+' itens');assert(!JSON.stringify(s.profile).includes('Marta'),'perfil de exemplo');await ctx.close()});
  await t('Celular de teste antigo: limpa Marta, os 6 remédios de exemplo e a ficha ao abrir, mantém o resto',async()=>{const {ctx,p}=await novo();
    await p.evaluate(()=>{localStorage.setItem('medlist-v2',JSON.stringify({list:['losartana','levotiroxina','metformina','omega3','calcio','b12','dipirona'],seedV:20,onboarded:true,registered:true,lockOn:true,profile:{nome:'Jack Real',nasc:'1964-03-14',cpf:'123.456.789-00',sangue:'A+',plano:'Unimed Maringá'},stock:{},horasOv:{}}))});
    await p.reload();await p.waitForTimeout(700);const s=await st(p);
    assert(!s.list.includes('losartana')&&s.list.includes('dipirona'),'lista: '+s.list);assert(s.profile.nome==='Jack Real'&&s.profile.sangue==='A+','apagou dado real');
    assert(!s.profile.cpf&&!s.profile.nasc&&!s.profile.plano,'ficou exemplo: '+JSON.stringify(s.profile));assert(!s.lockOn&&!(await p.isVisible('#sos.on')),'ficha ainda abre');await ctx.close()});
  await t('WP-07 cadastro pede aceite dos Termos e da Privacidade',async()=>{const {ctx,p}=await novo();await p.click('[data-onbskip]');await p.fill('#rg-nome','Ana');await p.fill('#rg-nasc','1960-05-05');await p.click('[data-regsave]');await p.waitForTimeout(300);
    assert(await p.isVisible('#reg.on'),'salvou sem aceite');assert((await p.textContent('#toast')).includes('Termos'),'sem aviso');await ctx.close()});
  await t('WP-18 nascimento no futuro é recusado',async()=>{const {ctx,p}=await novo();await p.click('[data-onbskip]');await p.fill('#rg-nome','Ana');await p.fill('#rg-nasc','2030-01-01');await p.check('#rg-ok');await p.click('[data-regsave]');await p.waitForTimeout(300);
    assert(await p.isVisible('#reg.on'),'aceitou 2030');await ctx.close()});
  await t('WP-02 dia novo começa com 0 doses tomadas',async()=>{const {ctx,p}=await novo('2026-11-21T06:00:00');await cadastrar(p);await addManual(p,'Remedio Teste');await p.clock.setSystemTime(BR('2026-11-22T07:00:00'));await p.reload();await p.waitForTimeout(700);
    const s=await st(p);const tk=await p.evaluate(()=>Object.keys(S.taken).length);assert(tk===0,tk+' doses marcadas sozinhas');await ctx.close()});
  await t('WP-01 alarme toca sozinho na hora da dose',async()=>{const {ctx,p}=await novo('2026-11-21T07:58:00');await cadastrar(p);await addManual(p,'Remedio Teste');
    assert(!(await p.isVisible('#alarm.on')),'tocou antes da hora');await p.clock.runFor('00:03:00');await p.waitForTimeout(300);assert(await p.isVisible('#alarm.on'),'não tocou às 08:01');
    await p.click('[data-took]');await p.waitForTimeout(300);assert(!(await p.isVisible('#alarm.on')),'não fechou');const s=await st(p);assert(Object.values(s.taken).some(Boolean),'dose não registrada');
    await p.clock.runFor('00:20:00');assert(!(await p.isVisible('#alarm.on')),'tocou de novo depois de tomada');await ctx.close()});
  await t('WP-01 "Adiar" toca de novo depois do tempo escolhido',async()=>{const {ctx,p}=await novo('2026-11-21T07:59:30');await cadastrar(p);await addManual(p,'Remedio Teste');await p.clock.runFor('00:01:00');await p.waitForTimeout(200);
    assert(await p.isVisible('#alarm.on'),'não tocou');await p.click('[data-snz]');await p.clock.runFor('00:05:00');assert(!(await p.isVisible('#alarm.on')),'tocou cedo');await p.clock.runFor('00:06:00');assert(await p.isVisible('#alarm.on'),'não tocou de novo');await ctx.close()});
  await t('WP-09 dia passado sem uso mostra "Sem registro", não doses inventadas',async()=>{const {ctx,p}=await novo('2026-11-21T10:00:00');await cadastrar(p);await addManual(p,'Remedio Teste');await p.click('[data-wday="4"]');await p.waitForTimeout(400);
    const tx=await p.innerText('#view');assert(tx.includes('Sem registro neste dia'),'mostrou: '+tx.slice(0,120).replace(/\n/g,' '));await ctx.close()});
  await t('WP-09 histórico real: dose marcada ontem aparece como tomada',async()=>{const {ctx,p}=await novo('2026-11-20T09:00:00');await cadastrar(p);await addManual(p,'Remedio Teste');await p.evaluate(()=>{stopRing();go('hoje')});await p.click('[data-takenext]');await p.waitForTimeout(300);
    await p.clock.setSystemTime(BR('2026-11-21T09:00:00'));await p.reload();await p.waitForTimeout(700);await p.click('[data-wday="5"]');await p.waitForTimeout(400);const tx=await p.innerText('#view');assert(tx.includes('Todas as doses tomadas'),'histórico não guardado: '+tx.slice(0,120).replace(/\n/g,' '));await ctx.close()});
  await t('WP-20 dose atrasada aparece em destaque',async()=>{const {ctx,p}=await novo('2026-11-21T07:00:00');await cadastrar(p);await addManual(p,'Remedio Teste');await p.clock.setSystemTime(BR('2026-11-21T11:00:00'));await p.evaluate(()=>{stopRing();go('hoje')});await p.waitForTimeout(300);
    const tx=await p.innerText('#view');assert(tx.toLowerCase().includes('dose atrasada'),'sem destaque: '+tx.slice(0,200).replace(/\n+/g,' | '));await ctx.close()});
  await t('WP-05 nome com código não executa nada',async()=>{const {ctx,p}=await novo();await cadastrar(p);await addManual(p,'Vit <img src=y onerror=window.__xss=true>','vitamina');for(const tab of ['lista','alertas','hoje'])await p.evaluate(t=>go(t),tab);await p.reload();await p.waitForTimeout(700);
    assert(!(await p.evaluate(()=>window.__xss)),'código executou');await ctx.close()});
  await t('WP-19 item digitado repetido é bloqueado',async()=>{const {ctx,p}=await novo();await cadastrar(p);await addManual(p,'Remedio Teste');await addManual(p,'Remedio Teste');const s=await st(p);assert(s.list.length===1,'ficou com '+s.list.length);await ctx.close()});
  await t('WP-28 item digitado avisa que não foi checado',async()=>{const {ctx,p}=await novo();await cadastrar(p);await addManual(p,'Remedio Teste');const id=(await st(p)).list[0];await p.evaluate(id=>openSheet(sheetItem(id),{item:id}),id);await p.waitForTimeout(300);
    assert((await p.innerText('#sheetBody')).includes('não conseguimos checar'),'sem aviso');await ctx.close()});
  await t('WP-17 e WP-16 boas-vindas e ficha não aparecem ao reabrir',async()=>{const {ctx,p}=await novo();await cadastrar(p);await p.reload();await p.waitForTimeout(700);assert(!(await p.isVisible('#onb.on')),'boas-vindas de novo');
    assert(await p.evaluate(()=>document.querySelector('#sos').classList.contains('off')||!document.querySelector('#sos').innerHTML),'ficha aberta');await ctx.close()});
  await t('WP-10 assinatura não é simulada',async()=>{const {ctx,p}=await novo();await cadastrar(p);await p.evaluate(()=>go('planos'));await p.waitForTimeout(300);await p.click('[data-plan="premium"]');await p.waitForTimeout(300);
    assert(!(await p.isVisible('#sheet.on')),'abriu checkout');assert((await st(p)).plan==='gratis','virou premium');await ctx.close()});
  await t('WP-12 Equipe sem profissionais fictícios',async()=>{const {ctx,p}=await novo();await cadastrar(p);await p.evaluate(()=>go('equipe'));await p.waitForTimeout(300);assert(!(await p.innerText('#view')).includes('Paulo'),'médico fictício');await ctx.close()});
  await t('Meus médicos: adicionar, ver botões de ligar/WhatsApp/mapa, editar e remover',async()=>{const {ctx,p}=await novo();await cadastrar(p);await p.evaluate(()=>{stopRing();go('equipe')});await p.waitForTimeout(300);
    await p.click('[data-newcontact]');await p.waitForTimeout(450);await p.fill('#nc-nome','Dra. Carla Lima');await p.fill('#nc-area','Cardiologista');await p.fill('#nc-clinica','Clínica Coração');await p.fill('#nc-crm','CRM-PR 12345');
    await p.fill('#nc-tel','(44) 3025-1111');await p.fill('#nc-wa','(44) 99999-2222');await p.fill('#nc-end','Av. Brasil, 100, Maringá');await p.click('[data-savecontact]');await p.waitForTimeout(500);
    let tx=await p.innerText('#view');assert(tx.includes('Dra. Carla Lima')&&tx.includes('Clínica Coração'),'não listou: '+tx.slice(0,150));
    await p.click('[data-contact]');await p.waitForTimeout(450);const hrefs=await p.$$eval('#sheetBody a',a=>a.map(x=>x.getAttribute('href')).join(' '));
    assert(hrefs.includes('tel:+554430251111')&&hrefs.includes('wa.me/5544999992222')&&hrefs.includes('google.com/maps'),'links: '+hrefs);
    await p.click('[data-editcontact]');await p.waitForTimeout(450);assert((await p.inputValue('#nc-nome'))==='Dra. Carla Lima','editar sem dados');await p.fill('#nc-area','Clínica geral');await p.click('[data-savecontact]');await p.waitForTimeout(500);
    const s=await st(p);assert(s.extraPros.length===1&&s.extraPros[0].area==='Clínica geral','edição criou outro ou não salvou');
    await p.click('[data-contact]');await p.waitForTimeout(450);await p.click('[data-delcontact]');await p.waitForTimeout(500);assert(!(await p.innerText('#view')).includes('Carla'),'não removeu');await ctx.close()});
  await t('Abertura com o logo só ao reabrir, some sozinha e não cobre o alarme',async()=>{const {ctx,p}=await novo('2026-11-21T07:59:58');assert(!(await p.$('.splash')),'abertura no 1º acesso');await cadastrar(p);await addManual(p,'Remedio Teste');
    await p.clock.setSystemTime(BR('2026-11-21T08:00:30'));await p.reload();await p.waitForTimeout(300);assert(await p.$('.splash'),'sem abertura ao reabrir');
    const z=await p.evaluate(()=>[+getComputedStyle($('.splash')).zIndex,+getComputedStyle($('#alarm')).zIndex]);assert(z[0]<z[1],'abertura por cima do alarme');
    await p.clock.runFor(2500);await p.waitForTimeout(100);assert(!(await p.$('.splash')),'abertura não sumiu');await ctx.close()});
  await t('WP-21 intolerância não aparece como alergia',async()=>{const {ctx,p}=await novo();await cadastrar(p);await p.evaluate(()=>{S.profile.obs='Intolerância a lactose';S.list.push('calcio');save();go('hoje')});await p.waitForTimeout(300);
    const tx=await p.innerText('#view');assert(!tx.includes('alergênico')&&!tx.includes('tem alergia'),'chamou de alergia');await ctx.close()});
  await t('Tela travada: sem zoom, sem rolagem lateral, campos com 16px (pedido do Jack; texto maior fica em Tamanho do texto)',async()=>{const {ctx,p}=await novo();assert((await p.getAttribute('meta[name=viewport]','content')).includes('user-scalable=no'),'zoom liberado');
    const r=await p.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,fs:[...document.querySelectorAll('input,select,textarea')].map(e=>parseFloat(getComputedStyle(e).fontSize))}));
    assert(r.sw<=r.vw,'rolagem lateral '+r.sw+'>'+r.vw);assert(r.fs.every(f=>f>=16),'campo com letra pequena '+r.fs);await ctx.close()});
  await t('Sem erros de JavaScript no fluxo principal',async()=>{const {ctx,p}=await novo();await cadastrar(p);await addManual(p,'Remedio Teste');for(const tab of ['lista','alertas','equipe','planos','perfil','hoje'])await p.evaluate(t=>go(t),tab);
    assert(!p.errs.length,p.errs.join(' | '));await ctx.close()});
  await b.close();srv.close();console.log(`\n${ok} passaram, ${fail} falharam`);process.exit(fail?1:0)})();
