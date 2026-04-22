// ── DATA ──────────────────────────────────────────────────────────────────────

const STORAGE_KEY  = "futsal-2026-state";
const SYNC_KEY     = "futsal-2026-sync";
const TEAM_KEY     = "futsal-2026-team";
const SYNC_POLL_MS = 5000;

const groups = {
  A: ["Aztecas FC", "Gentry Uncs", "Glacier FC"],
  B: ["Rayo FC", "Los Tigrillos de Zaragoza", "SSBC"],
  C: ["El Club", "Tekks", "Botafogo FC"],
  D: ["La Mezcla Perfecta", "Dragon Ball A", "3 Puntos Fáciles"],
};

const groupMatches = [
  { id:"G1",  time:"9:30 AM",  court:"Court 1", teamA:"Aztecas FC",                teamB:"Gentry Uncs",                group:"A" },
  { id:"G2",  time:"9:30 AM",  court:"Court 2", teamA:"El Club",                   teamB:"Tekks",                      group:"C" },
  { id:"G3",  time:"10:00 AM", court:"Court 1", teamA:"Rayo FC",                   teamB:"Los Tigrillos de Zaragoza",  group:"B" },
  { id:"G4",  time:"10:00 AM", court:"Court 2", teamA:"La Mezcla Perfecta",        teamB:"Dragon Ball A",              group:"D" },
  { id:"G5",  time:"10:30 AM", court:"Court 1", teamA:"Gentry Uncs",               teamB:"Glacier FC",                 group:"A" },
  { id:"G6",  time:"10:30 AM", court:"Court 2", teamA:"Tekks",                     teamB:"Botafogo FC",                group:"C" },
  { id:"G7",  time:"11:00 AM", court:"Court 1", teamA:"Los Tigrillos de Zaragoza", teamB:"SSBC",                       group:"B" },
  { id:"G8",  time:"11:00 AM", court:"Court 2", teamA:"Dragon Ball A",             teamB:"3 Puntos Fáciles",           group:"D" },
  { id:"G9",  time:"11:30 AM", court:"Court 1", teamA:"Aztecas FC",                teamB:"Glacier FC",                 group:"A" },
  { id:"G10", time:"11:30 AM", court:"Court 2", teamA:"El Club",                   teamB:"Botafogo FC",                group:"C" },
  { id:"G11", time:"12:00 PM", court:"Court 1", teamA:"Rayo FC",                   teamB:"SSBC",                       group:"B" },
  { id:"G12", time:"12:00 PM", court:"Court 2", teamA:"La Mezcla Perfecta",        teamB:"3 Puntos Fáciles",           group:"D" },
];

const knockoutTemplate = [
  { id:"QF1",   round:"Quarterfinal", time:"1:00 PM", court:"Court 1", slotA:"1st Group A", slotB:"2nd Group B" },
  { id:"QF2",   round:"Quarterfinal", time:"1:00 PM", court:"Court 2", slotA:"1st Group B", slotB:"2nd Group A" },
  { id:"QF3",   round:"Quarterfinal", time:"1:30 PM", court:"Court 1", slotA:"1st Group C", slotB:"2nd Group D" },
  { id:"QF4",   round:"Quarterfinal", time:"1:30 PM", court:"Court 2", slotA:"1st Group D", slotB:"2nd Group C" },
  { id:"SF1",   round:"Semifinal",    time:"2:00 PM", court:"Court 1", slotA:"Winner QF1",  slotB:"Winner QF3"  },
  { id:"SF2",   round:"Semifinal",    time:"2:00 PM", court:"Court 2", slotA:"Winner QF2",  slotB:"Winner QF4"  },
  { id:"THIRD", round:"3rd Place",    time:"2:30 PM", court:"Court 1", slotA:"Loser SF1",   slotB:"Loser SF2"   },
  { id:"FINAL", round:"Final",        time:"2:30 PM", court:"Court 2", slotA:"Winner SF1",  slotB:"Winner SF2"  },
];

