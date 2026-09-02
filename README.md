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
4. Cada teste executa uma consulta de 1 crédito. Cada busca usa até 12 créditos, ajustáveis por `EUREKA_SERPER_BUDGET` (6 a 30). O cadastro inicial do Serper inclui 2.500 créditos gratuitos, sem cartão.

### Por que 100 resultados por consulta

No Serper, uma consulta de até 10 resultados custa 1 crédito e uma consulta de 11 a 100 resultados custa 2. São **10 perfis por crédito contra 50** — pedir a página cheia é cinco vezes mais barato por perfil encontrado. A versão anterior paginava de 10 em 10 afirmando o contrário, e por isso decidia a lista final sobre poucas dezenas de nomes. Com 6 consultas de 100 resultados, o conjunto avaliado passa a ser de centenas de perfis, e o corte continua acontecendo **depois** do ranking.

### Orçamento de palavras da consulta

Toda consulta respeita 30 palavras: o Google descarta em silêncio o excedente de consultas longas. A ordem dos blocos é **cargo → geografia → critério → exclusões → empresas**, e o que não couber é descartado inteiro, nunca cortado no meio de um grupo `OR`.

A geografia vem antes do critério de propósito: uma busca sem critério devolve profissionais demais na região certa, enquanto uma busca sem região devolve o mundo inteiro. Duas medidas devolveram espaço ao orçamento:

- o **país sai da consulta** e passa para o operador `site:` — `site:br.linkedin.com/in` resolve a geografia nacional sem gastar palavra alguma;
- cada conceito entra com no máximo **3 sinônimos** em vez de 10. Um grupo `OR` de dez expressões consumia sozinho 21 das 30 palavras e empurrava a geografia para fora — era a causa técnica das buscas que voltavam com o profissional certo no país errado. Os sinônimos restantes continuam valendo no ranking, onde não custam nada.

Anúncios de vaga passam a ser excluídos **na própria consulta** (`-intitle:vagas -intitle:jobs -"estamos contratando"`), em vez de recuperados, pontuados e só então penalizados.

O backend monta uma pesquisa natural compatível com contas gratuitas do Serper, aceita somente URLs públicas de perfis individuais do LinkedIn e remove duplicidades. Antes da pesquisa, o motor Python identifica cargos equivalentes em português, inglês e espanhol. Cada palavra-chave preenchida é tratada como critério prioritário, com equivalentes multilíngues quando disponíveis; o resultado informa se a evidência pública é completa, parcial ou insuficiente. Depois, o motor reordena os resultados por aderência profissional explicável: função, competências, senioridade e localização visíveis no resultado público. Se o motor Python estiver indisponível, a busca é interrompida em vez de apresentar uma lista não validada. O sistema não faz scraping do LinkedIn e não usa enriquecimento do Apollo.

## Como o Eureka decide quem entra na lista

O critério é **precisão em primeiro lugar**: trazer o perfil errado custa mais caro do que deixar um bom perfil de fora.

### Léxico funcional, não taxonomia

Até esta versão, a aderência era decidida por uma taxonomia fixa de 19 famílias profissionais escritas à mão. Uma taxonomia **classifica**: ela precisa conter a carreira do candidato, e o que ela não contém ela julga errado. A medição mostrou que o comportamento se invertia conforme a família fosse ou não reconhecida — onde era reconhecida o filtro reprovava quase todo mundo, e onde não era, aprovava quase todo mundo.

O que decide agora é um **léxico** (`python-service/lexicon.py`), que não classifica: ele apenas informa que "abate", "slaughter" e "faena" são a mesma coisa. Dele saem dois conjuntos, extraídos da própria vaga e traduzidos para os três idiomas:

- **núcleo funcional** — o que a pessoa faz;
- **conceitos de domínio** — o vocabulário distintivo da vaga.

A regra de elegibilidade é uma só, em três camadas do sistema: **o perfil exerce a função, ou demonstra dois ou mais conceitos do domínio.** Nenhuma das duas evidências e o perfil não entra. Exigir dois conceitos, e não um, é deliberado: um único termo adjacente não pode carregar um perfil de outra carreira para dentro da lista.

Duas distinções sustentam a precisão:

