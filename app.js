const STORAGE_KEY = "futsal-2026-state";
const SYNC_KEY = "futsal-2026-sync";
const SYNC_POLL_MS = 5000;

const groups = {
  A: ["Aztecas FC", "Gentry Uncs", "Glacier FC"],
  B: ["Rayo FC", "Los Tigrillos de Zaragoza", "SSBC"],
  C: ["El Club", "Tekks", "Botafogo FC"],
  D: ["La Mezcla Perfecta", "Dragon Ball A", "3 Puntos Fáciles"],
};

const groupMatches = [
  { id: "G1",  time: "9:30 AM",  court: "Court 1", teamA: "Aztecas FC",             teamB: "Gentry Uncs",                group: "A" },
  { id: "G2",  time: "9:30 AM",  court: "Court 2", teamA: "El Club",                teamB: "Tekks",                      group: "C" },
  { id: "G3",  time: "10:00 AM", court: "Court 1", teamA: "Rayo FC",                teamB: "Los Tigrillos de Zaragoza",   group: "B" },
  { id: "G4",  time: "10:00 AM", court: "Court 2", teamA: "La Mezcla Perfecta",     teamB: "Dragon Ball A",              group: "D" },
  { id: "G5",  time: "10:30 AM", court: "Court 1", teamA: "Gentry Uncs",            teamB: "Glacier FC",                 group: "A" },
  { id: "G6",  time: "10:30 AM", court: "Court 2", teamA: "Tekks",                  teamB: "Botafogo FC",                group: "C" },
  { id: "G7",  time: "11:00 AM", court: "Court 1", teamA: "Los Tigrillos de Zaragoza", teamB: "SSBC",                   group: "B" },
  { id: "G8",  time: "11:00 AM", court: "Court 2", teamA: "Dragon Ball A",          teamB: "3 Puntos Fáciles",           group: "D" },
  { id: "G9",  time: "11:30 AM", court: "Court 1", teamA: "Aztecas FC",             teamB: "Glacier FC",                 group: "A" },
  { id: "G10", time: "11:30 AM", court: "Court 2", teamA: "El Club",                teamB: "Botafogo FC",                group: "C" },
  { id: "G11", time: "12:00 PM", court: "Court 1", teamA: "Rayo FC",                teamB: "SSBC",                       group: "B" },
  { id: "G12", time: "12:00 PM", court: "Court 2", teamA: "La Mezcla Perfecta",     teamB: "3 Puntos Fáciles",           group: "D" },
];

const knockoutTemplate = [
  { id: "QF1",   round: "Quarterfinal", time: "1:00 PM", court: "Court 1", slotA: "1st Group A", slotB: "2nd Group B" },
  { id: "QF2",   round: "Quarterfinal", time: "1:00 PM", court: "Court 2", slotA: "1st Group B", slotB: "2nd Group A" },
  { id: "QF3",   round: "Quarterfinal", time: "1:30 PM", court: "Court 1", slotA: "1st Group C", slotB: "2nd Group D" },
  { id: "QF4",   round: "Quarterfinal", time: "1:30 PM", court: "Court 2", slotA: "1st Group D", slotB: "2nd Group C" },
  { id: "SF1",   round: "Semifinal",    time: "2:00 PM", court: "Court 1", slotA: "Winner QF1",  slotB: "Winner QF3" },
  { id: "SF2",   round: "Semifinal",    time: "2:00 PM", court: "Court 2", slotA: "Winner QF2",  slotB: "Winner QF4" },
  { id: "THIRD", round: "3rd Place",    time: "2:30 PM", court: "Court 1", slotA: "Loser SF1",   slotB: "Loser SF2" },
  { id: "FINAL", round: "Final",        time: "2:30 PM", court: "Court 2", slotA: "Winner SF1",  slotB: "Winner SF2" },
];

const defaultState = {
  group: Object.fromEntries(groupMatches.map((m) => [m.id, { scoreA: "", scoreB: "", scorersA: "", scorersB: "" }])),
  knockout: Object.fromEntries(knockoutTemplate.map((m) => [m.id, { scoreA: "", scoreB: "", tiebreakWinner: "" }])),
  meta: { updatedAt: 0 },
};

const defaultSyncConfig = { url: "", key: "", room: "", connected: false };
const state = loadState();
const syncConfig = loadSyncConfig();

let syncPollTimer = null;
let syncDebounceTimer = null;
let syncInFlight = false;

