export function directorySearch(value = "") {
  const query = String(value)
    .normalize("NFKC")
    .replace(/[\u09e6-\u09ef]/g, (c) => String(c.charCodeAt(0) - 0x09e6))
    .trim()
    .slice(0, 80);
  const phone = /^[+0-9 ()-]+$/.test(query) ? query.replace(/[^0-9]/g, "") : "";
  const escaped = query.replace(/[\\%_]/g, (c) => "\\" + c);
  return { query, phone, pattern: "%" + (phone || escaped) + "%" };
}
export function patientContact(contacts) {
  const contact = contacts?.find((c) => c.is_primary) || contacts?.[0];
  return contact?.phone || null;
}
