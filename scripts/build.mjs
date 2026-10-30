// Generates the SVGs used by README.md from live GitHub data.
// Usage: GH_TOKEN=... node scripts/build.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const LOGIN = "xhoantran";
const OUT = new URL("../assets/", import.meta.url);

const PROJECTS = [
  { repo: "iphone-use", color: 1, span: "agents.act", blurb: "Let an AI agent use a real iPhone from your Mac. Screen over USB, taps over Bluetooth, no app on the phone." },
  { repo: "wake", color: 2, span: "agents.trace", blurb: "See what ChatGPT, Claude and Perplexity read on your website, and which sales those agent visits lead to." },
  { repo: "agentdog", color: 2, span: "agents.observe", blurb: "Open-source observability on OpenTelemetry, Tempo, Loki and Mimir, with a Claude agent that investigates." },
  { repo: "receiptly", color: 3, span: "humans.help", blurb: "Item-level receipts from any merchant. Plaid gives the transaction; receiptly fetches the itemized receipt." },
  { repo: "open-interview-coder", color: 3, span: "humans.help", blurb: "Desktop AI helper for coding interviews. Screenshot the problem, get a worked solution, bring your own key." },
  { repo: "node-agent", color: 0, span: "agents.build", blurb: "TypeScript agent framework: streaming tool loops, hooks, context compaction, Redis and DynamoDB state." },
];

const THEMES = {
  dark: {
    bg: "#0d1117", border: "#30363d", ink: "#e6edf3", muted: "#8b949e", faint: "#21262d", grid: "#161b22",
    spans: ["#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c"],
  },
  light: {
    bg: "#ffffff", border: "#d0d7de", ink: "#1f2328", muted: "#59636e", faint: "#eaeef2", grid: "#f6f8fa",
    spans: ["#7c3aed", "#059669", "#d97706", "#db2777", "#2563eb", "#c2410c"],
  },
};

const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => n.toLocaleString("en-US");

function wrap(text, max) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + " " + word : word;
    }
  }
  return line ? [...lines, line] : lines;
}

function svg(w, h, title, style, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>
  .sans { font-family: ${SANS}; }
  .mono { font-family: ${MONO}; }
  ${style}
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
${body}
</svg>
`;
}

async function fetchData() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Set GH_TOKEN to a GitHub token");
  const repoFields = "name stargazerCount primaryLanguage { name color }";
  const aliases = PROJECTS.map((p, i) => `r${i}: repository(owner: $login, name: "${p.repo}") { ${repoFields} }`).join("\n");
  const query = `query($login: String!) {
    user(login: $login) {
      createdAt
      repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 100) { totalCount nodes { stargazerCount } }
      contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } }
    }
    ${aliases}
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const { user } = json.data;
  return {
    user,
    repos: PROJECTS.map((p, i) => ({ ...p, ...json.data[`r${i}`] })),
  };
}

function streaks(days) {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today may have no contributions yet, so the current streak can end yesterday.
  let current = 0;
  let i = days.length - 1;
  if (days[i]?.contributionCount === 0) i--;
  for (; i >= 0 && days[i].contributionCount > 0; i--) current++;
  const busiest = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a));
  return { longest, current, busiest };
}