// ─── STATE ────────────────────────────────────────────────────────────────────

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    return mergeStateDefaults(JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}

function loadSyncConfig() {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return structuredClone(defaultSyncConfig);
    return { ...structuredClone(defaultSyncConfig), ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaultSyncConfig);
  }
}

function mergeStateDefaults(input) {
  return {
    group: { ...structuredClone(defaultState.group), ...(input?.group || {}) },
    knockout: { ...structuredClone(defaultState.knockout), ...(input?.knockout || {}) },
    meta: { ...structuredClone(defaultState.meta), ...(input?.meta || {}) },
  };
}

function touchUpdateTime() { state.meta.updatedAt = Date.now(); }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function saveSyncConfig() { localStorage.setItem(SYNC_KEY, JSON.stringify(syncConfig)); }
function setSyncStatus(msg) {
  const el = document.getElementById("syncStatus");
  if (el) el.textContent = msg;
}

// ─── CALCULATIONS ─────────────────────────────────────────────────────────────

function getStandings() {
  const standings = {};
  for (const [g, teams] of Object.entries(groups)) {
    standings[g] = teams.map((team) => ({ team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }));
  }
  for (const match of groupMatches) {
    const res = state.group[match.id];
    const a = Number.parseInt(res.scoreA, 10);
    const b = Number.parseInt(res.scoreB, 10);
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    const table = standings[match.group];
    const rowA = table.find((r) => r.team === match.teamA);
    const rowB = table.find((r) => r.team === match.teamB);
    rowA.mp++; rowB.mp++;
    rowA.gf += a; rowA.ga += b;
    rowB.gf += b; rowB.ga += a;
    if (a > b)      { rowA.w++; rowA.pts += 3; rowB.l++; }
    else if (b > a) { rowB.w++; rowB.pts += 3; rowA.l++; }
    else            { rowA.d++; rowB.d++; rowA.pts++; rowB.pts++; }
  }
  for (const group of Object.values(standings)) {
    for (const row of group) row.gd = row.gf - row.ga;
    group.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team));
  }
  return standings;
}

function getSlotTeam(slot, standings, winners, losers) {
  if (slot.startsWith("1st Group")) return standings[slot.slice(-1)]?.[0]?.team ?? slot;
  if (slot.startsWith("2nd Group")) return standings[slot.slice(-1)]?.[1]?.team ?? slot;
  if (slot.startsWith("Winner "))   return winners[slot.replace("Winner ", "")] ?? slot;
  if (slot.startsWith("Loser "))    return losers[slot.replace("Loser ", "")] ?? slot;
  return slot;
}

function knockoutResult(matchId, teamA, teamB) {
  const match = state.knockout[matchId];
  const a = Number.parseInt(match.scoreA, 10);
  const b = Number.parseInt(match.scoreB, 10);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return { winner: null, loser: null, score: null };
  if (a > b) return { winner: teamA, loser: teamB, score: `${a}–${b}` };
  if (b > a) return { winner: teamB, loser: teamA, score: `${a}–${b}` };
  if (match.tiebreakWinner === "A") return { winner: teamA, loser: teamB, score: `${a}–${b} (pens)` };
  if (match.tiebreakWinner === "B") return { winner: teamB, loser: teamA, score: `${a}–${b} (pens)` };
  return { winner: null, loser: null, score: `${a}–${b}` };
}

// ─── TIME HELPERS ─────────────────────────────────────────────────────────────

