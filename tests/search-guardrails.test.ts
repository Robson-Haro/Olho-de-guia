import assert from "node:assert/strict";
import test from "node:test";
import {
  extractExcludedCandidateNames,
  extractExplicitCurrentLocation,
  isExcludedCandidateName,
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
