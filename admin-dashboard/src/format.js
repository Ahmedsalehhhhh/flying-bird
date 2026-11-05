// Arabic words, Western digits (Arabic-Indic ٥ looks like 0 in charts)
const LOCALE = "ar-EG-u-nu-latn";
const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
const nf = new Intl.NumberFormat(LOCALE);

export const formatNumber = (n) => nf.format(n || 0);

export function timeAgo(date) {
  if (!date) return "—";
  const diffSec = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  return formatDate(date);
}

export function formatDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(LOCALE, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortDay(isoDay) {
  // "2026-10-18" -> "18 أكتوبر"
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

// ---------- Subscriptions ----------

// Same logic as the server (server/src/rules.js addMonths), so the preview matches exactly.
export function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  const r = new Date(d.getTime());
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

// <input type="date"> value ("2026-11-05") <-> Date at local midnight
export function toInputDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function fromInputDate(value) {
  const [y, m, d] = String(value || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
export const monthsLabel = (n) => (n === 1 ? "شهر" : n === 2 ? "شهرين" : n <= 10 ? `${n} شهور` : `${n} شهر`);

/**
 * Default start date when setting / renewing a subscription:
 * still running (or not started yet) -> its last day, so the new months are added on top.
 * none / expired / never expires   -> today.
 */
export function defaultStartDate(subscription) {
  if (subscription && subscription.endsAt && (subscription.status === "active" || subscription.status === "not_started"))
    return toInputDate(subscription.endsAt);
  return toInputDate(new Date());
}
