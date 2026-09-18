import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
export function token(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret).update(body).digest("base64url")
  );
}
export function untoken(secret, value, kind, now = Date.now()) {
  if (typeof value !== "string" || value.length > 2048) throw Error();
  const parts = value.split(".");
  if (parts.length !== 2) throw Error();
  const expected = createHmac("sha256", secret).update(parts[0]).digest(),
    actual = Buffer.from(parts[1], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw Error();
  const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  if (
    payload.kind !== kind ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= now
  )
    throw Error();
  return payload;
}
export function challenge(secret, now = Date.now()) {
  return token(secret, {
    kind: "request",
    id: randomUUID(),
    issued: now,
    exp: now + 30 * 60000,
  });
}
export function receipt(secret, id) {
  return (
    "CB-" +
    createHmac("sha256", secret)
      .update("receipt:" + id)
      .digest("hex")
      .slice(0, 24)
      .toUpperCase()
  );
}
// Bounded single-process basic controls. No IP header is trusted and no PII is stored.
export function limiter(maxKeys = 2000) {
  const buckets = new Map();
  return (key, max, windowMs, now = Date.now()) => {
    for (const [k, b] of buckets) if (b.until <= now) buckets.delete(k);
    let b = buckets.get(key);
    if (!b) {
      if (buckets.size >= maxKeys) return false;
      b = { count: 0, until: now + windowMs };
      buckets.set(key, b);
    }
    return ++b.count <= max;
  };
}
export const allow = limiter();
export function privateRateKey(secret, value) {
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function validOrigin(request, origin) {
  return (
    request.headers.get("origin") === origin &&
    ["same-origin", "none", null].includes(
      request.headers.get("sec-fetch-site"),
    )
  );
}
export async function readSmallJson(request, limit = 8192) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw Error();
  if (Number(request.headers.get("content-length")) > limit || !request.body)
    throw Error();
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw Error();
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } finally {
    await reader.cancel().catch(() => {});
  }
}
