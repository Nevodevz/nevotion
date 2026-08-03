/**
 * Shared formatting helpers.
 *
 * Dates are stored in UTC and displayed in Asia/Bishkek (UTC+6).
 */

export const BISHKEK_OFFSET_MS = 6 * 3600 * 1000;

/** Whole сом with thin separators, e.g. `150 000 сом`. */
export function fmtMoney(v: number | null | undefined, suffix = "сом"): string {
  const n = Number(v ?? 0);
  if (!n) return "0 " + suffix;
  return `${n.toLocaleString("ru-RU")} ${suffix}`;
}

/** Compact variant for dense tables: `150 000 с`. */
export function fmtMoneyShort(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (!n) return "—";
  return `${n.toLocaleString("ru-RU")} с`;
}

/** `DD.MM.YYYY` from an ISO date or datetime, without timezone shifting. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** UTC ISO → `YYYY-MM-DDTHH:mm` local (Bishkek) for `datetime-local` inputs. */
export function utcToLocalInput(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms + BISHKEK_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` entered in Bishkek time → UTC ISO for the API. */
export function localInputToUtc(value: string): string {
  const [d, t = "00:00"] = value.split("T");
  const [Y, Mo, D] = d.split("-").map(Number);
  const [h, m] = t.split(":").map(Number);
  return new Date(Date.UTC(Y, Mo - 1, D, h, m) - BISHKEK_OFFSET_MS).toISOString();
}

/** `DD.MM.YYYY HH:mm` in Bishkek time. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const local = utcToLocalInput(iso);
  if (!local) return "—";
  return `${local.slice(8, 10)}.${local.slice(5, 7)}.${local.slice(0, 4)} ${local.slice(11, 16)}`;
}

/** `HH:mm` in Bishkek time. */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return utcToLocalInput(iso).slice(11, 16);
}

/** Today in Bishkek as `YYYY-MM-DD` — the correct default for date inputs. */
export function todayBishkek(): string {
  return new Date(Date.now() + BISHKEK_OFFSET_MS).toISOString().slice(0, 10);
}
