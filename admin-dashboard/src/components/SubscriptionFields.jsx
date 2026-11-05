import { addMonths, formatDate, fromInputDate, MONTH_OPTIONS, monthsLabel } from "../format.js";

/**
 * Start date + length (1-12 months) + "ends on ..." preview.
 * value: { start: "YYYY-MM-DD", months: number }
 */
export default function SubscriptionFields({ value, onChange, optional, onToggle, enabled = true, startRef }) {
  const start = fromInputDate(value.start);
  const endsAt = start ? addMonths(start, value.months) : null;

  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      {optional ? (
        <label className="checkbox-row">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />{" "}
          <span>ليه اشتراك بتاريخ انتهاء (من غيره الحساب مش بيخلص)</span>
        </label>
      ) : (
        <span>الاشتراك</span>
      )}

      {enabled && (
        <>
          <div className="input-row">
            <label className="field">
              <small className="muted">يبدأ من</small>
              <input ref={startRef} type="date" value={value.start} required
                onChange={(e) => onChange({ ...value, start: e.target.value })} />
            </label>
            <label className="field">
              <small className="muted">المدة</small>
              <select value={value.months} onChange={(e) => onChange({ ...value, months: Number(e.target.value) })}>
                {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{monthsLabel(m)}</option>)}
              </select>
            </label>
          </div>
          <p className="muted small sub-preview">
            {endsAt ? <>هيخلص يوم <b>{formatDate(endsAt)}</b></> : "اختار تاريخ البداية"}
          </p>
        </>
      )}
    </fieldset>
  );
}
