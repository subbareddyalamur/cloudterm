import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";

const DARK = {
  bg0: "#0a0c0f", bg1: "#0f1115", bg2: "#14181f", bg3: "#1c2230",
  border: "#1e2535", borderHover: "#2a3448",
  text0: "#f0f4ff", text1: "#8b9ab5", text2: "#4a5568",
  amber: "#f5a623", amberDim: "#2a1f0a",
  red: "#ff4757", redDim: "#1f0a0a",
  green: "#00d68f", greenDim: "#0a1f15",
  blue: "#3b82f6", blueDim: "#0a1428",
  purple: "#a78bfa", purpleDim: "#1a1030",
  teal: "#2dd4bf",
  chart1: "#3b82f6", chart2: "#00d68f", chart3: "#f5a623", chart4: "#a78bfa", chart5: "#ff6b81",
  chart6: "#00d4aa", chart7: "#e17055", chart8: "#74b9ff", chart9: "#fd79a8", chart10: "#636e72",
};

const LIGHT = {
  bg0: "#f8f9fc", bg1: "#ffffff", bg2: "#f0f2f5", bg3: "#e4e7ec",
  border: "#d1d5db", borderHover: "#9ca3af",
  text0: "#111827", text1: "#6b7280", text2: "#9ca3af",
  amber: "#d97706", amberDim: "#fef3c7",
  red: "#dc2626", redDim: "#fee2e2",
  green: "#059669", greenDim: "#d1fae5",
  blue: "#2563eb", blueDim: "#dbeafe",
  purple: "#7c3aed", purpleDim: "#ede9fe",
  teal: "#0d9488",
  chart1: "#2563eb", chart2: "#059669", chart3: "#d97706", chart4: "#7c3aed", chart5: "#dc2626",
  chart6: "#0d9488", chart7: "#ea580c", chart8: "#3b82f6", chart9: "#db2777", chart10: "#6b7280",
};

let C = DARK;

const ACCT_COLORS = [C.chart1, C.chart2, C.chart3, C.chart4, C.chart5, C.chart6, C.chart7, C.chart8, C.chart9, C.chart10];

const fmt = (n) => {
  if (n == null || isNaN(n)) return "$0";
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(2) + "M";
  if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + n.toFixed(0);
};
const fmtFull = (n) => n == null ? "$0" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (a, b) => b === 0 ? 0 : ((a - b) / b * 100);

