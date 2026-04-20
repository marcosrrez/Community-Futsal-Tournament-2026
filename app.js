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
  { id: "G1", time: "9:30 AM", court: "Court 1", teamA: "Aztecas FC", teamB: "Gentry Uncs", group: "A" },
  { id: "G2", time: "9:30 AM", court: "Court 2", teamA: "El Club", teamB: "Tekks", group: "C" },
  { id: "G3", time: "10:00 AM", court: "Court 1", teamA: "Rayo FC", teamB: "Los Tigrillos de Zaragoza", group: "B" },
  { id: "G4", time: "10:00 AM", court: "Court 2", teamA: "La Mezcla Perfecta", teamB: "Dragon Ball A", group: "D" },
  { id: "G5", time: "10:30 AM", court: "Court 1", teamA: "Gentry Uncs", teamB: "Glacier FC", group: "A" },
  { id: "G6", time: "10:30 AM", court: "Court 2", teamA: "Tekks", teamB: "Botafogo FC", group: "C" },
  { id: "G7", time: "11:00 AM", court: "Court 1", teamA: "Los Tigrillos de Zaragoza", teamB: "SSBC", group: "B" },
  { id: "G8", time: "11:00 AM", court: "Court 2", teamA: "Dragon Ball A", teamB: "3 Puntos Fáciles", group: "D" },
  { id: "G9", time: "11:30 AM", court: "Court 1", teamA: "Aztecas FC", teamB: "Glacier FC", group: "A" },
  { id: "G10", time: "11:30 AM", court: "Court 2", teamA: "El Club", teamB: "Botafogo FC", group: "C" },
  { id: "G11", time: "12:00 PM", court: "Court 1", teamA: "Rayo FC", teamB: "SSBC", group: "B" },
  { id: "G12", time: "12:00 PM", court: "Court 2", teamA: "La Mezcla Perfecta", teamB: "3 Puntos Fáciles", group: "D" },
];

const knockoutTemplate = [
  { id: "QF1", round: "Quarterfinal", time: "1:00 PM", court: "Court 1", slotA: "1st Group A", slotB: "2nd Group B" },
  { id: "QF2", round: "Quarterfinal", time: "1:00 PM", court: "Court 2", slotA: "1st Group B", slotB: "2nd Group A" },
  { id: "QF3", round: "Quarterfinal", time: "1:30 PM", court: "Court 1", slotA: "1st Group C", slotB: "2nd Group D" },
  { id: "QF4", round: "Quarterfinal", time: "1:30 PM", court: "Court 2", slotA: "1st Group D", slotB: "2nd Group C" },
  { id: "SF1", round: "Semifinal", time: "2:00 PM", court: "Court 1", slotA: "Winner QF1", slotB: "Winner QF3" },
  { id: "SF2", round: "Semifinal", time: "2:00 PM", court: "Court 2", slotA: "Winner QF2", slotB: "Winner QF4" },
  { id: "THIRD", round: "3rd Place", time: "2:30 PM", court: "Court 1", slotA: "Loser SF1", slotB: "Loser SF2" },
  { id: "FINAL", round: "Final", time: "2:30 PM", court: "Court 2", slotA: "Winner SF1", slotB: "Winner SF2" },
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

function touchUpdateTime() {
  state.meta.updatedAt = Date.now();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveSyncConfig() {
  localStorage.setItem(SYNC_KEY, JSON.stringify(syncConfig));
}

function setSyncStatus(message) {
  const status = document.getElementById("syncStatus");
  if (status) status.textContent = message;
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.tab).classList.add("active");
    });
  });
}

function renderAdminMatches() {
  const container = document.getElementById("groupMatchesAdmin");
  container.innerHTML = "";

  for (const match of groupMatches) {
    const card = document.getElementById("adminMatchTemplate").content.cloneNode(true);
    card.querySelector(".chip").textContent = `Group ${match.group}`;
    card.querySelector("h3").textContent = `${match.id}: ${match.teamA} vs ${match.teamB}`;
    card.querySelector(".muted").textContent = `${match.time} • ${match.court}`;
    const teams = card.querySelector(".teams");

    teams.appendChild(scoreRow(match.id, "A", match.teamA));
    teams.appendChild(scoreRow(match.id, "B", match.teamB));

    const scorersA = document.createElement("textarea");
    scorersA.placeholder = `${match.teamA} scorers`;
    scorersA.value = state.group[match.id].scorersA;
    scorersA.addEventListener("change", (e) => updateGroup(match.id, "scorersA", e.target.value));
    teams.appendChild(scorersA);

    const scorersB = document.createElement("textarea");
    scorersB.placeholder = `${match.teamB} scorers`;
    scorersB.value = state.group[match.id].scorersB;
    scorersB.addEventListener("change", (e) => updateGroup(match.id, "scorersB", e.target.value));
    teams.appendChild(scorersB);

    container.appendChild(card);
  }
}

