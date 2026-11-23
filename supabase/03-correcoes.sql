-- WePill · Correções da auditoria (22/11/2026) · cole no Supabase › SQL Editor › New query › Run
-- Pode rodar mais de uma vez sem estragar nada. Não apaga dados de ninguém.

-- 1) WP-04: membro da família não pode mais virar "responsável" sozinho.
--    Antes, a regra deixava cada pessoa mudar qualquer coisa da própria linha, inclusive o papel.
drop policy if exists membros_apelido on public.membros;
revoke update on public.membros from authenticated;
create or replace function public.definir_apelido(p_apelido text) returns void
language sql security definer set search_path = public as $$
  update membros set apelido = left(coalesce(p_apelido, ''), 40) where user_id = auth.uid();
$$;
revoke execute on function public.definir_apelido(text) from public, anon;
grant execute on function public.definir_apelido(text) to authenticated;

-- 2) WP-24: limites de tamanho (evita que uma conta encha o banco).
--    "not valid" = vale para tudo que for gravado daqui em diante, sem checar o que já existe.
alter table public.perfis drop constraint if exists perfis_nome_tam;
alter table public.perfis add constraint perfis_nome_tam check (char_length(nome) <= 80) not valid;
alter table public.familias drop constraint if exists familias_nome_tam;
alter table public.familias add constraint familias_nome_tam check (char_length(nome) <= 80) not valid;
alter table public.itens drop constraint if exists itens_tam;
alter table public.itens add constraint itens_tam check (char_length(item_id) <= 64 and pg_column_size(dados) <= 4096) not valid;
alter table public.doses drop constraint if exists doses_item_tam;
alter table public.doses add constraint doses_item_tam check (char_length(item_id) <= 64) not valid;

-- 3) WP-08: a própria pessoa apaga a conta e tudo ligado a ela (LGPD).
--    Se ela for responsável por uma família, a família também é apagada.
create or replace function public.apagar_minha_conta() returns void
language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'faça login'; end if;
  delete from public.familias where dono = me;
  delete from auth.users where id = me;  -- apaga em cascata perfil, itens, doses, convites e participação em famílias
end $$;
revoke execute on function public.apagar_minha_conta() from public, anon;
grant execute on function public.apagar_minha_conta() to authenticated;

-- 4) WP-04 (reforço): só quem é responsável de verdade continua responsável.
--    Corrige famílias que tenham mais de um responsável por causa da falha antiga.
update public.membros m set papel = 'membro'
from public.familias f
where m.familia_id = f.id and m.papel = 'responsavel' and m.user_id <> f.dono;