const defaultState = {
  group:    Object.fromEntries(groupMatches.map(m   => [m.id,   { scoreA:"", scoreB:"", scorersA:"", scorersB:"" }])),
  knockout: Object.fromEntries(knockoutTemplate.map(m => [m.id, { scoreA:"", scoreB:"", tiebreakWinner:"" }])),
  meta:     { updatedAt: 0 },
};

const defaultSync = { url:"", key:"", room:"", connected:false };

// ── STATE ──────────────────────────────────────────────────────────────────────

const state      = loadState();
const syncConfig = loadSyncConfig();
let selectedTeam = localStorage.getItem(TEAM_KEY) || "";

let syncPollTimer = null, syncDebounceTimer = null, syncInFlight = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? mergeDefaults(JSON.parse(raw)) : structuredClone(defaultState);
  } catch { return structuredClone(defaultState); }
}

function loadSyncConfig() {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    return raw ? { ...structuredClone(defaultSync), ...JSON.parse(raw) } : structuredClone(defaultSync);
  } catch { return structuredClone(defaultSync); }
}

function mergeDefaults(input) {
  return {
    group:    { ...structuredClone(defaultState.group),    ...(input?.group    || {}) },
    knockout: { ...structuredClone(defaultState.knockout), ...(input?.knockout || {}) },
    meta:     { ...structuredClone(defaultState.meta),     ...(input?.meta     || {}) },
  };
}

