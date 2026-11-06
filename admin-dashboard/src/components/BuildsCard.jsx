import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../api.js";
import { formatDate } from "../format.js";
import Modal from "./Modal.jsx";

const HASH_RE = /^[a-f0-9]{40,64}$/i;

/**
 * Official build hashes allowlist for one game (see server/src/builds.js).
 * Shown only when a single game is selected, since hashes are per-game.
 */
export default function BuildsCard({ gameId, gameName, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [removeModal, setRemoveModal] = useState(null);

  const load = () => {
    api.builds(gameId).then((d) => { setData(d); setError(""); }).catch((e) => setError(errorText(e)));
  };
  useEffect(load, [gameId]);

  const remove = async (b) => {
    try {
      await api.removeBuild(b._id);
    } catch (e) {
      throw new Error(errorText(e));
    }
    notify(`تم حذف النسخة ${b.label || b.hash.slice(0, 12)}`);
    load();
  };

  return (
    <section className="card">
      <div className="card-head wrap">
        <h2 className="card-title">
          نسخ {gameName} المعتمدة
          {data && <span className="muted num"> ({data.builds.length})</span>}
        </h2>
        <button className="btn btn-small" onClick={() => setAdding(true)}>+ سجّل نسخة</button>
      </div>

      <p className="muted small">
        {data && !data.enforced && (
          <>
            <b>وضع المراقبة بس:</b> نسخة مش متسجلة هنا بتتحط كتنبيه على الحساب في جدول الحسابات، ومش بتتمنع من اللعب.
            لتفعيل المنع الفعلي، حط <code dir="ltr">ENFORCE_BUILD_CHECK=true</code> في إعدادات السيرفر بعد ما تسجّل كل النسخ الرسمية.
          </>
        )}
        {data && data.enforced && <b>وضع المنع مفعّل: أي نسخة مش في القايمة دي مش هتقدر تلعب.</b>}
      </p>

      {error && <p className="banner-error" role="alert">{error}</p>}

      {!data ? (
        <div className="skeleton" style={{ height: 60 }} />
      ) : data.builds.length === 0 ? (
        <p className="muted">مفيش نسخة متسجلة لسه. لحد ما تسجّل واحدة، كل النسخ بتتحط كتنبيه بس.</p>
      ) : (
        <ul className="build-list">
          {data.builds.map((b) => (
            <li key={b._id}>
              <div>
                <b>{b.label || "(من غير اسم)"}</b>{" "}
                <code className="muted small" dir="ltr" title={b.hash}>{b.hash.slice(0, 16)}…</code>
                <div className="muted small">اتسجلت {formatDate(b.createdAt)}</div>
              </div>
              <button className="btn btn-small btn-danger-ghost" onClick={() => setRemoveModal(b)}>حذف</button>
            </li>
          ))}
        </ul>
      )}

      {removeModal && (
        <Modal
          title={`حذف نسخة ${removeModal.label || removeModal.hash.slice(0, 12)}`}
          message="أي لاعب شغّال بالنسخة دي هيتحط عليه تنبيه (أو هيتمنع لو وضع المنع مفعّل)."
          confirmText="احذف"
          danger
          onConfirm={() => remove(removeModal)}
          onClose={() => setRemoveModal(null)}
        />
      )}
      {adding && (
        <AddBuildModal
          gameId={gameId}
          onAdded={(b) => { notify(`تم تسجيل ${b.label || "النسخة"}`); load(); }}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}

function AddBuildModal({ gameId, onAdded, onClose }) {
  const [hash, setHash] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstRef = useRef(null);

  useEffect(() => {
    firstRef.current && firstRef.current.focus();
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const h = hash.trim().toLowerCase();
  const invalid = !HASH_RE.test(h);

  async function submit(e) {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.addBuild(gameId, h, label.trim());
      onAdded(res.build);
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="build-title" onSubmit={submit}>
        <h3 id="build-title">تسجيل نسخة رسمية</h3>
        <p className="muted small">
          الـ hash بتاع ملف اللعبة (sha1 أو sha256) اللي مطوّر اللعبة بيديهولك مع كل إصدار.
        </p>

        <label className="field">
          <span>الاسم (اختياري)</span>
          <input ref={firstRef} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100}
            placeholder="مثلاً: v1.3.0 - 10 نوفمبر" dir="auto" />
        </label>

        <label className="field">
          <span>Hash</span>
          <input value={hash} onChange={(e) => setHash(e.target.value)} dir="ltr"
            placeholder="a1b2c3..." autoComplete="off" />
          <small className="muted">40 حرف (sha1) أو 64 حرف (sha256)، إنجليزي وأرقام بس</small>
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button className="btn btn-primary" disabled={busy || invalid}>{busy ? "..." : "سجّل"}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}
