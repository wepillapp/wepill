-- WePill · 04 · Família mais simples (app v84)
-- Titular + 2 pessoas, convite com código de 6 números, convidado entra sem cadastro,
-- responsável pode remover alguém. Cole tudo no SQL Editor e clique em Run. Pode rodar mais de uma vez.

-- tentativas de código errado (trava quem tenta adivinhar)
create table if not exists public.convite_tentativas (
  user_id uuid not null references auth.users(id) on delete cascade,
  em timestamptz not null default now()
);
create index if not exists convite_tentativas_user on public.convite_tentativas(user_id, em);
alter table public.convite_tentativas enable row level security;
revoke all on public.convite_tentativas from anon, authenticated;

create or replace function public.eh_anonimo() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- só quem entrou com e-mail cria família
create or replace function public.criar_familia(p_nome text default 'Minha família') returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'faça login'; end if;
  if public.eh_anonimo() then raise exception 'entre com seu e-mail para criar a família'; end if;
  if exists (select 1 from membros where user_id = auth.uid()) then raise exception 'você já está em uma família'; end if;
  insert into familias(nome, dono) values (left(coalesce(nullif(p_nome,''),'Minha família'), 80), auth.uid()) returning id into f;
  insert into membros(familia_id, user_id, papel) values (f, auth.uid(), 'responsavel');
  return f;
end $$;

-- convite: 6 números, um por vez por família, vale 48 horas
create or replace function public.gerar_convite() returns text
language plpgsql security definer set search_path = public as $$
declare f uuid; c text; n int := 0;
begin
  select familia_id into f from membros where user_id = auth.uid() and papel = 'responsavel';
  if f is null then raise exception 'só o responsável convida'; end if;
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

-- aceitar: devolve a família, ou null se o código não vale. 5 erros por hora e trava.
create or replace function public.aceitar_convite(p_codigo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cv convites%rowtype; c text; me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login'; end if;
  if (select count(*) from convite_tentativas where user_id = me and em > now() - interval '1 hour') >= 5 then
    raise exception 'muitas tentativas';
  end if;
  if exists (select 1 from membros where user_id = me) then raise exception 'você já está em uma família'; end if;
  c := upper(regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Za-z]', '', 'g'));
  if c like 'WP%' then c := substr(c, 3); end if;
  select * into cv from convites where codigo = c for update;
  if not found or cv.usado_por is not null or cv.expira_em < now() then
    insert into convite_tentativas(user_id) values (me);
    return null;
  end if;
  if (select count(*) from membros where familia_id = cv.familia_id) >= 3 then raise exception 'a família já tem 3 pessoas'; end if;
  insert into membros(familia_id, user_id, papel) values (cv.familia_id, me, 'membro');
  update convites set usado_por = me where codigo = cv.codigo;
  return cv.familia_id;
end $$;

-- responsável remove alguém. Convidado sem e-mail tem a conta apagada junto.
create or replace function public.remover_membro(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare f uuid; an boolean;
begin
  select familia_id into f from public.membros where user_id = auth.uid() and papel = 'responsavel';
  if f is null then raise exception 'só o responsável remove'; end if;
  if p_user = auth.uid() then raise exception 'para sair, use Desfazer família'; end if;
  delete from public.membros where familia_id = f and user_id = p_user;
  if not found then return; end if;
  select is_anonymous into an from auth.users where id = p_user;
  if coalesce(an, false) then delete from auth.users where id = p_user; end if;
end $$;

-- desfazer família: convidados sem e-mail são apagados junto
create or replace function public.sair_da_familia() returns void
language plpgsql security definer set search_path = public, auth as $$
declare f uuid; pp text;
begin
  select familia_id, papel into f, pp from public.membros where user_id = auth.uid();
  if f is null then return; end if;
  if pp = 'responsavel' then
    delete from auth.users where is_anonymous and id in (select user_id from public.membros where familia_id = f and user_id <> auth.uid());
    delete from public.familias where id = f;
  else
    delete from public.membros where user_id = auth.uid() and familia_id = f;
  end if;
end $$;

create or replace function public.apagar_minha_conta() returns void
language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login'; end if;
  delete from auth.users where is_anonymous and id in (
    select m.user_id from public.membros m join public.familias fa on fa.id = m.familia_id
    where fa.dono = me and m.user_id <> me);
  delete from public.familias where dono = me;
  delete from auth.users where id = me;
end $$;

revoke execute on function public.remover_membro(uuid) from public, anon;
grant execute on function public.remover_membro(uuid) to authenticated;
revoke execute on function public.apagar_minha_conta() from public, anon;
grant execute on function public.apagar_minha_conta() to authenticated;
grant execute on function public.criar_familia(text), public.gerar_convite(), public.aceitar_convite(text), public.sair_da_familia(), public.eh_anonimo() to authenticated;

-- convidado sem e-mail só grava dados depois de entrar numa família (evita abuso de contas anônimas)
create or replace function public.pode_gravar() returns boolean
language sql stable security definer set search_path = public as $$
  select not public.eh_anonimo() or exists (select 1 from membros where user_id = auth.uid());
$$;
grant execute on function public.pode_gravar() to authenticated;
drop policy if exists perfis_meu on public.perfis;
create policy perfis_meu on public.perfis for all using (id = auth.uid()) with check (id = auth.uid() and public.pode_gravar());
drop policy if exists itens_meus on public.itens;
create policy itens_meus on public.itens for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.pode_gravar());
drop policy if exists doses_minhas on public.doses;
create policy doses_minhas on public.doses for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.pode_gravar());
drop policy if exists push_meu on public.push_inscricoes;
create policy push_meu on public.push_inscricoes for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.pode_gravar());
