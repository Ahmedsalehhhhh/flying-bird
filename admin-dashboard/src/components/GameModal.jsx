import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../api.js";

const GAME_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/; // same rule as the server (rules.js validateGameId)

/** Add a new game: gameId (fixed forever) + display name. */
export default function GameModal({ onCreated, onClose }) {
  const [gameId, setGameId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstRef = useRef(null);

  useEffect(() => {
    firstRef.current && firstRef.current.focus();
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const id = gameId.trim().toLowerCase();
  const invalid = !GAME_ID_RE.test(id) || !name.trim() || name.trim().length > 60;

  async function submit(e) {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.createGame(id, name.trim());
      onCreated(res.game);
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="game-title" onSubmit={submit}>
        <h3 id="game-title">لعبة جديدة</h3>

        <label className="field">
          <span>اسم اللعبة</span>
          <input ref={firstRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
            placeholder="مثلاً: Space Race" dir="auto" />
          <small className="muted">ده اللي بيظهر في الداش بورد، وتقدر تغيّره بعدين.</small>
        </label>

        <label className="field">
          <span>gameId</span>
          <input value={gameId} onChange={(e) => setGameId(e.target.value.toLowerCase())} dir="ltr"
            placeholder="space-race" autoComplete="off" />
          <small className="muted">
            ده اللي اللعبة بتبعته في <code dir="ltr">gameId</code> في اللوجين، و<b>مش هيتغير بعد كده</b>.
            من 2 لـ 40 حرف: إنجليزي صغير وأرقام و -
          </small>
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button className="btn btn-primary" disabled={busy || invalid}>{busy ? "..." : "ضيف اللعبة"}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}
