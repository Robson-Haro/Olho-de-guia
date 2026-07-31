create table if not exists public.app_settings (
  key text primary key,
  encrypted_value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Sem policy: navegadores e usuários comuns não conseguem ler a tabela.
-- O backend acessa exclusivamente pela service role do Supabase.
