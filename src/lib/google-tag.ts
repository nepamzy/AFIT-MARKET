/** The Google tag id from the server environment (GOOGLE_TAG_ID), or null when unset or not shaped like one. */
export function googleTagId(): string | null {
  const v = (process.env.GOOGLE_TAG_ID ?? '').trim()
  return /^(G|GT|AW)-[A-Z0-9]{4,20}$/.test(v) ? v : null
}
