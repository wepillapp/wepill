// @ts-nocheck
// WePill · função "lembretes" (Supabase Edge Function)
// Roda a cada minuto (chamada pelo pg_cron do 05-push.sql) e manda o aviso de remédio
// para os celulares cujo horário chegou, mesmo com o app fechado.
// Segredos necessários (Edge Functions > Secrets): VAPID_PUBLIC, VAPID_PRIVATE, CRON_SECRET. O banco vem de SUPABASE_DB_URL.
// "Verify JWT" desligado: a proteção é o cabeçalho x-cron-secret.
import webpush from "npm:web-push@3.6.7";
import postgres from "npm:postgres@3.4.5";

// ---- regras (JS puro, testado em tests/push-regras.js) ----
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function agoraLocal(tz, now) {
  let p;
  try { p = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(now); }
  catch (_e) { return agoraLocal("America/Sao_Paulo", now); }
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return { day: `${g("year")}-${g("month")}-${g("day")}`, dow: WD[g("weekday")], min: (+g("hour") % 24) * 60 + +g("minute") };
}
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "")); return m ? +m[1] * 60 + +m[2] : -1; };
// Decide o que mandar agora. Devolve {avisos:[{t, keys, rep}], sent}
function decidir(sub, now) {
  const L = agoraLocal(sub.tz || "America/Sao_Paulo", now);
  const sent = sub.sent && sub.sent.day === L.day ? { day: L.day, keys: { ...(sub.sent.keys || {}) } } : { day: L.day, keys: {} };
  const taken = sub.taken && sub.taken.day === L.day ? new Set(sub.taken.keys || []) : new Set();
  const grupos = {};
  for (const s of Array.isArray(sub.schedule) ? sub.schedule : []) {
    if (!s || !s.k || !Array.isArray(s.d) || !s.d[L.dow] || taken.has(s.k)) continue;
    const t0 = toMin(s.t); if (t0 < 0) continue;
    const ms = L.min - t0; if (ms < 0) continue;
    const n = sent.keys[s.k] || 0, gap = 5, MAX = 5;
    const insiste = +s.n > 0;
    // 1º aviso na hora (até 5 min de atraso); se "insistir" e não marcou como tomado, repete de 5 em 5 min até 5 avisos
    let manda = false;
    if (n === 0 && ms <= 5) manda = true;
    else if (insiste && n >= 1 && n < MAX && ms >= n * gap && ms <= n * gap + 2) manda = true;
    if (!manda) continue;
    sent.keys[s.k] = n + 1;
    const g = grupos[s.t] || (grupos[s.t] = { t: s.t, keys: [], rep: n > 0 });
    g.keys.push(s.k); if (n === 0) g.rep = false;
  }
  return { avisos: Object.values(grupos), sent };
}
function mensagem(a) {
  const q = a.keys.length;
  return {
    title: a.rep ? "Lembrete: hora do remédio" : "Hora do remédio",
    body: a.rep
      ? `Você ainda não marcou ${q > 1 ? q + " doses" : "a dose"} das ${a.t}. Toque para abrir o WePill.`
      : `${q > 1 ? q + " doses" : "1 dose"} das ${a.t} para tomar agora. Toque para abrir o WePill.`,
    tag: "wepill-" + a.t, url: "/app/", keys: a.keys,
  };
}
// Família: doses de uma pessoa que passaram 10 min sem "Tomei" (até 2 h depois).
// m = {tz, schedule:[{k,t,d}], takenKeys:Set (de hoje), takenDoses:[{item_id, quando: Date}]}
function atrasadas(m, now, LIM = 10, JAN = 120) {
  const L = agoraLocal(m.tz || "America/Sao_Paulo", now), out = [];
  const tomadas = new Set();
  for (const d of m.takenDoses || []) {
    const D = agoraLocal(m.tz || "America/Sao_Paulo", d.quando);
    if (D.day === L.day) tomadas.add(d.item_id + "@" + D.min);
  }
  for (const s of Array.isArray(m.schedule) ? m.schedule : []) {
    if (!s || !s.k) continue;
    if (Array.isArray(s.d) && !s.d[L.dow]) continue;
    const t0 = toMin(s.t); if (t0 < 0) continue;
    const atraso = L.min - t0; if (atraso < LIM || atraso > JAN) continue;
    if (m.takenKeys && m.takenKeys.has(s.k)) continue;
    if (tomadas.has(String(s.k).split("#")[0] + "@" + t0)) continue;
    out.push({ k: s.k, t: s.t, day: L.day });
  }
  return out;
}
function msgFamilia(nome, t, q) {
  const quem = (String(nome || "").trim().split(/\s+/)[0] || "Alguém da família").slice(0, 30);
  return { title: "WePill · Família", body: `${quem} ainda não marcou ${q > 1 ? q + " doses" : "a dose"} das ${t}. Que tal dar uma olhada?`, tag: "wepill-fam-" + quem + "-" + t, url: "/app/", keys: [] };
}
// ---- fim das regras ----

