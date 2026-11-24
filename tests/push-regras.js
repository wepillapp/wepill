// Testa as regras da função lembretes (supabase/functions/lembretes/index.ts) sem servidor.
const fs=require('fs'),src=fs.readFileSync(__dirname+'/../supabase/functions/lembretes/index.ts','utf8');
const bloco=src.split('// ---- regras')[1].split('// ---- fim das regras')[0].replace(/^[^\n]*\n/,'');
const R=new Function(bloco+';return {agoraLocal,decidir,mensagem}')();
let ok=0,fail=0;const t=(n,f)=>{try{f();ok++;console.log('  ✓ '+n)}catch(e){fail++;console.log('  ✗ '+n+'\n      '+e.message)}};const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+' esperado '+JSON.stringify(b)+' veio '+JSON.stringify(a))};
const at=s=>new Date(s);const all=[1,1,1,1,1,1,1];
const sub=(o={})=>({tz:'America/Sao_Paulo',schedule:[{k:'a#0',t:'08:00',d:all,n:10},{k:'b#0',t:'08:00',d:all,n:0},{k:'c#0',t:'21:30',d:all,n:10}],taken:{},sent:{},...o});
t('hora local de São Paulo',()=>{const L=R.agoraLocal('America/Sao_Paulo',at('2026-11-24T11:02:00Z'));eq([L.day,L.dow,L.min],['2026-11-24',2,8*60+2])});
t('manda na hora, agrupando as doses do mesmo horário',()=>{const r=R.decidir(sub(),at('2026-11-24T11:00:30Z'));eq(r.avisos,[{t:'08:00',keys:['a#0','b#0'],rep:false}]);eq(r.sent.keys,{'a#0':1,'b#0':1})});
t('não manda antes da hora nem duas vezes',()=>{eq(R.decidir(sub(),at('2026-11-24T10:59:00Z')).avisos,[]);const s=sub({sent:{day:'2026-11-24',keys:{'a#0':1,'b#0':1}}});eq(R.decidir(s,at('2026-11-24T11:03:00Z')).avisos,[])});
t('repete após 5 min só para quem tem insistir e não tomou',()=>{const s=sub({sent:{day:'2026-11-24',keys:{'a#0':1,'b#0':1}}});eq(R.decidir(s,at('2026-11-24T11:03:00Z')).avisos,[]);const r=R.decidir(s,at('2026-11-24T11:05:00Z'));eq(r.avisos,[{t:'08:00',keys:['a#0'],rep:true}]);eq(r.sent.keys['a#0'],2)});
t('não repete se marcou como tomado',()=>{const s=sub({sent:{day:'2026-11-24',keys:{'a#0':1,'b#0':1}},taken:{day:'2026-11-24',keys:['a#0']}});eq(R.decidir(s,at('2026-11-24T11:05:00Z')).avisos.length,0)});
t('no máximo 5 avisos por dose, de 5 em 5 min',()=>{const s=sub({sent:{day:'2026-11-24',keys:{'a#0':4,'b#0':1}}});eq(R.decidir(s,at('2026-11-24T11:20:00Z')).avisos[0].keys,['a#0']);const s2=sub({sent:{day:'2026-11-24',keys:{'a#0':5,'b#0':1}}});eq(R.decidir(s2,at('2026-11-24T11:25:00Z')).avisos,[])});
t('respeita os dias da semana',()=>{const s=sub({schedule:[{k:'x#0',t:'08:00',d:[1,0,0,0,0,0,0],n:0}]});eq(R.decidir(s,at('2026-11-24T11:00:00Z')).avisos,[]);eq(R.decidir(s,at('2026-11-29T11:00:00Z')).avisos.length,1)});
t('dia novo zera o que foi enviado ontem',()=>{const s=sub({sent:{day:'2026-11-23',keys:{'a#0':3,'b#0':3}}});eq(R.decidir(s,at('2026-11-24T11:01:00Z')).avisos[0].keys,['a#0','b#0'])});
t('fuso inválido cai em São Paulo; agenda estragada não quebra',()=>{eq(R.decidir(sub({tz:'Lua/Base'}),at('2026-11-24T11:00:00Z')).avisos.length,1);eq(R.decidir({schedule:[null,{k:'z'},{k:'y',t:'xx',d:all}]},at('2026-11-24T11:00:00Z')).avisos,[])});
t('texto do aviso',()=>{const m=R.mensagem({t:'08:00',keys:['a','b'],rep:false});eq(m.title,'Hora do remédio');eq(m.body,'2 doses das 08:00 para tomar agora. Toque para abrir o WePill.')});
console.log(`\n${ok} passaram, ${fail} falharam`);process.exit(fail?1:0);
