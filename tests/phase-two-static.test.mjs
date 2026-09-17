import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { localConnection } from "../scripts/test-database.mjs";
const files = fs
  .readdirSync("supabase/migrations")
  .filter((x) => x.endsWith(".sql"))
  .sort();
const migrations = files.map((name) => ({
  name,
  sql: fs.readFileSync("supabase/migrations/" + name, "utf8"),
}));
const all = migrations.map((x) => x.sql).join("\n");
test("STATIC: six ordered transactional forward-only migrations, no destructive baseline", () => {
  assert.equal(files.length, 6);
  for (const { name, sql } of migrations) {
    assert.match(name, /^\d{14}_[a-z_]+\.sql$/);
    assert.match(sql, /\bbegin;/i);
    assert.match(sql, /commit;\s*$/i);
    assert.doesNotMatch(
      sql,
      /\bdrop\s+(table|schema|column)|\btruncate\b|on delete cascade/i,
    );
    assert.equal(
      (sql.match(/\$\$/g) || []).length % 2,
      0,
      name + " balanced dollar-quoted blocks",
    );
    assert.doesNotMatch(
      sql,
      /as \$\r?\n/,
      name + " no incomplete function delimiter",
    );
  }
  assert.match(all, /Existing CareBridge\/legacy schema detected/);
});
test("STATIC: definer functions have fixed empty search paths and explicit privilege revocation", () => {
  for (const { sql } of migrations) {
    for (const match of sql.matchAll(/create function ([\s\S]*?)\bas \$\$/gi)) {
      if (/security definer/i.test(match[1]))
        assert.match(match[1], /set search_path=''/);
    }
  }
  assert.match(
    all,
    /revoke all on all functions in schema carebridge,carebridge_private from public,anon,authenticated,service_role/,
  );
  assert.doesNotMatch(
    all,
    /grant[\s\S]{0,50}on all tables[\s\S]{0,50}to (?:anon|service_role)/i,
  );
  assert.doesNotMatch(all, /raw_user_meta_data|user_metadata/);
});
test("STATIC: integrity and Storage guardrails are present (not an executed RLS test)", () => {
  assert.match(all, /exclude using gist\(tstzrange/);
  assert.match(all, /numeric\(12,2\)/);
  assert.match(all, /Prescription history is immutable/);
  assert.match(all, /one_draft_version/);
  assert.match(all, /interval '7 days'/);
  assert.match(all, /interval '90 days'/);
  assert.match(all, /cb_objects_read_boundary[\s\S]*?as restrictive/);
  assert.match(all, /cb_objects_anon_boundary[\s\S]*?as restrictive/);
  assert.match(all, /storage.allow_any_operation/);
  assert.doesNotMatch(all, /delete from storage\.objects/i);
  assert.doesNotMatch(all, /response jsonb|access_token|refresh_token/i);
});
test("local SQL runner rejects remote, ambiguous and non-disposable targets", () => {
  const marker = { CAREBRIDGE_ALLOW_LOCAL_DB_TESTS: "disposable-local-only" };
  assert.throws(() => localConnection({}), /explicitly/);
  for (const url of [
    "postgresql://user:placeholder@project.example.invalid:54322/postgres",
    "postgresql://user:placeholder@localhost:54322/postgres",
    "postgresql://user:placeholder@127.0.0.1:5432/postgres",
    "postgresql://user:placeholder@127.0.0.1:54322/production",
    "postgresql://user:placeholder@127.0.0.1:54322/postgres?host=remote",
  ]) {
    assert.throws(
      () => localConnection({ ...marker, CAREBRIDGE_TEST_DATABASE_URL: url }),
      /Only disposable/,
    );
  }
  assert.equal(
    localConnection({
      ...marker,
      CAREBRIDGE_TEST_DATABASE_URL:
        "postgresql://user:placeholder@127.0.0.1:54322/postgres",
    }).hostname,
    "127.0.0.1",
  );
});
test("STATIC: all backend credential placeholders are empty", () => {
  for (const line of fs.readFileSync(".env.example", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || line === "NEXT_PUBLIC_DATA_MODE=local")
      continue;
    assert.match(line, /^[A-Z_]+=\s*$/);
  }
});
