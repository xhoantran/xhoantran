// Generates the SVGs used by README.md from live GitHub data.
// Usage: GH_TOKEN=... node scripts/build.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const LOGIN = "xhoantran";
const OUT = new URL("../assets/", import.meta.url);

const C = {
  bg: "#07070d", panel: "#0b0b14", line: "#23233a", ink: "#f4f4fb", muted: "#9a9ab8", dim: "#55557a",
  violet: "#a78bfa", cyan: "#22d3ee", green: "#34d399", pink: "#f472b6", amber: "#fbbf24", blue: "#60a5fa",
};

const PROJECTS = [
  { repo: "iphone-use", color: C.cyan, blurb: "Let an AI agent use a real iPhone from your Mac: screen over USB, taps over Bluetooth." },
  { repo: "wake", color: C.violet, blurb: "See what ChatGPT, Claude and Perplexity read on your website, and which sales those agent visits lead to." },
  { repo: "agentdog", color: C.green, blurb: "Open-source observability on OpenTelemetry, Tempo, Loki and Mimir, with a Claude agent that investigates." },
  { repo: "receiptly", color: C.pink, blurb: "Item-level receipts from any merchant. Plaid gives the transaction; receiptly fetches the itemized receipt." },
  { repo: "open-interview-coder", color: C.amber, blurb: "AI coding-interview helper: screenshot the problem, get a worked solution, bring your own key." },
  { repo: "node-agent", color: C.blue, blurb: "TypeScript agent framework: streaming tool loops, hooks, context compaction, Redis and DynamoDB state." },
];

const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => n.toLocaleString("en-US");
const f4 = (n) => +n.toFixed(4);

// Seeded so the starfield and particles don't change (and commit) on every daily run.
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

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

function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