function timeToMinutes(str) {
  const [time, period] = str.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// ─── RENDER: SCHEDULE ─────────────────────────────────────────────────────────

function renderSchedule() {
  const container = document.getElementById("scheduleView");
  container.innerHTML = "";

  const standings = getStandings();
  const winners = {};
  const losers = {};
  for (const g of knockoutTemplate) {
    const tA = getSlotTeam(g.slotA, standings, winners, losers);
    const tB = getSlotTeam(g.slotB, standings, winners, losers);
    const r = knockoutResult(g.id, tA, tB);
    winners[g.id] = r.winner;
    losers[g.id] = r.loser;
  }

  // Build flat list of all matches with metadata
  const allMatches = [
    ...groupMatches.map((m) => {
      const s = state.group[m.id];
      const hasScore = s.scoreA !== "" && s.scoreB !== "";
      return {
        time: m.time, court: m.court, label: `Group ${m.group}`,
        teams: `${m.teamA} vs ${m.teamB}`,
        score: hasScore ? `${s.scoreA}–${s.scoreB}` : null,
      };
    }),
    ...knockoutTemplate.map((g) => {
      const tA = getSlotTeam(g.slotA, standings, winners, losers);
      const tB = getSlotTeam(g.slotB, standings, winners, losers);
      const s = state.knockout[g.id];
      const hasScore = s.scoreA !== "" && s.scoreB !== "";
      return {
        time: g.time, court: g.court, label: g.round,
        teams: `${tA} vs ${tB}`,
        score: hasScore ? `${s.scoreA}–${s.scoreB}` : null,
      };
    }),
  ];

  // Group by time slot
  const slotMap = new Map();
  for (const m of allMatches) {
    if (!slotMap.has(m.time)) slotMap.set(m.time, []);
    slotMap.get(m.time).push(m);
  }

  const sortedTimes = [...slotMap.keys()].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  const now = nowMinutes();

  // Determine current slot index
  let nowSlotIdx = -1;
  for (let i = 0; i < sortedTimes.length; i++) {
    const slotMin = timeToMinutes(sortedTimes[i]);
    const nextMin = i + 1 < sortedTimes.length ? timeToMinutes(sortedTimes[i + 1]) : slotMin + 45;
    if (now >= slotMin && now < nextMin) { nowSlotIdx = i; break; }
  }

  for (let i = 0; i < sortedTimes.length; i++) {
    const time = sortedTimes[i];
    const matches = slotMap.get(time);
    const isNow = i === nowSlotIdx;
    const isPast = nowSlotIdx !== -1 ? i < nowSlotIdx : matches.every((m) => m.score !== null);

    const slotEl = document.createElement("div");
    slotEl.className = "time-slot";

    const labelEl = document.createElement("div");
    labelEl.className = `time-label${isNow ? " is-now" : ""}`;
    labelEl.textContent = time;
    if (isNow) {
      const badge = document.createElement("span");
      badge.className = "now-badge";
      badge.textContent = "NOW";
      labelEl.appendChild(badge);
    }
    slotEl.appendChild(labelEl);

    for (const m of matches) {
      const row = document.createElement("div");
      row.className = ["match-row", isPast && !isNow ? "played" : "", isNow ? "is-now" : ""].filter(Boolean).join(" ");

      const chip = document.createElement("span");
      chip.className = "match-chip";
      chip.textContent = m.label;

      const teams = document.createElement("div");
      teams.className = "match-teams";
      teams.textContent = m.teams;

      const score = document.createElement("div");
      score.className = "match-score";
      score.textContent = m.score ?? "–";

      const court = document.createElement("div");
      court.className = "match-court";
      court.textContent = m.court;

      row.append(chip, teams, score, court);
      slotEl.appendChild(row);
    }

    container.appendChild(slotEl);
  }
}

// ─── RENDER: STANDINGS ────────────────────────────────────────────────────────

function renderStandings() {
  const standings = getStandings();
  const container = document.getElementById("standingsContainer");
  container.innerHTML = "";

  for (const [groupName, table] of Object.entries(standings)) {
    const block = document.createElement("div");
    block.className = "group-block";

    const title = document.createElement("div");
    title.className = "group-name";
    title.textContent = `Group ${groupName}`;
    block.appendChild(title);

    const tbl = document.createElement("table");
    tbl.className = "s-table";
    tbl.innerHTML = `
      <thead>
        <tr>
          <th class="t-col">Team</th>
          <th>W</th><th>D</th><th>L</th>
          <th>GD</th><th>Pts</th>
        </tr>
      </thead>`;

    const tbody = document.createElement("tbody");
    table.forEach((row, i) => {
      const tr = document.createElement("tr");
      if (i < 2) tr.className = "advances";
      tr.innerHTML = `
        <td class="t-col">${row.team}</td>
        <td>${row.w}</td>
        <td>${row.d}</td>
        <td>${row.l}</td>
        <td>${row.gd > 0 ? "+" : ""}${row.gd}</td>
        <td class="p-col">${row.pts}</td>`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    block.appendChild(tbl);

    const note = document.createElement("div");
    note.className = "advances-note";
    note.textContent = "Top 2 advance";
    block.appendChild(note);

    container.appendChild(block);
  }
}

// ─── RENDER: BRACKET ──────────────────────────────────────────────────────────

function renderBracketSnapshot() {
  const view = document.getElementById("bracketView");
  view.innerHTML = "";

  const anyGroupScored = groupMatches.some((m) => state.group[m.id].scoreA !== "");

  if (!anyGroupScored) {
    const empty = document.createElement("p");
    empty.className = "bracket-empty";
    empty.textContent = "Bracket fills in as group stage scores are entered.";
    view.appendChild(empty);
    return;
  }

  const standings = getStandings();
  const winners = {};
  const losers = {};

  const rounds = [
    { label: "Quarterfinals", ids: ["QF1", "QF2", "QF3", "QF4"] },
    { label: "Semifinals",    ids: ["SF1", "SF2"] },
    { label: "Finals",        ids: ["THIRD", "FINAL"] },
  ];

  for (const round of rounds) {
    const roundEl = document.createElement("div");
    roundEl.className = "b-round";

    const labelEl = document.createElement("div");
    labelEl.className = "b-round-label";
    labelEl.textContent = round.label;
    roundEl.appendChild(labelEl);

    for (const id of round.ids) {
      const game = knockoutTemplate.find((g) => g.id === id);
      const tA = getSlotTeam(game.slotA, standings, winners, losers);
      const tB = getSlotTeam(game.slotB, standings, winners, losers);
      const result = knockoutResult(id, tA, tB);

      // update winners/losers map for next round
      winners[id] = result.winner;
      losers[id] = result.loser;

      const s = state.knockout[id];
      const hasScore = s.scoreA !== "" && s.scoreB !== "";

      const isTbdA = tA.startsWith("1st") || tA.startsWith("2nd") || tA.startsWith("Winner") || tA.startsWith("Loser");
      const isTbdB = tB.startsWith("1st") || tB.startsWith("2nd") || tB.startsWith("Winner") || tB.startsWith("Loser");

      const matchEl = document.createElement("div");
      matchEl.className = "b-match";

      const makeTeamRow = (name, score, isTbd, isWinner) => {
        const row = document.createElement("div");
        row.className = ["b-team", isWinner ? "winner" : "", isTbd ? "is-tbd" : ""].filter(Boolean).join(" ");
        const nameEl = document.createElement("span");
        nameEl.textContent = name;
        const scoreEl = document.createElement("span");
        scoreEl.className = "b-score";
        scoreEl.textContent = hasScore ? score : "";
        row.append(nameEl, scoreEl);
        return row;
      };

      matchEl.appendChild(makeTeamRow(tA, s.scoreA, isTbdA, result.winner === tA));
      matchEl.appendChild(makeTeamRow(tB, s.scoreB, isTbdB, result.winner === tB));
      roundEl.appendChild(matchEl);
    }

    view.appendChild(roundEl);
  }
}

// ─── RENDER: LEADERS ──────────────────────────────────────────────────────────

function renderLeaders() {
  const topScorersEl = document.getElementById("topScorers");
  const topWinsEl = document.getElementById("topWins");
  topScorersEl.innerHTML = "";
  topWinsEl.innerHTML = "";

  const scorerMap = new Map();
  for (const game of groupMatches) {
    const s = state.group[game.id];
    for (const bundle of [s.scorersA, s.scorersB]) {
      bundle.split(",").map((p) => p.trim()).filter(Boolean)
        .forEach((p) => scorerMap.set(p, (scorerMap.get(p) || 0) + 1));
    }
  }

  const sorted = [...scorerMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  if (!sorted.length) {
    topScorersEl.innerHTML = "<li>No goals logged yet.</li>";
  } else {
    for (const [name, goals] of sorted) {
      const li = document.createElement("li");
      li.textContent = `${name} (${goals})`;
      topScorersEl.appendChild(li);
    }
  }

  const standings = getStandings();
  const winRows = Object.values(standings).flat()
    .sort((a, b) => b.w - a.w || b.pts - a.pts || a.team.localeCompare(b.team))
    .slice(0, 10);
  for (const team of winRows) {
    const li = document.createElement("li");
    li.textContent = `${team.team} (${team.w}W)`;
    topWinsEl.appendChild(li);
  }
}

// ─── RENDER: ADMIN MATCHES ────────────────────────────────────────────────────

function renderAdminMatches() {
  const container = document.getElementById("groupMatchesAdmin");
  container.innerHTML = "";

  for (const match of groupMatches) {
    const s = state.group[match.id];
    const hasScore = s.scoreA !== "" && s.scoreB !== "";

    const card = document.createElement("div");
    card.className = `admin-card${hasScore ? " is-scored" : ""}`;

    const header = document.createElement("div");
    header.className = "admin-card-header";
    header.innerHTML = `
      <span class="admin-chip">Group ${match.group}</span>
      <span class="admin-card-title">${match.teamA} vs ${match.teamB}</span>
      <span class="admin-card-meta">${match.time} · ${match.court}</span>`;
    card.appendChild(header);

    card.appendChild(makeScoreRow(match.id, "A", match.teamA, "group"));
    card.appendChild(makeScoreRow(match.id, "B", match.teamB, "group"));

    const hint = document.createElement("p");
    hint.className = "scorers-hint";
    hint.textContent = "Scorers (comma separated)";
    card.appendChild(hint);

    for (const [side, team] of [["A", match.teamA], ["B", match.teamB]]) {
      const ta = document.createElement("textarea");
      ta.placeholder = `${team} scorers`;
      ta.value = s[`scorers${side}`];
      ta.addEventListener("change", (e) => updateGroup(match.id, `scorers${side}`, e.target.value));
      card.appendChild(ta);
    }

    container.appendChild(card);
  }
}

function renderKnockoutAdmin() {
  const container = document.getElementById("knockoutAdmin");
  container.innerHTML = "";
  const standings = getStandings();
  const winners = {};
  const losers = {};

  for (const game of knockoutTemplate) {
    const tA = getSlotTeam(game.slotA, standings, winners, losers);
    const tB = getSlotTeam(game.slotB, standings, winners, losers);
    const s = state.knockout[game.id];
    const hasScore = s.scoreA !== "" && s.scoreB !== "";

    const card = document.createElement("div");
    card.className = `admin-card${hasScore ? " is-scored" : ""}`;

    const header = document.createElement("div");
    header.className = "admin-card-header";
    header.innerHTML = `
      <span class="admin-chip">${game.round}</span>
      <span class="admin-card-title">${tA} vs ${tB}</span>
      <span class="admin-card-meta">${game.time} · ${game.court}</span>`;
    card.appendChild(header);

    card.appendChild(makeScoreRow(game.id, "A", tA, "knockout"));
    card.appendChild(makeScoreRow(game.id, "B", tB, "knockout"));

    const select = document.createElement("select");
    select.innerHTML = `<option value="">If tied — pick penalty winner</option>
      <option value="A">${tA}</option>
      <option value="B">${tB}</option>`;
    select.value = s.tiebreakWinner || "";
    select.addEventListener("change", (e) => updateKnockout(game.id, "tiebreakWinner", e.target.value));
    card.appendChild(select);

    container.appendChild(card);

    const result = knockoutResult(game.id, tA, tB);
    winners[game.id] = result.winner;
    losers[game.id] = result.loser;
  }
}

function makeScoreRow(matchId, side, teamName, type) {
  const row = document.createElement("div");
  row.className = "score-row";
  const label = document.createElement("label");
  label.textContent = teamName;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "99";
  input.value = type === "group" ? state.group[matchId][`score${side}`] : state.knockout[matchId][`score${side}`];
  input.addEventListener("change", (e) => {
    if (type === "group") updateGroup(matchId, `score${side}`, e.target.value);
    else updateKnockout(matchId, `score${side}`, e.target.value);
  });
  row.append(label, input);
  return row;
}

// ─── UPDATE HANDLERS ──────────────────────────────────────────────────────────

function updateGroup(matchId, field, value) {
  state.group[matchId][field] = value;
  touchUpdateTime();
  saveState();
  renderAllLive();
  scheduleSyncPush();
}

function updateKnockout(matchId, field, value) {
  state.knockout[matchId][field] = value;
  touchUpdateTime();
  saveState();
  renderAllLive();
  renderKnockoutAdmin();
  scheduleSyncPush();
}

function renderAllLive() {
  renderSchedule();
  renderStandings();
  renderBracketSnapshot();
  renderLeaders();
}

// ─── TABS ─────────────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

// ─── RESET ────────────────────────────────────────────────────────────────────

function initReset() {
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!window.confirm("Reset all scores and stats? This cannot be undone.")) return;
    Object.assign(state, structuredClone(defaultState));
    touchUpdateTime();
    saveState();
    renderAdminMatches();
    renderKnockoutAdmin();
    renderAllLive();
    scheduleSyncPush();
  });
}

// ─── SYNC ─────────────────────────────────────────────────────────────────────

function escapeRoom(room) { return encodeURIComponent(room.trim()); }

function getSyncHeaders() {
  return {
    apikey: syncConfig.key,
    Authorization: `Bearer ${syncConfig.key}`,
    "Content-Type": "application/json",
  };
}

async function fetchRemoteState() {
  const endpoint = `${syncConfig.url}/rest/v1/tournament_state?room_id=eq.${escapeRoom(syncConfig.room)}&select=payload,updated_at&limit=1`;
  const res = await fetch(endpoint, { headers: getSyncHeaders() });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const data = await res.json();
  return data[0] || null;
}

async function pushRemoteState() {
  if (!syncConfig.connected || syncInFlight) return;
  syncInFlight = true;
  try {
    const res = await fetch(`${syncConfig.url}/rest/v1/tournament_state`, {
      method: "POST",
      headers: { ...getSyncHeaders(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ room_id: syncConfig.room.trim(), payload: state }]),
    });
    if (!res.ok) throw new Error(`Push failed (${res.status})`);
    setSyncStatus(`Synced · ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    setSyncStatus(`Sync error: ${err.message}`);
  } finally {
    syncInFlight = false;
  }
}

async function pullRemoteState() {
  if (!syncConfig.connected || syncInFlight) return;
  syncInFlight = true;
  try {
    const remote = await fetchRemoteState();
    if (!remote?.payload) { setSyncStatus("Connected · no remote data yet"); return; }
    const localTs = Number(state?.meta?.updatedAt || 0);
    const remoteTs = Number(remote.payload?.meta?.updatedAt || 0);
    if (remoteTs > localTs) {
      Object.assign(state, mergeStateDefaults(remote.payload));
      saveState();
      renderAdminMatches();
      renderKnockoutAdmin();
      renderAllLive();
      setSyncStatus(`Pulled · ${new Date().toLocaleTimeString()}`);
    } else {
      setSyncStatus(`Up to date · ${new Date().toLocaleTimeString()}`);
    }
  } catch (err) {
    setSyncStatus(`Sync error: ${err.message}`);
  } finally {
    syncInFlight = false;
  }
}

function scheduleSyncPush() {
  if (!syncConfig.connected) return;
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(pushRemoteState, 500);
}

function startPolling() {
  stopPolling();
  syncPollTimer = setInterval(pullRemoteState, SYNC_POLL_MS);
}

function stopPolling() {
  if (!syncPollTimer) return;
  clearInterval(syncPollTimer);
  syncPollTimer = null;
}

function readSyncForm() {
  syncConfig.url  = document.getElementById("sbUrl").value.trim().replace(/\/$/, "");
  syncConfig.key  = document.getElementById("sbKey").value.trim();
  syncConfig.room = document.getElementById("sbRoom").value.trim();
}

function hydrateSyncForm() {
  document.getElementById("sbUrl").value  = syncConfig.url  || "";
  document.getElementById("sbKey").value  = syncConfig.key  || "";
  document.getElementById("sbRoom").value = syncConfig.room || "";
}

async function connectSync() {
  readSyncForm();
  if (!syncConfig.url || !syncConfig.key || !syncConfig.room) {
    setSyncStatus("Enter URL, anon key, and room ID first.");
    return;
  }
  syncConfig.connected = true;
  saveSyncConfig();
  try {
    const remote = await fetchRemoteState();
    if (!remote) { touchUpdateTime(); await pushRemoteState(); setSyncStatus("Connected · initialized room"); }
    else { await pullRemoteState(); }
    startPolling();
  } catch (err) {
    syncConfig.connected = false;
    saveSyncConfig();
    setSyncStatus(`Connection failed: ${err.message}`);
  }
}

function disconnectSync() {
  syncConfig.connected = false;
  saveSyncConfig();
  stopPolling();
  setSyncStatus("Disconnected.");
}

function initSyncControls() {
  hydrateSyncForm();
  document.getElementById("connectSyncBtn").addEventListener("click", connectSync);
  document.getElementById("disconnectSyncBtn").addEventListener("click", disconnectSync);
  document.getElementById("pullSyncBtn").addEventListener("click", pullRemoteState);
  document.getElementById("pushSyncBtn").addEventListener("click", pushRemoteState);
  if (syncConfig.connected && syncConfig.url && syncConfig.key && syncConfig.room) {
    setSyncStatus("Reconnecting...");
    connectSync();
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

function init() {
  initTabs();
  initReset();
  initSyncControls();
  renderAdminMatches();
  renderKnockoutAdmin();
  renderAllLive();
}

init();
