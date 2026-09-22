import assert from "node:assert/strict";
import test from "node:test";
import { canonicalLinkedInProfileUrl } from "../lib/profile-url.ts";

test("normaliza variações públicas do mesmo perfil LinkedIn", () => {
  const expected = "https://www.linkedin.com/in/ana-silva";
  assert.equal(canonicalLinkedInProfileUrl("https://br.linkedin.com/in/Ana-Silva/?trk=public_profile"), expected);
  assert.equal(canonicalLinkedInProfileUrl("https://www.linkedin.com/in/ana-silva/"), expected);
});

test("não trata páginas que não são perfis individuais como candidatos", () => {
  assert.equal(canonicalLinkedInProfileUrl("https://www.linkedin.com/company/minerva-foods"), "");
  assert.equal(canonicalLinkedInProfileUrl("https://example.com/in/ana-silva"), "");
});