function svg(w, h, title, { defs = "", style = "", bare = false }, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs>
  <clipPath id="frame"><rect width="${w}" height="${h}" rx="16"/></clipPath>
  <filter id="glow" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="haze" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="16"/></filter>
  ${defs}
</defs>
<style>
  .sans { font-family: ${SANS}; }
  .mono { font-family: ${MONO}; }
  .blink { animation: blink 1.1s steps(1) infinite; }
  .rise { animation: rise .9s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes blink { 50% { opacity: 0; } }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  ${style}
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
${bare ? body : `<g clip-path="url(#frame)">
${body}
</g>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="16" fill="none" stroke="${defs.includes('id="edge"') ? "url(#edge)" : C.line}" stroke-width="1"/>`}
</svg>
`;
}

// A border gradient that slowly travels around the frame.
function edge(w, h, a, b) {
  return `<linearGradient id="edge" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="0">
  <stop offset="0" stop-color="${a}"/><stop offset=".3" stop-color="${C.line}"/><stop offset=".7" stop-color="${C.line}"/><stop offset="1" stop-color="${b}"/>
  <animateTransform attributeName="gradientTransform" type="rotate" from="0 ${w / 2} ${h / 2}" to="360 ${w / 2} ${h / 2}" dur="9s" repeatCount="indefinite"/>
</linearGradient>`;
}

// Discrete SMIL keyframes: value(i) for i = 0..n, step i landing at start + i * step seconds.
function steps(n, start, step, dur, value) {
  const times = [0];
  const vals = [value(0)];
  for (let i = 1; i <= n; i++) {
    times.push(f4((start + i * step) / dur));
    vals.push(value(i));
  }
  return { times, vals };
}

const discrete = (attr, dur, times, vals, loop) =>
  `<animate attributeName="${attr}" calcMode="discrete" dur="${dur}s" keyTimes="${times.join(";")}" values="${vals.join(";")}" ${loop ? 'repeatCount="indefinite"' : 'fill="freeze"'}/>`;

async function gql(query, variables) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Set GH_TOKEN to a GitHub token");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

// The year before `date` (exclusive), oldest day first.
async function fetchYearBefore(date) {
  const to = new Date(date + "T00:00:00Z");
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 365);
  const data = await gql(`query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) { contributionsCollection(from: $from, to: $to) { contributionCalendar { weeks { contributionDays { date contributionCount } } } } }
  }`, { login: LOGIN, from: from.toISOString(), to: new Date(to - 1000).toISOString() });
  return data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .filter((d) => d.date < date && d.date >= from.toISOString().slice(0, 10));
}

async function fetchData() {
  const repoFields = "name stargazerCount primaryLanguage { name color }";
  const aliases = PROJECTS.map((p, i) => `r${i}: repository(owner: $login, name: "${p.repo}") { ${repoFields} }`).join("\n");
  const query = `query($login: String!) {
    user(login: $login) {
      repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 100) { nodes { stargazerCount } }
      contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } }
    }
    ${aliases}
  }`;
  const data = await gql(query, { login: LOGIN });
  return { user: data.user, repos: PROJECTS.map((p, i) => ({ ...p, ...data[`r${i}`] })) };
}

// Streaks are counted over `days` (which may reach back several years), busiest day over the last year only.
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
  return { longest, current };
}

const shortDate = (iso) => new Date(iso + "T00:00:00Z").toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function hero(s) {
  const W = 900, H = 372;
  const rand = rng(7);

  // Stars stay clear of the text column so nothing sits on top of the name, tagline or chips.
  const stars = Array.from({ length: 120 }, () => [f4(rand() * W), f4(rand() * H), f4(0.3 + rand() * 1.1), rand(), rand()])
    .filter(([x, y]) => !(x < 540 && y > 24 && y < 348))
    .map(([x, y, r, o, t]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${f4(0.25 + o * 0.5)}" style="animation: tw ${f4(3 + t * 4)}s ease-in-out ${f4(-t * 6)}s infinite"/>`)
    .join("\n");

  // Tagline typed out, one character per step, with a caret that follows along.
  const cw = 10.2, tx = 40, y1 = 204, y2 = 232, step = 0.045, s1 = 1.0;
  const t1 = "I build AI agents that work for people,";
  const t2 = "on the road to AGI that helps humanity.";
  const s2 = s1 + t1.length * step + 0.25;
  const dur = f4(s2 + t2.length * step + 0.1);
  const w1 = steps(t1.length, s1, step, dur, (i) => f4(i * cw));
  const w2 = steps(t2.length, s2, step, dur, (i) => f4(i * cw));
  const caretTimes = [...w1.times, f4(s2 / dur), ...w2.times.slice(1)];
  const caretX = [...w1.vals.map((v) => f4(tx + v)), tx, ...w2.vals.slice(1).map((v) => f4(tx + v))];
  const caretY = [...w1.vals.map(() => y1 - 15), ...Array(w2.vals.length).fill(y2 - 15)];
  const typed = (id, y, text, w) => `<clipPath id="${id}"><rect x="${tx}" y="${y - 17}" height="24" width="${text.length * cw + 20}">${discrete("width", dur, w.times, w.vals)}</rect></clipPath>
<text class="mono" x="${tx}" y="${y}" font-size="17" fill="${C.muted}" clip-path="url(#${id})">${esc(text)}</text>`;

  const chips = [
    [fmt(s.total), "contributions / yr", C.violet],
    [`${s.current}`, "day streak", C.cyan],
    [`★ ${fmt(s.stars)}`, "stars earned", C.amber],
  ].map(([v, k, color], i) => {
    const x = 40 + i * 162;
    return `<g class="rise" style="animation-delay:${f4(s2 + t2.length * step + 0.2 + i * 0.15)}s">
  <rect x="${x}" y="268" width="150" height="62" rx="12" fill="#ffffff" fill-opacity=".03" stroke="${color}" stroke-opacity=".35"/>
  <circle cx="${x + 16}" cy="286" r="3" fill="${color}" filter="url(#glow)"/>
  <text class="sans" x="${x + 16}" y="${312}" font-size="22" font-weight="700" fill="${C.ink}">${esc(v)}</text>
  <text class="mono" x="${x + 26}" y="289" font-size="10" fill="${C.muted}" letter-spacing=".04em">${esc(k)}</text>
</g>`;
  }).join("\n");

  // Agents and their friends orbit an AGI core.
  const cx = 700, cy = 196;
  const rings = [
    { rx: 172, ry: 64, dur: 36, nodes: [["humans", C.pink], ["agents", C.cyan], ["MCP", C.violet]] },
    { rx: 120, ry: 46, dur: 26, nodes: [["tools", C.green], ["memory", C.blue]] },
    // Too close to the core for a labelled node; it stays as a ring.
    { rx: 70, ry: 25, dur: 17, nodes: [] },
  ];
  const orbitPath = (rx, ry) => `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy}`;
  const arc = (r, front) => `<path class="ring" d="M ${front ? cx - r.rx : cx + r.rx} ${cy} A ${r.rx} ${r.ry} 0 0 0 ${front ? cx + r.rx : cx - r.rx} ${cy}" fill="none" stroke="url(#ringGrad)" stroke-width="1" stroke-dasharray="2 7" opacity="${front ? 0.95 : 0.45}"/>`;
  const ringBack = rings.map((r) => arc(r, false)).join("\n");
  const ringFront = rings.map((r) => arc(r, true)).join("\n");
  // The motion starts at the right edge and runs clockwise: front at 1/4, back at 3/4.
  const nodeEls = rings.flatMap((r) => r.nodes.map(([label, color], k) => {
    const begin = `${f4(-(r.dur * k) / r.nodes.length - r.dur * 0.15)}s`;
    const timing = `dur="${r.dur}s" begin="${begin}" repeatCount="indefinite" keyTimes="0;.25;.5;.75;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1"`;
    return `<g>
  <g>
    <circle r="5" fill="${color}" filter="url(#glow)"/>
    <circle r="11" fill="none" stroke="${color}" stroke-opacity=".35"/>
    <text class="mono" x="15" y="4" font-size="11" fill="${C.ink}" stroke="${C.bg}" stroke-width="4" stroke-linejoin="round" paint-order="stroke">${label}</text>
    <animateTransform attributeName="transform" type="scale" values="1;1.18;1;.72;1" ${timing}/>
  </g>
  <animate attributeName="opacity" values=".85;1;.85;.38;.85" ${timing}/>
  <animateMotion dur="${r.dur}s" begin="${begin}" repeatCount="indefinite" path="${orbitPath(r.rx, r.ry)}"/>
</g>`;
  })).join("\n");

  const particles = Array.from({ length: 8 }, (_, i) => {
    const a = rand() * Math.PI * 2;
    const d = 60 + rand() * 80;
    const dx = f4(Math.cos(a) * d), dy = f4(Math.sin(a) * d * 0.45);
    return { el: `<circle cx="${cx}" cy="${cy}" r="${f4(0.8 + rand() * 1.4)}" fill="${[C.cyan, C.violet, "#ffffff"][i % 3]}" style="animation: p${i} ${f4(2.5 + rand() * 2.5)}s ease-out ${f4(-rand() * 4)}s infinite"/>`,
      kf: `@keyframes p${i} { 0% { transform: translate(0,0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translate(${dx}px, ${dy}px); opacity: 0; } }` };
  });

  const defs = `${edge(W, H, C.violet, C.cyan)}
  <radialGradient id="glowV"><stop offset="0" stop-color="#7c3aed" stop-opacity=".55"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowC"><stop offset="0" stop-color="#06b6d4" stop-opacity=".35"/><stop offset="1" stop-color="#06b6d4" stop-opacity="0"/></radialGradient>
  <radialGradient id="core" cx=".5" cy=".5" r=".5" fx=".34" fy=".3"><stop offset="0" stop-color="#fbf9ff"/><stop offset=".16" stop-color="#d9ceff"/><stop offset=".48" stop-color="#8b6cf0"/><stop offset=".82" stop-color="#4c1d95"/><stop offset="1" stop-color="#1c0a3d"/></radialGradient>
  <linearGradient id="night" x1=".2" y1=".15" x2=".85" y2=".95"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#05010f" stop-opacity=".6"/></linearGradient>
  <linearGradient id="rim" x1=".15" y1=".1" x2=".9" y2=".95"><stop offset=".55" stop-color="#67e8f9" stop-opacity="0"/><stop offset="1" stop-color="#67e8f9" stop-opacity=".9"/></linearGradient>
  <radialGradient id="atmo"><stop offset=".62" stop-color="#a78bfa" stop-opacity="0"/><stop offset=".7" stop-color="#a78bfa" stop-opacity=".45"/><stop offset=".82" stop-color="#22d3ee" stop-opacity=".12"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
  <filter id="spec" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <radialGradient id="aura"><stop offset="0" stop-color="#a78bfa" stop-opacity=".7"/><stop offset=".5" stop-color="#22d3ee" stop-opacity=".15"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
  <linearGradient id="ringGrad" x1="0" x2="1"><stop offset="0" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.cyan}"/></linearGradient>
  <linearGradient id="shine" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="460" y2="0" spreadMethod="repeat">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#c4b5fd"/><stop offset=".55" stop-color="#67e8f9"/><stop offset=".8" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff"/>
    <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="460 0" dur="7s" repeatCount="indefinite"/>
  </linearGradient>`;

  const style = `
  @keyframes tw { 0%, 100% { opacity: .15; } 50% { opacity: .9; } }
  .ring { animation: flow 24s linear infinite; }
  @keyframes flow { to { stroke-dashoffset: -180; } }
  .pulse { transform-box: fill-box; transform-origin: center; animation: pulse 3.2s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.18); opacity: 1; } }
  .dot { animation: dot 1.6s ease-in-out infinite; }
  @keyframes dot { 50% { opacity: .2; } }
  ${particles.map((p) => p.kf).join("\n  ")}`;

  const body = `<rect width="${W}" height="${H}" fill="${C.bg}"/>
<circle cx="120" cy="20" r="340" fill="url(#glowV)"/>
<circle cx="840" cy="400" r="340" fill="url(#glowC)"/>
${stars}
${ringBack}
<circle class="pulse" cx="${cx}" cy="${cy}" r="70" fill="url(#aura)"/>
${particles.map((p) => p.el).join("\n")}
<circle cx="${cx}" cy="${cy}" r="48" fill="url(#atmo)"/>
<circle cx="${cx}" cy="${cy}" r="30" fill="url(#core)"/>
<circle cx="${cx}" cy="${cy}" r="30" fill="url(#night)"/>
<circle cx="${cx}" cy="${cy}" r="29.4" fill="none" stroke="url(#rim)" stroke-width="1.4"/>
<ellipse cx="${cx - 10}" cy="${cy - 12}" rx="7" ry="4.2" fill="#ffffff" opacity=".55" filter="url(#spec)" transform="rotate(-28 ${cx - 10} ${cy - 12})"/>
<text class="mono" x="${cx}" y="${cy + 5}" font-size="13" font-weight="800" fill="#ffffff" fill-opacity=".92" text-anchor="middle" letter-spacing=".1em" stroke="#2e1065" stroke-opacity=".5" stroke-width="2" paint-order="stroke">AGI</text>
${ringFront}
${nodeEls}
<g class="rise">
  <rect x="40" y="38" width="226" height="26" rx="13" fill="#ffffff" fill-opacity=".04" stroke="${C.green}" stroke-opacity=".4"/>
  <circle class="dot" cx="56" cy="51" r="4" fill="${C.green}" filter="url(#glow)"/>
  <text class="mono" x="68" y="55" font-size="11" fill="${C.ink}" letter-spacing=".08em">ONLINE · BUILDING IN STEALTH</text>
</g>
<g class="rise" style="animation-delay:.2s">
  <text class="sans" x="40" y="152" font-size="72" font-weight="800" fill="${C.violet}" letter-spacing="-.035em" filter="url(#haze)" opacity=".35">Hoan Tran</text>
  <text class="sans" x="40" y="152" font-size="72" font-weight="800" fill="url(#shine)" letter-spacing="-.035em">Hoan Tran</text>
</g>
${typed("tl1", y1, t1, w1)}
${typed("tl2", y2, t2, w2)}
<rect class="blink" width="9" height="19" fill="${C.cyan}" x="${caretX.at(-1)}" y="${y2 - 15}">
  ${discrete("x", dur, caretTimes, caretX)}
  ${discrete("y", dur, caretTimes, caretY)}
</rect>
${chips}`;

  return svg(W, H, "Hoan Tran: I build AI agents that work for people, on the road to AGI that helps humanity.", { defs, style }, body);
}