function scoreRow(matchId, side, teamName) {
  const wrap = document.createElement("div");
  wrap.className = "team-row";
  const label = document.createElement("label");
  label.textContent = teamName;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "99";
  input.value = state.group[matchId][`score${side}`];
  input.addEventListener("change", (e) => updateGroup(matchId, `score${side}`, e.target.value));
  wrap.append(label, input);
  return wrap;
}

function knockoutScoreRow(matchId, side, teamName) {
  const wrap = document.createElement("div");
  wrap.className = "team-row";
  const label = document.createElement("label");
  label.textContent = teamName;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "99";
  input.value = state.knockout[matchId][`score${side}`];
  input.addEventListener("change", (e) => updateKnockout(matchId, `score${side}`, e.target.value));
  wrap.append(label, input);
  return wrap;
}

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

function getStandings() {
  const standings = {};
  for (const [groupKey, teams] of Object.entries(groups)) {
    standings[groupKey] = teams.map((team) => ({ team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }));
  }

  for (const match of groupMatches) {
    const res = state.group[match.id];
    const a = Number.parseInt(res.scoreA, 10);
    const b = Number.parseInt(res.scoreB, 10);
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;

    const table = standings[match.group];
    const rowA = table.find((r) => r.team === match.teamA);
    const rowB = table.find((r) => r.team === match.teamB);
    rowA.mp += 1; rowB.mp += 1;
    rowA.gf += a; rowA.ga += b;
    rowB.gf += b; rowB.ga += a;

    if (a > b) {
      rowA.w += 1; rowA.pts += 3; rowB.l += 1;
    } else if (b > a) {
      rowB.w += 1; rowB.pts += 3; rowA.l += 1;
    } else {
      rowA.d += 1; rowB.d += 1; rowA.pts += 1; rowB.pts += 1;
    }
  }

  for (const group of Object.values(standings)) {
    for (const row of group) row.gd = row.gf - row.ga;
    group.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team));
  }
  return standings;
}

function renderStandings() {
  const standings = getStandings();
  const container = document.getElementById("standingsContainer");
  container.innerHTML = "";

  for (const [groupName, table] of Object.entries(standings)) {
    const card = document.createElement("article");
    card.className = "match-card";
    card.innerHTML = `
      <h3>Group ${groupName}</h3>
      <table class="table">
        <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
        <tbody>
          ${table.map((row, i) => `<tr><td>${i + 1}</td><td>${row.team}</td><td>${row.mp}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td>${row.gd}</td><td><strong>${row.pts}</strong></td></tr>`).join("")}
        </tbody>
      </table>`;
    container.appendChild(card);
  }
}

function getSlotTeam(slot, standings, winners, losers) {
  if (slot.startsWith("1st Group")) return standings[slot.slice(-1)][0]?.team ?? slot;
  if (slot.startsWith("2nd Group")) return standings[slot.slice(-1)][1]?.team ?? slot;
  if (slot.startsWith("Winner ")) return winners[slot.replace("Winner ", "")] ?? slot;
  if (slot.startsWith("Loser ")) return losers[slot.replace("Loser ", "")] ?? slot;
  return slot;
}

function knockoutResult(matchId, teamA, teamB) {
  const match = state.knockout[matchId];
  const a = Number.parseInt(match.scoreA, 10);
  const b = Number.parseInt(match.scoreB, 10);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return { winner: null, loser: null, score: "-" };
  if (a > b) return { winner: teamA, loser: teamB, score: `${a}-${b}` };
  if (b > a) return { winner: teamB, loser: teamA, score: `${a}-${b}` };

  if (match.tiebreakWinner === "A") return { winner: teamA, loser: teamB, score: `${a}-${b} (pens)` };
  if (match.tiebreakWinner === "B") return { winner: teamB, loser: teamA, score: `${a}-${b} (pens)` };
  return { winner: null, loser: null, score: `${a}-${b} (awaiting pens)` };
}

