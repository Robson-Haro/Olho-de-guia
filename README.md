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
4. Cada teste executa uma consulta Serper. A busca adaptativa usa até 8 consultas curtas em camadas — título exato, cargos equivalentes, gênero (quando a chave está ativa), domínio e páginas adicionais — para formar um conjunto amplo e só então selecionar os melhores perfis. O limite pode ser ajustado com `EUREKA_SERPER_BUDGET` (4 a 16). O cadastro inicial do Serper inclui 2.500 consultas gratuitas, sem cartão.

Toda consulta respeita um orçamento de 30 palavras: o Google descarta em silêncio o excedente de consultas longas, e era exatamente a geografia — o último bloco — que se perdia. Os blocos são montados por prioridade (cargo → critério → geografia → empresas) e o que não couber é descartado inteiro, nunca cortado no meio de um grupo `OR`.

O backend monta uma pesquisa natural compatível com contas gratuitas do Serper, aceita somente URLs públicas de perfis individuais do LinkedIn e remove duplicidades. Antes da pesquisa, o motor Python identifica cargos equivalentes em português, inglês e espanhol. Cada palavra-chave preenchida é tratada como critério prioritário, com equivalentes multilíngues quando disponíveis; o resultado informa se a evidência pública é completa, parcial ou insuficiente. Depois, o motor reordena os resultados por aderência profissional explicável: função, competências, senioridade e localização visíveis no resultado público. Se o motor Python estiver indisponível, a busca é interrompida em vez de apresentar uma lista não validada. O sistema não faz scraping do LinkedIn e não usa enriquecimento do Apollo.

### Inteligência geográfica internacional

- seleção de qualquer país da lista ISO, com idioma e mercado da consulta ajustados automaticamente;
- nomenclatura regional adaptada ao país (estado, província, departamento, região ou cantão);
- uma a vinte cidades por busca, abertas dinamicamente no formulário;
- distribuição das cidades entre até quatro consultas geográficas, preservando o limite de consumo do Serper;
- opção de busca em todo o país, sem manter o viés técnico fixo para o Brasil;
- ranking geográfico por evidência pública de cidade, divisão administrativa e país;
- painel de resultados universal por país → região → cidade, com localidades não confirmadas claramente sinalizadas.

## Motor Python multilíngue

- FastAPI executado como serviço Python no mesmo projeto Vercel;
- taxonomia profissional multilíngue para PT/EN/ES;
- expansão de títulos equivalentes antes da busca;
- ranking posterior dos perfis com motivo da pontuação;
- confiança da evidência baseada na quantidade de informação pública disponível;
- exportação da lista ordenada para `.xlsx`, com filtros e links ativos;
- testes unitários do ranking, das equivalências e do arquivo Excel.

A pontuação usa somente informações profissionais. Não utiliza nem infere idade, raça, deficiência, saúde, religião ou outros atributos pessoais sensíveis. A pontuação apoia a triagem, mas não automatiza aprovação ou reprovação; a decisão final deve ser humana.

## Chave de gênero (sourcing de diversidade)

Recurso **opcional e desligado por padrão**, criado para apoiar metas de diversidade na etapa de sourcing.

| Estado | Comportamento |
| --- | --- |
| Todos os gêneros (padrão) | Nenhuma inferência é executada, gravada ou exportada. |
| Feminino / Masculino | As consultas ao Google passam a incluir o cargo flexionado (`Coordenadora de Logística`) e o pronome declarado no perfil (`"Ela/Dela" OR "She/Her" OR "Ella/Suya"`), e a lista final exibe apenas perfis com gênero identificado. |

Como a inferência é feita, em ordem de prioridade:

1. **Pronome declarado** pelo próprio profissional no perfil público — confiança 98%;
2. **Forma gramatical do cargo** em português/espanhol — a forma feminina é uma marcação deliberada (confiança 88%); a masculina é a forma genérica da língua e vale menos (62%);
3. **Prenome**, por dicionário curado e, na ausência dele, por padrão morfológico de PT/ES — 92% e 72%.

Regras de governança embutidas:

- a chave **não soma nem subtrai um único ponto de aderência**, em nenhuma etapa; ela é aplicada **depois** da aprovação por cargo, senioridade, critérios obrigatórios e geografia, e apenas recorta o conjunto já aprovado;
- toda inferência carrega **confiança e base textual**, exibidas na tela e exportadas em duas colunas da planilha;
- a auditoria da busca informa quantos perfis foram separados por gênero divergente e quantos por falta de identificação;
- a opção **"manter perfis não identificados"** existe porque prenomes ambíguos (Alex, Ariel, Darci) e cargos neutros (Gerente, Analista) não permitem conclusão — sem ela, profissionais do gênero procurado ficam de fora;
- a decisão final continua humana; a chave não aprova nem reprova ninguém.

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
- Inteligência geográfica internacional com país, região e múltiplas cidades
- Download da lista em Excel
