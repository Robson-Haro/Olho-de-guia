import assert from "node:assert/strict";
import test from "node:test";
import { issueClaySearchSession, readClaySearchSession } from "../lib/talent-search-session.ts";

process.env.TOKEN_ENCRYPTION_KEY = "eureka-session-test-key-with-at-least-thirty-two-characters";

test("protege o cursor de continuação do Clay e o vincula à mesma busca", () => {
  const token = issueClaySearchSession("search_123", "same-query");
  const session = readClaySearchSession(token, "same-query");
  assert.equal(session.searchId, "search_123");
  assert.throws(() => readClaySearchSession(token, "other-query"), /não corresponde/i);
});
