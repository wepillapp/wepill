-- WePill · 05 · Alarme com o app fechado (Web Push)
-- Rode inteiro no SQL Editor do projeto wepill-br. Pode rodar de novo sem problema.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Cada celular que ligou os avisos. Não guarda nome de remédio: só horários.
create table if not exists public.push_subs (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  tz         text not null default 'America/Sao_Paulo',
  schedule   jsonb not null default '[]'::jsonb,   -- [{k:"id#0", t:"08:00", d:[1,1,1,1,1,1,1], n:10}]
  taken      jsonb not null default '{}'::jsonb,   -- {day:"2026-11-24", keys:["id#0"]}
  sent       jsonb not null default '{}'::jsonb,   -- {day:"2026-11-24", keys:{"id#0":1}}
  updated_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
-- Sem políticas: ninguém lê ou grava direto. O app usa só as duas funções abaixo.
revoke all on public.push_subs from anon, authenticated;

-- O app salva/atualiza os horários deste celular. O endpoint é secreto e único por aparelho.
create or replace function public.push_save(p_endpoint text, p_p256dh text, p_auth text, p_tz text, p_schedule jsonb, p_taken jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_endpoint is null or p_endpoint !~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/' then
    raise exception 'endpoint inválido';
  end if;
  if length(p_endpoint) > 1000 or length(coalesce(p_p256dh,'')) > 200 or length(coalesce(p_auth,'')) > 100 then raise exception 'dados grandes demais'; end if;
  if jsonb_typeof(p_schedule) <> 'array' or jsonb_array_length(p_schedule) > 80 then raise exception 'horários inválidos'; end if;
  if length(p_schedule::text) > 20000 or length(coalesce(p_taken,'{}'::jsonb)::text) > 5000 then raise exception 'dados grandes demais'; end if;
  insert into push_subs(endpoint,p256dh,auth,tz,schedule,taken,updated_at)
  values (p_endpoint,p_p256dh,p_auth,coalesce(nullif(p_tz,''),'America/Sao_Paulo'),p_schedule,coalesce(p_taken,'{}'::jsonb),now())
  on conflict (endpoint) do update set p256dh=excluded.p256dh, auth=excluded.auth, tz=excluded.tz,
    schedule=excluded.schedule, taken=excluded.taken, updated_at=now();
end $$;

-- O app avisa que desligou os avisos (ou que o celular saiu).
create or replace function public.push_remove(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subs where endpoint = p_endpoint;
$$;

revoke all on function public.push_save(text,text,text,text,jsonb,jsonb) from public;
revoke all on function public.push_remove(text) from public;
grant execute on function public.push_save(text,text,text,text,jsonb,jsonb) to anon, authenticated;
grant execute on function public.push_remove(text) to anon, authenticated;

-- Relógio: a cada minuto chama a função "lembretes", que manda os avisos da hora.
select cron.unschedule('wepill-lembretes') where exists (select 1 from cron.job where jobname = 'wepill-lembretes');
select cron.schedule('wepill-lembretes', '* * * * *', $$
  select net.http_post(
    url := 'https://bdltkeymohiegmiyneka.supabase.co/functions/v1/lembretes',
    headers := '{"Content-Type":"application/json","x-cron-secret":"COLE_AQUI_O_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 25000)
$$);
