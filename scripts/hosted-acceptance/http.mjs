import { check, uuid } from "./safety.mjs";
export function client(config, token, backend = false, fetcher = fetch) {
  return async (path, method = "GET", body, extra = {}, binary = false) => {
    check(
      path.startsWith("/") &&
        !path.startsWith("//") &&
        !path.includes("..") &&
        !/[\r\n]/.test(path),
    );
    const url = new URL(path, config.origin);
    check(url.origin === config.origin);
    const key = backend ? config.service : config.anon;
    check(Boolean(key));
    const headers = {
      apikey: key,
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...extra,
    };
    if (path.startsWith("/rest/")) {
      headers["Accept-Profile"] ??= "carebridge";
      headers["Content-Profile"] ??= "carebridge";
    }
    if (body !== undefined && !binary)
      headers["Content-Type"] = "application/json";
    try {
      const r = await fetcher(url, {
        method,
        headers,
        body:
          body === undefined ? undefined : binary ? body : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      });
      const bytes = Buffer.from(await r.arrayBuffer());
      check(bytes.length < 4 * 1024 * 1024);
      let data;
      try {
        data = JSON.parse(bytes.toString("utf8"));
      } catch {
        data = null;
      }
      return { status: r.status, ok: r.ok, data, bytes };
    } catch {
      throw new Error("HTTP request failed; details suppressed");
    }
  };
}
export async function signIn(config, env, role) {
  const request = client(config);
  const r = await request("/auth/v1/token?grant_type=password", "POST", {
    email: env["CAREBRIDGE_ACCEPTANCE_" + role + "_EMAIL"],
    password: env["CAREBRIDGE_ACCEPTANCE_" + role + "_PASSWORD"],
  });
  check(r.ok && typeof r.data?.access_token === "string");
  const api = client(config, r.data.access_token);
  const identity = await api("/auth/v1/user");
  check(identity.ok);
  return { api, id: uuid(identity.data.id), token: r.data.access_token };
}
export async function rows(api, table, query = "") {
  const r = await api("/rest/v1/" + table + "?" + query);
  check(r.ok && Array.isArray(r.data));
  return r.data;
}
export async function insert(api, table, body) {
  const r = await api("/rest/v1/" + table, "POST", body, {
    Prefer: "return=representation",
  });
  check(r.ok && r.data?.length === 1);
  return r.data[0];
}
export async function rpc(api, name, body) {
  const r = await api("/rest/v1/rpc/" + name, "POST", body);
  check(r.ok);
  return r.data;
}
export function forbidden(r) {
  check(
    [401, 403].includes(r.status) ||
      (r.status === 400 && r.data?.code === "42501"),
  );
}
export function invisible(r) {
  if (r.ok) check(Array.isArray(r.data) && r.data.length === 0);
  else forbidden(r);
}
