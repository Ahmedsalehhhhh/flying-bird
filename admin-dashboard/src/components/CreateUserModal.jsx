import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../api.js";
import { fromInputDate, toInputDate, formatDate } from "../format.js";
import SubscriptionFields from "./SubscriptionFields.jsx";

// Random readable password (no 0/O/1/l confusion)
function randomPassword(len = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Admin creates an account (streamer or agency), then sees the username + password once to hand them over.
 */
export default function CreateUserModal({ type = "streamer", title, notePlaceholder, games, defaultGame, onCreated, onClose }) {
  const [gameId, setGameId] = useState(defaultGame || games[0] || "flying-bird");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [note, setNote] = useState("");
  // Streamers must have a subscription; agency accounts never expire unless the admin sets one.
  const subRequired = type === "streamer";
  const [subOn, setSubOn] = useState(subRequired);
  const [sub, setSub] = useState({ start: toInputDate(new Date()), months: 3 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const firstRef = useRef(null);

  useEffect(() => {
    firstRef.current && firstRef.current.focus();
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose, created]);

  const subStart = fromInputDate(sub.start);
  const invalid =
    !/^[a-zA-Z0-9_.-]{3,30}$/.test(username.trim()) ||
    password.length < 6 ||
    password.length > 72 ||
    (subOn && !subStart);

  async function submit(e) {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.createUser({
        type,
        gameId,
        username: username.trim(),
        password,
        note: note.trim(),
        ...(subOn ? { startsAt: subStart.toISOString(), months: sub.months } : {}),
      });
      setCreated({ ...res.user, password });
      onCreated(res.user);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  const credsText = created ? `Username: ${created.username}\nPassword: ${created.password}` : "";

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      {created ? (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <h3 id="create-title">الحساب اتعمل</h3>
          <p className="muted">ابعت البيانات دي لصاحب الحساب. الباسورد مش هيظهر تاني بعد ما تقفل.</p>
          <pre className="creds" dir="ltr">{credsText}</pre>
          <p className="muted small">الحساب هيتقفل على أول جهاز يدخل منه.</p>
          {created.subscription && created.subscription.endsAt && (
            <p className="muted small">
              الاشتراك من {formatDate(created.subscription.startsAt)} لحد {formatDate(created.subscription.endsAt)}.
            </p>
          )}
          <div className="modal-actions">
            <button
              ref={firstRef}
              className="btn btn-primary"
              onClick={async () => setCopied(await copy(credsText))}
            >
              {copied ? "اتنسخ ✓" : "انسخ البيانات"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>قفل</button>
          </div>
        </div>
      ) : (
        <form className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title" onSubmit={submit}>
          <h3 id="create-title">{title || "حساب جديد"}</h3>

          {games.length > 1 && (
            <label className="field">
              <span>اللعبة</span>
              <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
                {games.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          )}

          <label className="field">
            <span>اليوزر</span>
            <input ref={firstRef} value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr"
              placeholder="ahmed_live" autoComplete="off" />
            <small className="muted">3-30 حرف: إنجليزي وأرقام و _ . -</small>
          </label>

          <label className="field">
            <span>الباسورد</span>
            <div className="input-row">
              <input value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" autoComplete="off" />
              <button type="button" className="btn btn-small" onClick={() => setPassword(randomPassword())}>
                ولّد
              </button>
            </div>
            <small className="muted">6 حروف على الأقل</small>
          </label>

          <SubscriptionFields
            value={sub}
            onChange={setSub}
            optional={!subRequired}
            enabled={subOn}
            onToggle={setSubOn}
          />

          <label className="field">
            <span>ملاحظة (اختياري)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
              placeholder={notePlaceholder || ""} dir="auto" />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy || invalid}>{busy ? "..." : "اعمل الحساب"}</button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>إلغاء</button>
          </div>
        </form>
      )}
    </div>
  );
}
