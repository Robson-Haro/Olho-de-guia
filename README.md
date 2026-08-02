# Olho de Águia — Talent Hunter

Sistema de inteligência para hunting, ranking profissional explicável, shortlist e integração com a Gupy.

## Executar

```bash
npm install
npx vercel dev
```

O comando `vercel dev` inicia os dois serviços do projeto: o frontend Next.js e o motor FastAPI/Python.

Copie `.env.example` para `.env.local` e configure Supabase, e-mail administrador e chave de criptografia. O token Gupy e a chave do Serper são cadastrados posteriormente na área administrativa e nunca são versionados ou enviados ao navegador.

## Busca pública no LinkedIn com Serper

1. Crie uma conta em [serper.dev](https://serper.dev/) e copie a API key.
2. No Eureka, abra **Configurações > Fontes de talentos**.
3. Cole a chave em **Serper · Busca LinkedIn** e clique em **Salvar e ativar**.
4. Cada teste executa uma consulta Serper. A busca adaptativa usa de 3 a 4 consultas para pesquisar o título principal, variações do cargo e uma página adicional quando a cobertura é baixa. O cadastro inicial do Serper inclui 2.500 consultas gratuitas, sem cartão.

O backend monta uma pesquisa natural compatível com contas gratuitas do Serper, aceita somente URLs públicas de perfis individuais do LinkedIn e remove duplicidades. Antes da pesquisa, o motor Python identifica cargos equivalentes em português, inglês e espanhol. Depois, reordena os resultados por aderência profissional explicável: função, competências, senioridade e localização visíveis no resultado público. O sistema não faz scraping do LinkedIn e não usa enriquecimento do Apollo.

## Motor Python multilíngue

- FastAPI executado como serviço Python no mesmo projeto Vercel;
- taxonomia profissional multilíngue para PT/EN/ES;
- expansão de títulos equivalentes antes da busca;
- ranking posterior dos perfis com motivo da pontuação;
- confiança da evidência baseada na quantidade de informação pública disponível;
- exportação da lista ordenada para `.xlsx`, com filtros e links ativos;
- testes unitários do ranking, das equivalências e do arquivo Excel.

O motor usa somente informações profissionais. Não utiliza nem infere idade, gênero, raça, deficiência, saúde, religião ou outros atributos pessoais sensíveis. A pontuação apoia a triagem, mas não automatiza aprovação ou reprovação; a decisão final deve ser humana.

### Limitação dos dados públicos

O Serper fornece título, URL e trecho público indexado pelo Google. Portanto, quando o currículo completo não foi fornecido ao Eureka, a aderência é calculada apenas sobre esse conteúdo público. O sistema mostra a confiança das evidências para não tratar um trecho curto como se fosse a leitura integral do perfil.

## Primeira versão

- Dashboard metálico e responsivo
- Importação de vaga por código (estrutura de API)
- Radar de candidatos e aderência
- Navegação para busca, shortlist e banco de talentos
- Área de configurações identificada como exclusiva do administrador
- Busca de perfis públicos do LinkedIn via Serper
- Tabela com nome, cargo, empresa, localização, aderência e link clicável
- Motor Python com cargos equivalentes em três idiomas
- Quantidade configurável de 1 a 20 candidatos, com interrupção automática da busca ao atingir o limite
- Download da lista em Excel
