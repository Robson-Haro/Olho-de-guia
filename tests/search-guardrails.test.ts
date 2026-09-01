import assert from "node:assert/strict";
import test from "node:test";
import {
  extractExcludedCandidateNames,
  extractExplicitCurrentLocation,
  isExcludedCandidateName,
  boundedSearchQuery,
  MAX_QUERY_WORDS,
} from "../lib/search-guardrails.ts";

test("bloqueia candidatos explicitamente excluídos", () => {
  const description = "Excluir candidatos já mapeados: Luciana Oliveira, Simone Giroto e Daniel Denis.";
  assert.deepEqual(extractExcludedCandidateNames(description), [
    "Luciana Oliveira",
    "Simone Giroto",
    "Daniel Denis",
  ]);
  assert.equal(isExcludedCandidateName("Simone Giroto", description), true);
  assert.equal(isExcludedCandidateName("Gustavo Anselmo", description), false);
});

test("normaliza acentos ao comparar exclusões", () => {
  const description = "Excluir candidatos: César Luján e Débora Ayres.";
  assert.equal(isExcludedCandidateName("Cesar Lujan", description), true);
  assert.equal(isExcludedCandidateName("Debora Ayres", description), true);
});

test("localização atual explícita prevalece sobre histórico profissional", () => {
  const snippet = "Zone Americas Head of Total Rewards · Location: Switzerland · Apr 2013 - Mar 2019 · São Paulo Area, Brazil";
  assert.equal(extractExplicitCurrentLocation(snippet), "Switzerland");
});

test("não inventa localização quando o cabeçalho não informa", () => {
  assert.equal(extractExplicitCurrentLocation("Consulta direcionada a São Paulo; confirmar no perfil"), "");
});

test("orçamento de palavras descarta blocos inteiros, nunca corta grupos OR", () => {
  const title = `"Gerente de Padronização de Processos"`;
  const concept = `("padronização de processos" OR "process standardization" OR "governança de processos")`;
  const geography = `("São Paulo" OR "Barretos" OR "Campinas") "SP" ("Brasil" OR "Brazil")`;
  const companies = `("Minerva Foods" OR "JBS" OR "Marfrig" OR "BRF" OR "Aurora Coop" OR "Frimesa" OR "Frigol" OR "Masterboi")`;

  const query = boundedSearchQuery(["site:linkedin.com/in", title, concept, geography, companies]);

  assert.ok(query.split(" ").length <= MAX_QUERY_WORDS);
  // Cargo, critério e geografia sobrevivem; a lista de empresas é a primeira a
  // ser sacrificada — antes era exatamente a geografia que o Google descartava.
  assert.ok(query.includes(title));
  assert.ok(query.includes(concept));
  assert.ok(query.includes(geography));
  assert.equal(query.includes("Marfrig"), false);
  // Nenhum grupo OR fica pela metade.
  assert.equal((query.match(/\(/g) || []).length, (query.match(/\)/g) || []).length);
});

test("consulta curta permanece intacta", () => {
  const query = boundedSearchQuery(["site:linkedin.com/in", `"Analista de Logística"`, `"Barretos"`]);
  assert.equal(query, `site:linkedin.com/in "Analista de Logística" "Barretos"`);
});
