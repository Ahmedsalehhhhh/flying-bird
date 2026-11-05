import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "../api.js";
import { formatNumber } from "../format.js";
import StatsCards from "./StatsCards.jsx";
import SignupsChart from "./SignupsChart.jsx";
import UsersTable from "./UsersTable.jsx";
import Toast from "./Toast.jsx";
import Modal from "./Modal.jsx";
import GameModal from "./GameModal.jsx";
import { SECTIONS } from "../sections.js";

const REFRESH_MS = 15000;
const TAB_KEY = "fb_admin_tab";


function savedTab() {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return SECTIONS[t] ? t : "streamer";
  } catch {
    return "streamer";
  }
}

export default function Dashboard({ onLogout }) {
  const [games, setGames] = useState([]);
  const [gameId, setGameId] = useState("all");
  const [type, setType] = useState(savedTab);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [tick, setTick] = useState(0); // bump to reload stats + users
  const [toast, setToast] = useState(null);

  const notify = useCallback((text, kind = "ok") => setToast({ text, kind, id: Date.now() }), []);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  // [{ gameId, name, active, users }] — reloaded with everything else (counts change)
  useEffect(() => {
    api.games().then((d) => setGames(d.games)).catch(() => {});
  }, [tick]);

  function switchTab(t) {
    setType(t);
    setStats(null);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* storage blocked */
    }
  }

  useEffect(() => {
    let alive = true;
    api
      .stats(gameId === "all" ? "" : gameId, type)
      .then((d) => {
        if (!alive) return;
        setStats(d.stats);
        setStatsError("");
      })
      .catch((e) => alive && setStatsError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [gameId, type, tick]);

  // Auto refresh (new logins keep coming)
  useEffect(() => {
    const t = setInterval(reload, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">🐦</span>
          <div>
            <h1>Flying Bird</h1>
            <p className="muted">لوحة تحكم الأدمن</p>
          </div>
        </div>

        <div className="topbar-actions">
          <label className="select-wrap">
            <span className="sr-only">اللعبة</span>
            <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
              <option value="all">كل الألعاب</option>
              {games.map((g) => (
                <option key={g.gameId} value={g.gameId}>{g.name}{g.active ? "" : " (موقوفة)"}</option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={reload} title="تحديث">↻ تحديث</button>
          <button className="btn btn-ghost" onClick={onLogout}>خروج</button>
        </div>
      </header>

      <nav className="section-nav" aria-label="الأقسام">
        <div className="tabs tabs-big" role="tablist">
          {Object.entries(SECTIONS).map(([key, s]) => (
            <button
              key={key}
              role="tab"
              aria-selected={type === key}
              className={`tab ${type === key ? "tab-active" : ""}`}
              onClick={() => switchTab(key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="content">
        {statsError && <p className="banner-error" role="alert">{statsError}</p>}

        <StatsCards stats={stats} />

        <div className="grid-2">
          <SignupsChart data={stats ? stats.loginsPerDay : null} />
          <GamesCard games={games} stats={stats} onChanged={reload} notify={notify} />
        </div>

        <UsersTable key={type} type={type} gameId={gameId} games={games} tick={tick} onChanged={reload} notify={notify} />
      </main>

      {toast && <Toast key={toast.id} {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

function GamesCard({ games, stats, onChanged, notify }) {
  const [modal, setModal] = useState(null);
  const [adding, setAdding] = useState(false);

  // users per game for the current tab (streamers / agency), from /stats
  const tabCounts = new Map(((stats && stats.perGame) || []).map((r) => [r.gameId, r.users]));
  const max = Math.max(1, ...games.map((g) => tabCounts.get(g.gameId) || 0));

  const act = (fn, okText) => async (value) => {
    try {
      await fn(value);
    } catch (e) {
      throw new Error(errorText(e));
    }
    notify(okText);
    onChanged();
  };

  const open = {
    rename: (g) =>
      setModal({
        title: `اسم اللعبة ${g.gameId}`,
        message: "ده الاسم اللي بيظهر في الداش بورد بس. الـ gameId اللي اللعبة بتبعته مش هيتغير.",
        confirmText: "احفظ",
        input: { label: "الاسم", initial: g.name, required: true },
        onConfirm: act((name) => api.updateGame(g.gameId, { name: name.trim() }), "تم حفظ اسم اللعبة"),
      }),
    disable: (g) =>
      setModal({
        title: `إيقاف ${g.name}`,
        message: `كل الحسابات اللي على اللعبة دي (${formatNumber(g.users)}) هتتقفل فوراً: مفيش لوجين ولا لعب لحد ما تشغّلها تاني. الحسابات والاشتراكات مش هتتمسح.`,
        confirmText: "وقّف اللعبة",
        danger: true,
        onConfirm: act(() => api.updateGame(g.gameId, { active: false }), `تم إيقاف ${g.name}`),
      }),
    enable: (g) =>
      setModal({
        title: `تشغيل ${g.name}`,
        message: "الحسابات هترجع تشتغل زي ما كانت.",
        confirmText: "شغّل اللعبة",
        onConfirm: act(() => api.updateGame(g.gameId, { active: true }), `تم تشغيل ${g.name}`),
      }),
    remove: (g) =>
      setModal({
        title: `حذف ${g.name}`,
        message: "اللعبة هتتمسح نهائي.",
        confirmText: "احذف",
        danger: true,
        onConfirm: act(() => api.deleteGame(g.gameId), `تم حذف ${g.name}`),
      }),
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">اللعب</h2>
        <button className="btn btn-small" onClick={() => setAdding(true)}>+ لعبة جديدة</button>
      </div>
      {!stats && !games.length ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : (
        <ul className="per-game">
          {games.map((g) => {
            const n = tabCounts.get(g.gameId) || 0;
            return (
              <li key={g.gameId}>
                <div className="per-game-head">
                  <span>
                    <b>{g.name}</b> <code className="muted small" dir="ltr">{g.gameId}</code>
                    {!g.active && (
                      <span className="badge badge-critical game-badge">
                        <span className="dot dot-critical" aria-hidden="true" /> موقوفة
                      </span>
                    )}
                  </span>
                  <span className="num" title="الحسابات في التاب الحالي">{formatNumber(n)}</span>
                </div>
                <div className="meter" aria-hidden="true">
                  <span style={{ width: `${(n / max) * 100}%` }} />
                </div>
                <div className="game-actions">
                  <button className="btn btn-small" onClick={() => open.rename(g)}>تعديل الاسم</button>
                  {g.active ? (
                    <button className="btn btn-small btn-danger-ghost" onClick={() => open.disable(g)}>إيقاف</button>
                  ) : (
                    <button className="btn btn-small" onClick={() => open.enable(g)}>تشغيل</button>
                  )}
                  <button className="btn btn-small btn-danger-ghost" disabled={g.users > 0} onClick={() => open.remove(g)}
                    title={g.users > 0 ? `عليها ${g.users} حساب: وقّفها بدل الحذف` : ""}>
                    حذف
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {modal && <Modal {...modal} onClose={() => setModal(null)} />}
      {adding && (
        <GameModal
          onCreated={(g) => {
            notify(`تم إضافة ${g.name}`);
            onChanged();
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}