function header(t, stats) {
  const W = 880, H = 384;
  const x0 = 236, x1 = 848, span = x1 - x0;
  const rows = [
    { name: "hoan.tran", start: 0, end: 1, label: `${fmt(stats.total)} contributions / yr`, root: true },
    { name: "agents.build", color: 0, start: 0.03, end: 0.52, label: "node-agent · cortex" },
    { name: "agents.observe", color: 2, start: 0.18, end: 0.66, label: "wake · agentdog" },
    { name: "humans.help", color: 3, start: 0.34, end: 0.6, label: "receiptly" },
    { name: "stealth", start: 0.5, end: 0.86, label: "████ ██████ ███", redacted: true },
    { name: "agi", color: 4, start: 0.7, end: 1, label: "in progress…", open: true },
  ];
  const top = 236, rowH = 24, barH = 12;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f, i) => {
    const x = x0 + f * span;
    const label = ["0", "250ms", "500ms", "750ms", "1s"][i];
    return `<line x1="${x}" y1="${top - 14}" x2="${x}" y2="${top + rows.length * rowH - 6}" stroke="${t.faint}" stroke-width="1"/>
<text class="mono" x="${x}" y="${top - 20}" font-size="10" fill="${t.muted}" text-anchor="${i === 4 ? "end" : i === 0 ? "start" : "middle"}">${label}</text>`;
  }).join("\n");

  const lastChildY = top + (rows.length - 1) * rowH;
  const tree = `<path d="M38 ${top + 6} V${lastChildY}" stroke="${t.border}" fill="none"/>` +
    rows.slice(1).map((_, i) => `<path d="M38 ${top + (i + 1) * rowH} H48" stroke="${t.border}" fill="none"/>`).join("");

  const bars = rows.map((r, i) => {
    const y = top + i * rowH;
    const bx = x0 + r.start * span;
    const bw = (r.end - r.start) * span;
    const color = r.root || r.redacted ? t.muted : t.spans[r.color];
    const delay = (0.35 + i * 0.22).toFixed(2);
    const labelW = r.label.length * 6.6;
    const after = bx + bw + 8 + labelW <= x1;
    const lx = r.root ? bx + 8 : after ? bx + bw + 8 : bx - 8;
    const anchor = r.root || after ? "start" : "end";
    const labelFill = r.root ? t.ink : t.muted;
    // An open span is still running: a pulsing head at the end of the timeline.
    const head = r.open ? `\n<circle class="pulse" cx="${x1}" cy="${y}" r="5" fill="${color}"/>` : "";
    return `<text class="mono" x="${r.root ? 32 : 54}" y="${y + 4}" font-size="12" fill="${r.root ? t.ink : t.muted}">${esc(r.name)}</text>
<rect class="bar" style="animation-delay:${delay}s" x="${bx}" y="${y - 6}" width="${bw}" height="${barH}" rx="3" fill="${color}" fill-opacity="${r.root ? 0.3 : 0.9}"/>
<text class="mono label" style="animation-delay:${(+delay + 0.45).toFixed(2)}s" x="${lx}" y="${y + 4}" font-size="11" fill="${labelFill}" text-anchor="${anchor}">${esc(r.label)}</text>${head}`;
  }).join("\n");

  const style = `
  .bar { transform-box: fill-box; transform-origin: left center; animation: grow .7s cubic-bezier(.2,.8,.2,1) both; }
  .label { animation: fade .4s ease-out both; }
  .rise { animation: rise .8s cubic-bezier(.2,.8,.2,1) both; }
  .cursor { animation: sweep 2.6s cubic-bezier(.4,0,.2,1) .3s both; }
  .pulse { animation: pulse 2s ease-in-out infinite; }
  @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes sweep { 0% { transform: translateX(0); opacity: 0; } 8% { opacity: .9; } 85% { opacity: .9; } 100% { transform: translateX(${span}px); opacity: 0; } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }`;

  const body = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
<text class="mono" x="32" y="28" font-size="11" fill="${t.muted}" letter-spacing=".06em">TRACE <tspan fill="${t.ink}">4e1d·c0de·7a11</tspan>  ·  github.com/${LOGIN}</text>
<circle class="pulse" cx="${W - 70}" cy="24" r="4" fill="${t.spans[1]}"/>
<text class="mono" x="${W - 32}" y="28" font-size="11" fill="${t.muted}" text-anchor="end" letter-spacing=".06em">LIVE</text>
<line x1="0" y1="44" x2="${W}" y2="44" stroke="${t.faint}"/>
<g class="rise">
  <text class="sans" x="32" y="104" font-size="42" font-weight="700" fill="${t.ink}" letter-spacing="-.02em">Hoan Tran</text>
  <text class="sans" x="32" y="138" font-size="17" fill="${t.muted}">I build AI agents that work for people,</text>
  <text class="sans" x="32" y="162" font-size="17" fill="${t.muted}">on the road to AGI that helps humanity.</text>
</g>
<g class="rise" style="animation-delay:.15s">
  <text class="mono" x="${W - 32}" y="88" font-size="11" fill="${t.muted}" text-anchor="end" letter-spacing=".06em">CURRENTLY</text>
  <text class="sans" x="${W - 32}" y="112" font-size="17" font-weight="600" fill="${t.ink}" text-anchor="end">building in stealth</text>
  <text class="mono" x="${W - 32}" y="136" font-size="11" fill="${t.muted}" text-anchor="end">agents · AGI · humans first</text>
