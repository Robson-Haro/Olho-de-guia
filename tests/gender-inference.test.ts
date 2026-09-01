import assert from "node:assert/strict";
import test from "node:test";
import {
  genderPronounExpression,
  genderedTitle,
  inferGender,
  matchesGenderKey,
} from "../lib/gender-inference.ts";

test("pronome declarado prevalece sobre prenome e cargo", () => {
  const result = inferGender({
    name: "Alex Ferreira",
    title: "Coordenador de Suprimentos",
    text: "Alex Ferreira (Ela/Dela) · Coordenador de Suprimentos · São Paulo",
  });
  assert.equal(result.value, "feminino");
  assert.equal(result.source, "pronome");
  assert.ok(result.confidence >= 95);
});

test("forma feminina do cargo é evidência forte", () => {
  const result = inferGender({
    name: "Cris Almeida",
    title: "Coordenadora de Logística",
    text: "Coordenadora de Logística na Indústria Alfa",
  });
  assert.equal(result.value, "feminino");
  assert.equal(result.source, "titulo");
});

test("prenome reconhecido classifica com confiança alta", () => {
  assert.equal(inferGender({ name: "Beatriz Nunes", title: "Analista de Dados" }).value, "feminino");
  assert.equal(inferGender({ name: "Robson Ramos", title: "Analista de Dados" }).value, "masculino");
});

test("regra morfológica cobre prenomes fora do dicionário", () => {
  const feminine = inferGender({ name: "Wanderleia Prates", title: "Analista" });
  assert.equal(feminine.value, "feminino");
  assert.equal(feminine.source, "morfologia");
  const masculine = inferGender({ name: "Clodoaldo Prates", title: "Analista" });
  assert.equal(masculine.value, "masculino");
});

test("prenomes ambíguos não são forçados a um gênero", () => {
  const result = inferGender({ name: "Ariel Souza", title: "Analista de Processos" });
  assert.equal(result.value, "indeterminado");
  assert.ok(result.basis.includes("homens e mulheres"));
});

test("nome masculino terminado em A não vira feminino", () => {
  assert.equal(inferGender({ name: "Luca Bianchi", title: "Analista" }).value, "masculino");
});

test("cargo masculino genérico não sobrepõe prenome feminino", () => {
  // O masculino é a forma padrão da língua e é usado por parte das
  // profissionais; o prenome, mais estável, precisa vencer.
  const result = inferGender({ name: "Fernanda Lima", title: "Coordenador de Qualidade" });
  assert.equal(result.value, "feminino");
  assert.ok(result.basis.includes("divergente"));
});

test("filtro estrito só aceita inferência acima do limiar", () => {
  assert.equal(matchesGenderKey(inferGender({ name: "Beatriz Nunes" }), "feminino"), true);
  assert.equal(matchesGenderKey(inferGender({ name: "Beatriz Nunes" }), "masculino"), false);
  assert.equal(matchesGenderKey(inferGender({ name: "Ariel Souza" }), "feminino"), false);
  // Chave desligada nunca filtra ninguém.
  assert.equal(matchesGenderKey(undefined, ""), true);
});

test("flexiona apenas o substantivo de cargo, nunca o complemento", () => {
  assert.equal(genderedTitle("Coordenador de Logística", "feminino"), "Coordenadora de Logística");
  assert.equal(genderedTitle("Supervisor de Manutenção", "feminino"), "Supervisora de Manutenção");
  assert.equal(genderedTitle("Coordenadora de Logística", "masculino"), "Coordenador de Logística");
  // Cargos neutros voltam vazios: não há forma flexionada a pesquisar.
  assert.equal(genderedTitle("Gerente de Logística", "feminino"), "");
  assert.equal(genderedTitle("Analista de Dados", "feminino"), "");
  // Sem chave, nenhuma transformação acontece.
  assert.equal(genderedTitle("Coordenador de Logística", ""), "");
});

test("expressão de pronomes cobre os três idiomas da busca", () => {
  const feminine = genderPronounExpression("feminino");
  assert.ok(feminine.includes("Ela/Dela"));
  assert.ok(feminine.includes("She/Her"));
  assert.ok(feminine.includes("Ella/Suya"));
  assert.equal(genderPronounExpression(""), "");
});
