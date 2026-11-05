import { formatNumber } from "../format.js";

export default function StatsCards({ stats }) {
  const cards = [
    { key: "totalUsers", label: "إجمالي الحسابات" },
    { key: "loggedInToday", label: "دخلوا النهارده", dot: "good" },
    { key: "notBound", label: "لسه ماربطوش جهاز" },
    { key: "expiringSoon", label: "اشتراكات قربت تخلص (7 أيام)", dot: "warning" },
    { key: "expiredSubs", label: "اشتراكات خلصت", dot: "critical" },
    { key: "wrongDeviceAttempts", label: "محاولات من جهاز تاني (7 أيام)", dot: "warning" },
    { key: "bannedUsers", label: "محظورين", dot: "critical" },
  ];

  return (
    <section className="stats" aria-label="إحصائيات">
      {cards.map((c) => (
        <div className="stat" key={c.key}>
          <span className="stat-label">
            {c.dot && <span className={`dot dot-${c.dot}`} aria-hidden="true" />}
            {c.label}
          </span>
          {stats ? (
            <span className="stat-value num">{formatNumber(stats[c.key])}</span>
          ) : (
            <span className="skeleton" style={{ height: 34, width: 70 }} />
          )}
        </div>
      ))}
    </section>
  );
}