const getStyles = () => ({
  dash: { background: C.bg0, minHeight: "100vh", color: C.text0, fontFamily: "'Inter', 'DM Mono', sans-serif", fontSize: 15 },
  panel: (extra = {}) => ({ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "18px 20px", ...extra }),
  label: { fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: C.text1, marginBottom: 4 },
  bigNum: { fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", color: C.text0, lineHeight: 1.1, fontFamily: "'DM Mono', monospace" },
  tag: (bg, color) => ({ display: "inline-block", fontSize: 12, padding: "3px 9px", borderRadius: 4, background: bg, color, letterSpacing: "0.04em", fontWeight: 600 }),
  bar: (w, color) => ({ height: 5, width: `${w}%`, background: color, borderRadius: 2, transition: "width 0.6s ease" }),
  th: { textAlign: "left", padding: "10px 14px", fontSize: 12, color: C.text1, letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}` },
  td: { padding: "12px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 14 },
  tdNum: { padding: "12px 14px", borderBottom: `1px solid ${C.border}`, fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 14 },
});

var s = getStyles();

const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: C.text1, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color || C.text0 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{typeof p.value === "number" ? fmtFull(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

const MetricCard = ({ label, value, sub, subColor, accent }) => (
  <div style={{ ...s.panel(), borderTop: `2px solid ${accent || C.border}`, position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: accent || C.border, opacity: 0.04, borderRadius: "0 8px 0 60px" }} />
    <div style={s.label}>{label}</div>
    <div style={s.bigNum}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: subColor || C.text1, marginTop: 5 }}>{sub}</div>}
  </div>
);

const SectionHeader = ({ title, sub, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text0, letterSpacing: "0.02em" }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: C.text1, marginTop: 2 }}>{sub}</div>}
    </div>
    {right}
  </div>
);

function FilterSidebar({ data, filters, setFilters }) {
  if (!data) return null;
  const accounts = (data.accounts || []).map(a => a.alias || a.account_id);
  const tags = Object.keys(data.tag_breakdown || {});

  return (
    <div style={{ width: 240, flexShrink: 0, background: C.bg1, borderRight: `1px solid ${C.border}`, padding: "14px 14px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={s.label}>Accounts</div>
        {accounts.map(a => (
          <label key={a} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: C.text1, padding: "4px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={filters.accounts.length === 0 || filters.accounts.includes(a)}
              onChange={() => {
                setFilters(f => {
                  const cur = f.accounts;
                  if (cur.length === 0) return { ...f, accounts: [a] };
                  if (cur.includes(a)) { const next = cur.filter(x => x !== a); return { ...f, accounts: next }; }
                  return { ...f, accounts: [...cur, a] };
                });
              }} style={{ accentColor: C.blue, width: 15, height: 15 }} />
            {a}
          </label>
        ))}
        {filters.accounts.length > 0 && (
          <button onClick={() => setFilters(f => ({ ...f, accounts: [] }))} style={{ fontSize: 12, color: C.red, background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>Clear</button>
        )}
      </div>
      <div>
        <div style={s.label}>Service Filter</div>
        <input type="text" value={filters.service} onChange={e => setFilters(f => ({ ...f, service: e.target.value }))}
          placeholder="Search services..." style={{ width: "100%", padding: "7px 10px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text0, fontSize: 13, outline: "none" }} />
      </div>
      <div>
        <div style={s.label}>Tag Filter</div>
        <input type="text" value={filters.tag} onChange={e => setFilters(f => ({ ...f, tag: e.target.value }))}
          placeholder="Search tags..." style={{ width: "100%", padding: "7px 10px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text0, fontSize: 13, outline: "none" }} />
      </div>
      {(filters.accounts.length > 0 || filters.service || filters.tag) && (
        <button onClick={() => setFilters({ accounts: [], service: "", tag: "" })}
          style={{ padding: "7px 12px", background: C.redDim, border: `1px solid ${C.border}`, borderRadius: 5, color: C.red, fontSize: 13, cursor: "pointer" }}>
          Clear All Filters
        </button>
      )}
    </div>
  );
}

function OverviewTab({ data, filters }) {
  const d = data;
  const momPct = pct(d.total_this_month, d.total_last_month);
  const ydPct = pct(d.total_yesterday, d.total_day_before);
  const dailyAvg = d.total_last_7_days / 7;

  const topSvc = d.top_cost_drivers?.[0];
  const topSvcPct = topSvc ? topSvc.percentage.toFixed(0) : 0;

  const acctDonut = d.accounts.map((a, i) => ({ name: a.alias || a.account_id, value: a.this_month, color: ACCT_COLORS[i % ACCT_COLORS.length] }));
  const dailyChart = (d.daily_trend || []).map(p => ({ date: p.date.substring(5), cost: p.cost }));
  const last30 = dailyChart.slice(-30);

  const tagCustomer = (d.tag_breakdown?.Customer || []).reduce((acc, r) => {
    const existing = acc.find(x => x.name === r.value);
    if (existing) { existing.value += r.this_month; } else { acc.push({ name: r.value, value: r.this_month }); }
    return acc;
  }, []).sort((a, b) => b.value - a.value).slice(0, 8);

  const fAcct = filters.accounts;
  const filteredDrivers = (d.top_cost_drivers || []).filter(drv => {
    if (filters.service && !drv.service.toLowerCase().includes(filters.service.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <MetricCard label="Total spend (MTD)" value={fmtFull(d.total_this_month)} sub={`${momPct > 0 ? "\u2191" : "\u2193"} ${Math.abs(momPct).toFixed(1)}% vs last month`} subColor={momPct > 0 ? C.red : C.green} accent={C.amber} />
        <MetricCard label="Last month" value={fmtFull(d.total_last_month)} accent={C.blue} />
        <MetricCard label="Last 7 days" value={fmtFull(d.total_last_7_days)} sub={`${fmtFull(dailyAvg)}/day avg`} accent={C.teal} />
        <MetricCard label="Yesterday" value={fmtFull(d.total_yesterday)} sub={`${ydPct > 0 ? "\u2191" : "\u2193"} ${Math.abs(ydPct).toFixed(1)}% vs day before`} subColor={ydPct > 0 ? C.red : C.green} accent={C.purple} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={s.panel()}>
          <SectionHeader title="Total spend trend" sub={`${dailyChart.length} days \u00b7 all accounts`} />
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailyChart}>
              <defs>
                <linearGradient id="gTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.chart1} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.chart1} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="date" tick={{ fill: C.text1, fontSize: 10 }} axisLine={false} tickLine={false} interval={6} />
              <YAxis tickFormatter={fmt} tick={{ fill: C.text1, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<DarkTooltip />} />
              <Area type="monotone" dataKey="cost" stroke={C.chart1} fill="url(#gTrend)" strokeWidth={2} name="Daily Cost" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={s.panel()}>
          <SectionHeader title="Account share" sub="Current month" />
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={acctDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2} strokeWidth={0}>
                {acctDonut.map((a, i) => <Cell key={a.name} fill={a.color} />)}
              </Pie>
              <Tooltip content={<DarkTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            {acctDonut.slice(0, 6).map(a => (
              <div key={a.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.text1 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: a.color }} />{a.name}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text0, fontFamily: "'DM Mono', monospace" }}>{fmtFull(a.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={s.panel()}>
          <SectionHeader title="Top services" sub="MTD share of total" />
          {filteredDrivers.slice(0, 8).map((drv, i) => {
            const color = drv.change > 10 ? C.red : drv.change < 0 ? C.green : C.text1;
            return (
              <div key={drv.service} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: C.text0 }}>{drv.service.length > 30 ? drv.service.substring(0, 28) + "\u2026" : drv.service}</span>
                  <span style={{ fontSize: 11, color: C.amber, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                    {fmtFull(drv.this_month)} <span style={{ color, opacity: 0.8, fontSize: 10 }}>{drv.change > 0 ? "\u2191" : "\u2193"}{Math.abs(drv.change).toFixed(1)}%</span>
                  </span>
                </div>
                <div style={{ height: 4, background: C.bg3, borderRadius: 2 }}>
                  <div style={s.bar(drv.percentage, ACCT_COLORS[i % ACCT_COLORS.length])} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={s.panel()}>
          <SectionHeader title="By Customer tag" sub="Customer tag values" />
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={tagCustomer} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={2} strokeWidth={0}>
                {tagCustomer.map((t, i) => <Cell key={t.name} fill={ACCT_COLORS[i % ACCT_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<DarkTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
            {tagCustomer.slice(0, 6).map((t, i) => (
              <div key={t.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.text1 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: ACCT_COLORS[i % ACCT_COLORS.length] }} />{t.name}
                </div>
                <span style={{ fontSize: 11, color: C.text0, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{fmtFull(t.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={s.panel()}>
          <SectionHeader title="Daily run rate" sub="Last 30 days \u00b7 $/day" />
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={last30} barSize={6}>
              <CartesianGrid strokeDasharray="2 4" stroke={C.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.text2, fontSize: 9 }} axisLine={false} tickLine={false} interval={5} />
              <YAxis tickFormatter={fmt} tick={{ fill: C.text1, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="cost" fill={C.chart1} radius={[2, 2, 0, 0]} name="Daily Cost" />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: C.text1 }}>avg/day</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.amber, fontFamily: "'DM Mono', monospace" }}>{fmtFull(dailyAvg)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountsTab({ data }) {
  const accounts = data.accounts || [];
  const totalThisMonth = data.total_this_month || 1;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(accounts.length, 3)}, 1fr)`, gap: 12, marginBottom: 12 }}>
        {accounts.slice(0, 9).map((a, i) => {
          const mom = pct(a.this_month, a.last_month);
          const share = (a.this_month / totalThisMonth * 100).toFixed(0);
          return (
            <div key={a.account_id} style={{ ...s.panel(), borderLeft: `3px solid ${ACCT_COLORS[i % ACCT_COLORS.length]}` }}>
              <div style={s.label}>{a.alias || a.account_id}</div>
              <div style={{ fontSize: 10, color: C.text2, marginBottom: 6 }}>{a.account_id}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text0, fontFamily: "'DM Mono', monospace" }}>{fmtFull(a.this_month)}</div>
              <div style={{ fontSize: 11, marginTop: 4, color: mom > 0 ? C.red : C.green }}>
                {mom > 0 ? "\u2191" : "\u2193"} {Math.abs(mom).toFixed(1)}% MoM
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 3, background: C.bg3, borderRadius: 2 }}>
                  <div style={s.bar(parseFloat(share), ACCT_COLORS[i % ACCT_COLORS.length])} />
                </div>
                <div style={{ fontSize: 10, color: C.text1, marginTop: 4 }}>{share}% of total</div>
              </div>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ padding: "6px 8px", background: C.bg3, borderRadius: 4 }}>
                  <div style={{ fontSize: 9, color: C.text2 }}>Last 7 Days</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text0, fontFamily: "'DM Mono', monospace" }}>{fmt(a.last_7_days)}</div>
                </div>
                <div style={{ padding: "6px 8px", background: C.bg3, borderRadius: 4 }}>
                  <div style={{ fontSize: 9, color: C.text2 }}>Yesterday</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.amber, fontFamily: "'DM Mono', monospace" }}>{fmt(a.yesterday)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={s.panel()}>
        <SectionHeader title="Account comparison" sub="All periods" />
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["Account", "This Month", "Last Month", "MoM %", "Last 7 Days", "Yesterday", "Share"].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a, i) => {
              const mom = pct(a.this_month, a.last_month);
              const share = (a.this_month / totalThisMonth * 100);
              return (
                <tr key={a.account_id}>
                  <td style={{ ...s.td, fontWeight: 700, color: C.text0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 2, background: ACCT_COLORS[i % ACCT_COLORS.length] }} />
                      {a.alias || a.account_id}
                    </div>
                  </td>
                  <td style={{ ...s.tdNum, color: C.amber }}>{fmtFull(a.this_month)}</td>
                  <td style={{ ...s.tdNum, color: C.text1 }}>{fmtFull(a.last_month)}</td>
                  <td style={{ ...s.tdNum, color: mom > 0 ? C.red : C.green }}>{mom > 0 ? "\u2191" : "\u2193"} {Math.abs(mom).toFixed(1)}%</td>
                  <td style={{ ...s.tdNum, color: C.text0 }}>{fmtFull(a.last_7_days)}</td>
                  <td style={{ ...s.tdNum, color: C.text0 }}>{fmtFull(a.yesterday)}</td>
                  <td style={s.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 60, height: 4, background: C.bg3, borderRadius: 2 }}>
                        <div style={s.bar(share, ACCT_COLORS[i % ACCT_COLORS.length])} />
                      </div>
                      <span style={{ fontSize: 11, color: C.text1 }}>{share.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={s.panel({ marginTop: 12 })}>
        <SectionHeader title="MoM delta by account" sub="% change vs prior month" />
        <ResponsiveContainer width="100%" height={Math.max(accounts.length * 40, 120)}>
          <BarChart data={accounts.map((a, i) => ({ name: a.alias || a.account_id, mom: parseFloat(pct(a.this_month, a.last_month).toFixed(1)), color: ACCT_COLORS[i % ACCT_COLORS.length] }))} layout="vertical" barSize={18}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
            <XAxis type="number" tickFormatter={v => v + "%"} tick={{ fill: C.text1, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: C.text0, fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
            <Tooltip content={<DarkTooltip />} />
            <Bar dataKey="mom" radius={[0, 4, 4, 0]} name="MoM %"
              label={{ position: "right", fontSize: 11, fill: C.text1, formatter: v => v + "%" }}>
              {accounts.map((a, i) => <Cell key={a.account_id} fill={pct(a.this_month, a.last_month) > 0 ? C.red : C.green} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ServicesTab({ data, filters }) {
  const [sortCol, setSortCol] = useState("this_month");
  const [sortDir, setSortDir] = useState("desc");
  const [showAll, setShowAll] = useState(false);

  const svcAgg = useMemo(() => {
    const map = {};
    (data.service_breakdown || []).forEach(r => {
      if (!map[r.service]) map[r.service] = { service: r.service, this_month: 0, last_month: 0, last_7_days: 0, yesterday: 0 };
      map[r.service].this_month += r.this_month;
      map[r.service].last_month += r.last_month;
      map[r.service].last_7_days += r.last_7_days;
      map[r.service].yesterday += r.yesterday;
    });
    return Object.values(map);
  }, [data]);

  const filtered = useMemo(() => {
    let rows = svcAgg;
    if (filters.service) rows = rows.filter(r => r.service.toLowerCase().includes(filters.service.toLowerCase()));
    rows.sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return rows;
  }, [svcAgg, filters.service, sortCol, sortDir]);

  const visible = showAll ? filtered : filtered.slice(0, 50);
  const total = data.total_this_month || 1;

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const cols = [
    { key: "service", label: "Service", num: false },
    { key: "this_month", label: "MTD Cost", num: true },
    { key: "last_month", label: "Last Month", num: true },
    { key: "mom", label: "MoM", num: false },
    { key: "pct", label: "% Total", num: false },
    { key: "last_7_days", label: "Last 7 Days", num: true },
    { key: "yesterday", label: "Yesterday", num: true },
  ];

  return (
    <div>
      <div style={s.panel()}>
        <SectionHeader title="Service spend breakdown" sub={`${filtered.length} services \u00b7 aggregated across all accounts \u00b7 sorted by ${sortCol.replace(/_/g, " ")}`} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c.key} style={{ ...s.th, cursor: c.num ? "pointer" : "default" }} onClick={() => c.num && handleSort(c.key)}>
                    {c.label}{sortCol === c.key ? (sortDir === "desc" ? " \u2193" : " \u2191") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(row => {
                const mom = pct(row.this_month, row.last_month);
                const sharePct = (row.this_month / total * 100);
                return (
                  <tr key={row.service}>
                    <td style={{ ...s.td, fontWeight: 700, color: C.text0, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.service}</td>
                    <td style={{ ...s.tdNum, color: C.amber }}>{fmtFull(row.this_month)}</td>
                    <td style={{ ...s.tdNum, color: C.text1 }}>{fmtFull(row.last_month)}</td>
                    <td style={{ ...s.tdNum, color: mom > 10 ? C.red : mom < 0 ? C.green : C.text1 }}>
                      {mom > 0 ? "\u2191" : "\u2193"} {Math.abs(mom).toFixed(1)}%
                      {Math.abs(mom) > 25 && <span style={{ ...s.tag(C.redDim, C.red), marginLeft: 6 }}>spike</span>}
                    </td>
                    <td style={s.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 60, height: 4, background: C.bg3, borderRadius: 2 }}>
                          <div style={s.bar(Math.min(sharePct, 100), C.chart1)} />
                        </div>
                        <span style={{ fontSize: 11, color: C.text1 }}>{sharePct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ ...s.tdNum, color: C.text0 }}>{fmtFull(row.last_7_days)}</td>
                    <td style={{ ...s.tdNum, color: C.text0 }}>{fmtFull(row.yesterday)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!showAll && filtered.length > 50 && (
          <button onClick={() => setShowAll(true)} style={{ marginTop: 10, padding: "6px 14px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text1, fontSize: 11, cursor: "pointer" }}>
            Show All ({filtered.length} services)
          </button>
        )}
      </div>
    </div>
  );
}

function TagsTab({ data, filters }) {
  const renderTagSection = (tagKey, items) => {
    const agg = {};
    (items || []).forEach(r => {
      if (filters.tag && !r.value.toLowerCase().includes(filters.tag.toLowerCase())) return;
      if (!agg[r.value]) agg[r.value] = { value: r.value, this_month: 0, last_month: 0, last_7_days: 0, yesterday: 0 };
      agg[r.value].this_month += r.this_month;
      agg[r.value].last_month += r.last_month;
      agg[r.value].last_7_days += r.last_7_days;
      agg[r.value].yesterday += r.yesterday;
    });
    const rows = Object.values(agg).sort((a, b) => b.this_month - a.this_month);
    const pieData = rows.slice(0, 8).map((r, i) => ({ name: r.value, value: r.this_month, color: ACCT_COLORS[i % ACCT_COLORS.length] }));

    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 12, marginBottom: 12 }}>
          <div style={s.panel()}>
            <SectionHeader title={`By ${tagKey}`} sub={`${rows.length} values \u00b7 MTD`} />
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} strokeWidth={0}>
                  {pieData.map(t => <Cell key={t.name} fill={t.color} />)}
                </Pie>
                <Tooltip content={<DarkTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {pieData.map(t => (
                <div key={t.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.text1 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: t.color }} />{t.name}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.text0, fontFamily: "'DM Mono', monospace" }}>{fmtFull(t.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={s.panel()}>
            <SectionHeader title={`${tagKey} breakdown`} sub="All values" />
            <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {[tagKey, "This Month", "Last Month", "MoM", "Last 7 Days", "Yesterday"].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 30).map((r, i) => {
                    const mom = pct(r.this_month, r.last_month);
                    return (
                      <tr key={r.value}>
                        <td style={{ ...s.td, color: C.text0, fontWeight: 600 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{ width: 6, height: 6, borderRadius: 2, background: ACCT_COLORS[i % ACCT_COLORS.length] }} />{r.value}
                          </div>
                        </td>
                        <td style={{ ...s.tdNum, color: C.amber }}>{fmtFull(r.this_month)}</td>
                        <td style={{ ...s.tdNum, color: C.text1 }}>{fmtFull(r.last_month)}</td>
                        <td style={{ ...s.tdNum, color: mom > 0 ? C.red : C.green }}>{mom > 0 ? "\u2191" : "\u2193"} {Math.abs(mom).toFixed(1)}%</td>
                        <td style={{ ...s.tdNum, color: C.text0 }}>{fmtFull(r.last_7_days)}</td>
                        <td style={{ ...s.tdNum, color: C.text0 }}>{fmtFull(r.yesterday)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const tags = data.tag_breakdown || {};
  return (
    <div>
      {tags.Customer && renderTagSection("Customer", tags.Customer)}
      {tags.ProjectCode && renderTagSection("ProjectCode", tags.ProjectCode)}

      {(data.region_breakdown || []).length > 0 && (
        <div style={s.panel()}>
          <SectionHeader title="Cost by Region" sub={`${data.region_breakdown.length} region entries \u00b7 all accounts`} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 12 }}>
            <ResponsiveContainer width="100%" height={Math.min(data.region_breakdown.length * 28, 300)}>
              <BarChart data={(() => {
                const rAgg = {};
                data.region_breakdown.forEach(r => { rAgg[r.region] = (rAgg[r.region] || 0) + r.this_month; });
                return Object.entries(rAgg).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([r, c]) => ({ region: r, cost: c }));
              })()} layout="vertical" barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                <XAxis type="number" tickFormatter={fmt} tick={{ fill: C.text1, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="region" tick={{ fill: C.text0, fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]} name="This Month">
                  {Array.from({ length: 12 }).map((_, i) => <Cell key={i} fill={ACCT_COLORS[i % ACCT_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ overflowY: "auto", maxHeight: 300 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Region", "Account", "This Month", "Last Month", "MoM"].map(h => <th key={h} style={s.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.region_breakdown.slice(0, 30).map((r, i) => {
                    const mom = pct(r.this_month, r.last_month);
                    return (
                      <tr key={r.region + r.account + i}>
                        <td style={{ ...s.td, color: C.text0, fontWeight: 600 }}>{r.region}</td>
                        <td style={{ ...s.td, color: C.text1 }}>{r.account}</td>
                        <td style={{ ...s.tdNum, color: C.amber }}>{fmtFull(r.this_month)}</td>
                        <td style={{ ...s.tdNum, color: C.text1 }}>{fmtFull(r.last_month)}</td>
                        <td style={{ ...s.tdNum, color: mom > 0 ? C.red : C.green }}>{mom > 0 ? "\u2191" : "\u2193"} {Math.abs(mom).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnomaliesTab({ data, theme }) {
  const daily = data.daily_trend || [];
  const anomalies = useMemo(() => {
    if (daily.length < 8) return [];
    const result = [];
    for (let i = 7; i < daily.length; i++) {
      const window = daily.slice(i - 7, i);
      const avg = window.reduce((s, p) => s + p.cost, 0) / 7;
      const actual = daily[i].cost;
      if (avg > 0 && actual > avg * 1.4) {
        result.push({
          date: daily[i].date,
          expected: avg,
          actual,
          delta: ((actual - avg) / avg * 100),
          excess: actual - avg,
        });
      }
    }
    return result.sort((a, b) => b.delta - a.delta).slice(0, 10);
  }, [daily]);

  const totalExcess = anomalies.reduce((s, a) => s + a.excess, 0);
  const topDrivers = (data.top_cost_drivers || []).filter(d => d.change > 15).slice(0, 4);

  const insights = useMemo(() => {
    const items = [];
    (data.top_cost_drivers || []).forEach(d => {
      if (d.change > 25) items.push({ type: "warn", title: `${d.service} spike`, body: `+${d.change.toFixed(1)}% month-over-month increase. Current MTD: ${fmtFull(d.this_month)} (${d.percentage.toFixed(0)}% of total).` });
    });
    const svcAgg = {};
    (data.service_breakdown || []).forEach(r => {
      svcAgg[r.service] = (svcAgg[r.service] || 0) + r.this_month;
    });
    const sorted = Object.entries(svcAgg).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      items.push({ type: "info", title: "Top cost concentration", body: `${sorted[0][0]} accounts for ${(sorted[0][1] / (data.total_this_month || 1) * 100).toFixed(0)}% of total spend at ${fmtFull(sorted[0][1])}.` });
    }
    const momTotal = pct(data.total_this_month, data.total_last_month);
    if (momTotal > 5) {
      items.push({ type: "warn", title: "Overall spend trending up", body: `Total spend is +${momTotal.toFixed(1)}% vs last month. Review top cost drivers for optimization opportunities.` });
    } else if (momTotal < -5) {
      items.push({ type: "save", title: "Spend reduction achieved", body: `Total spend is ${momTotal.toFixed(1)}% vs last month. Good progress on cost optimization.` });
    }
    return items;
  }, [data]);

  const insightColors = { warn: [C.redDim, "#3a1515", C.red], save: [C.greenDim, "#0a2a18", C.green], info: [C.blueDim, "#0a1e3a", C.blue] };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        <MetricCard label="Detected anomalies" value={String(anomalies.length)} sub={anomalies.length > 0 ? "Cost spikes > 40% of baseline" : "No anomalies detected"} subColor={anomalies.length > 0 ? C.red : C.green} accent={anomalies.length > 0 ? C.red : C.green} />
        <MetricCard label="Anomalous excess" value={fmtFull(totalExcess)} sub="Above 7-day rolling average" subColor={C.red} accent={C.amber} />
        <MetricCard label="Services with spikes" value={String(topDrivers.length)} sub={topDrivers.length > 0 ? topDrivers.map(d => d.service.substring(0, 20)).join(", ") : "None"} accent={C.chart1} />
      </div>

      {anomalies.length > 0 && (
        <div style={s.panel({ marginBottom: 12 })}>
          <SectionHeader title="Detected anomalies" sub="Days where total spend exceeded 140% of the prior 7-day average, indicating unusual cost spikes" />
          {anomalies.map((a, i) => (
            <div key={i} style={{ border: `1px solid ${theme === "dark" ? "#3a1515" : "#fca5a5"}`, borderRadius: 6, padding: "16px 18px", marginBottom: 10, background: C.redDim }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <span style={{ fontWeight: 700, color: C.text0, fontSize: 15 }}>{a.date}</span>
                  <div style={{ fontSize: 12, color: C.text1, marginTop: 4, lineHeight: 1.6 }}>
                    On this day, your total AWS spend was <span style={{ color: C.red, fontWeight: 700 }}>{fmtFull(a.actual)}</span>,
                    which is <span style={{ color: C.red, fontWeight: 700 }}>{fmtFull(a.excess)}</span> more than the expected daily average
                    of <span style={{ color: C.green, fontWeight: 700 }}>{fmtFull(a.expected)}</span> (based on the previous 7 days).
                    This represents a <span style={{ color: C.red, fontWeight: 700 }}>+{a.delta.toFixed(0)}%</span> spike.
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 20 }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: C.red, fontFamily: "'DM Mono', monospace" }}>+{a.delta.toFixed(0)}%</div>
                  <div style={{ fontSize: 11, color: C.text1 }}>above baseline</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 28 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.text1, marginBottom: 3 }}>Expected (7d avg)</div>
                  <div style={{ fontSize: 16, color: C.green, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{fmtFull(a.expected)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.text1, marginBottom: 3 }}>Actual spend</div>
                  <div style={{ fontSize: 16, color: C.red, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{fmtFull(a.actual)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.text1, marginBottom: 3 }}>Excess cost</div>
                  <div style={{ fontSize: 16, color: C.amber, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{fmtFull(a.excess)}</div>
                </div>
              </div>
              <div style={{ marginTop: 12, height: 6, background: C.bg3, borderRadius: 3 }}>
                <div style={{ height: 6, width: `${Math.min(a.delta / 3, 100)}%`, background: `linear-gradient(90deg, ${C.amber}, ${C.red})`, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {anomalies.length === 0 && (
        <div style={s.panel({ marginBottom: 12 })}>
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>&#x2713;</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.green, marginBottom: 4 }}>No anomalies detected</div>
            <div style={{ fontSize: 11, color: C.text1 }}>All daily costs are within normal variance of the 7-day rolling average.</div>
          </div>
        </div>
      )}

      <div style={s.panel()}>
        <SectionHeader title="FinOps intelligence" sub="Automated insights from cost data" right={
          insights.filter(i => i.type === "save").length > 0 ? (
            <div style={{ fontSize: 11, color: C.green, border: `1px solid ${C.greenDim}`, padding: "3px 10px", borderRadius: 4 }}>Savings detected</div>
          ) : null
        } />
        {insights.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: C.text1, fontSize: 12 }}>No actionable insights at this time.</div>
        )}
        {insights.map((ins, i) => {
          const [bg, bd, fg] = insightColors[ins.type] || insightColors.info;
          return (
            <div key={i} style={{ padding: "10px 12px", background: bg, border: `1px solid ${bd}`, borderRadius: 6, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ color: fg, fontSize: 14, lineHeight: 1.4, flexShrink: 0 }}>{ins.type === "warn" ? "\u26a0" : ins.type === "save" ? "$" : "\u2192"}</span>
                <div>
                  <div style={{ fontWeight: 700, color: C.text0, marginBottom: 2, fontSize: 12 }}>{ins.title}</div>
                  <div style={{ fontSize: 11, color: C.text1, lineHeight: 1.6 }}>{ins.body}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TABS = ["Overview", "Accounts", "Services", "Tags", "Anomalies"];

export default function App() {
  const [tab, setTab] = useState("Overview");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ accounts: [], service: "", tag: "" });
  const [pulse, setPulse] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem("ce-theme") || "dark");

  useEffect(() => { const t = setTimeout(() => setPulse(false), 2000); return () => clearTimeout(t); }, []);

  C = theme === "light" ? LIGHT : DARK;
  s = getStyles();

  useEffect(() => { localStorage.setItem("ce-theme", theme); }, [theme]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  const CACHE_KEY = "ce-data-cache";
  const CACHE_TTL = 5 * 60 * 1000;

  const loadData = (force) => {
    if (!force) {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data: cachedData, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL) {
            setData(cachedData);
            setLoading(false);
            return;
          }
        }
      } catch (e) {}
    }
    setLoading(true);
    setError(null);
    fetch("/cost-explorer/comprehensive")
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(d => {
        setData(d);
        setLoading(false);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: d, ts: Date.now() })); } catch (e) {}
      })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(() => loadData(false), []);

  const filteredData = useMemo(() => {
    if (!data) return null;
    if (filters.accounts.length === 0 && !filters.service && !filters.tag) return data;
    const fa = filters.accounts;
    const matchAcct = (name) => fa.length === 0 || fa.includes(name);

    return {
      ...data,
      accounts: data.accounts.filter(a => matchAcct(a.alias || a.account_id)),
      total_this_month: data.accounts.filter(a => matchAcct(a.alias || a.account_id)).reduce((s, a) => s + a.this_month, 0),
      total_last_month: data.accounts.filter(a => matchAcct(a.alias || a.account_id)).reduce((s, a) => s + a.last_month, 0),
      total_last_7_days: data.accounts.filter(a => matchAcct(a.alias || a.account_id)).reduce((s, a) => s + a.last_7_days, 0),
      total_yesterday: data.accounts.filter(a => matchAcct(a.alias || a.account_id)).reduce((s, a) => s + a.yesterday, 0),
      service_breakdown: data.service_breakdown.filter(r => matchAcct(r.account)),
      region_breakdown: data.region_breakdown?.filter(r => matchAcct(r.account)),
      tag_breakdown: Object.fromEntries(Object.entries(data.tag_breakdown || {}).map(([k, v]) => [k, v.filter(r => matchAcct(r.account))])),
      top_cost_drivers: data.top_cost_drivers,
    };
  }, [data, filters]);

  const acctCount = data?.accounts?.length || 0;

  const tabContent = {
    Overview: filteredData && <OverviewTab data={filteredData} filters={filters} />,
    Accounts: filteredData && <AccountsTab data={filteredData} />,
    Services: filteredData && <ServicesTab data={filteredData} filters={filters} />,
    Tags: filteredData && <TagsTab data={filteredData} filters={filters} />,
    Anomalies: filteredData && <AnomaliesTab data={filteredData} theme={theme} />,
  };

  const exportCSV = () => {
    if (!data?.service_breakdown?.length) return;
    const rows = data.service_breakdown;
    const header = "Service,Account,This Month,Last Month,Last 7 Days,Yesterday\n";
    const body = rows.map(r =>
      [r.service, r.account, r.this_month.toFixed(2), r.last_month.toFixed(2), r.last_7_days.toFixed(2), r.yesterday.toFixed(2)]
        .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cost-explorer.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const anomalyCount = useMemo(() => {
    const daily = filteredData?.daily_trend || [];
    if (daily.length < 8) return 0;
    let count = 0;
    for (let i = 7; i < daily.length; i++) {
      const avg = daily.slice(i - 7, i).reduce((s, p) => s + p.cost, 0) / 7;
      if (avg > 0 && daily[i].cost > avg * 1.4) count++;
    }
    return count;
  }, [filteredData]);

  if (loading) {
    return (
      <div style={{ ...s.dash, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, color: C.text1, marginBottom: 8 }}>Loading cost data across {acctCount || "all"} accounts...</div>
          <div style={{ fontSize: 11, color: C.text2 }}>This may take 10-30 seconds</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...s.dash, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, color: C.red, marginBottom: 8 }}>Failed to load cost data</div>
          <div style={{ fontSize: 11, color: C.text2, marginBottom: 12 }}>{error}</div>
          <button onClick={loadData} style={{ padding: "8px 20px", background: C.blueDim, border: `1px solid ${C.blue}`, borderRadius: 6, color: C.blue, cursor: "pointer", fontSize: 12 }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div key={theme} style={s.dash}>
      <div style={{ background: C.bg1, borderBottom: `1px solid ${C.border}`, padding: "14px 20px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}>
              <svg viewBox="0 0 640 512" style={{ position: "absolute", width: 36, height: 36, fill: "#58a6ff" }}>
                <path d="M537.6 226.6c4.1-10.7 6.4-22.4 6.4-34.6 0-53-43-96-96-96-19.7 0-38.1 6-53.3 16.2C367 64.2 315.3 32 256 32c-88.4 0-160 71.6-160 160 0 2.7.1 5.4.2 8.1C40.2 219.8 0 273.2 0 336c0 79.5 64.5 144 144 144h368c70.7 0 128-57.3 128-128 0-61.9-44-113.6-102.4-125.4z"/>
              </svg>
              <svg viewBox="0 0 24 24" style={{ position: "absolute", width: 16, height: 16, top: 12, left: 10, fill: "none", stroke: C.bg0, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", zIndex: 2 }}>
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, background: "linear-gradient(135deg, #58a6ff, #d2a8ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CloudTerm</div>
              <div style={{ fontSize: 11, color: C.text1, letterSpacing: "0.05em", textTransform: "uppercase" }}>Cost Explorer</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={toggleTheme} style={{ padding: "6px 12px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text1, fontSize: 14, cursor: "pointer", lineHeight: 1 }}>{theme === "dark" ? "\u2600" : "\u263e"}</button>
            <button onClick={exportCSV} style={{ padding: "6px 14px", background: C.greenDim, border: `1px solid ${theme === "dark" ? "#0a2a18" : "#a7f3d0"}`, borderRadius: 5, color: C.green, fontSize: 12, cursor: "pointer" }}>Export CSV</button>
            <button onClick={() => loadData(true)} style={{ padding: "6px 14px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text1, fontSize: 12, cursor: "pointer" }}>Refresh</button>
          </div>
        </div>
      </div>

      <div style={{ background: `linear-gradient(90deg, ${C.amberDim}, ${C.bg1})`, borderBottom: `1px solid ${C.border}`, padding: "9px 20px", display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
        {[
          { l: "MTD Spend", v: fmtFull(filteredData?.total_this_month), c: C.text0 },
          { l: "Last Month", v: fmtFull(filteredData?.total_last_month), c: C.amber },
          { l: "Last 7 Days", v: fmtFull(filteredData?.total_last_7_days), c: C.text0 },
          { l: "Yesterday", v: fmtFull(filteredData?.total_yesterday), c: C.text0 },
          { l: "MoM Change", v: `${pct(filteredData?.total_this_month, filteredData?.total_last_month) > 0 ? "+" : ""}${pct(filteredData?.total_this_month, filteredData?.total_last_month).toFixed(1)}%`, c: pct(filteredData?.total_this_month, filteredData?.total_last_month) > 0 ? C.red : C.green },
        ].map(m => (
          <div key={m.l} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{ fontSize: 10, color: C.text1, letterSpacing: "0.06em", textTransform: "uppercase" }}>{m.l}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: m.c, fontFamily: "'DM Mono', monospace" }}>{m.v}</span>
          </div>
        ))}
      </div>

      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "0 20px", background: C.bg1, display: "flex", gap: 2 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ fontSize: 12, padding: "10px 16px", background: "transparent", border: "none", borderBottom: `2px solid ${tab === t ? C.amber : "transparent"}`, color: tab === t ? C.amber : C.text1, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em", transition: "all 0.15s" }}>
            {t}
            {t === "Anomalies" && anomalyCount > 0 && <span style={{ marginLeft: 5, fontSize: 10, background: C.redDim, color: C.red, border: "1px solid #3a1515", borderRadius: 9, padding: "1px 5px" }}>{anomalyCount}</span>}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        <FilterSidebar data={data} filters={filters} setFilters={setFilters} />
        <div style={{ flex: 1, padding: "18px 20px", overflowY: "auto" }}>
          {tabContent[tab]}
        </div>
      </div>
    </div>
  );
}
