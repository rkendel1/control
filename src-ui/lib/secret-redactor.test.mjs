import test from "node:test";
import assert from "node:assert/strict";
import {SecretRedactor} from "./core/secret-redactor.ts";

test("redacts provider, GitHub, JWT, bearer, and quoted credentials",()=>{
  const redactor=new SecretRedactor();
  const input="sk-abcdefghijklmnopqrstuvwxyz ghp_abcdefghijklmnopqrstuvwxyz bearer abc.def-123 password=\"hunter2\" eyJabcdefghijk.abcdefghijkl.abcdefghijkl";
  const result=redactor.redact(input).redacted;
  assert.equal(result.includes("sk-abcdefghijklmnopqrstuvwxyz"),false);
  assert.equal(result.includes("ghp_abcdefghijklmnopqrstuvwxyz"),false);
  assert.equal(result.includes("hunter2"),false);
  assert.equal(result.includes("eyJabcdefghijk"),false);
});

test("secret detection is stable across repeated calls",()=>{
  const redactor=new SecretRedactor(),value="ghp_abcdefghijklmnopqrstuvwxyz";
  assert.equal(redactor.containsSecrets(value),true);
  assert.equal(redactor.containsSecrets(value),true);
});

test("redacts unexported sensitive environment assignments",()=>{
  const redactor=new SecretRedactor();
  const input="MODE=development\nOPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz\nDATABASE_URL=postgresql://user:password@example.test/db";
  const result=redactor.redact(input).redacted;
  assert.equal(result.includes("sk-abcdefghijklmnopqrstuvwxyz"),false);
  assert.equal(result.includes("postgresql://user:password"),false);
  assert.match(result,/REDACTED_ENVIRONMENT_VARIABLE/);
});