function saveState()    { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function saveSyncConfig(){ localStorage.setItem(SYNC_KEY,   JSON.stringify(syncConfig)); }
function saveTeam(t)    { selectedTeam = t; localStorage.setItem(TEAM_KEY, t); }
function touch()        { state.meta.updatedAt = Date.now(); }
function setSyncStatus(msg) {
  const el = document.getElementById("syncStatus");
  if (el) el.textContent = msg;
}

// ── CALCULATIONS ───────────────────────────────────────────────────────────────

function getStandings() {
  const out = {};
  for (const [g, teams] of Object.entries(groups))
    out[g] = teams.map(team => ({ team, mp:0, w:0, d:0, l:0, gf:0, ga:0, gd:0, pts:0 }));

  for (const m of groupMatches) {
    const r = state.group[m.id];
    const a = parseInt(r.scoreA, 10), b = parseInt(r.scoreB, 10);
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    const tbl = out[m.group];
    const rA = tbl.find(x => x.team === m.teamA);
    const rB = tbl.find(x => x.team === m.teamB);
    rA.mp++; rB.mp++;
    rA.gf += a; rA.ga += b;
    rB.gf += b; rB.ga += a;
    if (a > b)      { rA.w++; rA.pts += 3; rB.l++; }
    else if (b > a) { rB.w++; rB.pts += 3; rA.l++; }
    else            { rA.d++; rB.d++; rA.pts++; rB.pts++; }
  }

  for (const grp of Object.values(out)) {
    for (const r of grp) r.gd = r.gf - r.ga;
    grp.sort((x,y) => y.pts-x.pts || y.gd-x.gd || y.gf-x.gf || x.team.localeCompare(y.team));
  }
  return out;
}

function getSlotTeam(slot, standings, winners, losers) {
  if (slot.startsWith("1st Group")) return standings[slot.slice(-1)]?.[0]?.team ?? slot;
  if (slot.startsWith("2nd Group")) return standings[slot.slice(-1)]?.[1]?.team ?? slot;
  if (slot.startsWith("Winner "))   return winners[slot.replace("Winner ","")] ?? slot;
  if (slot.startsWith("Loser "))    return losers[slot.replace("Loser ","")] ?? slot;
  return slot;
}

function knockoutResult(id, tA, tB) {
  const m = state.knockout[id];
  const a = parseInt(m.scoreA,10), b = parseInt(m.scoreB,10);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return { winner:null, loser:null, score:null };
  if (a > b) return { winner:tA, loser:tB, score:`${a}–${b}` };
  if (b > a) return { winner:tB, loser:tA, score:`${a}–${b}` };
  if (m.tiebreakWinner==="A") return { winner:tA, loser:tB, score:`${a}–${b} (pens)` };
  if (m.tiebreakWinner==="B") return { winner:tB, loser:tA, score:`${a}–${b} (pens)` };
  return { winner:null, loser:null, score:`${a}–${b}` };
}

// ── TIME HELPERS ───────────────────────────────────────────────────────────────

function toMins(str) {
  const [t, p] = str.split(" ");
  let [h, m]   = t.split(":").map(Number);
  if (p==="PM" && h!==12) h += 12;
  if (p==="AM" && h===12) h = 0;
  return h*60 + m;
}

function nowMins() {
  const d = new Date();
  return d.getHours()*60 + d.getMinutes();
}

// ── TEAM BANNER ────────────────────────────────────────────────────────────────

function renderTeamBanner() {
  const el = document.getElementById("teamBanner");
  el.innerHTML = "";

  const allTeams = Object.values(groups).flat();

  if (selectedTeam) {
    // Show compact "following" strip with change option
    const strip = document.createElement("div");
    strip.className = "team-banner";
    strip.innerHTML = `
      <p class="team-banner-label">Following</p>
      <div class="team-grid" id="teamGridInline"></div>
    `;
    el.appendChild(strip);
    const grid = strip.querySelector("#teamGridInline");
    for (const name of allTeams) {
      const btn = document.createElement("button");
      btn.className = `team-btn${name === selectedTeam ? " selected" : ""}`;
      btn.textContent = name;
      btn.addEventListener("click", () => { saveTeam(name); renderAll(); });
      grid.appendChild(btn);
    }
  } else {
    // First-time prompt
    const strip = document.createElement("div");
    strip.className = "team-banner";
    strip.innerHTML = `<p class="team-banner-label">Follow your team — tap to highlight your matches</p>`;
    const grid = document.createElement("div");
    grid.className = "team-grid";
    for (const name of allTeams) {
      const btn = document.createElement("button");
      btn.className = "team-btn";
      btn.textContent = name;
      btn.addEventListener("click", () => { saveTeam(name); renderAll(); });
      grid.appendChild(btn);
    }
    strip.appendChild(grid);

    const dismiss = document.createElement("button");
    dismiss.className = "team-banner-dismiss";
    dismiss.textContent = "Skip";
    dismiss.addEventListener("click", () => {
      saveTeam("__none__");
      renderAll();
    });
    strip.appendChild(dismiss);
    el.appendChild(strip);
  }
}

// ── MY NEXT MATCH ──────────────────────────────────────────────────────────────

function renderMyNextMatch() {
  const el = document.getElementById("myNextMatch");
  el.innerHTML = "";
  if (!selectedTeam || selectedTeam === "__none__") return;

  const standings = getStandings();
  const winners = {}, losers = {};
  for (const g of knockoutTemplate) {
    const tA = getSlotTeam(g.slotA, standings, winners, losers);
    const tB = getSlotTeam(g.slotB, standings, winners, losers);
    const r  = knockoutResult(g.id, tA, tB);
    winners[g.id] = r.winner; losers[g.id] = r.loser;
  }

  // Find first unplayed match involving this team
  const allM = [
    ...groupMatches.map(m => {
      const s = state.group[m.id];
      return { time:m.time, court:m.court, label:`Group ${m.group}`,
               tA:m.teamA, tB:m.teamB,
               played: s.scoreA !== "" && s.scoreB !== "" };
    }),
    ...knockoutTemplate.map(g => {
      const tA = getSlotTeam(g.slotA, standings, winners, losers);
      const tB = getSlotTeam(g.slotB, standings, winners, losers);
      const s  = state.knockout[g.id];
      return { time:g.time, court:g.court, label:g.round,
               tA, tB, played: s.scoreA !== "" && s.scoreB !== "" };
    }),
  ];

  const next = allM
    .filter(m => !m.played && (m.tA === selectedTeam || m.tB === selectedTeam))
    .sort((a,b) => toMins(a.time) - toMins(b.time))[0];

  if (!next) return;

  const card = document.createElement("div");
  card.className = "my-next-card";
  card.innerHTML = `
    <p class="my-next-eyebrow">Your next match</p>
    <p class="my-next-matchup">${next.tA} vs ${next.tB}</p>
    <div class="my-next-meta">
      <span>${next.time}</span>
      <span>·</span>
      <span>${next.court}</span>
      <span>·</span>
      <span>${next.label}</span>
    </div>`;
  el.appendChild(card);
}

// ── SCHEDULE ───────────────────────────────────────────────────────────────────

function renderSchedule() {
  const container = document.getElementById("scheduleView");
  container.innerHTML = "";

  const standings = getStandings();
  const winners = {}, losers = {};
  for (const g of knockoutTemplate) {
    const tA = getSlotTeam(g.slotA, standings, winners, losers);
    const tB = getSlotTeam(g.slotB, standings, winners, losers);
    const r  = knockoutResult(g.id, tA, tB);
    winners[g.id] = r.winner; losers[g.id] = r.loser;
  }

  const allMatches = [
    ...groupMatches.map(m => {
      const s = state.group[m.id];
      const hasScore = s.scoreA !== "" && s.scoreB !== "";
      return { time:m.time, court:m.court, tag:`Group ${m.group}`,
               tA:m.teamA, tB:m.teamB, sA:s.scoreA, sB:s.scoreB, hasScore };
    }),
    ...knockoutTemplate.map(g => {
      const tA = getSlotTeam(g.slotA, standings, winners, losers);
      const tB = getSlotTeam(g.slotB, standings, winners, losers);
      const s  = state.knockout[g.id];
      const hasScore = s.scoreA !== "" && s.scoreB !== "";
      return { time:g.time, court:g.court, tag:g.round,
               tA, tB, sA:s.scoreA, sB:s.scoreB, hasScore };
    }),
  ];

  // Group by time slot
  const slotMap = new Map();
  for (const m of allMatches) {
    if (!slotMap.has(m.time)) slotMap.set(m.time, []);
    slotMap.get(m.time).push(m);
  }

  const times = [...slotMap.keys()].sort((a,b) => toMins(a) - toMins(b));
  const now   = nowMins();

  let nowIdx = -1;
  for (let i = 0; i < times.length; i++) {
    const slotMin = toMins(times[i]);
    const nextMin = i+1 < times.length ? toMins(times[i+1]) : slotMin + 45;
    if (now >= slotMin && now < nextMin) { nowIdx = i; break; }
  }

  const earlier = [], upcoming = [];
  let nextSlotRendered = false;

  for (let i = 0; i < times.length; i++) {
    const t       = times[i];
    const matches = slotMap.get(t);
    const isNow   = i === nowIdx;
    const isPast  = nowIdx >= 0 ? i < nowIdx : matches.every(m => m.hasScore);

    if (isNow) {
      // ── IN PROGRESS ──
      const section = document.createElement("div");
      section.className = "inprogress-section";

      const lbl = document.createElement("div");
      lbl.className = "inprogress-label";
      lbl.innerHTML = `<span class="inprogress-dot"></span> In Progress · ${t}`;
      section.appendChild(lbl);

      for (const m of matches) {
        section.appendChild(makeInProgressCard(m));
      }
      container.appendChild(section);

    } else if (isPast) {
      earlier.push(...matches);

    } else if (!nextSlotRendered) {
      // ── NEXT UP ──
      const lbl = document.createElement("div");
      lbl.className = "slot-label";
      lbl.textContent = `Next Up · ${t}`;
      container.appendChild(lbl);

      for (const m of matches) {
        container.appendChild(makeMatchRow(m, true));
      }
      nextSlotRendered = true;

    } else {
      upcoming.push({ time: t, matches });
    }
  }

  // Upcoming slots
  for (const slot of upcoming) {
    const lbl = document.createElement("div");
    lbl.className = "upcoming-label";
    lbl.textContent = slot.time;
    container.appendChild(lbl);
    for (const m of slot.matches) container.appendChild(makeMatchRow(m, false));
  }

  // Earlier (past, faded)
  if (earlier.length) {
    const lbl = document.createElement("div");
    lbl.className = "earlier-label";
    lbl.textContent = "Earlier";
    container.appendChild(lbl);
    for (const m of earlier) container.appendChild(makeMatchRow(m, false, true));
  }
}

function makeInProgressCard(m) {
  const card = document.createElement("div");
  card.className = "inprogress-card";

  const bar = document.createElement("div");
  bar.className = "inprogress-bar";

  const inner = document.createElement("div");
  inner.className = "inprogress-inner";

  const matchup = document.createElement("div");
  matchup.className = "inprogress-matchup";

  const teamA = document.createElement("div");
  teamA.className = "ip-team";
  teamA.textContent = m.tA;

  const scoreBlock = document.createElement("div");
  scoreBlock.className = "ip-score-block";
  if (m.hasScore) {
    scoreBlock.innerHTML = `<div class="ip-score">${m.sA}<span style="font-size:0.55em;letter-spacing:0;margin:0 2px">–</span>${m.sB}</div>`;
  } else {
    scoreBlock.innerHTML = `<div class="ip-score" style="color:var(--muted);font-size:28px">–</div><span class="ip-vs">vs</span>`;
  }

  const teamB = document.createElement("div");
  teamB.className = "ip-team right";
  teamB.textContent = m.tB;

  matchup.append(teamA, scoreBlock, teamB);
  inner.appendChild(matchup);

  const footer = document.createElement("div");
  footer.className = "inprogress-footer";
  footer.innerHTML = `<span class="court-tag">${m.court}</span><span>${m.tag}</span>`;
  inner.appendChild(footer);

  card.append(bar, inner);
  return card;
}

function makeMatchRow(m, isNext, isPlayed = false) {
  const isMyMatch = selectedTeam && selectedTeam !== "__none__" &&
                    (m.tA === selectedTeam || m.tB === selectedTeam);
  const row = document.createElement("div");
  const cls = ["match-row"];
  if (isPlayed) cls.push("played");
  else if (isMyMatch && !isNext) cls.push("my-match");
  else if (isNext) cls.push("is-next");
  row.className = cls.join(" ");

  const tag = document.createElement("span");
  tag.className = "match-tag";
  tag.textContent = m.tag;

  const teams = document.createElement("div");
  teams.className = "match-teams";
  teams.textContent = `${m.tA} vs ${m.tB}`;

  const score = document.createElement("div");
  score.className = "match-score";
  score.textContent = m.hasScore ? `${m.sA}–${m.sB}` : "–";

  const court = document.createElement("span");
  court.className = "court-tag";
  court.textContent = m.court;

  row.append(tag, teams, score, court);
  return row;
}

// ── STANDINGS ──────────────────────────────────────────────────────────────────

function renderStandings() {
  const standings = getStandings();
  const container = document.getElementById("standingsContainer");
  container.innerHTML = "";

  // Put my group first if selected
  let groupOrder = Object.keys(standings);
  const myGroup = selectedTeam && selectedTeam !== "__none__"
    ? Object.entries(groups).find(([, teams]) => teams.includes(selectedTeam))?.[0]
    : null;
  if (myGroup) groupOrder = [myGroup, ...groupOrder.filter(g => g !== myGroup)];

  for (const g of groupOrder) {
    const table = standings[g];
    const isMyGroup = g === myGroup;

    const card = document.createElement("div");
    card.className = `group-card${isMyGroup ? " my-group" : ""}`;

    const hdr = document.createElement("div");
    hdr.className = "group-header";
    hdr.textContent = `Group ${g}`;
    card.appendChild(hdr);

    const tbl = document.createElement("table");
    tbl.className = "s-table";
    tbl.innerHTML = `<thead><tr>
      <th class="t">Team</th>
      <th>W</th><th>L</th><th>Pts</th>
    </tr></thead>`;

    const tbody = document.createElement("tbody");
    table.forEach((row, i) => {
      const tr = document.createElement("tr");
      const isMe = row.team === selectedTeam && selectedTeam !== "__none__";
      if (i < 2) tr.className = "adv";
      if (isMe)  tr.className = (tr.className ? tr.className + " " : "") + "me";
      tr.innerHTML = `
        <td class="t">${row.team}</td>
        <td>${row.w}</td>
        <td>${row.l}</td>
        <td class="p">${row.pts}</td>`;
      tbody.appendChild(tr);
    });

    tbl.appendChild(tbody);
    card.appendChild(tbl);

    const note = document.createElement("div");
    note.className = "adv-note";
    note.textContent = "Top 2 advance";
    card.appendChild(note);

    container.appendChild(card);
  }
}

// ── BRACKET ────────────────────────────────────────────────────────────────────

function renderBracket() {
  const view = document.getElementById("bracketView");
  view.innerHTML = "";

  const anyScored = groupMatches.some(m => state.group[m.id].scoreA !== "");

  if (!anyScored) {
    view.innerHTML = `<p class="bracket-empty">Bracket fills in once group stage scores are entered.</p>`;
    return;
  }

  const standings = getStandings();
  const winners = {}, losers = {};

  const rounds = [
    { label:"Quarterfinals", ids:["QF1","QF2","QF3","QF4"] },
    { label:"Semifinals",    ids:["SF1","SF2"]             },
    { label:"Finals",        ids:["THIRD","FINAL"]         },
  ];

  const scroll = document.createElement("div");
  scroll.className = "bracket-scroll";
  const tree = document.createElement("div");
  tree.className = "bracket-tree";

  for (const round of rounds) {
    const col = document.createElement("div");
    col.className = "b-col";

    const lbl = document.createElement("div");
    lbl.className = "b-col-label";
    lbl.textContent = round.label;
    col.appendChild(lbl);

    for (const id of round.ids) {
      const game = knockoutTemplate.find(g => g.id === id);
      const tA   = getSlotTeam(game.slotA, standings, winners, losers);
      const tB   = getSlotTeam(game.slotB, standings, winners, losers);
      const res  = knockoutResult(id, tA, tB);
      winners[id] = res.winner; losers[id] = res.loser;

      const s = state.knockout[id];
      const hasScore = s.scoreA !== "" && s.scoreB !== "";
      const isTbd = t => t.startsWith("1st") || t.startsWith("2nd") ||
                         t.startsWith("Winner") || t.startsWith("Loser");

      const matchEl = document.createElement("div");
      matchEl.className = "b-match";

      for (const [name, score, side] of [[tA, s.scoreA, "A"], [tB, s.scoreB, "B"]]) {
        const rowEl = document.createElement("div");
        rowEl.className = `b-team${res.winner === name ? " winner" : ""}`;

        const nameEl = document.createElement("span");
        nameEl.className = `b-name${isTbd(name) ? " tbd" : ""}`;
        nameEl.textContent = name;

        const scoreEl = document.createElement("span");
        scoreEl.className = "b-score";
        scoreEl.textContent = hasScore ? score : "";

        rowEl.append(nameEl, scoreEl);
        matchEl.appendChild(rowEl);
      }

      col.appendChild(matchEl);
    }

    tree.appendChild(col);
  }

  scroll.appendChild(tree);
  view.appendChild(scroll);
}

// ── ADMIN: GROUP MATCHES ────────────────────────────────────────────────────────

function renderAdminMatches() {
  const container = document.getElementById("groupMatchesAdmin");
  container.innerHTML = "";

  for (const m of groupMatches) {
    const s = state.group[m.id];
    const hasScore = s.scoreA !== "" && s.scoreB !== "";

    const card = document.createElement("div");
    card.className = `admin-card${hasScore ? " scored" : ""}`;

    card.innerHTML = `<div class="admin-card-head">
      <span class="admin-round-tag">Group ${m.group}</span>
      <span class="admin-card-title">${m.teamA} vs ${m.teamB}</span>
      <span class="admin-card-time">${m.time} · ${m.court}</span>
    </div>`;

    card.appendChild(makeAdminScoreRow(m.id, "A", m.teamA, "group"));
    card.appendChild(makeAdminScoreRow(m.id, "B", m.teamB, "group"));

    const hint = document.createElement("p");
    hint.className = "scorers-hint";
    hint.textContent = "Scorers (comma separated)";
    card.appendChild(hint);

    for (const [side, team] of [["A", m.teamA], ["B", m.teamB]]) {
      const ta = document.createElement("textarea");
      ta.placeholder = `${team} scorers`;
      ta.value = s[`scorers${side}`];
      ta.addEventListener("change", e => updateGroup(m.id, `scorers${side}`, e.target.value));
      card.appendChild(ta);
    }

    container.appendChild(card);
  }
}

function renderKnockoutAdmin() {
  const container = document.getElementById("knockoutAdmin");
  container.innerHTML = "";
  const standings = getStandings();
  const winners = {}, losers = {};

  for (const g of knockoutTemplate) {
    const tA = getSlotTeam(g.slotA, standings, winners, losers);
    const tB = getSlotTeam(g.slotB, standings, winners, losers);
    const s  = state.knockout[g.id];
    const hasScore = s.scoreA !== "" && s.scoreB !== "";

    const card = document.createElement("div");
    card.className = `admin-card${hasScore ? " scored" : ""}`;

    card.innerHTML = `<div class="admin-card-head">
      <span class="admin-round-tag">${g.round}</span>
      <span class="admin-card-title">${tA} vs ${tB}</span>
      <span class="admin-card-time">${g.time} · ${g.court}</span>
    </div>`;

    card.appendChild(makeAdminScoreRow(g.id, "A", tA, "knockout"));
    card.appendChild(makeAdminScoreRow(g.id, "B", tB, "knockout"));

    const sel = document.createElement("select");
    sel.innerHTML = `<option value="">If tied — choose penalty winner</option>
      <option value="A">${tA}</option>
      <option value="B">${tB}</option>`;
    sel.value = s.tiebreakWinner || "";
    sel.addEventListener("change", e => updateKnockout(g.id, "tiebreakWinner", e.target.value));
    card.appendChild(sel);

    container.appendChild(card);

    const res = knockoutResult(g.id, tA, tB);
    winners[g.id] = res.winner; losers[g.id] = res.loser;
  }
}

function makeAdminScoreRow(matchId, side, teamName, type) {
  const row = document.createElement("div");
  row.className = "score-row";
  const lbl = document.createElement("label");
  lbl.className = "score-label";
  lbl.textContent = teamName;
  const inp = document.createElement("input");
  inp.type = "number"; inp.min = "0"; inp.max = "99";
  inp.value = type === "group"
    ? state.group[matchId][`score${side}`]
    : state.knockout[matchId][`score${side}`];
  inp.addEventListener("change", e => {
    if (type === "group") updateGroup(matchId, `score${side}`, e.target.value);
    else updateKnockout(matchId, `score${side}`, e.target.value);
  });
  row.append(lbl, inp);
  return row;
}

// ── UPDATE HANDLERS ────────────────────────────────────────────────────────────

function updateGroup(matchId, field, value) {
  state.group[matchId][field] = value;
  touch(); saveState(); renderAll(); scheduleSyncPush();
}

function updateKnockout(matchId, field, value) {
  state.knockout[matchId][field] = value;
  touch(); saveState(); renderAll(); renderKnockoutAdmin(); scheduleSyncPush();
}

function renderAll() {
  renderTeamBanner();
  renderMyNextMatch();
  renderSchedule();
  renderStandings();
  renderBracket();
}

// ── TABS ───────────────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

// ── ADMIN GUARD ────────────────────────────────────────────────────────────────

function initAdmin() {
  const isAdmin = new URLSearchParams(window.location.search).has("admin");
  if (!isAdmin) return;
  document.getElementById("adminTab").classList.remove("hidden");
  document.getElementById("resetBtn").classList.remove("hidden");
  renderAdminMatches();
  renderKnockoutAdmin();
}

// ── RESET ──────────────────────────────────────────────────────────────────────

function initReset() {
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("Reset all scores? This cannot be undone.")) return;
    Object.assign(state, structuredClone(defaultState));
    touch(); saveState();
    renderAdminMatches(); renderKnockoutAdmin(); renderAll();
    scheduleSyncPush();
  });
}

