(function () {
  "use strict";

  // ============ CONSTANTES ============
  var STORAGE_KEY = "skypoint_games_v1";
  var COLORS = [
    "#f5d0a9", "#e0245e", "#8b8b1a", "#e08a1e",
    "#0a84ff", "#32d74b", "#bf5af2", "#ff453a",
    "#64d2ff", "#ff9f0a", "#30d158", "#ff375f"
  ];

  // ============ ÉTAT ============
  /** @type {{id:string,name:string,targetScore:number,createdAt:number,endedAt:number|null,players:Array,rounds:Array}[]} */
  var games = [];
  var activeGameId = null;
  var currentCell = { playerIndex: 0, roundIndex: 0 };
  var sheetValue = "";
  var sheetNegative = false;
  var editingPlayerId = null; // pour la modale nom joueur
  var setupPlayers = []; // joueurs en cours de création sur l'écran setup
  var confirmCallback = null;

  // ============ PERSISTENCE ============
  function loadGames() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      games = raw ? JSON.parse(raw) : [];
    } catch (e) {
      games = [];
    }
  }
  function saveGames() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
    } catch (e) { /* stockage indisponible : on continue sans persister */ }
  }
  function getGame(id) {
    for (var i = 0; i < games.length; i++) if (games[i].id === id) return games[i];
    return null;
  }
  function activeGame() {
    return activeGameId ? getGame(activeGameId) : null;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ============ NAVIGATION ÉCRANS ============
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) {
      s.classList.toggle("active", s.id === id);
    });
  }
  function openSheet(id) {
    document.getElementById(id).classList.add("active");
  }
  function closeSheet(id) {
    document.getElementById(id).classList.remove("active");
  }
  function closeAllSheets() {
    document.querySelectorAll(".sheet-overlay").forEach(function (o) {
      o.classList.remove("active");
    });
  }

  // ============ ACCUEIL ============
  function renderHome() {
    var current = activeGame();
    var card = document.getElementById("active-game-card");
    if (current && !current.endedAt) {
      card.classList.remove("hidden");
      document.querySelector('[data-el="active-game-name"]').textContent = current.name;
    } else {
      card.classList.add("hidden");
    }

    var finished = games.filter(function (g) { return g.endedAt; })
      .sort(function (a, b) { return b.endedAt - a.endedAt; })
      .slice(0, 5);

    var list = document.getElementById("home-history-list");
    var hint = document.querySelector('[data-el="home-empty-hint"]');
    var title = document.querySelector('[data-el="history-title"]');
    list.innerHTML = "";
    if (finished.length === 0) {
      hint.style.display = "block";
      title.style.display = "none";
    } else {
      hint.style.display = "none";
      title.style.display = "block";
      finished.forEach(function (g) {
        list.appendChild(buildHistoryRow(g));
      });
    }
  }

  function buildHistoryRow(g) {
    var row = document.createElement("div");
    row.className = "history-row";
    var winner = getWinner(g);
    var date = new Date(g.endedAt || g.createdAt);
    var dateStr = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
    row.innerHTML =
      '<div class="history-row-info">' +
        '<div class="history-name">' + escapeHtml(g.name) + "</div>" +
        '<div class="history-meta">' + dateStr + " · " + g.players.length + " joueurs · " + g.rounds.length + " manches</div>" +
      "</div>" +
      '<div class="history-winner">' + (winner ? "🏆 " + escapeHtml(winner.name) : "") + "</div>";
    row.addEventListener("click", function () {
      openHistoryDetail(g.id);
    });
    return row;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // ============ CALCULS SCORE ============
  function totalFor(game, playerId) {
    var total = 0;
    game.rounds.forEach(function (r) {
      var v = r.scores[playerId];
      if (typeof v === "number") total += v;
    });
    return total;
  }
  function getWinner(game) {
    if (!game.players.length) return null;
    var best = null;
    game.players.forEach(function (p) {
      var t = totalFor(game, p.id);
      if (best === null || t < best.total) best = { id: p.id, name: p.name, total: t };
    });
    return best;
  }
  function ranking(game) {
    return game.players
      .map(function (p) { return { id: p.id, name: p.name, color: p.color, total: totalFor(game, p.id) }; })
      .sort(function (a, b) { return a.total - b.total; });
  }

  // ============ ÉCRAN SETUP (nouvelle partie) ============
  function openSetupScreen() {
    setupPlayers = [
      { id: uid(), name: "Joueur 1", color: COLORS[0] },
      { id: uid(), name: "Joueur 2", color: COLORS[1] }
    ];
    document.getElementById("input-game-name").value = "Skyjo";
    document.getElementById("input-target-score").value = "100";
    renderSetupPlayers();
    showScreen("screen-setup");
  }

  function renderSetupPlayers() {
    var list = document.getElementById("setup-players-list");
    list.innerHTML = "";
    setupPlayers.forEach(function (p, idx) {
      var row = document.createElement("div");
      row.className = "player-row";
      row.innerHTML =
        '<span class="dot" style="background:' + p.color + '"></span>' +
        '<span class="player-name">' + escapeHtml(p.name) + "</span>" +
        '<div class="row-actions">' +
          '<button class="small-icon-btn" data-edit="' + idx + '">✎</button>' +
          '<button class="small-icon-btn danger" data-remove="' + idx + '">✕</button>' +
        "</div>";
      list.appendChild(row);
    });
    document.getElementById("setup-hint").style.display = setupPlayers.length < 2 ? "block" : "none";
    document.getElementById("btn-start-game").disabled = setupPlayers.length < 2;

    list.querySelectorAll("[data-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openNameModal(setupPlayers[+btn.dataset.edit], function (name, color) {
          setupPlayers[+btn.dataset.edit].name = name;
          setupPlayers[+btn.dataset.edit].color = color;
          renderSetupPlayers();
        });
      });
    });
    list.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setupPlayers.splice(+btn.dataset.remove, 1);
        renderSetupPlayers();
      });
    });
  }

  function nextColor(existingColors) {
    for (var i = 0; i < COLORS.length; i++) {
      if (existingColors.indexOf(COLORS[i]) === -1) return COLORS[i];
    }
    return COLORS[existingColors.length % COLORS.length];
  }

  document.getElementById("btn-add-player-setup").addEventListener("click", function () {
    var p = { id: uid(), name: "Joueur " + (setupPlayers.length + 1), color: nextColor(setupPlayers.map(function (x) { return x.color; })) };
    openNameModal(p, function (name, color) {
      p.name = name; p.color = color;
      setupPlayers.push(p);
      renderSetupPlayers();
    }, true);
  });

  document.getElementById("btn-start-game").addEventListener("click", function () {
    if (setupPlayers.length < 2) return;
    var name = document.getElementById("input-game-name").value.trim() || "Skyjo";
    var target = parseInt(document.getElementById("input-target-score").value, 10) || 100;
    var game = {
      id: uid(),
      name: name,
      targetScore: target,
      createdAt: Date.now(),
      endedAt: null,
      players: setupPlayers.map(function (p) { return { id: p.id, name: p.name, color: p.color }; }),
      rounds: [{ scores: {} }]
    };
    games.push(game);
    activeGameId = game.id;
    saveGames();
    currentCell = { playerIndex: 0, roundIndex: 0 };
    openGameScreen();
  });

  document.querySelector('[data-action="close-setup"]').addEventListener("click", function () {
    showScreen("screen-home");
    renderHome();
  });

  // ============ MODALE NOM / COULEUR JOUEUR ============
  function openNameModal(player, onSave, isNew) {
    editingPlayerId = player.id;
    document.querySelector('[data-el="name-modal-title"]').textContent = isNew ? "Ajouter un joueur" : "Modifier le joueur";
    var input = document.getElementById("name-modal-input");
    input.value = player.name || "";
    var colorsWrap = document.getElementById("name-modal-colors");
    colorsWrap.innerHTML = "";
    var selected = player.color || COLORS[0];
    COLORS.forEach(function (c) {
      var sw = document.createElement("button");
      sw.className = "color-swatch" + (c === selected ? " selected" : "");
      sw.style.background = c;
      sw.addEventListener("click", function () {
        colorsWrap.querySelectorAll(".color-swatch").forEach(function (s) { s.classList.remove("selected"); });
        sw.classList.add("selected");
        selected = c;
      });
      colorsWrap.appendChild(sw);
    });

    function cleanup() {
      closeSheet("name-modal-overlay");
      document.getElementById("name-modal-save").onclick = null;
      document.getElementById("name-modal-cancel").onclick = null;
    }
    document.getElementById("name-modal-save").onclick = function () {
      var name = input.value.trim();
      if (!name) { input.focus(); return; }
      cleanup();
      onSave(name, selected);
    };
    document.getElementById("name-modal-cancel").onclick = function () {
      cleanup();
    };
    openSheet("name-modal-overlay");
    setTimeout(function () { input.focus(); }, 250);
  }

  // ============ ÉCRAN JEU ============
  function openGameScreen() {
    var g = activeGame();
    if (!g) return;
    document.querySelector('[data-el="game-title"]').textContent = g.name;
    renderGameTable();
    showScreen("screen-game");
  }

  function renderGameTable() {
    var g = activeGame();
    if (!g) return;
    var head = document.getElementById("score-table-head");
    var body = document.getElementById("score-table-body");
    head.innerHTML = "";
    body.innerHTML = "";

    var thName = document.createElement("th");
    thName.className = "col-name";
    thName.textContent = "Manche";
    head.appendChild(thName);
    g.rounds.forEach(function (r, ri) {
      var th = document.createElement("th");
      th.textContent = String(ri + 1);
      head.appendChild(th);
    });
    var thTotal = document.createElement("th");
    thTotal.className = "col-total";
    thTotal.textContent = "Total";
    head.appendChild(thTotal);

    g.players.forEach(function (p, pi) {
      var tr = document.createElement("tr");

      var tdName = document.createElement("td");
      tdName.className = "cell-name";
      tdName.innerHTML = '<span class="cell-name-inner"><span class="dot" style="background:' + p.color + '"></span><span class="name-text">' + escapeHtml(p.name) + "</span></span>";
      tr.appendChild(tdName);

      g.rounds.forEach(function (r, ri) {
        var td = document.createElement("td");
        var val = r.scores[p.id];
        var btn = document.createElement("button");
        var isCurrent = (pi === currentCell.playerIndex && ri === currentCell.roundIndex);
        btn.className = "score-cell-btn" + (typeof val !== "number" ? " empty" : "") + (isCurrent ? " current" : "");
        btn.textContent = typeof val === "number" ? String(val) : "–";
        btn.addEventListener("click", function () {
          currentCell = { playerIndex: pi, roundIndex: ri };
          openScoreSheet();
        });
        td.appendChild(btn);
        tr.appendChild(td);
      });

      var tdTotal = document.createElement("td");
      tdTotal.className = "cell-total";
      var total = totalFor(g, p.id);
      tdTotal.textContent = String(total);
      if (total >= g.targetScore) tdTotal.style.color = "var(--danger)";
      tr.appendChild(tdTotal);

      body.appendChild(tr);
    });

    updateFooterButtons();
    scrollTableToCurrent();
    renderChartPanel();
  }

  function scrollTableToCurrent() {
    var wrap = document.querySelector(".table-wrap");
    if (wrap) wrap.scrollLeft = wrap.scrollWidth;
  }

  function updateFooterButtons() {
    var g = activeGame();
    if (!g) return;
    document.getElementById("btn-prev-cell").disabled = (currentCell.playerIndex === 0 && currentCell.roundIndex === 0);
    var isRoundComplete = roundIsComplete(g, currentCell.roundIndex);
    var isLastRound = currentCell.roundIndex === g.rounds.length - 1;
    var mainBtn = document.getElementById("btn-new-round");
    if (isLastRound && isRoundComplete) {
      mainBtn.textContent = "Manche suivante";
      mainBtn.disabled = false;
    } else {
      mainBtn.textContent = "Manche suivante";
      mainBtn.disabled = !isRoundComplete;
    }
  }

  function roundIsComplete(g, roundIndex) {
    var r = g.rounds[roundIndex];
    if (!r) return false;
    return g.players.every(function (p) { return typeof r.scores[p.id] === "number"; });
  }

  function cellCoords(playerIndex, roundIndex) {
    return { playerIndex: playerIndex, roundIndex: roundIndex };
  }

  function moveCell(delta) {
    var g = activeGame();
    if (!g) return;
    var flatIndex = currentCell.roundIndex * g.players.length + currentCell.playerIndex;
    flatIndex += delta;
    if (flatIndex < 0) flatIndex = 0;
    var maxIndex = g.rounds.length * g.players.length - 1;
    if (flatIndex > maxIndex) flatIndex = maxIndex;
    var roundIndex = Math.floor(flatIndex / g.players.length);
    var playerIndex = flatIndex % g.players.length;
    currentCell = cellCoords(playerIndex, roundIndex);
  }

  document.getElementById("btn-prev-cell").addEventListener("click", function () {
    moveCell(-1);
    renderGameTable();
  });
  document.getElementById("btn-next-cell").addEventListener("click", function () {
    moveCell(1);
    renderGameTable();
  });

  document.getElementById("btn-new-round").addEventListener("click", function () {
    var g = activeGame();
    if (!g) return;
    if (!roundIsComplete(g, currentCell.roundIndex)) return;

    // Vérifie la fin de partie automatique
    var maxTotal = Math.max.apply(null, g.players.map(function (p) { return totalFor(g, p.id); }));
    if (maxTotal >= g.targetScore) {
      endGame(g);
      return;
    }

    g.rounds.push({ scores: {} });
    saveGames();
    currentCell = { playerIndex: 0, roundIndex: g.rounds.length - 1 };
    renderGameTable();
  });

  function endGame(g) {
    g.endedAt = Date.now();
    saveGames();
    renderEndScreen(g);
    showScreen("screen-end");
  }

  function renderEndScreen(g) {
    var rk = ranking(g);
    var winner = rk[0];
    document.querySelector('[data-el="winner-name"]').textContent = winner ? winner.name : "";
    var list = document.getElementById("end-ranking-list");
    list.innerHTML = "";
    rk.forEach(function (p, i) {
      var row = document.createElement("div");
      row.className = "rank-row" + (i === 0 ? " winner" : "");
      row.innerHTML =
        '<span class="rank-num">' + (i + 1) + "</span>" +
        '<span class="dot" style="background:' + p.color + ';width:20px;height:20px"></span>' +
        '<span class="rank-name">' + escapeHtml(p.name) + "</span>" +
        '<span class="rank-score">' + p.total + "</span>";
      list.appendChild(row);
    });
  }

  document.querySelectorAll('[data-action="end-to-home"]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeGameId = null;
      showScreen("screen-home");
      renderHome();
    });
  });

  document.querySelector('[data-action="leave-game"]').addEventListener("click", function () {
    showScreen("screen-home");
    renderHome();
  });
  document.querySelector('[data-action="resume-game"]').addEventListener("click", function () {
    openGameScreen();
  });

  // ============ BOTTOM SHEET SAISIE SCORE ============
  function openScoreSheet() {
    var g = activeGame();
    if (!g) return;
    var p = g.players[currentCell.playerIndex];
    var r = g.rounds[currentCell.roundIndex];
    var existing = r.scores[p.id];

    document.querySelector('[data-el="sheet-player-dot"]').style.background = p.color;
    document.querySelector('[data-el="sheet-player-label"]').textContent = p.name + " · Manche " + (currentCell.roundIndex + 1);

    sheetNegative = typeof existing === "number" && existing < 0;
    sheetValue = typeof existing === "number" ? String(Math.abs(existing)) : "";
    renderSheetDisplay();
    openSheet("score-sheet-overlay");
  }

  function renderSheetDisplay() {
    var display = sheetValue === "" ? "0" : sheetValue;
    document.getElementById("sheet-score-display").textContent = (sheetNegative ? "-" : "") + display;
  }

  document.querySelectorAll(".key").forEach(function (key) {
    key.addEventListener("click", function () {
      var k = key.dataset.key;
      if (k === "back") {
        sheetValue = sheetValue.slice(0, -1);
      } else if (k === "sign") {
        sheetNegative = !sheetNegative;
      } else {
        if (sheetValue.length < 3) sheetValue += k;
      }
      renderSheetDisplay();
    });
  });

  document.getElementById("btn-sheet-done").addEventListener("click", function () {
    var g = activeGame();
    if (!g) return;
    var p = g.players[currentCell.playerIndex];
    var r = g.rounds[currentCell.roundIndex];
    var num = sheetValue === "" ? 0 : parseInt(sheetValue, 10);
    if (sheetNegative) num = -num;
    r.scores[p.id] = num;
    saveGames();
    closeSheet("score-sheet-overlay");

    // avance automatiquement au joueur suivant s'il en reste dans la manche
    var g2 = activeGame();
    if (currentCell.playerIndex < g2.players.length - 1) {
      currentCell.playerIndex++;
    }
    renderGameTable();
  });

  document.getElementById("score-sheet-overlay").addEventListener("click", function (e) {
    if (e.target.id === "score-sheet-overlay") {
      closeSheet("score-sheet-overlay");
      renderGameTable();
    }
  });

  // ============ GRAPHIQUE ÉVOLUTION DES SCORES ============
  function buildScoreSeries(g) {
    var maxRound = 0, minScore = 0, maxScore = 0;
    var series = g.players.map(function (p) {
      var pts = [{ x: 0, y: 0 }];
      var running = 0;
      g.rounds.forEach(function (r, ri) {
        var v = r.scores[p.id];
        if (typeof v === "number") {
          running += v;
          pts.push({ x: ri + 1, y: running });
          if (ri + 1 > maxRound) maxRound = ri + 1;
        }
      });
      pts.forEach(function (pt) {
        if (pt.y > maxScore) maxScore = pt.y;
        if (pt.y < minScore) minScore = pt.y;
      });
      return { id: p.id, name: p.name, color: p.color, points: pts };
    });
    return { series: series, maxRound: maxRound, minScore: minScore, maxScore: maxScore };
  }

  function renderChartInto(wrap, legend) {
    var g = activeGame();
    if (!g) { wrap.innerHTML = ""; legend.innerHTML = ""; return; }

    var data = buildScoreSeries(g);
    if (data.maxRound === 0) {
      wrap.innerHTML = '<p class="chart-empty-hint">Pas encore de score enregistré.</p>';
      legend.innerHTML = "";
      return;
    }

    var W = 320, H = 190, padL = 26, padR = 14, padT = 14, padB = 22;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;

    var rangeMax = Math.max(data.maxScore, g.targetScore || 0);
    var rangeMin = Math.min(0, data.minScore);
    var pad = (rangeMax - rangeMin) * 0.08 || 5;
    rangeMax += pad;
    if (rangeMin < 0) rangeMin -= pad;
    var span = (rangeMax - rangeMin) || 1;

    function xPos(x) { return padL + (data.maxRound === 0 ? 0 : (x / data.maxRound) * innerW); }
    function yPos(y) { return padT + innerH - ((y - rangeMin) / span) * innerH; }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';

    if (g.targetScore) {
      var ty = yPos(g.targetScore);
      svg += '<line x1="' + padL + '" y1="' + ty + '" x2="' + (W - padR) + '" y2="' + ty + '" stroke="var(--text-dim)" stroke-width="1" stroke-dasharray="4 3"/>';
      svg += '<text x="' + (W - padR) + '" y="' + (ty - 4) + '" text-anchor="end" font-size="9" fill="var(--text-dim)">' + g.targetScore + '</text>';
    }

    var zy = yPos(0);
    svg += '<line x1="' + padL + '" y1="' + zy + '" x2="' + (W - padR) + '" y2="' + zy + '" stroke="var(--border)" stroke-width="1"/>';
    svg += '<text x="2" y="' + (zy + 3) + '" font-size="9" fill="var(--text-dim)">0</text>';

    data.series.forEach(function (s) {
      if (s.points.length < 2) return;
      var pathPts = s.points.map(function (pt) { return xPos(pt.x) + ',' + yPos(pt.y); }).join(' ');
      svg += '<polyline points="' + pathPts + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      s.points.forEach(function (pt, i) {
        if (i === 0) return;
        svg += '<circle cx="' + xPos(pt.x) + '" cy="' + yPos(pt.y) + '" r="2.5" fill="' + s.color + '"/>';
      });
    });

    var step = Math.ceil(data.maxRound / 6) || 1;
    for (var rr = step; rr <= data.maxRound; rr += step) {
      svg += '<text x="' + xPos(rr) + '" y="' + (H - 6) + '" font-size="9" text-anchor="middle" fill="var(--text-dim)">' + rr + '</text>';
    }
    if (data.maxRound % step !== 0) {
      svg += '<text x="' + xPos(data.maxRound) + '" y="' + (H - 6) + '" font-size="9" text-anchor="middle" fill="var(--text-dim)">' + data.maxRound + '</text>';
    }

    svg += '</svg>';
    wrap.innerHTML = svg;

    legend.innerHTML = data.series.map(function (s) {
      return '<span class="chart-legend-item"><span class="dot" style="background:' + s.color + '"></span>' + escapeHtml(s.name) + '</span>';
    }).join("");
  }

  function renderChart() {
    renderChartInto(document.getElementById("chart-wrap"), document.getElementById("chart-legend"));
  }
  function renderChartPanel() {
    renderChartInto(document.getElementById("chart-panel-wrap"), document.getElementById("chart-panel-legend"));
  }

  document.getElementById("btn-game-chart").addEventListener("click", function () {
    renderChart();
    openSheet("chart-sheet-overlay");
  });
  document.getElementById("btn-close-chart-sheet").addEventListener("click", function () {
    closeSheet("chart-sheet-overlay");
  });
  document.getElementById("chart-sheet-overlay").addEventListener("click", function (e) {
    if (e.target.id === "chart-sheet-overlay") closeSheet("chart-sheet-overlay");
  });

  // ============ MENU PARTIE ============
  document.getElementById("btn-game-menu").addEventListener("click", function () {
    openSheet("menu-sheet-overlay");
  });
  document.getElementById("menu-sheet-overlay").addEventListener("click", function (e) {
    if (e.target.id === "menu-sheet-overlay") closeSheet("menu-sheet-overlay");
  });

  document.getElementById("menu-add-player").addEventListener("click", function () {
    closeSheet("menu-sheet-overlay");
    var g = activeGame();
    if (!g) return;
    var p = { id: uid(), name: "Joueur " + (g.players.length + 1), color: nextColor(g.players.map(function (x) { return x.color; })) };
    openNameModal(p, function (name, color) {
      p.name = name; p.color = color;
      g.players.push(p);
      saveGames();
      renderGameTable();
    }, true);
  });

  document.getElementById("menu-edit-players").addEventListener("click", function () {
    closeSheet("menu-sheet-overlay");
    renderPlayersSheet();
    openSheet("players-sheet-overlay");
  });

  function renderPlayersSheet() {
    var g = activeGame();
    if (!g) return;
    var list = document.getElementById("players-sheet-list");
    list.innerHTML = "";
    g.players.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "player-row";
      row.innerHTML =
        '<span class="dot" style="background:' + p.color + '"></span>' +
        '<span class="player-name">' + escapeHtml(p.name) + "</span>" +
        '<div class="row-actions">' +
          '<button class="small-icon-btn" data-pedit="' + p.id + '">✎</button>' +
          '<button class="small-icon-btn danger" data-premove="' + p.id + '">✕</button>' +
        "</div>";
      list.appendChild(row);
    });
    list.querySelectorAll("[data-pedit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pl = g.players.find(function (x) { return x.id === btn.dataset.pedit; });
        openNameModal(pl, function (name, color) {
          pl.name = name; pl.color = color;
          saveGames();
          renderPlayersSheet();
          renderGameTable();
        });
      });
    });
    list.querySelectorAll("[data-premove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (g.players.length <= 2) {
          alertMsg("Il faut au moins 2 joueurs dans la partie.");
          return;
        }
        askConfirm("Retirer ce joueur ?", "Son historique de score dans cette partie sera perdu.", function () {
          var idx = g.players.findIndex(function (x) { return x.id === btn.dataset.premove; });
          if (idx === -1) return;
          var removedId = g.players[idx].id;
          g.players.splice(idx, 1);
          g.rounds.forEach(function (r) { delete r.scores[removedId]; });
          saveGames();
          if (currentCell.playerIndex >= g.players.length) currentCell.playerIndex = g.players.length - 1;
          renderPlayersSheet();
          renderGameTable();
        });
      });
    });
  }

  document.getElementById("btn-close-players-sheet").addEventListener("click", function () {
    closeSheet("players-sheet-overlay");
  });
  document.getElementById("players-sheet-overlay").addEventListener("click", function (e) {
    if (e.target.id === "players-sheet-overlay") closeSheet("players-sheet-overlay");
  });

  document.getElementById("menu-end-game").addEventListener("click", function () {
    closeSheet("menu-sheet-overlay");
    var g = activeGame();
    if (!g) return;
    askConfirm("Terminer la partie ?", "Le classement final sera calculé avec les scores actuels.", function () {
      endGame(g);
    });
  });

  document.getElementById("menu-delete-game").addEventListener("click", function () {
    closeSheet("menu-sheet-overlay");
    var g = activeGame();
    if (!g) return;
    askConfirm("Supprimer la partie ?", "Cette action est définitive.", function () {
      games = games.filter(function (x) { return x.id !== g.id; });
      activeGameId = null;
      saveGames();
      showScreen("screen-home");
      renderHome();
    });
  });

  // ============ CONFIRM / ALERT ============
  function askConfirm(title, text, onOk) {
    document.querySelector('[data-el="confirm-title"]').textContent = title;
    document.querySelector('[data-el="confirm-text"]').textContent = text;
    confirmCallback = onOk;
    openSheet("confirm-overlay");
  }
  document.getElementById("confirm-ok").addEventListener("click", function () {
    closeSheet("confirm-overlay");
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  });
  document.getElementById("confirm-cancel").addEventListener("click", function () {
    closeSheet("confirm-overlay");
    confirmCallback = null;
  });
  function alertMsg(text) {
    askConfirm("Info", text, null);
    document.getElementById("confirm-cancel").style.display = "none";
    var restore = function () { document.getElementById("confirm-cancel").style.display = ""; };
    document.getElementById("confirm-ok").addEventListener("click", restore, { once: true });
  }

  // ============ HISTORIQUE ============
  document.getElementById("btn-history").addEventListener("click", function () {
    renderHistoryScreen();
    showScreen("screen-history");
  });
  document.querySelector('[data-action="close-history"]').addEventListener("click", function () {
    showScreen("screen-home");
    renderHome();
  });

  function renderHistoryScreen() {
    var finished = games.filter(function (g) { return g.endedAt; })
      .sort(function (a, b) { return b.endedAt - a.endedAt; });
    var list = document.getElementById("history-list");
    var hint = document.querySelector('[data-el="history-empty-hint"]');
    list.innerHTML = "";
    if (finished.length === 0) {
      hint.style.display = "block";
    } else {
      hint.style.display = "none";
      finished.forEach(function (g) { list.appendChild(buildHistoryRow(g)); });
    }
  }

  function openHistoryDetail(gameId) {
    var g = getGame(gameId);
    if (!g) return;
    activeGameId = gameId;
    renderEndScreen(g);
    showScreen("screen-end");
  }

  // ============ NOUVELLE PARTIE / BOUTON ACCUEIL ============
  document.getElementById("btn-new-game").addEventListener("click", openSetupScreen);

  // ============ INIT ============
  function init() {
    loadGames();
    var unfinished = games.filter(function (g) { return !g.endedAt; });
    if (unfinished.length > 0) {
      activeGameId = unfinished[unfinished.length - 1].id;
    }
    renderHome();
    showScreen("screen-home");

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