function terminal() {
  const OW = 900, OH = 352, mx = 22, my = 10, W = OW - 2 * mx, H = 316, T = 16, cw = 8.4, x = 30, top = 80, lh = 27;
  const tool = (name, color, call, ms) => ({ parts: [["  ↳ ", C.dim], [name, color], [call, C.ink]], right: `✓ ${ms}` });
  const lines = [
    { parts: [["❯ ", C.green], ["agent run ", C.ink], ['"make life easier for 8 billion people"', C.amber]] },
    { parts: [["◆ ", C.violet], ["planning… ", C.ink], ["4 subtasks · 4 tools · 0 shortcuts", C.muted]], at: 3.0 },
    { ...tool("node-agent", C.blue, '.spawn({ tools: 12, memory: "long" })', "182ms"), at: 3.8 },
    { ...tool("wake", C.violet, '.trace("chatgpt → your-site.com")', "96ms"), at: 4.5 },
    { ...tool("agentdog", C.green, '.investigate("p99 spike in checkout")', "1.4s"), at: 5.2 },
    { ...tool("receiptly", C.pink, '.itemize("$62.02 at Publix")', "311ms"), at: 5.9 },
    { parts: [["✓ ", C.green], ["done ", C.ink], ["· 4/4 tasks · humans helped +1 · AGI eta: soon™", C.muted]], at: 7.0 },
    { parts: [["❯ ", C.green]], at: 7.6, caret: true },
  ];
  const pct = (t) => f4((t / T) * 100);
  const spans = (parts) => parts.map(([t, c]) => `<tspan fill="${c}">${esc(t)}</tspan>`).join("");

  // The first line is typed; the rest print in sequence. The whole run loops.
  const first = lines[0].parts.map(([t]) => t).join("");
  const step = 0.035, start = 0.6;
  const typedEnd = start + first.length * step;
  const w = steps(first.length, start, step, T, (i) => f4(i * cw));
  const clear = f4(0.97);
  const loopTimes = [...w.times, clear];
  const kfs = [];
  const els = lines.map((l, i) => {
    const y = top + i * lh;
    if (i === 0) {
      return `<clipPath id="type"><rect x="${x}" y="${y - 16}" height="24" width="${first.length * cw + 20}">${discrete("width", T, loopTimes, [...w.vals, 0], true)}</rect></clipPath>
<text class="mono" x="${x}" y="${y}" font-size="14" clip-path="url(#type)">${spans(l.parts)}</text>
<rect width="8" height="17" y="${y - 13}" fill="${C.cyan}" x="${x}">
  ${discrete("x", T, loopTimes, [...w.vals.map((v) => f4(x + v)), x], true)}
  ${discrete("opacity", T, [0, f4((typedEnd + 0.3) / T)], [1, 0], true)}
</rect>`;
    }
    kfs.push(`@keyframes l${i} { 0%, ${pct(l.at)}% { opacity: 0; transform: translateX(-8px); } ${pct(l.at + 0.25)}% { opacity: 1; transform: none; } 96% { opacity: 1; } 100% { opacity: 0; } }`);
    let el = `<g style="animation: l${i} ${T}s linear infinite"><text class="mono" x="${x}" y="${y}" font-size="14">${spans(l.parts)}</text>`;
    if (l.caret) el += `<rect class="blink" x="${x + 2 * cw}" y="${y - 13}" width="8" height="17" fill="${C.cyan}"/>`;
    el += "</g>";
    if (l.right) {
      kfs.push(`@keyframes r${i} { 0%, ${pct(l.at + 0.45)}% { opacity: 0; } ${pct(l.at + 0.6)}% { opacity: 1; } 96% { opacity: 1; } 100% { opacity: 0; } }`);
      el += `\n<text class="mono" x="${W - 32}" y="${y}" font-size="13" fill="${C.green}" text-anchor="end" style="animation: r${i} ${T}s linear infinite">${esc(l.right)}</text>`;
    }
    return el;
  }).join("\n");

  kfs.push(`@keyframes foot { 0%, ${pct(7.0)}% { opacity: 0; } ${pct(7.3)}% { opacity: 1; } 96% { opacity: 1; } 100% { opacity: 0; } }`);

  const defs = `
  <linearGradient id="bar" x1="0" x2="1"><stop offset="0" stop-color="${C.violet}" stop-opacity="0"/><stop offset=".5" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></linearGradient>
  <radialGradient id="tglow" cx="1" cy="0" r="1"><stop offset="0" stop-color="#7c3aed" stop-opacity=".16"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
  <linearGradient id="titlebar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2b3b"/><stop offset="1" stop-color="#1f1f2c"/></linearGradient>
  <linearGradient id="pane" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f0f19"/><stop offset="1" stop-color="#0a0a12"/></linearGradient>
  <filter id="drop" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#000" flood-opacity=".45"/><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity=".35"/></filter>
  <clipPath id="win"><rect width="${W}" height="${H}" rx="12"/></clipPath>
  ${[["red", "#ff7b73", "#e0443e"], ["yellow", "#ffd36b", "#dea123"], ["green", "#5fe07a", "#1aab29"]].map(([id, a, b]) => `<radialGradient id="${id}" cx=".5" cy=".3" r=".7"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`).join("\n  ")}`;

  const light = (cx, id, edge) => `<circle cx="${cx}" cy="19" r="6" fill="url(#${id})" stroke="${edge}" stroke-width=".6"/>`;
  const body = `<g transform="translate(${mx} ${my})">
<rect width="${W}" height="${H}" rx="12" fill="${C.panel}" filter="url(#drop)"/>
<g clip-path="url(#win)">
<rect width="${W}" height="${H}" fill="url(#pane)"/>
<rect width="${W}" height="${H}" fill="url(#tglow)"/>
<rect width="${W}" height="38" fill="url(#titlebar)"/>
<line x1="0" y1="38.5" x2="${W}" y2="38.5" stroke="#000" stroke-opacity=".55"/>
<rect y="38" width="${W}" height="1" fill="url(#bar)" opacity=".5"/>
<line x1="12" y1=".5" x2="${W - 12}" y2=".5" stroke="#fff" stroke-opacity=".14"/>
${light(22, "red", "#c13a33")}${light(42, "yellow", "#c08a1c")}${light(62, "green", "#169424")}
<text class="sans" x="${W / 2}" y="23" font-size="12.5" font-weight="600" fill="#b8b8cc" text-anchor="middle">agent@stealth — ~/humanity</text>
${els}
<text class="mono" x="${W - 32}" y="${H - 20}" font-size="11" fill="${C.dim}" text-anchor="end" style="animation: foot ${T}s linear infinite">tokens 12.4k · cost $0.03 · vibes ✓</text>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="11.5" fill="none" stroke="#fff" stroke-opacity=".09"/>
<rect x="-.5" y="-.5" width="${W + 1}" height="${H + 1}" rx="12.5" fill="none" stroke="#000" stroke-opacity=".5"/>
</g>`;

  return svg(OW, OH, "An agent run: the agent plans, calls node-agent, wake, agentdog and receiptly as tools, and finishes all four tasks.", { defs, style: kfs.join("\n  "), bare: true }, body);
}

