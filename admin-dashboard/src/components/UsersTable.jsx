import { useEffect, useState } from "react";
import { api, errorText } from "../api.js";
import { formatDate, formatDateTime, formatNumber, timeAgo } from "../format.js";
import Modal from "./Modal.jsx";
import CreateUserModal from "./CreateUserModal.jsx";
import SubscriptionModal from "./SubscriptionModal.jsx";
import { SECTIONS } from "../sections.js";

const TABS = [
  { key: "all", label: "الكل" },
  { key: "unbound", label: "ماربطش جهاز" },
  { key: "expiring", label: "الاشتراك قرب يخلص" },
  { key: "expired", label: "الاشتراك خلص" },
  { key: "alerts", label: "محاولات من جهاز تاني" },
  { key: "banned", label: "محظورين" },
];
const LIMIT = 20;
const shortId = (id) => (id.length > 14 ? id.slice(0, 6) + "…" + id.slice(-4) : id);

export default function UsersTable({ type = "streamer", gameId, games = [], tick, onChanged, notify }) {
  const section = SECTIONS[type];
  const [status, setStatus] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [creating, setCreating] = useState(false);
  const [subFor, setSubFor] = useState(null);

  // Debounce search typing
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => setPage(1), [gameId, status]);

  useEffect(() => {
    let alive = true;
    api
      .users({ type, gameId: gameId === "all" ? "" : gameId, status, search, page, limit: LIMIT })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError("");
      })
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [type, gameId, status, search, page, tick]);

  // Wraps an action: run it, show a toast, refresh everything. Errors show inside the modal.
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
    resetDevice: (u) =>
      setModal({
        title: `فك ربط جهاز ${u.username}`,
        message: "الحساب هيتفك من الجهاز الحالي، وأول جهاز يدخل بعد كده هيتقفل عليه. استخدمها لو الاستريمر غيّر جهازه.",
        confirmText: "فك الربط",
        onConfirm: act(() => api.resetDevice(u.id), `تم فك ربط جهاز ${u.username}`),
      }),
    ban: (u) =>
      setModal({
        title: `حظر ${u.username}`,
        message: "الاستريمر مش هيقدر يعمل لوجين لحد ما تفك الحظر.",
        confirmText: "احظر",
        danger: true,
        input: { label: "السبب (اختياري)", placeholder: "مثلاً: شارك الحساب" },
        onConfirm: act((reason) => api.ban(u.id, reason), `تم حظر ${u.username}`),
      }),
    unban: (u) =>
      setModal({
        title: `فك حظر ${u.username}`,
        message: "الاستريمر هيقدر يدخل تاني.",
        confirmText: "فك الحظر",
        onConfirm: act(() => api.unban(u.id), `تم فك حظر ${u.username}`),
      }),
    password: (u) =>
      setModal({
        title: `باسورد جديد لـ ${u.username}`,
        message: "الباسورد القديم هيبطل. ابعت الجديد للاستريمر. الجهاز المربوط مش هيتغير.",
        confirmText: "غيّر الباسورد",
        input: { label: "الباسورد الجديد", type: "text", minLength: 6, required: true },
        onConfirm: act((pw) => api.setPassword(u.id, pw), `تم تغيير باسورد ${u.username}`),
      }),
    note: (u) =>
      setModal({
        title: `ملاحظة على ${u.username}`,
        confirmText: "احفظ",
        input: { label: "الملاحظة", placeholder: "مثلاً: أحمد - تويتش", initial: u.note },
        onConfirm: act((note) => api.setNote(u.id, note), "تم حفظ الملاحظة"),
      }),
    clearAlert: (u) =>
      setModal({
        title: `محاولة دخول من جهاز تاني: ${u.username}`,
        message: `في ${formatDateTime(u.wrongDevice.at)} حد دخل اليوزر والباسورد الصح من جهاز تاني (${u.wrongDevice.deviceId}) والسيرفر رفضه. لو الاستريمر غيّر جهازه اعمل "فك ربط الجهاز". لو مش هو، غيّر الباسورد.`,
        confirmText: "تمت المراجعة",
        onConfirm: act(() => api.clearAlert(u.id), "تم إخفاء التنبيه"),
      }),
    remove: (u) =>
      setModal({
        title: `حذف ${u.username}`,
        message: "الحساب وسجل دخوله هيتمسحوا نهائي.",
        confirmText: "احذف نهائي",
        danger: true,
        onConfirm: act(() => api.remove(u.id), `تم حذف ${u.username}`),
      }),
  };

  const users = data ? data.users : [];

  return (
    <section className="card">
      <div className="card-head wrap">
        <h2 className="card-title">
          {section.title} {data && <span className="muted num">({formatNumber(data.total)})</span>}
        </h2>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ حساب جديد</button>
      </div>
      <div className="filters filters-row">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={status === t.key}
              className={`tab ${status === t.key ? "tab-active" : ""}`}
              onClick={() => setStatus(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder="ابحث باليوزر أو الملاحظة..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {error && <p className="banner-error" role="alert">{error}</p>}

      <div className="table-scroll">
        <table className="users">
          <thead>
            <tr>
              <th>اليوزر</th>
              <th>اللعبة</th>
              <th>الجهاز</th>
              <th>الحالة</th>
              <th>الاشتراك</th>
              <th>آخر نشاط</th>
              <th>اتعمل</th>
              <th className="actions-col">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {!data &&
              [0, 1, 2].map((i) => (
                <tr key={i}>
                  <td colSpan={8}><div className="skeleton" style={{ height: 20 }} /></td>
                </tr>
              ))}

            {data && users.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">مفيش حسابات</td>
              </tr>
            )}

            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="username" dir="ltr">{u.username}</div>
                  {u.note && <div className="muted small user-note">{u.note}</div>}
                </td>
                <td><span className="chip">{u.gameId}</span></td>
                <td>
                  {u.deviceId ? (
                    <span title={`${u.deviceId}\nاتربط ${formatDateTime(u.deviceBoundAt)}`}>
                      <code className="device" dir="ltr">{shortId(u.deviceId)}</code>
                      <div className="muted small">{formatDate(u.deviceBoundAt)}</div>
                    </span>
                  ) : (
                    <span className="muted">لسه ماربطش</span>
                  )}
                </td>
                <td>
                  <div className="status-cell">
                    <StatusBadge user={u} />
                    {u.wrongDevice && (
                      <button className="badge badge-warning badge-btn" onClick={() => open.clearAlert(u)}
                        title={formatDateTime(u.wrongDevice.at)}>
                        <span className="dot dot-warning" aria-hidden="true" /> جهاز تاني حاول
                      </button>
                    )}
                  </div>
                </td>
                <td><SubscriptionCell sub={u.subscription} /></td>
                <td title={activityTitle(u)}>{u.lastSeenAt || u.lastLoginAt ? timeAgo(u.lastSeenAt || u.lastLoginAt) : "—"}</td>
                <td>{formatDate(u.createdAt)}</td>
                <td className="actions">
                  <button className="btn btn-small" onClick={() => setSubFor(u)}>
                    {u.subscription && u.subscription.endsAt ? "تجديد الاشتراك" : "اشتراك"}
                  </button>
                  <button className="btn btn-small" disabled={!u.deviceId} onClick={() => open.resetDevice(u)}
                    title={u.deviceId ? "" : "مش مربوط بجهاز"}>
                    فك ربط الجهاز
                  </button>
                  {u.banned ? (
                    <button className="btn btn-small" onClick={() => open.unban(u)}>فك الحظر</button>
                  ) : (
                    <button className="btn btn-small btn-danger-ghost" onClick={() => open.ban(u)}>حظر</button>
                  )}
                  <button className="btn btn-small" onClick={() => open.password(u)}>باسورد</button>
                  <button className="btn btn-small" onClick={() => open.note(u)}>ملاحظة</button>
                  <button className="btn btn-small btn-danger-ghost" onClick={() => open.remove(u)}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="pager">
          <button className="btn btn-small" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span className="muted num">صفحة {formatNumber(page)} من {formatNumber(data.pages)}</span>
          <button className="btn btn-small" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}

      {modal && <Modal {...modal} onClose={() => setModal(null)} />}
      {subFor && (
        <SubscriptionModal
          user={subFor}
          onConfirm={(startsAt, months) =>
            act(() => api.setSubscription(subFor.id, startsAt, months), `تم حفظ اشتراك ${subFor.username}`)()}
          onClose={() => setSubFor(null)}
        />
      )}
      {creating && (
        <CreateUserModal
          type={type}
          title={section.newTitle}
          notePlaceholder={section.notePh}
          games={games}
          defaultGame={gameId !== "all" ? gameId : undefined}
          onCreated={(u) => {
            notify(`تم عمل حساب ${u.username}`);
            onChanged();
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </section>
  );
}

function StatusBadge({ user }) {
  if (user.banned)
    return (
      <span className="badge badge-critical" title={user.banReason || ""}>
        <span className="dot dot-critical" aria-hidden="true" /> محظور
        {user.banReason && <span className="badge-note"> · {user.banReason}</span>}
      </span>
    );
  if (user.deviceId)
    return (
      <span className="badge badge-good">
        <span className="dot dot-good" aria-hidden="true" /> شغال
      </span>
    );
  return (
    <span className="badge">
      <span className="dot dot-muted" aria-hidden="true" /> مستني أول دخول
    </span>
  );
}

const SOON_DAYS = 7;

function SubscriptionCell({ sub }) {
  if (!sub || sub.status === "unlimited") return <span className="muted">من غير انتهاء</span>;
  if (sub.status === "none")
    return (
      <span className="badge badge-critical">
        <span className="dot dot-critical" aria-hidden="true" /> مالوش اشتراك
      </span>
    );

  let badge;
  if (sub.status === "expired")
    badge = (
      <span className="badge badge-critical">
        <span className="dot dot-critical" aria-hidden="true" /> خلص
      </span>
    );
  else if (sub.status === "not_started")
    badge = (
      <span className="badge">
        <span className="dot dot-muted" aria-hidden="true" /> يبدأ {formatDate(sub.startsAt)}
      </span>
    );
  else {
    const soon = sub.daysLeft <= SOON_DAYS;
    badge = (
      <span className={`badge ${soon ? "badge-warning" : "badge-good"}`}>
        <span className={`dot ${soon ? "dot-warning" : "dot-good"}`} aria-hidden="true" /> فاضل {formatNumber(sub.daysLeft)} يوم
      </span>
    );
  }

  return (
    <div className="sub-cell" title={`من ${formatDateTime(sub.startsAt)}\nلحد ${formatDateTime(sub.endsAt)}`}>
      {badge}
      <span className="muted small">لحد {formatDate(sub.endsAt)}</span>
    </div>
  );
}

// Tooltip for the "last activity" column: last login + when the session ends.
function activityTitle(u) {
  const lines = [];
  if (u.lastSeenAt) lines.push(`آخر نشاط: ${formatDateTime(u.lastSeenAt)}`);
  if (u.lastLoginAt) lines.push(`آخر لوجين: ${formatDateTime(u.lastLoginAt)}`);
  if (u.sessionExpiresAt) {
    const ended = new Date(u.sessionExpiresAt) <= new Date();
    lines.push(`${ended ? "السيشن خلصت" : "السيشن بتخلص"}: ${formatDateTime(u.sessionExpiresAt)}`);
  }
  return lines.join("\n");
}