async function avisosFamilia(sql, now) {
  if (now.getUTCMinutes() === 0) await sql`delete from public.fam_avisos where dia < current_date - 7`;
  const membros = await sql`select m.familia_id, m.user_id, coalesce(nullif(m.apelido,''), p.nome, '') as nome
    from public.membros m left join public.perfis p on p.id = m.user_id`;
  if (!membros.length) return 0;
  const subs = await sql`select endpoint, p256dh, auth, user_id, tz, schedule, taken from public.push_subs where user_id is not null`;
  const ids = membros.map((m) => m.user_id);
  const itens = await sql`select user_id, item_id, dados from public.itens where ativo and user_id in ${sql(ids)}`;
  const doses = await sql`select user_id, item_id, tomado_em, previsto_para from public.doses
    where status = 'tomada' and user_id in ${sql(ids)} and previsto_para > now() - interval '30 hours'`;
  const J = (v) => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch (_e) { return null; } };
  let enviados = 0;
  for (const m of membros) {
    const meus = subs.filter((x) => x.user_id === m.user_id);
    const outros = subs.filter((x) => x.user_id !== m.user_id && membros.some((o) => o.user_id === x.user_id && o.familia_id === m.familia_id));
    if (!outros.length) continue;
    // horários: do celular da pessoa (com dias e liga/desliga); se ela não ligou os avisos, da lista salva na Família
    let schedule = [], tz = "America/Sao_Paulo";
    const takenKeys = new Set();
    for (const x of meus) {
      tz = x.tz || tz;
      for (const s of J(x.schedule) || []) if (s && s.k && !schedule.some((y) => y.k === s.k)) schedule.push(s);
      const tk = J(x.taken) || {};
      if (tk.day === agoraLocal(tz, now).day) for (const k of tk.keys || []) takenKeys.add(k);
    }
    if (!schedule.length) {
      for (const it of itens.filter((i) => i.user_id === m.user_id)) {
        const d = J(it.dados) || {};
        (Array.isArray(d.horas) ? d.horas : []).forEach((h, i) => schedule.push({ k: it.item_id + "#" + i, t: h }));
      }
    }
    const takenDoses = doses.filter((d) => d.user_id === m.user_id).map((d) => ({ item_id: d.item_id, quando: new Date(d.previsto_para) }));
    const late = atrasadas({ tz, schedule, takenKeys, takenDoses }, now);
    const porHora = {};
    for (const a of late) {
      const novo = await sql`insert into public.fam_avisos (user_id, k, dia) values (${m.user_id}, ${a.k}, ${a.day})
        on conflict do nothing returning k`;
      if (novo.length) (porHora[a.t] = porHora[a.t] || []).push(a.k);
    }
    for (const t of Object.keys(porHora)) {
      const msg = JSON.stringify(msgFamilia(m.nome, t, porHora[t].length));
      for (const o of outros) {
        try {
          await webpush.sendNotification({ endpoint: o.endpoint, keys: { p256dh: o.p256dh, auth: o.auth } }, msg, { TTL: 3600, urgency: "high" });
          enviados++;
        } catch (e) {
          const st = (e && e.statusCode) || 0;
          if (st === 404 || st === 410) await sql`delete from public.push_subs where endpoint = ${o.endpoint}`;
          else console.error("falha familia", st);
        }
      }
    }
  }
  return enviados;
}

// Conexão direta com o banco (SUPABASE_DB_URL vem pronto em toda Edge Function): não depende de chave de API.
let sql = null;
Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("não autorizado", { status: 401 });
  try {
    const vpub = Deno.env.get("VAPID_PUBLIC"), vpriv = Deno.env.get("VAPID_PRIVATE");
    if (!vpub || !vpriv) throw new Error("faltam os segredos VAPID_PUBLIC/VAPID_PRIVATE");
    webpush.setVapidDetails("mailto:wepilladm@gmail.com", vpub.trim(), vpriv.trim());
    if (!sql) sql = postgres(Deno.env.get("SUPABASE_DB_URL"), { prepare: false, max: 1 });
    const subs = await sql`select endpoint, p256dh, auth, tz, schedule, taken, sent from public.push_subs`;
    const now = new Date(); let enviados = 0, removidos = 0, falhas = 0;
    const J = (v) => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch (_e) { return null; } };
    let doses = 0;
    for (const row of subs) {
      const sub = { ...row, schedule: J(row.schedule) || [], taken: J(row.taken) || {}, sent: J(row.sent) || {} };
      doses += Array.isArray(sub.schedule) ? sub.schedule.length : 0;
      const { avisos, sent } = decidir(sub, now);
      if (!avisos.length) continue;
      let morto = false;
      for (const a of avisos) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(mensagem(a)), { TTL: 1800, urgency: "high" });
          enviados++;
        } catch (e) {
          const st = (e && e.statusCode) || 0;
          if (st === 404 || st === 410) { morto = true; break; }
          falhas++; console.error("falha ao enviar", st, e && e.body ? e.body : String(e));
        }
      }
      if (morto) { await sql`delete from public.push_subs where endpoint = ${sub.endpoint}`; removidos++; }
      else await sql`update public.push_subs set sent = ${sql.json(sent)} where endpoint = ${sub.endpoint}`;
    }
    // ---- Família: avisa os outros quando alguém passa 30 min sem marcar a dose ----
    let familia = 0;
    try { familia = await avisosFamilia(sql, now); } catch (e) { console.error("ERRO familia:", e && e.message ? e.message : String(e)); }
    const L = agoraLocal("America/Sao_Paulo", now);
    const r = { familia, hora: L.day + " " + String(Math.floor(L.min / 60)).padStart(2, "0") + ":" + String(L.min % 60).padStart(2, "0"), celulares: subs.length, doses, enviados, removidos, falhas };
    console.log("lembretes", JSON.stringify(r));
    return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ERRO lembretes:", e && e.message ? e.message : String(e));
    return new Response(JSON.stringify({ erro: String(e && e.message || e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