// ── SYNC ───────────────────────────────────────────────────────────────────────

function escRoom(r) { return encodeURIComponent(r.trim()); }

function syncHeaders() {
  return { apikey: syncConfig.key, Authorization: `Bearer ${syncConfig.key}`, "Content-Type": "application/json" };
}

async function fetchRemote() {
  const res = await fetch(`${syncConfig.url}/rest/v1/tournament_state?room_id=eq.${escRoom(syncConfig.room)}&select=payload,updated_at&limit=1`, { headers: syncHeaders() });
  if (!res.ok) throw new Error(`${res.status}`);
  const d = await res.json();
  return d[0] || null;
}

async function pushRemote() {
  if (!syncConfig.connected || syncInFlight) return;
  syncInFlight = true;
  try {
    const res = await fetch(`${syncConfig.url}/rest/v1/tournament_state`, {
      method: "POST",
      headers: { ...syncHeaders(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ room_id: syncConfig.room.trim(), payload: state }]),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    setSyncStatus(`Synced · ${new Date().toLocaleTimeString()}`);
  } catch (e) {
    setSyncStatus(`Sync error: ${e.message}`);
  } finally { syncInFlight = false; }
}

async function pullRemote() {
  if (!syncConfig.connected || syncInFlight) return;
  syncInFlight = true;
  try {
    const remote = await fetchRemote();
    if (!remote?.payload) { setSyncStatus("Connected · no data yet"); return; }
    const localTs  = Number(state?.meta?.updatedAt || 0);
    const remoteTs = Number(remote.payload?.meta?.updatedAt || 0);
    if (remoteTs > localTs) {
      Object.assign(state, mergeDefaults(remote.payload));
      saveState();
      renderAdminMatches(); renderKnockoutAdmin(); renderAll();
      setSyncStatus(`Pulled · ${new Date().toLocaleTimeString()}`);
    } else {
      setSyncStatus(`Up to date · ${new Date().toLocaleTimeString()}`);
    }
  } catch (e) {
    setSyncStatus(`Sync error: ${e.message}`);
  } finally { syncInFlight = false; }
}

function scheduleSyncPush() {
  if (!syncConfig.connected) return;
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(pushRemote, 500);
}

function startPolling() { stopPolling(); syncPollTimer = setInterval(pullRemote, SYNC_POLL_MS); }
function stopPolling()  { clearInterval(syncPollTimer); syncPollTimer = null; }

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
    setSyncStatus("Enter URL, anon key, and room ID first."); return;
  }
  syncConfig.connected = true; saveSyncConfig();
  try {
    const remote = await fetchRemote();
    if (!remote) { touch(); await pushRemote(); setSyncStatus("Connected · room initialized"); }
    else { await pullRemote(); }
    startPolling();
  } catch (e) {
    syncConfig.connected = false; saveSyncConfig();
    setSyncStatus(`Failed: ${e.message}`);
  }
}

function initSyncControls() {
  hydrateSyncForm();
  document.getElementById("connectSyncBtn").addEventListener("click", connectSync);
  document.getElementById("disconnectSyncBtn").addEventListener("click", () => {
    syncConfig.connected = false; saveSyncConfig(); stopPolling(); setSyncStatus("Disconnected.");
  });
  document.getElementById("pullSyncBtn").addEventListener("click", pullRemote);
  document.getElementById("pushSyncBtn").addEventListener("click", pushRemote);
  if (syncConfig.connected && syncConfig.url && syncConfig.key && syncConfig.room) {
    setSyncStatus("Reconnecting…"); connectSync();
  }
}

// ── INIT ───────────────────────────────────────────────────────────────────────

function init() {
  initTabs();
  initAdmin();
  initReset();
  initSyncControls();
  renderAll();
}

init();
