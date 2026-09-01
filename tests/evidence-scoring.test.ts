import assert from "node:assert/strict";
import test from "node:test";
import { assessCandidateEvidence } from "../lib/evidence-scoring.ts";

const concepts = [
  { label: "Remuneração variável", aliases: ["remuneração variável", "variable compensation", "incentive programs"] },
  { label: "Benefícios", aliases: ["benefícios", "benefits"] },
];

test("aprova head de total rewards com evidências executivas", () => {
  const result = assessCandidateEvidence({
    jobTitle: "Gerente Executivo de Remuneração e Benefícios",
    candidateTitle: "Head of Compensation & Benefits",
    candidateText: "Leading the regional team for Latin America. Responsible for variable compensation, benefits and executive compensation programs.",
    requiredConcepts: concepts,
    geographicMatch: "city",
    geographicLabel: "cidade atual confirmada: São Paulo",
  });

  assert.equal(result.eligible, true);
  assert.equal(result.classification, "high");
  assert.ok(result.score >= 85);
  assert.equal(result.evidence.find((item) => item.criterion === "required")?.status, "confirmed");
});

test("elimina analista mesmo quando repete palavras da vaga", () => {
  const result = assessCandidateEvidence({
    jobTitle: "Gerente Executivo de Remuneração e Benefícios",
    candidateTitle: "Analista de Remuneração e Benefícios",
    candidateText: "Remuneração variável, benefícios, Mercer, Korn Ferry e projetos para América Latina.",
    requiredConcepts: concepts,
    geographicMatch: "city",
    geographicLabel: "cidade atual confirmada: São Paulo",
  });

  assert.equal(result.eligible, false);
  assert.equal(result.classification, "rejected");
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("senioridade")));
  assert.ok(result.score <= 54);
});

test("elimina RH generalista sem aderência funcional", () => {
  const result = assessCandidateEvidence({
    jobTitle: "Gerente Executivo de Remuneração e Benefícios",
    candidateTitle: "Gerente de Recursos Humanos",
    candidateText: "HR business partner, cultura, recrutamento e desenvolvimento organizacional.",
    requiredConcepts: concepts,
    geographicMatch: "city",
    geographicLabel: "cidade atual confirmada: Santo André",
  });

  assert.equal(result.eligible, false);
  assert.ok(result.rejectionReasons.includes("cargo funcional incompatível com a vaga"));
});

test("localização atual divergente é eliminatória", () => {
  const result = assessCandidateEvidence({
    jobTitle: "Gerente Executivo de Remuneração e Benefícios",
    candidateTitle: "Head of Compensation & Benefits",
    candidateText: "Leading compensation and benefits programs.",
    requiredConcepts: concepts,
    geographicMatch: "unknown",
    geographicLabel: "localização atual divergente: Switzerland",
  });

  assert.equal(result.eligible, false);
  assert.ok(result.rejectionReasons.some((reason) => reason.includes("localização")));
});

test("ausência de evidência não é apresentada como confirmação", () => {
  const result = assessCandidateEvidence({
    jobTitle: "Gerente Executivo de Remuneração e Benefícios",
    candidateTitle: "Compensation & Benefits Manager",
    candidateText: "Responsible for compensation operations.",
    requiredConcepts: concepts,
    geographicMatch: "targeted",
    geographicLabel: "consulta direcionada a Cajamar; localização não confirmada",
  });

  assert.equal(result.evidence.find((item) => item.criterion === "geography")?.status, "unconfirmed");
  assert.equal(result.evidence.find((item) => item.criterion === "required")?.status, "unconfirmed");
});

test("aceita título equivalente multilíngue antes do ranking Python", () => {
  const result = assessCandidateEvidence({
    jobTitle: "Gerente de Produção",
    roleAlternatives: ["Production Manager", "Manufacturing Manager"],
    candidateTitle: "Production Manager",
    candidateText: "Leadership of food manufacturing operations.",
    requiredConcepts: [],
    geographicMatch: "city",
    geographicLabel: "cidade atual confirmada: Barretos",
  });

  assert.equal(result.eligible, true);
  // "produção" é reconhecida em "Production" pelo vocabulário funcional, sem
  // depender de o título alternativo coincidir palavra por palavra.
  assert.equal(result.evidence.find((item) => item.criterion === "role")?.status, "confirmed");
  assert.ok(result.evidence.find((item) => item.criterion === "role")?.evidence.includes("producao"));
});

test("usa o título alternativo quando o vocabulário funcional não cobre o termo", () => {
  const result = assessCandidateEvidence({
    jobTitle: "Gerente de Padronização de Processos",
    roleAlternatives: ["Process Standardization Manager"],
    candidateTitle: "Process Standardization Manager",
    candidateText: "Governance and standardization of industrial processes.",
    requiredConcepts: [],
    geographicMatch: "city",
    geographicLabel: "cidade atual confirmada: Barretos",
  });

  assert.equal(result.eligible, true);
  assert.ok(result.evidence.find((item) => item.criterion === "role")?.evidence
    .includes("título equivalente: Process Standardization Manager"));
});

test("cargo citado só no trecho público vale menos que no título", () => {
  // Quando o Google não devolve separador, o parser entrega um título genérico.
  // Antes da correção a aderência funcional caía a zero e o perfil correto era
  // eliminado por falha de formatação do snippet, não por incompatibilidade.
  const result = assessCandidateEvidence({
    jobTitle: "Gerente de Produção",
    roleAlternatives: ["Production Manager"],
    candidateTitle: "Perfil profissional no LinkedIn",
    candidateText: "Production Manager na Indústria Alfa, liderando três turnos e 180 pessoas.",
    requiredConcepts: [],
    geographicMatch: "city",
    geographicLabel: "cidade atual confirmada: Barretos",
  });

  assert.equal(result.eligible, true);
  const role = result.evidence.find((item) => item.criterion === "role");
  assert.equal(role?.status, "unconfirmed");
  assert.ok((role?.score || 0) > 0 && (role?.score || 0) < 25);
});