- **área guarda-chuva não é função.** Em "Business Partner de RH", a função é business partner e "RH" é o contexto; em "Especialista em Genética Bovina", a função é genética e "bovina" diz sobre o quê. Sem essa distinção, qualquer Gerente de RH e qualquer comprador de gado entravam pela porta da frente.
- **substantivo comum não prova função.** Fora do léxico, os termos são comparados pela grafia — e "trabalho" casa com metade do mercado.

Vocabulário ausente **degrada suavemente**: o termo continua valendo pela grafia original, sem penalidade. Acrescentar grupos ao léxico é aditivo e seguro, e é a única manutenção que este mecanismo pede.

### Um único vocabulário para os dois motores

O léxico é calculado uma vez, na interpretação da vaga, e enviado à camada TypeScript junto com os títulos equivalentes (`roleCore`, `domainConcepts`, `levelTerms`). As duas camadas passam a decidir sobre o **mesmo** vocabulário. Enquanto cada motor mantinha a própria lista, um aprovava exatamente quem o outro reprovava.

### Nota normalizada pelo que é observável

A régua anterior dividia todo candidato por um total fixo de 100 pontos, dos quais 20 dependiam de sinais que quase nunca aparecem num trecho de 160 caracteres — escopo global e cidade confirmada. Um Supervisor de Abate perfeito chegava no máximo a 62 e nunca saía de "expansão": a régua fora calibrada para um cargo executivo global e aplicada a toda a operação.

Cada critério agora declara se pôde ser **observado naquele perfil**. O que não pôde sai do numerador **e** do denominador — ausência de evidência deixa de ser tratada como evidência de ausência. Liderança só é cobrada em vaga de liderança; geografia só entra quando o trecho traz localização (cerca de quatro em cada cinco não trazem).

Em troca vem a **trava de precisão**: normalizar sozinho premiaria quem tem menos informação pública, porque menos critérios no denominador tornam mais fácil acertar todos. A nota é multiplicada por um fator de confiança que cresce com o número de critérios **independentes** confirmados. Quem confirma um único critério não alcança o topo, ainda que o acerte.

### Efeito medido

Conjunto rotulado à mão, com perfis escritos no formato que o Google devolve:

| Conjunto | Precisão | Recall |
| --- | --- | --- |
| 10 vagas · 60 perfis | 75% → **100%** | 83% → **100%** |
| 4 vagas · 21 perfis, domínios fora do léxico | 53% → **90%** | 100% → **90%** |

O segundo conjunto é o mais honesto: foi escrito para cobrir domínios que o léxico não conhecia. Antes de acrescentar aquele vocabulário, só com as regras novas, o resultado era 86% de precisão e 60% de recall — a precisão vem da regra, o recall vem do vocabulário.

O recall de 100% do motor anterior no conjunto cego não é qualidade: ele aprovava 9 perfis errados em 19.

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

## Proteção das rotas administrativas

As rotas `/api/admin/talent-source` e `/api/admin/gupy-token` gravam a chave do Serper e o token da Gupy e **não tinham nenhuma autenticação**: quem conhecesse o endereço do sistema em produção podia sobrescrever as duas credenciais. A criptografia AES-256 protege os dados guardados no Supabase, mas não impede a escrita por um terceiro.

A trava imediata:

1. Na Vercel, em **Settings → Environment Variables**, crie `EUREKA_ADMIN_KEY` com 16 caracteres ou mais.
2. Faça um novo deploy.
3. No Eureka, abra **Configurações** e digite a mesma senha no campo **Senha administrativa**.

A senha fica apenas na aba aberta do navegador (`sessionStorage`): nunca vai para o banco e some ao fechar. A leitura de status continua aberta — ela não expõe credencial, só informa se a integração está ativa. Sem a variável configurada, a gravação é **negada**: falhar fechado é deliberado, porque a alternativa seria um sistema que parece protegido e não está.

Esta é a proteção imediata. A definitiva é o Supabase Auth restrito ao domínio corporativo, com perfis analista e admin, e esta trava foi desenhada para sair do caminho quando ele chegar.

## Onda 2 — leitura por modelo e memória de vagas

Duas capacidades novas, ambas **opcionais e de degradação segura**: sem chave e sem Supabase, o Eureka funciona exatamente como na Onda 1.

### A leitura amplia, o parecer restringe

A divisão entre as duas etapas é o que preserva o critério de precisão em primeiro lugar.