function renderKnockoutAdmin() {
  const container = document.getElementById("knockoutAdmin");
  container.innerHTML = "";
  const standings = getStandings();
  const winners = {};
  const losers = {};

  for (const game of knockoutTemplate) {
    const teamA = getSlotTeam(game.slotA, standings, winners, losers);
    const teamB = getSlotTeam(game.slotB, standings, winners, losers);
    const card = document.getElementById("adminMatchTemplate").content.cloneNode(true);

    card.querySelector(".chip").textContent = game.round;
    card.querySelector("h3").textContent = `${game.id}: ${teamA} vs ${teamB}`;
    card.querySelector(".muted").textContent = `${game.time} • ${game.court}`;

    const teams = card.querySelector(".teams");
    teams.append(knockoutScoreRow(game.id, "A", teamA), knockoutScoreRow(game.id, "B", teamB));

    const select = document.createElement("select");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "If tied, pick winner";
    select.appendChild(placeholder);

    const optA = document.createElement("option");
    optA.value = "A";
    optA.textContent = teamA;
    const optB = document.createElement("option");
    optB.value = "B";
    optB.textContent = teamB;
    select.append(optA, optB);
    select.value = state.knockout[game.id].tiebreakWinner || "";
    select.addEventListener("change", (e) => updateKnockout(game.id, "tiebreakWinner", e.target.value));
    teams.appendChild(select);

    container.appendChild(card);

    const result = knockoutResult(game.id, teamA, teamB);
    winners[game.id] = result.winner;
    losers[game.id] = result.loser;
  }
}

function renderTimeline() {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "";

  [...groupMatches, ...knockoutTemplate].forEach((game) => {
    const row = document.createElement("div");
    row.className = "timeline-row";

    if (game.group) {
      const scored = state.group[game.id];
      const score = Number.isInteger(Number.parseInt(scored.scoreA, 10)) && Number.isInteger(Number.parseInt(scored.scoreB, 10))
        ? `${scored.scoreA}-${scored.scoreB}`
        : "vs";
      row.textContent = `${game.time} | ${game.court} | ${game.teamA} ${score} ${game.teamB}`;
    } else {
      const scored = state.knockout[game.id];
      const score = Number.isInteger(Number.parseInt(scored.scoreA, 10)) && Number.isInteger(Number.parseInt(scored.scoreB, 10))
        ? `${scored.scoreA}-${scored.scoreB}`
        : "vs";
      row.textContent = `${game.time} | ${game.id} | ${game.slotA} ${score} ${game.slotB}`;
    }

    timeline.appendChild(row);
  });
}

function renderLeaders() {
  const topScorersEl = document.getElementById("topScorers");
  const topWinsEl = document.getElementById("topWins");
  topScorersEl.innerHTML = "";
  topWinsEl.innerHTML = "";

  const scorerMap = new Map();
  for (const game of groupMatches) {
    const scored = state.group[game.id];
    [scored.scorersA, scored.scorersB].forEach((bundle) => {
      bundle
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((player) => scorerMap.set(player, (scorerMap.get(player) || 0) + 1));
    });
  }

  const sortedScorers = [...scorerMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  if (!sortedScorers.length) {
    topScorersEl.innerHTML = "<li>No goals logged yet.</li>";
  } else {
    sortedScorers.forEach(([name, goals]) => {
      const li = document.createElement("li");
      li.textContent = `${name} (${goals})`;
      topScorersEl.appendChild(li);
    });
  }

  const standings = getStandings();
  const winRows = Object.values(standings)
    .flat()
    .sort((a, b) => b.w - a.w || b.pts - a.pts || a.team.localeCompare(b.team))
    .slice(0, 10);
  winRows.forEach((team) => {
    const li = document.createElement("li");
    li.textContent = `${team.team} (${team.w} wins)`;
    topWinsEl.appendChild(li);
  });
}

function renderBracketSnapshot() {
  const view = document.getElementById("bracketView");
  view.innerHTML = "";

  const standings = getStandings();
  const winners = {};
  const losers = {};

  for (const game of knockoutTemplate) {
    const teamA = getSlotTeam(game.slotA, standings, winners, losers);
    const teamB = getSlotTeam(game.slotB, standings, winners, losers);
    const result = knockoutResult(game.id, teamA, teamB);
    winners[game.id] = result.winner;
    losers[game.id] = result.loser;

    const box = document.createElement("article");
    box.className = "bracket-box";
    box.innerHTML = `
      <p class="chip">${game.id}</p>
      <p><strong>${teamA}</strong> vs <strong>${teamB}</strong></p>
      <p class="muted">${result.score}</p>
      <p>${result.winner ? `Winner: ${result.winner}` : "Winner pending"}</p>
    `;
    view.appendChild(box);
  }
}

function renderAllLive() {
  renderStandings();
  renderTimeline();
  renderLeaders();
  renderBracketSnapshot();
}

function initReset() {
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!window.confirm("Reset all entered scores and stats?")) return;
    Object.assign(state, structuredClone(defaultState));
    touchUpdateTime();
    saveState();
    renderAdminMatches();
    renderKnockoutAdmin();
    renderAllLive();
    scheduleSyncPush();
  });
}

