-- 08-remedios-extra.sql · WePill · base própria de remédios (27/11/2026)
-- Quando o cliente escaneia um código que não está na lista da Anvisa (CMED), o app manda
-- um pedido para esta tabela: só o código, o nome que ele escolheu e uma foto pequena da caixa.
-- Nenhum dado da pessoa (nem e-mail, nem id) é guardado.
-- A equipe revisa na página wepill.com.br/equipe.html e aprova; aprovado vale para todos.
-- Rode este arquivo inteiro uma vez no SQL Editor do Supabase.

create table if not exists public.remedios_extra (
  id         bigint generated always as identity primary key,
  codigo     text check (codigo is null or codigo ~ '^[0-9]{8,14}$'),
  nome       text check (nome is null or length(nome) <= 160),
  dose       text check (dose is null or length(dose) <= 60),
  substancia text check (substancia is null or length(substancia) <= 200),
  cat        text not null default 'remedio' check (cat in ('remedio','suplemento','vitamina','fito')),
  sugestoes  text,          -- o que os clientes escolheram ou digitaram (até 2.000 letras)
  foto       text,          -- foto pequena da caixa (jpeg em texto, até ~300 KB)
  pedidos    int  not null default 1,
  aprovado   boolean not null default false,
  criado     timestamptz not null default now(),
  revisado   timestamptz
);
alter table public.remedios_extra enable row level security;
-- sem políticas: o app só usa as funções abaixo.
create index if not exists remedios_extra_codigo on public.remedios_extra (codigo);

-- quem pode revisar (a equipe). Depois de rodar o arquivo, adicione o seu e-mail:
--   insert into public.equipe (email) values ('seu-email@exemplo.com');
create table if not exists public.equipe (email text primary key);
alter table public.equipe enable row level security;

create or replace function public.sou_equipe() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from equipe where email = lower(coalesce(auth.jwt()->>'email','')))
$$;

-- 1) o app pede um remédio que não achou
create or replace function public.pedir_remedio(p_codigo text, p_nome text, p_foto text) returns void
language plpgsql security definer set search_path = public as $$
declare r remedios_extra;
begin
  p_codigo := nullif(regexp_replace(coalesce(p_codigo,''), '[^0-9]', '', 'g'), '');
  p_nome := nullif(left(trim(coalesce(p_nome,'')), 160), '');
  if p_codigo is not null and p_codigo !~ '^[0-9]{8,14}$' then return; end if;
  if p_codigo is null and p_nome is null then return; end if;
  if p_foto is not null and (length(p_foto) > 300000 or p_foto !~ '^data:image/jpeg;base64,') then p_foto := null; end if;
  -- proteção contra abuso: no máximo 300 pedidos novos por hora no total
  if (select count(*) from remedios_extra where criado > now() - interval '1 hour') > 300 then return; end if;
  -- código já aprovado: nada a fazer
  if p_codigo is not null and exists (select 1 from remedios_extra where codigo = p_codigo and aprovado) then return; end if;
  if p_codigo is not null then
    select * into r from remedios_extra where codigo = p_codigo and not aprovado order by id limit 1;
  else
    select * into r from remedios_extra where codigo is null and not aprovado and lower(nome) = lower(p_nome) order by id limit 1;
  end if;
  if r.id is null then
    insert into remedios_extra (codigo, nome, sugestoes, foto) values (p_codigo, p_nome, p_nome, p_foto);
  else
    update remedios_extra set
      pedidos   = pedidos + case when p_nome is null or p_codigo is null then 1 else 0 end,
      nome      = coalesce(nome, p_nome),
      sugestoes = case when p_nome is null or position(p_nome in coalesce(sugestoes,'')) > 0 then sugestoes
                       else left(concat_ws(' | ', sugestoes, p_nome), 2000) end,
      foto      = case when p_foto is not null and (foto is null or p_nome is not null) then p_foto else foto end
    where id = r.id;
  end if;
end $$;

-- 2) o app baixa a lista aprovada (sem fotos)
create or replace function public.remedios_extra_lista()
returns table (codigo text, nome text, dose text, substancia text, cat text)
language sql security definer set search_path = public stable as $$
  select codigo, nome, dose, substancia, cat from remedios_extra where aprovado order by nome
$$;

-- 3) página da equipe: lista os pedidos (mais pedidos primeiro)
create or replace function public.remedios_pendentes()
returns setof remedios_extra
language plpgsql security definer set search_path = public stable as $$
begin
  if not sou_equipe() then raise exception 'Só a equipe WePill pode ver os pedidos.'; end if;
  return query select * from remedios_extra where not aprovado order by pedidos desc, id limit 200;
end $$;

create or replace function public.remedios_aprovados()
returns setof remedios_extra
language plpgsql security definer set search_path = public stable as $$
begin
  if not sou_equipe() then raise exception 'Só a equipe WePill pode ver.'; end if;
  return query select * from remedios_extra where aprovado order by revisado desc nulls last limit 500;
end $$;

-- 4) aprovar (com nome, dose, substância e categoria revisados)
create or replace function public.remedio_aprovar(p_id bigint, p_nome text, p_dose text, p_substancia text, p_cat text) returns void
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not sou_equipe() then raise exception 'Só a equipe WePill pode aprovar.'; end if;
  if coalesce(trim(p_nome),'') = '' then raise exception 'Falta o nome.'; end if;
  select codigo into c from remedios_extra where id = p_id;
  if c is not null then delete from remedios_extra where codigo = c and aprovado and id <> p_id; end if;
  update remedios_extra set nome = left(trim(p_nome),160), dose = nullif(left(trim(coalesce(p_dose,'')),60),''),
    substancia = nullif(left(trim(coalesce(p_substancia,'')),200),''),
    cat = case when p_cat in ('remedio','suplemento','vitamina','fito') then p_cat else 'remedio' end,
    aprovado = true, revisado = now(), foto = null  -- a foto do cliente é apagada depois da revisão
  where id = p_id;
end $$;

-- 5) apagar um pedido (spam, foto errada) ou tirar um aprovado
create or replace function public.remedio_apagar(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not sou_equipe() then raise exception 'Só a equipe WePill pode apagar.'; end if;
  delete from remedios_extra where id = p_id;
end $$;

grant execute on function public.pedir_remedio(text,text,text) to anon, authenticated;
grant execute on function public.remedios_extra_lista() to anon, authenticated;
grant execute on function public.remedios_pendentes() to authenticated;
grant execute on function public.remedios_aprovados() to authenticated;
grant execute on function public.remedio_aprovar(bigint,text,text,text,text) to authenticated;
grant execute on function public.remedio_apagar(bigint) to authenticated;
revoke execute on function public.sou_equipe() from public;
grant execute on function public.sou_equipe() to authenticated;

-- Contagem rápida (opcional, para ver no SQL Editor):
--   select codigo, nome, pedidos from remedios_extra where not aprovado order by pedidos desc;
