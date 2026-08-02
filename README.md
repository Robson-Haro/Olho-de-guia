# Olho de Águia — Talent Hunter

Sistema de inteligência para hunting, ranking explicável, shortlist e integração com a Gupy.

## Executar

```bash
npm install
npm run dev
```

Copie `.env.example` para `.env.local` e configure Supabase, e-mail administrador e chave de criptografia. O token Gupy e a chave do Serper são cadastrados posteriormente na área administrativa e nunca são versionados ou enviados ao navegador.

## Busca pública no LinkedIn com Serper

1. Crie uma conta em [serper.dev](https://serper.dev/) e copie a API key.
2. No Eureka, abra **Configurações > Fontes de talentos**.
3. Cole a chave em **Serper · Busca LinkedIn** e clique em **Salvar e ativar**.
4. Cada teste ou busca do Eureka executa uma única consulta Serper. O cadastro inicial do Serper inclui 2.500 consultas gratuitas, sem cartão.

O backend monta uma pesquisa natural compatível com contas gratuitas do Serper, aceita somente URLs públicas de perfis individuais do LinkedIn, remove duplicidades e ordena os resultados por uma aderência explicável baseada no título, palavras-chave e localização visíveis no resultado público. O sistema não faz scraping do LinkedIn e não usa enriquecimento do Apollo.

## Primeira versão

- Dashboard metálico e responsivo
- Importação de vaga por código (estrutura de API)
- Radar de candidatos e aderência
- Navegação para busca, shortlist e banco de talentos
- Área de configurações identificada como exclusiva do administrador
- Busca de perfis públicos do LinkedIn via Serper
- Tabela com nome, cargo, empresa, localização, aderência e link clicável