**A interpretação amplia.** Antes de montar as consultas, o modelo lê a vaga e devolve vocabulário de mercado: a função nos três idiomas, os conceitos técnicos distintivos e os títulos realmente praticados. Esse vocabulário é **somado** ao do léxico, nunca o substitui — uma indisponibilidade do modelo reduz a cobertura da busca sem quebrá-la. É aqui que está o ganho de alcance, e esta etapa não decide sobre candidato nenhum.

**O parecer restringe.** Depois do ranking, os perfis do topo recebem uma leitura individual com veredito, nota e uma justificativa curta citando o trecho que a sustenta. O parecer pesa 35% da nota final e reordena a lista. O que ele **não** pode fazer é promover alguém que as regras reprovaram: perfil reprovado nem chega a ser enviado ao modelo. Um veredito "fraco" derruba o perfil para o fim da lista, mas ele continua visível — o recrutador precisa poder discordar.

Medido sobre três vagas em domínios que o léxico não cobre (crédito rural, refeitório industrial, topografia), com o retorno do modelo simulado:

| | Precisão | Recall |
| --- | --- | --- |
| Só léxico | 86% | 67% |
| Léxico + leitura | 90% | **100%** |

### Como o Eureka aprende o perfil de vagas da casa

Cada "Aprovar" ou "Descartar" na lista é gravado e reagrega a memória daquela família de vaga na mesma chamada — o recrutador vê o efeito da própria decisão imediatamente.

O que a memória guarda: os **títulos de mercado** que já produziram aprovação, os **termos** recorrentes nos perfis aprovados, as **empresas** de onde os aprovados vêm, e os títulos com histórico de descarte. Na busca seguinte, os títulos confirmados viram uma camada de consulta própria e os termos confirmados contam como domínio.

Três decisões de desenho merecem registro:

- **Não é um modelo treinado, é memória com contadores.** A escolha é deliberada. Dá para abrir e ler exatamente o que o sistema aprendeu, apagar uma linha errada, e explicar ao requisitante — ou a uma auditoria — por que um nome subiu. Um modelo ajustado seria uma caixa-preta, precisaria de milhares de exemplos e carregaria o viés dentro dos pesos.
- **Uma aprovação isolada não vira padrão.** São necessárias duas confirmações para um título influenciar a busca, e dois descartes sem nenhuma aprovação para um título ser rebaixado. Um "sim" ou um "não" solitário é acaso, não aprendizado.
- **A memória move, nunca abre a porta.** O ajuste vale no máximo ±12 pontos e só se aplica a quem já é elegível. O time pode aprovar um trader dez vezes: isso não faz um trader entrar numa vaga de abate. A porta lateral fechada na Onda 1 continua fechada, inclusive para o aprendizado.

O ajuste é calculado no motor Python, onde a nota final é decidida. Calculá-lo apenas na camada TypeScript faria ele ser sobrescrito na reavaliação — a mesma classe de erro que fazia os dois motores se anularem antes da Onda 1.

### Ativar

**Leitura por modelo.** Na Vercel, crie `EUREKA_LLM_API_KEY`. O provedor padrão é a Anthropic; `EUREKA_LLM_PROVIDER` aceita também `openai` e `compatible` (qualquer endpoint no formato da OpenAI). Custo estimado: **poucos centavos de dólar por busca** — duas chamadas, uma de interpretação e uma de parecer. A tela exibe o custo de cada busca.

**Memória de vagas.** Rode o `supabase/schema.sql` atualizado, que cria `candidate_feedback` e `role_memory`. Com o Supabase já configurado, os botões de decisão aparecem sozinhos.

### Duas notas de risco

**Injeção de instrução.** Descrições de vaga e trechos de perfil são conteúdo que terceiros escrevem: qualquer pessoa pode colocar "ignore as instruções anteriores" no próprio LinkedIn. Todo conteúdo externo entra delimitado por um marcador aleatório que o próprio texto não consegue fechar, e o sistema instrui o modelo a tratá-lo como dado. Há teste automatizado para essa garantia.

**LGPD.** A tabela `candidate_feedback` guarda dado pessoal de candidatos — URL do perfil público, cargo, empregador e o trecho indexado pelo Google. Trate-a como base de sourcing: defina o prazo de retenção junto ao jurídico e apague o que passar dele. A tabela `role_memory` guarda apenas vocabulário agregado e contadores, sem dado pessoal.
