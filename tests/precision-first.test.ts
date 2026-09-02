import test from "node:test";
import assert from "node:assert/strict";
import { assessCandidateEvidence } from "../lib/evidence-scoring.ts";
import { boundedSearchQuery } from "../lib/search-guardrails.ts";

/**
 * Bateria de regressão da rodada "precisão em primeiro lugar".
 *
 * Cada teste aqui trava um comportamento que foi MEDIDO como quebrado antes da
 * correção. Se algum deles voltar a falhar, o sintoma correspondente voltou.
 */

// Vocabulário como o motor Python o entrega: núcleo funcional traduzido e
// conceitos de domínio agrupados por sinônimo.
const ABATE = {
  jobTitle: "Supervisor de Abate",
  roleCore: ["abate", "abatedouro", "slaughter", "slaughterhouse", "faena"],
  domainConcepts: [
    ["abate", "slaughter", "faena"],
    ["bovino", "beef", "cattle", "vacuno"],
    ["bem estar animal", "animal welfare", "bienestar animal"],
    ["carcaca", "carcass", "canal"],
  ],
  requiredConcepts: [],
};

test("o equivalente em inglês do cargo é aprovado", () => {
  // Antes: reprovado como "família profissional divergente (Qualidade)", porque
  // o trecho público continha a palavra HACCP.
  const result = assessCandidateEvidence({
    ...ABATE,
    candidateTitle: "Slaughter Supervisor",
    candidateText: "Slaughter Supervisor at Marfrig · Beef processing, animal welfare, HACCP.",
    geographicMatch: "targeted",
  });
  assert.equal(result.eligible, true);
  assert.equal(result.evidence.find((item) => item.criterion === "role")?.status, "confirmed");
});

test("profissional de outra carreira continua reprovado", () => {
  // Antes: numa vaga cuja família a taxonomia não cobria, o filtro deixava de
  // filtrar e este perfil entrava na lista.
  const result = assessCandidateEvidence({
    ...ABATE,
    candidateTitle: "Trader de Carnes",
    candidateText: "Trader de Carnes na Minerva · Exportação de proteína bovina para Ásia e MENA.",
    geographicMatch: "targeted",
  });
  assert.equal(result.eligible, false);
  assert.ok(result.rejectionReasons.includes("sem evidência pública da função nem do domínio da vaga"));
});

test("um único termo de domínio não carrega perfil de outra carreira", () => {
  // A regra exige DOIS conceitos distintos. Um termo adjacente isolado não
  // pode servir de passaporte.
  const result = assessCandidateEvidence({
    ...ABATE,
    candidateTitle: "Analista Financeiro",
    candidateText: "Analista Financeiro · Custos de compra de gado bovino e fechamento contábil.",
    geographicMatch: "targeted",
  });
  assert.equal(result.eligible, false);
});

test("cargo operacional perfeito alcança alta aderência sem cidade no trecho", () => {
  // Antes: o teto matemático era 62 de 100, e o candidato ideal de uma vaga de
  // operação nunca saía de "expansão". Complexidade global e cidade confirmada
  // valiam 20 pontos inalcançáveis num trecho de 160 caracteres.
  const result = assessCandidateEvidence({
    ...ABATE,
    candidateTitle: "Supervisor de Abate",
    candidateText: "Supervisor de Abate na JBS · abate bovino, bem-estar animal e rendimento de carcaça.",
    geographicMatch: "targeted",
    geographicLabel: "consulta direcionada a Barretos; localização não confirmada",
  });
  assert.equal(result.eligible, true);
  assert.ok(result.score >= 78, `esperava alta aderência, obtive ${result.score}`);
  assert.equal(result.classification, "high");
});

test("critério não observável sai da conta em vez de zerar a nota", () => {
  const result = assessCandidateEvidence({
    ...ABATE,
    candidateTitle: "Supervisor de Abate",
    candidateText: "Supervisor de Abate · abate bovino e carcaça.",
    geographicMatch: "targeted",
  });
  const geography = result.evidence.find((item) => item.criterion === "geography");
  const leadership = result.evidence.find((item) => item.criterion === "leadership");
  assert.equal(geography?.observable, false, "geografia não confirmada deve sair do denominador");
  assert.equal(leadership?.observable, false, "vaga sem liderança não deve cobrar evidência de liderança");
});

test("perfil com um único sinal confirmado não alcança o topo", () => {
  // TRAVA DE PRECISÃO. Normalizar sozinho premiaria quem tem menos informação
  // pública: menos critérios no denominador, mais fácil acertar todos.
  const magro = assessCandidateEvidence({
    ...ABATE,
    candidateTitle: "Supervisor de Abate",
    candidateText: "Supervisor de Abate",
    geographicMatch: "targeted",
  });
  const completo = assessCandidateEvidence({
    ...ABATE,
    candidateTitle: "Supervisor de Abate",
    candidateText: "Supervisor de Abate na JBS · abate bovino, bem-estar animal, rendimento de carcaça. Barretos, São Paulo.",
    geographicMatch: "city",
    geographicLabel: "cidade atual confirmada: Barretos",
  });
  assert.ok(
    completo.score > magro.score,
    `perfil com mais evidência (${completo.score}) deve superar o perfil magro (${magro.score})`,
  );
  assert.ok(magro.score < 78, `perfil de sinal único não deve ser alta aderência, obtive ${magro.score}`);
});

test("senioridade muito abaixo continua eliminatória", () => {
  const result = assessCandidateEvidence({
    jobTitle: "Gerente de Manutenção Industrial",
    roleCore: ["manutencao", "maintenance", "mantenimiento"],
    domainConcepts: [["manutencao", "maintenance"], ["utilidades", "utilities", "amonia", "ammonia"]],
    candidateTitle: "Assistente de Manutenção",
    candidateText: "Assistente de Manutenção · apoio à equipe de utilidades e amônia.",
    requiredConcepts: [],
    geographicMatch: "city",
    geographicLabel: "cidade atual confirmada: Barretos",
  });
  assert.equal(result.eligible, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("senioridade")));
});

test("a geografia cabe na consulta depois do enxugamento dos sinônimos", () => {
  // Antes: o grupo OR de sinônimos consumia 21 das 30 palavras e a geografia,
  // que vinha depois, era descartada inteira. A busca ia ao Google sem cidade,
  // sem estado e sem país.
  const geografia = '("Barretos" OR "Palmeiras de Goiás" OR "Araguaína" OR "Rondonópolis")';
  const conceito = '("bem-estar animal" OR "animal welfare" OR "bienestar animal")';
  const consulta = boundedSearchQuery([
    "site:br.linkedin.com/in",
    '"Supervisor de Abate"',
    geografia,
    conceito,
    '-intitle:vagas -intitle:jobs -"estamos contratando"',
  ]);
  assert.ok(consulta.includes(geografia), "a geografia precisa sobreviver ao orçamento de palavras");
  assert.ok(consulta.includes(conceito), "o conceito enxuto também precisa caber");
  assert.ok(consulta.includes("br.linkedin.com"), "o país é resolvido pelo subdomínio, sem gastar palavras");
});
