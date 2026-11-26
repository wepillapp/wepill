-- 07-planos.sql · WePill · venda pela Cakto (26/11/2026)
-- Lista de assinantes. Por enquanto o Jack adiciona cada venda à mão (e-mail do cliente).
-- Depois um aviso automático da Cakto (webhook) vai preencher a mesma tabela.

create table if not exists public.assinantes (
  email  text primary key,
  plano  text not null check (plano in ('premium','familia')),
  ate    date not null,
  obs    text,
  criado timestamptz not null default now()
);
alter table public.assinantes enable row level security;
-- sem políticas: ninguém lê nem grava direto pelo app; só pelas funções abaixo.

-- e-mail sempre em minúsculas, sem espaços
create or replace function public.assinantes_norm() returns trigger
language plpgsql as $$ begin new.email := lower(trim(new.email)); return new; end $$;
drop trigger if exists assinantes_norm on public.assinantes;
create trigger assinantes_norm before insert or update on public.assinantes
for each row execute function public.assinantes_norm();

-- plano Família ativo para uma família (pelo e-mail do dono)
create or replace function public.familia_paga(p_familia uuid) returns boolean
language sql security definer set search_path = public, auth stable as $$
  select exists (
    select 1 from familias f join auth.users u on u.id = f.dono
    join assinantes a on a.email = lower(u.email)
    where f.id = p_familia and a.plano = 'familia' and a.ate >= current_date)
$$;

-- o app pergunta: qual é o meu plano? (o meu e-mail, ou a família de quem paga o Família)
create or replace function public.meu_plano() returns json
language plpgsql security definer set search_path = public, auth stable as $$
declare p text; d date; f uuid;
begin
  if auth.uid() is null then return json_build_object('plano','gratis'); end if;
  select a.plano, a.ate into p, d from assinantes a
   where a.email = lower(coalesce(auth.jwt()->>'email','')) and a.ate >= current_date;
  if p is not null then return json_build_object('plano',p,'ate',d); end if;
  select familia_id into f from membros where user_id = auth.uid() limit 1;
  if f is not null and public.familia_paga(f) then
    select a.ate into d from familias fa join auth.users u on u.id = fa.dono
      join assinantes a on a.email = lower(u.email) where fa.id = f;
    return json_build_object('plano','familia','ate',d,'membro',true);
  end if;
  return json_build_object('plano','gratis');
end $$;
grant execute on function public.meu_plano() to authenticated;

-- convite da Família só para quem tem o plano Família (famílias que já existem continuam funcionando)
create or replace function public.gerar_convite() returns text
language plpgsql security definer set search_path = public as $$
declare f uuid; c text; n int := 0;
begin
  select familia_id into f from membros where user_id = auth.uid() and papel = 'responsavel';
  if f is null then raise exception 'só o responsável convida'; end if;
  if not public.familia_paga(f) then raise exception 'o convite faz parte do plano Família'; end if;
  if (select count(*) from membros where familia_id = f) >= 3 then raise exception 'a família já tem 3 pessoas'; end if;
  delete from convites where familia_id = f and usado_por is null;
  delete from convites where expira_em < now() - interval '7 days';
  loop
    c := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000))::text, 6, '0');
    exit when not exists (select 1 from convites where codigo = c);
    n := n + 1;
    if n > 30 then raise exception 'tente de novo'; end if;
  end loop;
  insert into convites(codigo, familia_id, criado_por) values (c, f, auth.uid());
  return c;
end $$;

-- COMO LIBERAR UMA VENDA (copie, troque o e-mail e rode):
-- insert into assinantes (email, plano, ate, obs) values ('cliente@email.com', 'premium', current_date + 32, 'Cakto')
--   on conflict (email) do update set plano = excluded.plano, ate = excluded.ate, obs = excluded.obs;
-- Família: troque 'premium' por 'familia'. Renovou na Cakto: rode de novo (a data anda mais 32 dias).
-- Cancelou: update assinantes set ate = current_date - 1 where email = 'cliente@email.com';