function card(p, i) {
  const W = 440, H = 168;
  const lines = wrap(p.blurb, 54).slice(0, 3);
  const lang = p.primaryLanguage;

  const defs = `
  <radialGradient id="cglow"><stop offset="0" stop-color="${p.color}" stop-opacity=".22"/><stop offset="1" stop-color="${p.color}" stop-opacity="0"/></radialGradient>
  <linearGradient id="num" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.color}" stop-opacity=".3"/><stop offset="1" stop-color="${p.color}" stop-opacity="0"/></linearGradient>`;

  const body = `<rect width="${W}" height="${H}" fill="${C.panel}"/>
<circle cx="${W - 40}" cy="0" r="160" fill="url(#cglow)"/>
<text class="sans" x="${W - 24}" y="62" font-size="60" font-weight="800" fill="url(#num)" text-anchor="end" letter-spacing="-.04em">${String(i + 1).padStart(2, "0")}</text>
<rect x="24" y="30" width="4" height="22" rx="2" fill="${p.color}"/>
<text class="mono" x="38" y="48" font-size="20" font-weight="700" fill="${C.ink}">${esc(p.repo)}</text>
${lines.map((l, j) => `<text class="sans" x="24" y="${84 + j * 20}" font-size="13.5" fill="${C.muted}">${esc(l)}</text>`).join("\n")}
${lang ? `<circle cx="29" cy="${H - 26}" r="4.5" fill="${lang.color || C.muted}"/>
<text class="mono" x="40" y="${H - 22}" font-size="12" fill="${C.muted}">${esc(lang.name)}</text>` : ""}
${p.stargazerCount > 0 ? `<text class="mono" x="${W - 24}" y="${H - 22}" font-size="12" fill="${C.amber}" text-anchor="end">★ ${fmt(p.stargazerCount)}</text>` : ""}`;

  return svg(W, H, `${p.repo}: ${p.blurb}`, { defs }, body);
}

