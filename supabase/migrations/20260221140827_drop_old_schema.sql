-- Suppression totale des tables métier
drop table if exists public.payments cascade;
drop table if exists public.subscription_requests cascade;
drop table if exists public.members cascade;
drop table if exists public.user_roles cascade;

-- Suppression des fonctions/types liés
drop function if exists public.has_role(uuid, public.app_role);
drop function if exists public.update_updated_at_column();
drop type if exists public.app_role;
