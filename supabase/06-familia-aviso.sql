-- WePill · 06 · Aviso de dose atrasada para a Família (app v100)
-- Rode inteiro no SQL Editor do projeto wepill-br. Pode rodar de novo sem problema.
-- Depois atualize a função "lembretes" (código novo) e faça o merge do PR.

-- 1) Cada celular com avisos ligados passa a saber de quem é (só quando a pessoa está numa família).
alter table public.push_subs add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists push_subs_user on public.push_subs(user_id);

-- 2) Registro dos avisos de atraso já mandados (um por dose por dia).
create table if not exists public.fam_avisos (
  user_id uuid not null references auth.users(id) on delete cascade,
  k       text not null,
  dia     date not null,
  em      timestamptz not null default now(),
  primary key (user_id, k, dia)
);
alter table public.fam_avisos enable row level security;
revoke all on public.fam_avisos from anon, authenticated;

-- 3) O app, já logado na Família, liga este celular à conta. Só quem tem o endpoint (secreto, do próprio aparelho) consegue.
create or replace function public.push_vincular(p_endpoint text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  update push_subs set user_id = auth.uid() where endpoint = p_endpoint;
  return found;
end $$;
revoke all on function public.push_vincular(text) from public;
grant execute on function public.push_vincular(text) to authenticated;

-- limpeza: avisos com mais de 7 dias
delete from public.fam_avisos where dia < current_date - 7;

select 'ok' as resultado;