function skyline(s) {
  const W = 900, H = 540;
  const weeks = s.weeks;
  const counts = weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount));
  const max = Math.max(...counts, 1);
  const Wv = [12.4, 3.6], Dv = [-7.6, 7.6], fill = 0.78, maxH = 175;
  const ox = (W - (weeks.length * Wv[0] - 7 * Dv[0])) / 2 - 7 * Dv[0] + 10, oy = 228;
  const P = (w, d, h = 0) => [ox + w * Wv[0] + d * Dv[0], oy + w * Wv[1] + d * Dv[1] - h];
  const pts = (arr) => arr.map(([a, b]) => `${f4(a)},${f4(b)}`).join(" ");

  // Four lit levels split at the quartiles of active days, like GitHub's own graph.
  const active = counts.filter((c) => c > 0).sort((a, b) => a - b);
  const q = (p) => active[Math.floor(p * (active.length - 1))] ?? 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (c) => (c === 0 ? 0 : 1 + cuts.filter((t) => c > t).length);
  // Per level: roof, lit side (top -> base), shaded side (top -> base).
  const PAL = [
    ["#161827", "#11131f", "#0b0c15", "#0d0e18", "#08090f"],
    ["#4a3f8c", "#362d6b", "#15122c", "#272052", "#0e0b1f"],
    ["#6b5fd6", "#4f45a8", "#1c1842", "#3a327f", "#120f2c"],
    ["#3fb0d8", "#27809f", "#0c2c3c", "#1b5f7c", "#081d29"],
    ["#b9eef8", "#6cc4dc", "#16485a", "#3f8fa7", "#0e2f3b"],
  ];
  const sideGrad = PAL.flatMap(([, lt, lb, st, sb], i) => [
    `<linearGradient id="lit${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lt}"/><stop offset="1" stop-color="${lb}"/></linearGradient>`,
    `<linearGradient id="shd${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${st}"/><stop offset="1" stop-color="${sb}"/></linearGradient>`,
  ]).join("\n  ");

  // Window grids, skewed to lie flat on each face direction.
  const rand = rng(31);
  const winTile = (id, skew) => {
    const lights = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const on = rand();
      if (on < 0.55) lights.push(`<rect x="${c * 4 + 1}" y="${r * 6 + 1.5}" width="1.8" height="2.6" fill="${on < 0.12 ? "#ffd58a" : "#cfe9ff"}" opacity="${f4(on < 0.12 ? 0.95 : 0.25 + rand() * 0.45)}"/>`);
    }
    return `<pattern id="${id}" width="12" height="24" patternUnits="userSpaceOnUse" patternTransform="skewY(${skew})">${lights.join("")}</pattern>`;
  };

  const cells = [];
  weeks.forEach((wk, w) => wk.contributionDays.forEach((day) => cells.push({ w, d: new Date(day.date + "T00:00:00Z").getUTCDay(), day })));
  cells.sort((a, b) => a.w + a.d - (b.w + b.d) || a.w - b.w);

  // Light comes from the back-left, so shadows fall forward-right across the ground.
  const shadowDir = [0.55, 0.16];
  const shadows = [];
  let beacon = "";
  const blocks = cells.map(({ w, d, day }) => {
    const c = day.contributionCount;
    const L = level(c);
    const h = c === 0 ? 1 : 4 + Math.sqrt(c / max) * maxH;
    const a = P(w, d), b = P(w + fill, d), cc = P(w + fill, d + fill), e = P(w, d + fill);
    const up = (p) => [p[0], p[1] - h];
    if (c > 0) {
      const v = (p) => [p[0] + h * shadowDir[0], p[1] + h * shadowDir[1]];
      shadows.push(`<polygon points="${pts([a, b, v(b), v(cc), v(e), e])}"/>`);
    }
    const front = [e, cc, up(cc), up(e)], side = [b, cc, up(cc), up(b)];
    let faces = `<polygon points="${pts(front)}" fill="url(#lit${L})"/>
<polygon points="${pts(side)}" fill="url(#shd${L})"/>`;
    if (h > 16) faces += `\n<polygon points="${pts(front)}" fill="url(#winF)" opacity="${L >= 3 ? 0.9 : 0.55}"/><polygon points="${pts(side)}" fill="url(#winS)" opacity="${L >= 3 ? 0.7 : 0.4}"/>`;
    faces += `\n<polygon points="${pts([up(a), up(b), up(cc), up(e)])}" fill="${PAL[L][0]}"/>`;
    if (L === 4) faces += `<polyline points="${pts([up(e), up(a), up(b)])}" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width=".6"/>`;
    if (day.date === s.busiest.date) {
      const [bx, by] = up(P(w + fill / 2, d + fill / 2));
      beacon = `<g class="beacon"><line x1="${f4(bx)}" y1="${f4(by)}" x2="${f4(bx)}" y2="${f4(by - 40)}" stroke="#ffffff" stroke-width="1" stroke-opacity=".7"/>
<circle class="blinker" cx="${f4(bx)}" cy="${f4(by - 40)}" r="2.2" fill="#ff5d5d" filter="url(#glow)"/>
<text class="mono" x="${f4(bx)}" y="${f4(by - 50)}" font-size="11" fill="${C.ink}" text-anchor="middle">${fmt(c)} on ${shortDate(day.date)}</text></g>`;
    }
    return `<g class="b" style="animation-delay:${f4(0.3 + w * 0.026 + d * 0.012)}s">${faces}</g>`;
  }).join("\n");

  // Ground plane with a faint street grid, one line per week and per weekday.
  const n = weeks.length;
  const ground = pts([P(-3, -2), P(n + 3, -2), P(n + 3, 10), P(-3, 10)]);
  const grid = [
    ...Array.from({ length: n + 1 }, (_, w) => `<line x1="${f4(P(w - 0.11, -0.5)[0])}" y1="${f4(P(w - 0.11, -0.5)[1])}" x2="${f4(P(w - 0.11, 7.5)[0])}" y2="${f4(P(w - 0.11, 7.5)[1])}"/>`),
    ...Array.from({ length: 8 }, (_, d) => `<line x1="${f4(P(-0.5, d - 0.11)[0])}" y1="${f4(P(-0.5, d - 0.11)[1])}" x2="${f4(P(n + 0.5, d - 0.11)[0])}" y2="${f4(P(n + 0.5, d - 0.11)[1])}"/>`),
  ].join("");

  let prev = null;
  const months = weeks.map((wk, w) => {
    const m = new Date(wk.contributionDays[0].date + "T00:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    if (m === prev) return "";
    const show = prev !== null && w < weeks.length - 2;
    prev = m;
    const [mx, my] = P(w, 9.6);
    return show ? `<text class="mono" x="${f4(mx)}" y="${f4(my + 10)}" font-size="10" fill="${C.dim}">${m}</text>` : "";
  }).join("");

  const defs = `
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04050b"/><stop offset=".55" stop-color="#080b1a"/><stop offset="1" stop-color="#0d1226"/></linearGradient>
  <radialGradient id="horizon" cx=".55" cy=".62" r=".6"><stop offset="0" stop-color="#3b2a8a" stop-opacity=".45"/><stop offset=".5" stop-color="#0e4a66" stop-opacity=".18"/><stop offset="1" stop-color="#0e4a66" stop-opacity="0"/></radialGradient>
  <linearGradient id="groundG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b0d1a"/><stop offset="1" stop-color="#121633"/></linearGradient>
  <linearGradient id="fog" x1="0" y1="0" x2="1" y2=".6"><stop offset="0" stop-color="#05060d" stop-opacity=".55"/><stop offset=".45" stop-color="#05060d" stop-opacity="0"/></linearGradient>
  <linearGradient id="big" x1="0" x2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c4b5fd"/><stop offset="1" stop-color="#67e8f9"/></linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
  ${sideGrad}
  ${winTile("winF", f4((Math.atan2(Wv[1], Wv[0]) * 180) / Math.PI))}
  ${winTile("winS", -45)}`;

  const style = `.b { transform-box: fill-box; transform-origin: 50% 100%; animation: grow .9s cubic-bezier(.2,.9,.25,1.08) both; }
  @keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  .shadows { animation: fadein 1.2s ease-out 1.8s both; }
  .beacon { animation: fadein .6s ease-out 2.6s both; }
  .blinker { animation: blinker 1.6s steps(1) infinite; }
  @keyframes fadein { from { opacity: 0; } }
  @keyframes blinker { 50% { opacity: .15; } }`;

  const kv = [
    ["longest streak", `${s.longest} days`],
    ["current streak", `${s.current} days`],
    ["busiest day", `${fmt(s.busiest.contributionCount)} · ${shortDate(s.busiest.date)}`],
  ].map(([k, v], i) => `<text class="mono" x="${W - 36}" y="${66 + i * 22}" font-size="11" fill="${C.muted}" text-anchor="end">${k}  <tspan fill="${C.ink}">${esc(v)}</tspan></text>`).join("\n");

  const body = `<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#horizon)"/>
<polygon points="${ground}" fill="url(#groundG)"/>
<g stroke="#8b9cff" stroke-opacity=".07" stroke-width=".6">${grid}</g>
<g class="shadows" fill="#000" fill-opacity=".55" filter="url(#soft)">${shadows.join("")}</g>
${blocks}
<rect width="${W}" height="${H}" fill="url(#fog)" pointer-events="none"/>
${beacon}
${months}
<text class="mono" x="36" y="44" font-size="11" fill="${C.muted}" letter-spacing=".12em">CONTRIBUTION SKYLINE · LAST 365 DAYS</text>
<text class="sans" x="34" y="100" font-size="52" font-weight="800" fill="url(#big)" letter-spacing="-.03em">${fmt(s.total)}</text>
<text class="sans" x="36" y="124" font-size="14" fill="${C.muted}">contributions in the last year</text>
${kv}
<text class="mono" x="${W - 36}" y="${H - 22}" font-size="10" fill="${C.dim}" text-anchor="end">updated ${s.today}</text>`;

  return svg(W, H, `Contribution skyline: ${fmt(s.total)} contributions in the last year`, { defs, style }, body);
}


const { user, repos } = await fetchData();
const cal = user.contributionsCollection.contributionCalendar;
const days = cal.weeks.flatMap((w) => w.contributionDays);
// A streak that starts at the edge of the calendar keeps going into earlier years.
let history = days;
for (let y = 0; y < 10 && history[0].contributionCount > 0; y++) {
  const earlier = await fetchYearBefore(history[0].date);
  if (!earlier.length) break;
  history = [...earlier, ...history];
}
const stats = {
  total: cal.totalContributions,
  weeks: cal.weeks,
  stars: user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0),
  today: new Date().toISOString().slice(0, 10),
  busiest: days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a)),
  ...streaks(history),
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const write = (name, content) => writeFileSync(new URL(name, OUT), content);
write("hero.svg", hero(stats));
write("terminal.svg", terminal());
write("skyline.svg", skyline(stats));
repos.forEach((p, i) => write(`card-${p.repo}.svg`, card(p, i)));
console.log(`Wrote assets for ${fmt(stats.total)} contributions, ${stats.stars} stars, ${repos.length} project cards.`);