</g>
<line x1="32" y1="194" x2="${W - 32}" y2="194" stroke="${t.faint}"/>
<text class="mono" x="32" y="${top - 20}" font-size="10" fill="${t.muted}" letter-spacing=".06em">SPAN</text>
${ticks}
${tree}
${bars}
<line class="cursor" x1="${x0}" y1="${top - 12}" x2="${x0}" y2="${top + rows.length * rowH - 8}" stroke="${t.ink}" stroke-width="1.5"/>`;

  return svg(W, H, "Hoan Tran: I build AI agents that work for people, on the road to AGI that helps humanity.", style, body);
}

function activity(t, stats) {
  const W = 880, H = 236;
  const weeks = stats.weeks.slice(-52);
  const totals = weeks.map((w) => w.contributionDays.reduce((s, d) => s + d.contributionCount, 0));
  const max = Math.max(...totals, 1);
  const cx0 = 316, cx1 = 848, base = 188, maxH = 118;
  const slot = (cx1 - cx0) / weeks.length;
  const bw = slot - 3;
  const accent = t.spans[1];

  const bars = totals.map((v, i) => {
    const h = Math.max(2, (v / max) * maxH);
    const x = cx0 + i * slot;
    const last = i === totals.length - 1;
    return `<rect class="col" style="animation-delay:${(0.2 + i * 0.018).toFixed(3)}s" x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${accent}" fill-opacity="${last ? 1 : 0.75}"><title>Week of ${weeks[i].contributionDays[0].date}: ${fmt(v)}</title></rect>`;
  }).join("\n");

  let prevMonth = null;
  const months = weeks.map((w, i) => {
    const m = new Date(w.contributionDays[0].date + "T00:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    if (m === prevMonth) return "";
    const show = prevMonth !== null && i < weeks.length - 2;
    prevMonth = m;
    return show ? `<text class="mono" x="${(cx0 + i * slot).toFixed(1)}" y="${base + 20}" font-size="10" fill="${t.muted}">${m}</text>` : "";
  }).join("");

  const gridlines = [0.5, 1].map((f) => {
    const y = base - f * maxH;
    return `<line x1="${cx0}" y1="${y}" x2="${cx1}" y2="${y}" stroke="${t.faint}" stroke-dasharray="2 4"/>
<text class="mono" x="${cx0 - 10}" y="${y + 3}" font-size="10" fill="${t.muted}" text-anchor="end">${fmt(Math.round(f * max))}</text>`;
  }).join("\n");

  const busiestDate = new Date(stats.busiest.date + "T00:00:00Z").toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const kv = [
    ["longest streak", `${stats.longest} days`],
    ["current streak", `${stats.current} days`],
    ["busiest day", `${fmt(stats.busiest.contributionCount)} · ${busiestDate}`],
  ].map(([k, v], i) => `<text class="mono" x="32" y="${150 + i * 20}" font-size="11" fill="${t.muted}">${k}<tspan x="150" fill="${t.ink}">${esc(v)}</tspan></text>`).join("\n");

  const style = `
  .col { transform-box: fill-box; transform-origin: bottom; animation: up .6s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes up { from { transform: scaleY(0); } to { transform: scaleY(1); } }`;

  const body = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
<text class="mono" x="32" y="28" font-size="11" fill="${t.muted}" letter-spacing=".06em">METRIC <tspan fill="${t.ink}">contributions</tspan>  ·  weekly  ·  last 52w</text>
<text class="mono" x="${W - 32}" y="28" font-size="11" fill="${t.muted}" text-anchor="end">updated ${stats.today}</text>
<line x1="0" y1="44" x2="${W}" y2="44" stroke="${t.faint}"/>
<text class="sans" x="32" y="104" font-size="40" font-weight="700" fill="${t.ink}" letter-spacing="-.02em">${fmt(stats.total)}</text>
<text class="sans" x="32" y="126" font-size="13" fill="${t.muted}">contributions in the last year</text>
${kv}
${gridlines}
<line x1="${cx0}" y1="${base}" x2="${cx1}" y2="${base}" stroke="${t.border}"/>
${bars}
${months}`;

  return svg(W, H, `${fmt(stats.total)} contributions in the last year`, style, body);
}

function card(t, p) {
  const W = 430, H = 168;
  const color = t.spans[p.color];
  const lines = wrap(p.blurb, 55).slice(0, 3);
  const lang = p.primaryLanguage;
  const stars = p.stargazerCount > 0 ? `★ ${fmt(p.stargazerCount)}` : "";

  const body = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
<rect x="24" y="22" width="22" height="6" rx="2" fill="${color}"/>
<text class="mono" x="54" y="29" font-size="11" fill="${t.muted}">${esc(p.span)}</text>
<text class="mono" x="${W - 24}" y="29" font-size="12" fill="${t.muted}" text-anchor="end">${stars}</text>
<text class="mono" x="24" y="62" font-size="18" font-weight="700" fill="${t.ink}">${esc(p.repo)}</text>
${lines.map((l, j) => `<text class="sans" x="24" y="${90 + j * 20}" font-size="13.5" fill="${t.muted}">${esc(l)}</text>`).join("\n")}
${lang ? `<circle cx="${W - 24 - lang.name.length * 7.2 - 12}" cy="${H - 24}" r="5" fill="${lang.color || t.muted}"/>
<text class="mono" x="${W - 24}" y="${H - 20}" font-size="12" fill="${t.muted}" text-anchor="end">${esc(lang.name)}</text>` : ""}`;

  return svg(W, H, `${p.repo}: ${p.blurb}`, "", body);
}

const { user, repos } = await fetchData();
const cal = user.contributionsCollection.contributionCalendar;
const days = cal.weeks.flatMap((w) => w.contributionDays);
const stats = {
  total: cal.totalContributions,
  weeks: cal.weeks,
  today: new Date().toISOString().slice(0, 10),
  ...streaks(days),
};

mkdirSync(OUT, { recursive: true });
for (const [name, t] of Object.entries(THEMES)) {
  writeFileSync(new URL(`header-${name}.svg`, OUT), header(t, stats));
  writeFileSync(new URL(`activity-${name}.svg`, OUT), activity(t, stats));
  repos.forEach((p) => writeFileSync(new URL(`card-${p.repo}-${name}.svg`, OUT), card(t, p)));
}
console.log(`Wrote assets for ${fmt(stats.total)} contributions, ${repos.length} project cards.`);
