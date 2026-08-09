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
