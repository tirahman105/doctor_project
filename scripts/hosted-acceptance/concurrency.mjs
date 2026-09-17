import fs from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { databaseOptions, sql } from "./database.mjs";
import { check, uuid } from "./safety.mjs";
import { fixture } from "./fixtures.mjs";
import { rpc, rows } from "./http.mjs";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function session(config, env) {
  const c = databaseOptions(config, env);
  const name = "cb_acceptance_" + randomUUID().replaceAll("-", "");
  const p = spawn(c.command, c.args, {
    env: { ...c.options.env, PGAPPNAME: name },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let out = "",
    err = "",
    ended = false;
  const done = new Promise((resolve) => {
    p.on("error", () => {
      ended = true;
      resolve({ code: -1, error: "" });
    });
    p.on("close", (code) => {
      ended = true;
      resolve({ code, error: err });
    });
  });
  p.stdout.on("data", (b) => {
    out += b.toString();
    if (out.length > 1048576) p.kill();
  });
  p.stderr.on("data", (b) => {
    err += b.toString();
    if (err.length > 1048576) p.kill();
  });
  p.stdin.on("error", () => {});
  return {
    name,
    done,
    send: (s) => p.stdin.write(s + "\n"),
    kill: () => p.kill(),
    async marker(label) {
      for (let i = 0; i < 200; i++) {
        if (out.split(/\r?\n/).includes(label)) return;
        if (ended) break;
        await pause(50);
      }
      throw new Error("Concurrency synchronization failed; output suppressed");
    },
  };
}
export async function concurrency(config, env, users, save, pass) {
  for (const isolation of ["READ COMMITTED", "REPEATABLE READ"])
    for (const name of [
      "booking",
      "payments",
      "finalization",
      "revisions",
      "blocking",
    ]) {
      const f = await fixture(users.DOCTOR, save);
      const api = users.DOCTOR.api;
      f.paymentTwo = await rpc(api, "submit_payment", {
        p_appointment: f.appointment,
        p_provider: "nagad",
        p_reference: "SYNTHETIC-" + randomUUID(),
        p_amount: 100,
      });
      save("payments", f.paymentTwo);
      if (name === "revisions")
        await rpc(api, "finalize_prescription", { p_version: f.version });
      const bindings = {
        patient: f.patient,
        other_patient: f.otherPatient,
        slot: f.slots[1],
        payment: f.payment,
        payment_two: f.paymentTwo,
        item: f.item,
        version: f.version,
        prescription: f.prescription,
      };
      const variables = Object.entries(bindings)
        .map(([k, v]) => "\\set " + k + " " + uuid(v))
        .join("\n");
      const begin =
        variables +
        "\nbegin isolation level " +
        isolation +
        "; set local role authenticated; select set_config('request.jwt.claim.sub','" +
        uuid(users.DOCTOR.id) +
        "',true); select count(*) from carebridge.appointments;";
      const a = session(config, env),
        b = session(config, env);
      try {
        // B establishes its snapshot before A changes anything; both remain independent sessions.
        b.send(begin + "\n\\echo CB_READY");
        await b.marker("CB_READY");
        a.send(
          begin +
            "\n" +
            fs.readFileSync(
              "supabase/acceptance/concurrency/" + name + "-a.sql",
              "utf8",
            ) +
            "\n\\echo CB_HELD",
        );
        await a.marker("CB_HELD");
        b.send(
          fs.readFileSync(
            "supabase/acceptance/concurrency/" + name + "-b.sql",
            "utf8",
          ) + "\ncommit;\n\\q",
        );
        let blocked = false;
        for (let i = 0; i < 15; i++) {
          await pause(100);
          const observed = sql(
            config,
            env,
            "begin read only;select count(*) from pg_stat_activity where application_name='" +
              b.name +
              "' and wait_event_type='Lock';rollback;",
          );
          if (observed.trim() === "1") {
            blocked = true;
            break;
          }
        }
        check(blocked);
        a.send("commit;\n\\q");
        const results = await Promise.all([a.done, b.done]);
        check(results[0].code === 0);
        const accepted = {
          booking: ["23P01", "40001"],
          payments: ["23505", "40001"],
          finalization: ["P0001", "40001"],
          revisions: ["P0001", "40001"],
          blocking: ["P0001", "40001"],
        }[name];
        check(
          results[1].code !== 0 &&
            accepted.some((code) =>
              new RegExp("\\b" + code + "\\b").test(results[1].error),
            ),
        );
        if (name === "booking")
          check(
            (
              await rows(
                api,
                "appointments",
                "slot_id=eq." + f.slots[1] + "&status=neq.cancelled",
              )
            ).length === 1,
          );
        if (name === "blocking")
          check(
            (await rows(api, "appointments", "slot_id=eq." + f.slots[1]))
              .length === 0,
          );
        if (name === "payments")
          check(
            (
              await rows(
                api,
                "payments",
                "appointment_id=eq." + f.appointment + "&status=eq.verified",
              )
            ).length === 1,
          );
        if (name === "finalization") {
          check(
            (await rows(api, "prescription_versions", "id=eq." + f.version))[0]
              .status === "draft",
          );
          check(
            (
              await rows(
                api,
                "prescription_items",
                "version_id=eq." + f.version,
              )
            ).length === 0,
          );
        }
        if (name === "revisions") {
          const versions = await rows(
            api,
            "prescription_versions",
            "prescription_id=eq." + f.prescription,
          );
          check(
            versions.length === 2 &&
              versions.filter((v) => v.status === "draft").length === 1,
          );
        }
        pass(name + "_" + isolation.toLowerCase().replaceAll(" ", "_"));
      } finally {
        a.kill();
        b.kill();
      }
    }
}
