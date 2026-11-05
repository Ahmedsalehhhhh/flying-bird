import { useEffect, useRef, useState } from "react";
import { addMonths, defaultStartDate, formatDate, fromInputDate } from "../format.js";
import SubscriptionFields from "./SubscriptionFields.jsx";

const STATUS_TEXT = {
  active: (s) => `الاشتراك الحالي شغال لحد ${formatDate(s.endsAt)} (فاضل ${s.daysLeft} يوم). لو بدأت من آخر يوم فيه، المدة الجديدة هتتضاف على الباقي.`,
  not_started: (s) => `الاشتراك الحالي لسه مابدأش، وهيخلص ${formatDate(s.endsAt)}.`,
  expired: (s) => `الاشتراك خلص يوم ${formatDate(s.endsAt)}.`,
  none: () => "الحساب مالوش اشتراك، ومش هيقدر يدخل اللعبة لحد ما تحدده.",
  unlimited: () => "الحساب ده من غير تاريخ انتهاء دلوقتي.",
};

/** Set / renew a subscription. onConfirm(startsAtISO, months) */
export default function SubscriptionModal({ user, onConfirm, onClose }) {
  const sub = user.subscription || { status: "none" };
  const [value, setValue] = useState({ start: defaultStartDate(sub), months: 3 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const startRef = useRef(null);

  useEffect(() => {
    startRef.current && startRef.current.focus();
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const start = fromInputDate(value.start);

  async function submit(e) {
    e.preventDefault();
    if (!start) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(start.toISOString(), value.months);
      onClose();
    } catch (err) {
      setError(err.message || "حصل خطأ");
      setBusy(false);
    }
  }

  // Renewing from inside the current period keeps the old start: show the real resulting period.
  const keepsStart =
    start && sub.startsAt && sub.endsAt && start >= new Date(sub.startsAt) && start <= new Date(sub.endsAt);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="sub-title" onSubmit={submit}>
        <h3 id="sub-title">اشتراك {user.username}</h3>
        <p className="muted">{(STATUS_TEXT[sub.status] || STATUS_TEXT.none)(sub)}</p>

        <SubscriptionFields value={value} onChange={setValue} startRef={startRef} />

        {keepsStart && (
          <p className="muted small sub-preview">
            الاشتراك هيفضل من {formatDate(sub.startsAt)} لحد {formatDate(addMonths(start, value.months))} من غير انقطاع.
          </p>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button className="btn btn-primary" disabled={busy || !start}>{busy ? "..." : "احفظ الاشتراك"}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}
