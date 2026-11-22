-- AE Finance: office-only 4-digit engineer PINs. Never store a plaintext PIN.
-- Uses a private schema, bcrypt, office-membership checks and a shared 15-minute lockout after 5 attempts.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.engineer_pin_credentials (
  engineer_id uuid primary key references public.engineers(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on private.engineer_pin_credentials from public, anon, authenticated;

create or replace function public.engineer_pin_status()
returns table(engineer_id uuid, configured boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.office_members m where m.user_id = auth.uid() and m.active
  ) then raise exception 'Not authorized' using errcode='42501'; end if;
  return query
    select e.id, p.engineer_id is not null
      from public.engineers e
      left join private.engineer_pin_credentials p on p.engineer_id=e.id
      where e.active;
end;
$$;

create or replace function public.set_engineer_pin(p_engineer_id uuid, p_pin text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.office_members m where m.user_id=auth.uid() and m.active
  ) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits' using errcode='22023';
  end if;
  if not exists (select 1 from public.engineers where id=p_engineer_id and active) then
    raise exception 'Engineer not found' using errcode='22023';
  end if;
  -- Once configured, a PIN cannot be silently replaced with an office session.
  -- Reset a lost PIN using an authorized administrative SQL procedure.
  if exists(select 1 from private.engineer_pin_credentials where engineer_id=p_engineer_id) then
    raise exception 'PIN already configured. Contact office administrator for a reset.' using errcode='23505';
  end if;
  insert into private.engineer_pin_credentials(engineer_id,pin_hash,failed_attempts,locked_until,updated_at)
    values (p_engineer_id,extensions.crypt(p_pin,extensions.gen_salt('bf',11)),0,null,now());
  return true;
end;
$$;

create or replace function public.verify_engineer_pin(p_engineer_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cred private.engineer_pin_credentials%rowtype;
  attempts integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.office_members m where m.user_id=auth.uid() and m.active
  ) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if not exists (select 1 from public.engineers where id=p_engineer_id and active) then
    return jsonb_build_object('ok',false,'reason','inactive');
  end if;
  select * into cred from private.engineer_pin_credentials
    where engineer_id=p_engineer_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','setup'); end if;
  if cred.locked_until is not null and cred.locked_until>now() then
    return jsonb_build_object('ok',false,'reason','locked','locked_until',cred.locked_until);
  end if;
  if cred.pin_hash=extensions.crypt(p_pin,cred.pin_hash) then
    update private.engineer_pin_credentials
      set failed_attempts=0,locked_until=null where engineer_id=p_engineer_id;
    return jsonb_build_object('ok',true);
  end if;
  attempts:=coalesce(cred.failed_attempts,0)+1;
  if cred.locked_until is not null and cred.locked_until<=now() then
    attempts:=1;
  end if;
  update private.engineer_pin_credentials set failed_attempts=attempts,
    locked_until=case when attempts>=5 then now()+interval '15 minutes' else null end
    where engineer_id=p_engineer_id;
  return jsonb_build_object('ok',false,'reason',case when attempts>=5 then 'locked' else 'invalid' end,
    'remaining',greatest(0,5-attempts));
end;
$$;

revoke all on function public.engineer_pin_status() from public, anon;
revoke all on function public.set_engineer_pin(uuid,text) from public, anon;
revoke all on function public.verify_engineer_pin(uuid,text) from public, anon;
grant execute on function public.engineer_pin_status() to authenticated;
grant execute on function public.set_engineer_pin(uuid,text) to authenticated;
grant execute on function public.verify_engineer_pin(uuid,text) to authenticated;