function escapeRoom(room) {
  return encodeURIComponent(room.trim());
}

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
    const endpoint = `${syncConfig.url}/rest/v1/tournament_state`;
    const payload = [{ room_id: syncConfig.room.trim(), payload: state }];
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { ...getSyncHeaders(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Push failed (${res.status})`);
    setSyncStatus(`Sync connected • pushed ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    setSyncStatus(`Sync error: ${error.message}`);
  } finally {
    syncInFlight = false;
  }
}

async function pullRemoteState() {
  if (!syncConfig.connected || syncInFlight) return;
  syncInFlight = true;
  try {
    const remote = await fetchRemoteState();
    if (!remote?.payload) {
      setSyncStatus("Sync connected • no remote state yet");
      return;
    }

    const localTs = Number(state?.meta?.updatedAt || 0);
    const remoteTs = Number(remote.payload?.meta?.updatedAt || 0);
    if (remoteTs > localTs) {
      const merged = mergeStateDefaults(remote.payload);
      Object.assign(state, merged);
      saveState();
      renderAdminMatches();
      renderKnockoutAdmin();
      renderAllLive();
      setSyncStatus(`Sync connected • pulled ${new Date().toLocaleTimeString()}`);
    } else {
      setSyncStatus(`Sync connected • up-to-date ${new Date().toLocaleTimeString()}`);
    }
  } catch (error) {
    setSyncStatus(`Sync error: ${error.message}`);
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
  syncConfig.url = document.getElementById("sbUrl").value.trim().replace(/\/$/, "");
  syncConfig.key = document.getElementById("sbKey").value.trim();
  syncConfig.room = document.getElementById("sbRoom").value.trim();
}

function hydrateSyncForm() {
  document.getElementById("sbUrl").value = syncConfig.url || "";
  document.getElementById("sbKey").value = syncConfig.key || "";
  document.getElementById("sbRoom").value = syncConfig.room || "";
}

async function connectSync() {
  readSyncForm();
  if (!syncConfig.url || !syncConfig.key || !syncConfig.room) {
    setSyncStatus("Sync: enter URL, anon key, and room ID first.");
    return;
  }

  syncConfig.connected = true;
  saveSyncConfig();

  try {
    const remote = await fetchRemoteState();
    if (!remote) {
      touchUpdateTime();
      await pushRemoteState();
      setSyncStatus("Sync connected • initialized remote room");
    } else {
      await pullRemoteState();
    }
    startPolling();
  } catch (error) {
    syncConfig.connected = false;
    saveSyncConfig();
    setSyncStatus(`Sync connection failed: ${error.message}`);
  }
}

function disconnectSync() {
  syncConfig.connected = false;
  saveSyncConfig();
  stopPolling();
  setSyncStatus("Sync: disconnected.");
}

function initSyncControls() {
  hydrateSyncForm();

  document.getElementById("connectSyncBtn").addEventListener("click", connectSync);
  document.getElementById("disconnectSyncBtn").addEventListener("click", disconnectSync);
  document.getElementById("pullSyncBtn").addEventListener("click", pullRemoteState);
  document.getElementById("pushSyncBtn").addEventListener("click", pushRemoteState);

  if (syncConfig.connected && syncConfig.url && syncConfig.key && syncConfig.room) {
    setSyncStatus("Sync: reconnecting...");
    connectSync();
  }
}

function init() {
  initTabs();
  initReset();
  initSyncControls();
  renderAdminMatches();
  renderKnockoutAdmin();
  renderAllLive();
}

init();
