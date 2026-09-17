import { client, rpc } from "./http.mjs";
import { check } from "./safety.mjs";
// Fixed one-pixel PNG generated from a constant. Never reads a user's file.
export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9p8AAAAASUVORK5CYII=",
  "base64",
);
function denied(r) {
  check(
    !r.ok &&
      ([401, 403, 404].includes(r.status) ||
        (r.status === 400 &&
          [401, 403, 404].includes(Number(r.data?.statusCode)))),
  );
}
export async function storageTests(config, users, f, save, pass) {
  const doctor = users.DOCTOR.api,
    a = users.ASSISTANT_A.api,
    b = users.ASSISTANT_B.api;
  const backend = client(config, config.service, true);
  const prefix = "/storage/v1/object/";
  const id = await rpc(a, "register_upload", {
    p_appointment: f.appointment,
    p_category: "payment_evidence",
    p_name: "synthetic-one-pixel.png",
    p_type: "image/png",
    p_size: png.length,
  });
  save("patient_uploads", id);
  const object = "carebridge-private/" + id;
  check(
    (
      await a(
        prefix + object,
        "POST",
        png,
        { "Content-Type": "image/png" },
        true,
      )
    ).ok,
  );
  denied(await a(prefix + "authenticated/" + object));
  // Independent trusted-byte comparison before marking available. No arbitrary files accepted.
  const bytes = await backend(prefix + "authenticated/" + object);
  check(bytes.ok && bytes.bytes.equals(png));
  await rpc(backend, "complete_upload", { p_upload: id });
  for (const api of [a, doctor]) {
    const r = await api(prefix + "authenticated/" + object);
    check(r.ok && r.bytes.equals(png));
  }
  for (const api of [b, users.OUTSIDER.api, client(config)])
    denied(await api(prefix + "authenticated/" + object));
  denied(await client(config)(prefix + "public/" + object));
  const listing = await a(prefix + "list/carebridge-private", "POST", {
    prefix: "",
    limit: 100,
  });
  if (listing.ok)
    check(Array.isArray(listing.data) && listing.data.length === 0);
  else denied(listing);
  denied(await a(prefix + "sign/" + object, "POST", { expiresIn: 3600 }));
  denied(
    await a(prefix + object, "PUT", png, { "Content-Type": "image/png" }, true),
  );
  denied(
    await a(
      prefix + object,
      "POST",
      png,
      { "Content-Type": "image/png", "x-upsert": "true" },
      true,
    ),
  );
  const moveTarget = await rpc(a, "register_upload", {
    p_appointment: f.appointment,
    p_category: "payment_evidence",
    p_name: "synthetic-move-target.png",
    p_type: "image/png",
    p_size: png.length,
  });
  save("patient_uploads", moveTarget);
  denied(
    await a(prefix + "move", "POST", {
      bucketId: "carebridge-private",
      sourceKey: id,
      destinationKey: moveTarget,
    }),
  );
  const removal = await a(prefix + "carebridge-private", "DELETE", {
    prefixes: [id],
  });
  if (removal.ok)
    check(Array.isArray(removal.data) && removal.data.length === 0);
  else denied(removal);
  check((await doctor(prefix + "authenticated/" + object)).bytes.equals(png));
  pass("private_storage_bytes_ownership_and_mutation_denials");
  const bad = await rpc(a, "register_upload", {
    p_appointment: f.appointment,
    p_category: "payment_evidence",
    p_name: "synthetic-oversize.png",
    p_type: "image/png",
    p_size: png.length,
  });
  save("patient_uploads", bad);
  const oversize = await a(
    prefix + "carebridge-private/" + bad,
    "POST",
    Buffer.alloc(2097153),
    { "Content-Type": "image/png" },
    true,
  );
  check(
    !oversize.ok &&
      (oversize.status === 413 ||
        Number(oversize.data?.statusCode) === 413 ||
        oversize.data?.code === "EntityTooLarge"),
  );
  pass("storage_size_limit");
  const mime = await a(
    prefix + "carebridge-private/" + bad,
    "POST",
    Buffer.from("synthetic only"),
    { "Content-Type": "text/plain" },
    true,
  );
  check(
    !mime.ok &&
      (mime.status === 415 ||
        Number(mime.data?.statusCode) === 415 ||
        mime.data?.code === "InvalidMimeType"),
  );
  pass("storage_mime_limit");
  const extension = await a("/rest/v1/rpc/keep_upload_longer", "POST", {
    p_upload: id,
    p_until: new Date(Date.now() + 14 * 86400000).toISOString(),
    p_reason: "payment_dispute",
  });
  check(!extension.ok && extension.data?.code === "42501");
  await rpc(doctor, "keep_upload_longer", {
    p_upload: id,
    p_until: new Date(Date.now() + 14 * 86400000).toISOString(),
    p_reason: "payment_dispute",
  });
  pass("doctor_only_retention_extension");
}
