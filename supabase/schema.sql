create table if not exists public.app_settings (
  key text primary key,
  encrypted_value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Sem policy: navegadores e usuários comuns não conseguem ler a tabela.
-- O backend acessa exclusivamente pela service role do Supabase.

-- ===================================================================== --
-- MEMÓRIA DE VAGAS (Onda 2)
--
-- O Eureka aprende o perfil de contratação da casa a partir das decisões do
-- recrutador. O aprendizado é memória organizacional com contadores, não um
-- modelo treinado: é auditável linha a linha, reversível apagando uma linha, e
-- funciona a partir da primeira decisão.
--
-- LGPD: `candidate_feedback` guarda dado pessoal de candidatos (URL do perfil
-- público, cargo, empregador e o trecho indexado pelo Google). Trate-a como
-- base de sourcing: defina o prazo de retenção junto ao jurídico e apague o que
-- passar dele. `role_memory` guarda apenas vocabulário agregado e contadores —
-- nenhum dado pessoal.
-- ===================================================================== --

create table if not exists public.candidate_feedback (
  role_key text not null,
  profile_url text not null,
  candidate_title text not null default '',
  company text not null default '',
  summary text not null default '',
  decision text not null check (decision in ('aprovado', 'descartado', 'contratado')),
  reason text not null default '',
  decided_by text not null default '',
  decided_at timestamptz not null default now(),
  primary key (role_key, profile_url)
);

create index if not exists candidate_feedback_decision_idx
  on public.candidate_feedback (role_key, decision);

create table if not exists public.role_memory (
  role_key text primary key,
  role_label text not null default '',
  -- Títulos de mercado que já produziram aprovação, com o contador.
  confirmed_titles jsonb not null default '[]'::jsonb,
  -- Títulos com dois ou mais descartes e nenhuma aprovação. Rebaixam a nota;
  -- nunca eliminam, porque uma decisão pontual não pode fechar uma porta.
  demoted_titles jsonb not null default '[]'::jsonb,
  -- Termos recorrentes nos perfis aprovados: o domínio real da casa.
  confirmed_terms jsonb not null default '[]'::jsonb,
  -- Empregadores de onde os aprovados costumam vir.
  companies jsonb not null default '[]'::jsonb,
  approved_count integer not null default 0,
  discarded_count integer not null default 0,
  hired_count integer not null default 0,
  search_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.candidate_feedback enable row level security;
alter table public.role_memory enable row level security;

-- Sem policy: navegadores e usuários comuns não conseguem ler estas tabelas.
-- O backend acessa exclusivamente pela service role do Supabase.
