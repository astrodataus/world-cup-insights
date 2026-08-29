/* World Cup Insights — Astrodata build.
   One data pass (build.py) derives aggregates; this file renders five views
   plus a scenario modal. No external requests, no libraries. */
(function () {
  'use strict';

  var U = {
    qs: function (s, el) { return (el || document).querySelector(s); },
    qsa: function (s, el) { return [].slice.call((el || document).querySelectorAll(s)); },
    on: function (el, ev, fn) { el.addEventListener(ev, fn); },
    esc: function (v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    fmt: function (n, d) {
      if (n == null || isNaN(n)) return '–';
      var s = Number(n).toFixed(d == null ? 0 : d);
      return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
  };

  var TC = window.WC = { data: null, views: {}, state: { year: 'all', team: 'all', pos: 'all' } };

  /* ---- footer design toggle: Taliesin <-> Boletin Radiante ---- */
  function initDesign() {
    var btn = U.qs('#wc-design-toggle');
    if (!btn) return;
    function apply(d) {
      if (d === 'boletin') {
        document.documentElement.setAttribute('data-design', 'boletin');
        btn.textContent = 'Design: Boletin Radiante';
      } else {
        document.documentElement.removeAttribute('data-design');
        btn.textContent = 'Design: Taliesin';
      }
      /* both designs open dark; the theme button flips each to its light program */
      document.documentElement.setAttribute('data-theme', 'dark');
      U.qs('#wc-theme-btn').textContent = 'Light';
    }
    U.on(btn, 'click', function () {
      apply(document.documentElement.getAttribute('data-design') === 'boletin' ? 'taliesin' : 'boletin');
    });
    var m = /design=(\w+)/.exec(location.search);
    if (m) apply(m[1]);
  }

  /* ---- theme ---- */
  function initTheme() {
    var btn = U.qs('#wc-theme-btn');
    function apply(t) {
      document.documentElement.setAttribute('data-theme', t);
      btn.textContent = t === 'dark' ? 'Light' : 'Dark';
      if (window.omni && omni.setParams) { try { omni.setParams({ theme: t }); } catch (e) {} }
    }
    U.on(btn, 'click', function () {
      apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    if (window.omni && omni.theme) {
      try {
        if (omni.theme === 'light' || omni.theme === 'dark') apply(omni.theme);
        if (omni.onThemeChange) omni.onThemeChange(function (t) { if (t === 'light' || t === 'dark') apply(t); });
      } catch (e) {}
    }
  }

  /* ---- scenario ---- */
  function initScenario() {
    var modal = U.qs('#wc-scenario');
    U.on(U.qs('#wc-nav-scenario'), 'click', function (e) { e.preventDefault(); modal.hidden = false; });
    U.qsa('[data-scn-close]', modal).forEach(function (el) { U.on(el, 'click', function () { modal.hidden = true; }); });
    U.on(document, 'keydown', function (e) { if (e.key === 'Escape') modal.hidden = true; });
  }

  /* ---- narrow-width nav ---- */
  function closeNav() {
    var nav = U.qs('#wc-nav'), btn = U.qs('#wc-nav-toggle');
    if (!nav) return;
    nav.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  function initNavToggle() {
    var nav = U.qs('#wc-nav'), btn = U.qs('#wc-nav-toggle');
    if (!nav || !btn) return;
    U.on(btn, 'click', function (e) {
      e.stopPropagation();
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    /* the Scenario link and theme button also close it */
    U.on(U.qs('#wc-nav-scenario'), 'click', closeNav);
    U.on(U.qs('#wc-theme-btn'), 'click', closeNav);
    U.on(document, 'click', function (e) {
      if (!nav.classList.contains('open')) return;
      if (nav.contains(e.target) || btn.contains(e.target)) return;
      closeNav();
    });
    U.on(document, 'keydown', function (e) { if (e.key === 'Escape') closeNav(); });
  }

  /* ---- router ----
     Inside a published Omni app the page runs in a sandboxed srcdoc iframe
     with an opaque origin: touching location.hash counts as navigating away
     and the sandbox stops the app. Detect that and route entirely in memory,
     intercepting hash-link clicks; the URL bar is only used when we own it. */
  var SANDBOXED = (typeof omni !== 'undefined');
  try { if (window.origin === 'null') SANDBOXED = true; } catch (e) { SANDBOXED = true; }
  var memRoute = { view: 'tournament', param: null };
  var router = TC.router = {
    parse: function () {
      if (SANDBOXED) return { view: memRoute.view, param: memRoute.param };
      var h = (location.hash || '#/tournament').replace(/^#\/?/, '');
      var segs = h.split('/');
      return { view: segs[0] || 'tournament', param: segs.slice(1).join('/') || null };
    },
    navigate: function (view, param) {
      memRoute = { view: view, param: param || null };
      if (SANDBOXED) { router.render(); return; }
      var h = '#/' + view + (param ? '/' + param : '');
      if (location.hash === h) router.render(); else location.hash = h;
    },
    render: function () {
      var r = router.parse();
      var view = TC.views[r.view] || TC.views.tournament;
      U.qsa('#wc-nav a[data-view]').forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('data-view') === r.view);
      });
      document.documentElement.setAttribute('data-view', r.view);
      var root = U.qs('#wc-root');
      root.innerHTML = '';
      view.render(root, r.param);
      window.scrollTo(0, 0);
    }
  };

  /* ---- data helpers ---- */
  function years() { return TC.data.meta.years; }
  function inYear(row) { return TC.state.year === 'all' || String(row.tournament_year) === String(TC.state.year); }

  function shotsFiltered(opts) {
    opts = opts || {};
    return TC.data.shots.filter(function (s) {
      if (!inYear(s)) return false;
      if (!opts.ignoreTeam && TC.state.team !== 'all' && s.team !== TC.state.team) return false;
      return true;
    });
  }
  function playersFiltered(rows) {
    var useYears = TC.data.meta.players_have_years;
    return rows.filter(function (r) {
      if (useYears && !inYear(r)) return false;
      if (TC.state.pos !== 'all' && r.position_group !== TC.state.pos) return false;
      return true;
    });
  }

  function headHtml(eyebrow, title, dek) {
    return '<div class="wc-view-head">' +
      '<div class="wc-view-eyebrow upper">' + U.esc(eyebrow) + '</div>' +
      '<h1 class="wc-title">' + U.esc(title) + '</h1>' +
      '<p class="wc-dek">' + U.esc(dek) + '</p>' +
      '</div>';
  }
  function statCard(value, label, drillKey) {
    var attrs = drillKey ? ' data-drill="' + drillKey + '" role="button" tabindex="0" aria-expanded="false"' : '';
    var hint = drillKey ? '<div class="wc-stat-hint">What this means</div>' : '';
    return '<div class="wc-card wc-stat' + (drillKey ? ' wc-stat-drill' : '') + '"' + attrs + '><div class="wc-stat-value">' + U.esc(value) + '</div>' +
      '<div class="wc-stat-label">' + U.esc(label) + '</div>' + hint + '</div>';
  }

  function playerYearsLabel() {
    return TC.data.meta.players_have_years ? '' :
      '<p class="wc-note" style="margin:6px 0 0">Player figures combine all three tournaments; the source export carries no per-tournament split.</p>';
  }
  function yearChips(withAll, onchange) {
    var html = '<div class="wc-filters"><span class="wc-filter-label">Tournament</span>';
    var opts = (withAll ? ['all'] : []).concat(years());
    opts.forEach(function (y) {
      html += '<button type="button" class="wc-chipbtn' + (String(TC.state.year) === String(y) ? ' on' : '') + '" data-year="' + y + '">' + (y === 'all' ? 'All three' : y) + '</button>';
    });
    html += '</div>';
    return html;
  }
  function bindYearChips(root) {
    U.qsa('[data-year]', root).forEach(function (b) {
      U.on(b, 'click', function () { TC.state.year = b.getAttribute('data-year'); router.render(); });
    });
  }

  /* Views are appended below by build order. */

  /* ================= derived aggregates (computed once per filter state) ================= */

  function tournamentSummary(y) {
    var shots = TC.data.shots.filter(function (s) { return y === 'all' || String(s.tournament_year) === String(y); });
    var goals = 0, xg = 0;
    shots.forEach(function (s) { if (s.is_goal) goals++; if (s.xg != null) xg += s.xg; });
    return { shots: shots.length, goals: goals, xg: xg };
  }

  function groupBy(rows, key) {
    var m = {};
    rows.forEach(function (r) {
      var k = typeof key === 'function' ? key(r) : r[key];
      (m[k] = m[k] || []).push(r);
    });
    return m;
  }

  /* Inline explainers for the four landing tiles. Every figure is
     recomputed from the loaded rows, never hard-coded. */
  function perYearRows(fn) {
    var h = '';
    var maxV = 1, vals = {};
    years().forEach(function (y) { vals[y] = fn(y); maxV = Math.max(maxV, vals[y].bar); });
    years().forEach(function (y) {
      var v = vals[y];
      h += '<div class="wc-bar-row"><div class="wc-bar-label">' + y + '</div>' +
        '<div class="wc-bar-track"><div class="wc-bar-fill" style="width:' + (v.bar / maxV * 100) + '%"></div></div>' +
        '<div class="wc-bar-value" style="width:150px;white-space:nowrap">' + v.label + '</div></div>';
    });
    return h;
  }
  var TOUR_DRILLS = {
    shots: function () {
      return '<div class="wc-drill-title">What counts as a shot on record</div>' +
        '<p class="wc-drill-note">Every attempt in the source data: scored, saved, blocked, off target, and off the woodwork, from open play, set pieces, penalties and shootouts. Each one carries where it was taken, the minute, the shooter and how it ended, which is what makes The Pitch and The Race possible.</p>' +
        perYearRows(function (y) { var t = tournamentSummary(y); return { bar: t.shots, label: U.fmt(t.shots) + ' shots' }; }) +
        '<p class="wc-drill-note" style="margin:10px 0 0">2026 runs larger because the tournament expanded to forty-eight teams and one hundred four matches.</p>';
    },
    goals: function () {
      return '<div class="wc-drill-title">Goals, straight from the record</div>' +
        '<p class="wc-drill-note">A shot flagged as scored in the source. No own-goal modelling, no adjustments: this is the number that decided the matches, and it is the yardstick every other figure here gets judged against.</p>' +
        perYearRows(function (y) { var t = tournamentSummary(y); return { bar: t.goals, label: U.fmt(t.goals) + ' goals' }; });
    },
    xg: function () {
      var withXg = {}, total = {};
      years().forEach(function (y) {
        withXg[y] = 0; total[y] = 0;
        TC.data.shots.forEach(function (s) { if (String(s.tournament_year) === String(y)) { total[y]++; if (s.xg != null) withXg[y]++; } });
      });
      return '<div class="wc-drill-title">Expected goals is a probability, not a score</div>' +
        '<p class="wc-drill-note">Each shot gets a value between zero and one: the chance a typical player scores from that position and situation, estimated from thousands of historical shots. Add them up and you get how many goals the chances were worth. When real goals run ahead of xG, finishing was hot; behind, chances died. It is a lens, not a verdict.</p>' +
        perYearRows(function (y) {
          var t = tournamentSummary(y);
          return { bar: t.xg, label: U.fmt(t.xg, 0) + ' xG · ' + U.fmt(withXg[y]) + ' of ' + U.fmt(total[y]) + ' shots' };
        }) +
        '<p class="wc-drill-note" style="margin:10px 0 0">The 2018 shots carry no xG values in the source, so the total covers 2022 and 2026. That is a fact of the data, stated rather than papered over.</p>';
    },
    conv: function () {
      return '<div class="wc-drill-title">Roughly one shot in eight goes in</div>' +
        '<p class="wc-drill-note">Goals divided by shots. It looks low until you watch where shots come from on The Pitch: most are taken under pressure, from distance, or through a crowd. This rate is the honest denominator behind every highlight reel.</p>' +
        perYearRows(function (y) {
          var t = tournamentSummary(y);
          var pct = t.shots ? (t.goals / t.shots * 100) : 0;
          return { bar: pct, label: pct.toFixed(1) + '%' };
        });
    }
  };

  /* ================= view: The Tournament ================= */

  TC.views.tournament = {
    render: function (root) {
      var all = tournamentSummary(TC.state.year);
      var html = headHtml('The Tournament', 'Where goals come from',
        'Three World Cups of shots in one set of joined tables. Start with the shape of the whole thing, then follow any number into the views that explain it.');
      html += yearChips(true);

      var convPct = all.shots ? (all.goals / all.shots * 100) : 0;
      html += '<div class="wc-grid wc-grid-4 wc-mt">';
      html += statCard(U.fmt(all.shots), 'Shots on record', 'shots');
      html += statCard(U.fmt(all.goals), 'Goals', 'goals');
      html += statCard(U.fmt(all.xg, 1), 'Expected goals (xG)', 'xg');
      html += statCard(convPct.toFixed(1) + '%', 'Shots that became goals', 'conv');
      html += '</div>';
      html += '<div id="wc-tour-drill" class="wc-drill" hidden></div>';

      /* per-tournament compare */
      html += '<div class="wc-section-label">Tournament by tournament</div><div class="wc-card">';
      var maxShots = 1;
      years().forEach(function (y) { maxShots = Math.max(maxShots, tournamentSummary(y).shots); });
      years().forEach(function (y) {
        var t = tournamentSummary(y);
        html += '<div class="wc-bar-row"><div class="wc-bar-label">' + y + '</div>' +
          '<div class="wc-bar-track"><div class="wc-bar-fill" style="width:' + (t.shots / maxShots * 100) + '%"></div></div>' +
          '<div class="wc-bar-value">' + U.fmt(t.shots) + '</div>' +
          '<div class="wc-bar-value" style="width:150px;white-space:nowrap">' + U.fmt(t.goals) + ' goals · ' + U.fmt(t.xg, 0) + ' xG</div></div>';
      });
      html += '<p class="wc-note" style="margin-bottom:0">Shots per tournament, with goals and the total value of the chances beside them. When goals run ahead of xG, finishing was hot; behind, the chances were there and the finishing was not.</p></div>';

      /* danger sources */
      var shots = shotsFiltered({ ignoreTeam: true });
      html += '<div class="wc-grid wc-grid-2 wc-mt">';
      [['situation', 'Where the danger comes from'], ['body_part', 'How chances are struck']].forEach(function (spec) {
        var by = groupBy(shots, spec[0]);
        var keys = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length; });
        var maxN = keys.length ? by[keys[0]].length : 1;
        var card = '<div class="wc-card"><div class="wc-section-label" style="margin-top:0">' + spec[1] + '</div>';
        keys.slice(0, 7).forEach(function (k) {
          var rows = by[k], g = rows.filter(function (r) { return r.is_goal; }).length;
          card += '<div class="wc-bar-row"><div class="wc-bar-label">' + U.esc(k || 'unknown') + '</div>' +
            '<div class="wc-bar-track"><div class="wc-bar-fill' + (spec[0] === 'body_part' ? ' wc-bar-fill-alt' : '') + '" style="width:' + (rows.length / maxN * 100) + '%"></div></div>' +
            '<div class="wc-bar-value">' + U.fmt(rows.length) + '</div>' +
            '<div class="wc-bar-value" style="width:70px">' + U.fmt(g) + ' goals</div></div>';
        });
        card += '</div>';
        html += card;
      });
      html += '</div>';

      /* rounds */
      var byRound = groupBy(shots.filter(function (s) { return s.round_name; }), 'round_name');
      var roundKeys = Object.keys(byRound);
      if (roundKeys.length >= 2) {
        html += '<div class="wc-section-label">Round by round</div><div class="wc-card">';
        var order = ['Group', 'Round of 32', 'Round of 16', 'Quarter', 'Semi', 'Third', 'Final'];
        roundKeys.sort(function (a, b) {
          function rank(n) { for (var i = 0; i < order.length; i++) if (n.toLowerCase().indexOf(order[i].toLowerCase()) === 0) return i; return 99; }
          return rank(a) - rank(b);
        });
        var maxR = 1;
        roundKeys.forEach(function (k) { maxR = Math.max(maxR, byRound[k].length); });
        roundKeys.forEach(function (k) {
          var rows = byRound[k];
          var xgPer = rows.reduce(function (a, r) { return a + r.xg; }, 0) / rows.length;
          html += '<div class="wc-bar-row"><div class="wc-bar-label">' + U.esc(k) + '</div>' +
            '<div class="wc-bar-track"><div class="wc-bar-fill" style="width:' + (rows.length / maxR * 100) + '%"></div></div>' +
            '<div class="wc-bar-value">' + U.fmt(rows.length) + '</div>' +
            '<div class="wc-bar-value" style="width:110px">' + xgPer.toFixed(2) + ' xG / shot</div></div>';
        });
        html += '<p class="wc-note" style="margin-bottom:0">The same shot data cut by stage. Chance quality per shot is the number to watch: knockout football usually trades volume for caution.</p></div>';
      }

      root.innerHTML = html;
      bindYearChips(root);

      /* stat tile drill-ins */
      var panel = root.querySelector('#wc-tour-drill');
      var tiles = root.querySelectorAll('.wc-stat-drill');
      var openKey = null;
      function toggleDrill(tile) {
        var key = tile.getAttribute('data-drill');
        for (var i = 0; i < tiles.length; i++) {
          tiles[i].classList.remove('wc-stat-open');
          tiles[i].setAttribute('aria-expanded', 'false');
        }
        if (openKey === key) {
          openKey = null;
          panel.hidden = true;
          panel.innerHTML = '';
          return;
        }
        openKey = key;
        panel.innerHTML = TOUR_DRILLS[key]();
        panel.hidden = false;
        tile.classList.add('wc-stat-open');
        tile.setAttribute('aria-expanded', 'true');
      }
      Array.prototype.forEach.call(tiles, function (tile) {
        tile.addEventListener('click', function () { toggleDrill(tile); });
        tile.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDrill(tile); }
        });
      });
    }
  };

  /* ================= view: The Pitch ================= */

  function pitchSvg(shots, selIdx, opts) {
    /* Attacking half, goal at top. Data extents from meta; normalized to a
       68x52.5 half-pitch viewBox (x across, y toward goal). */
    var ex = TC.data.meta.extents; /* {x_min,x_max,y_min,y_max} */
    var W = 680, H = 540, PAD = 24;
    function px(s) { return PAD + (s.x - ex.x_min) / (ex.x_max - ex.x_min || 1) * (W - 2 * PAD); }
    function py(s) { return H - PAD - (s.y - ex.y_min) / (ex.y_max - ex.y_min || 1) * (H - 2 * PAD); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Shot map">';
    /* pitch furniture: outline, penalty box, six-yard, spot, arc, goal */
    var gx = W / 2;
    svg += '<rect x="' + PAD + '" y="' + PAD + '" width="' + (W - 2 * PAD) + '" height="' + (H - 2 * PAD) + '" class="wc-pitch-line"/>';
    svg += '<rect x="' + (gx - 161) + '" y="' + PAD + '" width="322" height="129" class="wc-pitch-line"/>';
    svg += '<rect x="' + (gx - 73) + '" y="' + PAD + '" width="146" height="47" class="wc-pitch-line"/>';
    svg += '<circle cx="' + gx + '" cy="' + (PAD + 86) + '" r="2.6" fill="var(--pitch-line)"/>';
    svg += '<path d="M ' + (gx - 58) + ' ' + (PAD + 129) + ' A 72 72 0 0 0 ' + (gx + 58) + ' ' + (PAD + 129) + '" class="wc-pitch-line"/>';
    svg += '<line x1="' + (gx - 58) + '" y1="' + PAD + '" x2="' + (gx + 58) + '" y2="' + PAD + '" stroke="var(--ink)" stroke-width="3"/>';
    shots.forEach(function (s, i) {
      var r = 2.2 + Math.sqrt(Math.max(s.xg || 0, 0.005)) * 9;
      svg += '<circle data-shot="' + i + '" class="wc-shot ' + (s.is_goal ? 'goal' : 'miss') + (i === selIdx ? ' sel' : '') + '" cx="' + px(s).toFixed(1) + '" cy="' + py(s).toFixed(1) + '" r="' + r.toFixed(1) + '"><title>' + U.esc(s.player + ' · ' + s.matchup + ' · xG ' + (s.xg != null ? s.xg.toFixed(2) : 'n/a')) + '</title></circle>';
    });
    svg += '</svg>';
    return svg;
  }

  TC.views.pitch = {
    render: function (root, param) {
      var teams = Object.keys(groupBy(TC.data.shots.filter(inYear), 'team')).sort();
      var shots = shotsFiltered();
      var selIdx = param != null ? parseInt(param, 10) : null;
      if (selIdx != null && (isNaN(selIdx) || selIdx >= shots.length)) selIdx = null;

      var html = headHtml('The Pitch', 'Every shot, where it was taken',
        'Circle area is the value of the chance. Gold went in. Click any shot and it explains itself: who, when, from where, and what the chance was worth.');
      html += yearChips(true);
      html += '<div class="wc-filters"><span class="wc-filter-label">Team</span>' +
        '<select class="wc-select" id="wc-team-sel"><option value="all">All teams</option>' +
        teams.map(function (t) { return '<option' + (TC.state.team === t ? ' selected' : '') + '>' + U.esc(t) + '</option>'; }).join('') +
        '</select><span class="wc-bar-value" style="width:auto">' + U.fmt(shots.length) + ' shots · ' + U.fmt(shots.filter(function (s) { return s.is_goal; }).length) + ' goals</span></div>';

      html += '<div class="wc-grid wc-grid-split" style="--split:1.6fr 1fr;">';
      html += '<div class="wc-pitch-wrap">' + pitchSvg(shots, selIdx) +
        '<div class="wc-legend"><span><span class="wc-dot" style="background:var(--goal)"></span>Goal</span>' +
        '<span><span class="wc-dot" style="background:var(--miss);opacity:.55"></span>No goal</span>' +
        '<span>Area = xG</span></div></div>';

      /* side column: selection detail or the best chances list */
      html += '<div>';
      if (selIdx != null) {
        var s = shots[selIdx];
        html += '<div class="wc-detail"><div class="wc-view-eyebrow upper" style="margin-bottom:4px">Shot detail</div>' +
          '<div class="wc-detail-title">' + U.esc(s.player) + '</div>' +
          '<div class="wc-kv">' + U.esc(s.team) + ' · ' + U.esc(s.matchup) + (s.round_name ? ' · ' + U.esc(s.round_name) : '') + ' · ' + s.tournament_year + '</div>' +
          '<div class="wc-detail-kv">' +
          '<span class="wc-kv">Minute <b>' + U.esc(s.minute) + '</b></span>' +
          '<span class="wc-kv">xG <b>' + (s.xg != null ? s.xg.toFixed(2) : 'not recorded') + '</b></span>' +
          '<span class="wc-kv">Outcome <b>' + (s.is_goal ? 'Goal' : 'No goal') + '</b></span>' +
          '<span class="wc-kv">Situation <b>' + U.esc(s.situation || '–') + '</b></span>' +
          '<span class="wc-kv">Type <b>' + U.esc(s.shot_type || '–') + '</b></span>' +
          '<span class="wc-kv">Struck with <b>' + U.esc(s.body_part || '–') + '</b></span>' +
          '</div>' +
          '<a class="wc-chipbtn" style="display:inline-block;margin-top:14px;text-decoration:none" href="#/race/' + encodeURIComponent(s.tournament_year + '|' + s.matchup) + '">Replay this match →</a>' +
          '</div>';
      }
      var best = shots.filter(function (s) { return s.xg != null; }).sort(function (a, b) { return b.xg - a.xg; }).slice(0, 10);
      html += '<div class="wc-card wc-mt" style="margin-top:' + (selIdx != null ? '14px' : '0') + '"><div class="wc-section-label" style="margin-top:0">The ten biggest chances' + (TC.state.team !== 'all' ? ' · ' + U.esc(TC.state.team) : '') + '</div><table class="wc-table"><tbody>';
      best.forEach(function (s) {
        var i = shots.indexOf(s);
        html += '<tr data-goto="' + i + '"><td>' + U.esc(s.player) + '</td><td>' + U.esc(s.matchup) + '</td><td class="num">' + (s.xg != null ? s.xg.toFixed(2) : '–') + '</td><td class="num">' + (s.is_goal ? '<span style="color:var(--accent)">Goal</span>' : 'Missed') + '</td></tr>';
      });
      html += '</tbody></table><p class="wc-note" style="margin-bottom:0">A 0.7 xG chance missed is a story; a 0.03 screamer scored is a highlight, not a habit.</p></div>';
      html += '</div></div>';

      root.innerHTML = html;
      bindYearChips(root);
      U.on(U.qs('#wc-team-sel', root), 'change', function (e) { TC.state.team = e.target.value; router.navigate('pitch'); router.render(); });
      U.qsa('[data-shot]', root).forEach(function (c) {
        U.on(c, 'click', function () { router.navigate('pitch', c.getAttribute('data-shot')); });
      });
      U.qsa('[data-goto]', root).forEach(function (tr) {
        U.on(tr, 'click', function () { router.navigate('pitch', tr.getAttribute('data-goto')); });
      });
    }
  };

  /* ================= view: Finishing ================= */

  function scatterSvg(rows, xKey, yKey, opts) {
    var W = 720, H = 460, P = 44;
    var xs = rows.map(function (r) { return r[xKey]; }), ys = rows.map(function (r) { return r[yKey]; });
    var xMax = Math.max.apply(null, xs.concat([1])), yMax = Math.max.apply(null, ys.concat([1]));
    var m = Math.max(xMax, yMax) * 1.06;
    function sx(v) { return P + v / m * (W - 2 * P); }
    function sy(v) { return H - P - v / m * (H - 2 * P); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + U.esc(opts.label) + '">';
    for (var g = 0; g <= m; g += Math.max(1, Math.round(m / 6))) {
      svg += '<line class="wc-gridline" x1="' + sx(g) + '" y1="' + (H - P) + '" x2="' + sx(g) + '" y2="' + P + '"/>' +
        '<line class="wc-gridline" x1="' + P + '" y1="' + sy(g) + '" x2="' + (W - P) + '" y2="' + sy(g) + '"/>' +
        '<text x="' + sx(g) + '" y="' + (H - P + 16) + '" text-anchor="middle">' + g + '</text>' +
        '<text x="' + (P - 8) + '" y="' + (sy(g) + 3) + '" text-anchor="end">' + g + '</text>';
    }
    svg += '<line x1="' + sx(0) + '" y1="' + sy(0) + '" x2="' + sx(m) + '" y2="' + sy(m) + '" stroke="var(--faint)" stroke-dasharray="5 5" stroke-width="1"/>';
    svg += '<line class="wc-axis" x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '"/>';
    svg += '<line class="wc-axis" x1="' + P + '" y1="' + (H - P) + '" x2="' + P + '" y2="' + P + '"/>';
    svg += '<text x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + U.esc(opts.xLabel) + '</text>';
    svg += '<text transform="rotate(-90)" x="-' + (H / 2) + '" y="14" text-anchor="middle">' + U.esc(opts.yLabel) + '</text>';
    rows.forEach(function (r) {
      var over = r[yKey] - r[xKey];
      var col = over > 0.75 ? 'var(--pos)' : (over < -0.75 ? 'var(--neg)' : 'var(--miss)');
      svg += '<circle data-player="' + U.esc(r.name) + '" cx="' + sx(r[xKey]).toFixed(1) + '" cy="' + sy(r[yKey]).toFixed(1) + '" r="4" fill="' + col + '" opacity="0.8" style="cursor:pointer"><title>' + U.esc(r.name + (r.tournament_year ? ' (' + r.tournament_year + ')' : '') + ' · ' + opts.yLabel + ' ' + r[yKey] + ' · ' + opts.xLabel + ' ' + r[xKey].toFixed(1)) + '</title></circle>';
    });
    svg += '</svg>';
    return svg;
  }

  TC.views.finishing = {
    render: function (root) {
      var rows = playersFiltered(TC.data.finishing).filter(function (r) { return r.expected_goals_sum >= 0.5 || r.goals_sum > 0; });
      var positions = Object.keys(groupBy(TC.data.finishing, 'position_group')).sort();

      var html = headHtml('Finishing', 'Output against expectation',
        'Every dot is a player at one tournament: chances worth this much (across), goals actually scored (up). The dashed line is exactly-as-expected. Above it, finishing added goals; below it, chances died.');
      html += yearChips(true);
      html += '<div class="wc-filters"><span class="wc-filter-label">Position</span>' +
        '<button type="button" class="wc-chipbtn' + (TC.state.pos === 'all' ? ' on' : '') + '" data-pos="all">All</button>' +
        positions.map(function (p) { return '<button type="button" class="wc-chipbtn' + (TC.state.pos === p ? ' on' : '') + '" data-pos="' + U.esc(p) + '">' + U.esc(p) + '</button>'; }).join('') + '</div>';

      html += '<div class="wc-card wc-chart-card wc-mt">' +
        scatterSvg(rows, 'expected_goals_sum', 'goals_sum', { label: 'Goals vs expected goals', xLabel: 'Expected goals', yLabel: 'Goals' }) +
        '<div class="wc-legend"><span><span class="wc-dot" style="background:var(--accent)"></span>Well over expectation</span>' +
        '<span><span class="wc-dot" style="background:var(--turquoise)"></span>About expected</span>' +
        '<span><span class="wc-dot" style="background:var(--terracotta)"></span>Well under</span></div></div>';

      /* best and worst */
      var ranked = rows.slice().sort(function (a, b) { return (b.goals_sum - b.expected_goals_sum) - (a.goals_sum - a.expected_goals_sum); });
      function finTable(list, title, note) {
        var t = '<div class="wc-card"><div class="wc-section-label" style="margin-top:0">' + title + '</div><table class="wc-table"><thead><tr><th>Player</th><th>Year</th><th class="num">Goals</th><th class="num">xG</th><th class="num">Δ</th></tr></thead><tbody>';
        list.forEach(function (r) {
          var d = r.goals_sum - r.expected_goals_sum;
          t += '<tr><td>' + U.esc(r.name) + ' <span class="wc-pos-tag">' + U.esc(r.position_group || '') + '</span></td><td class="num">' + (r.tournament_year || 'All') + '</td><td class="num">' + r.goals_sum + '</td><td class="num">' + r.expected_goals_sum.toFixed(1) + '</td><td class="num" style="color:' + (d >= 0 ? 'var(--pos)' : 'var(--neg)') + '">' + (d >= 0 ? '+' : '') + d.toFixed(1) + '</td></tr>';
        });
        return t + '</tbody></table><p class="wc-note" style="margin-bottom:0">' + note + '</p></div>';
      }
      html += '<div class="wc-grid wc-grid-2 wc-mt">';
      html += finTable(ranked.slice(0, 8), 'Most over expectation', 'Goals the chances did not fully promise. Some of this is elite finishing; some is a hot month. The next tournament usually says which.');
      html += finTable(ranked.slice(-8).reverse(), 'Most under expectation', 'The chances were there. For a scout, this list is where value hides: the process is right and the price is down.');
      html += '</div>';

      root.innerHTML = html;
      bindYearChips(root);
      U.qsa('[data-pos]', root).forEach(function (b) {
        U.on(b, 'click', function () { TC.state.pos = b.getAttribute('data-pos'); router.render(); });
      });
    }
  };

  /* ================= view: The Race (cumulative xG per match) ================= */

  TC.views.race = {
    render: function (root, param) {
      var shots = TC.data.shots.filter(inYear);
      var byMatch = groupBy(shots, function (s) { return s.tournament_year + '|' + s.matchup; });
      var matchKeys = Object.keys(byMatch).sort();
      var sel = param ? decodeURIComponent(param) : null;
      if (!sel || !byMatch[sel]) {
        /* default: the match with the most combined xG in scope */
        sel = matchKeys.slice().sort(function (a, b) {
          function tot(k) { return byMatch[k].reduce(function (x, s) { return x + (s.xg || 0); }, 0); }
          return tot(b) - tot(a);
        })[0];
      }
      var rows = (byMatch[sel] || []).slice().sort(function (a, b) { return a.minute - b.minute; });
      var teams = Object.keys(groupBy(rows, 'team'));

      var html = headHtml('The Race', 'A match as minute-by-minute chance value',
        'Each line climbs as its team creates. A goal is a dot on the line. The final gap between a line and its dots is the story of the match: who deserved what, and who took it.');
      html += yearChips(true);
      html += '<div class="wc-filters"><span class="wc-filter-label">Match</span>' +
        '<select class="wc-select" id="wc-match-sel">' +
        matchKeys.map(function (k) {
          var p = k.split('|');
          return '<option value="' + U.esc(encodeURIComponent(k)) + '"' + (k === sel ? ' selected' : '') + '>' + U.esc(p[1] + ' · ' + p[0]) + '</option>';
        }).join('') + '</select></div>';

      /* build cumulative series */
      var W = 860, H = 420, P = 46;
      var maxMin = Math.max(95, Math.max.apply(null, rows.map(function (s) { return s.minute; }).concat([0])) + 2);
      var series = teams.map(function (t, ti) {
        var pts = [{ m: 0, v: 0 }], v = 0;
        rows.forEach(function (s) { if (s.team === t) { v += (s.xg || 0); pts.push({ m: s.minute, v: v, goal: !!s.is_goal, s: s }); } });
        pts.push({ m: maxMin, v: v });
        return { team: t, pts: pts, total: v, goals: rows.filter(function (s) { return s.team === t && s.is_goal; }).length, color: ti === 0 ? 'var(--goal)' : 'var(--miss)' };
      });
      var vMax = Math.max.apply(null, series.map(function (s) { return s.total; }).concat([1])) * 1.15;
      function sx(m) { return P + m / maxMin * (W - 2 * P); }
      function sy(v) { return H - P - v / vMax * (H - 2 * P); }
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
      [15, 30, 45, 60, 75, 90].forEach(function (m) {
        svg += '<line class="wc-gridline" x1="' + sx(m) + '" y1="' + P + '" x2="' + sx(m) + '" y2="' + (H - P) + '"/>' +
          '<text x="' + sx(m) + '" y="' + (H - P + 16) + '" text-anchor="middle">' + m + "'" + '</text>';
      });
      svg += '<line class="wc-axis" x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '"/>';
      series.forEach(function (s) {
        var d = '';
        s.pts.forEach(function (p, i) {
          d += (i === 0 ? 'M' : 'L') + sx(p.m).toFixed(1) + ' ' + sy(p.v).toFixed(1) + ' ';
        });
        svg += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.4"/>';
        s.pts.forEach(function (p) {
          if (p.goal) svg += '<circle cx="' + sx(p.m).toFixed(1) + '" cy="' + sy(p.v).toFixed(1) + '" r="5.5" fill="' + s.color + '" stroke="var(--paper)" stroke-width="1.6"><title>' + U.esc(p.s.player + ' scores, minute ' + p.m) + '</title></circle>';
        });
        svg += '<text x="' + (W - P + 4) + '" y="' + sy(s.total) + '" fill="' + s.color + '">' + s.total.toFixed(1) + '</text>';
      });
      svg += '</svg>';

      html += '<div class="wc-card wc-chart-card wc-mt">' + svg +
        '<div class="wc-legend">' + series.map(function (s) {
          return '<span><span class="wc-dot" style="background:' + s.color + '"></span>' + U.esc(s.team) + ' · ' + s.goals + ' goals from ' + s.total.toFixed(1) + ' xG</span>';
        }).join('') + '</div></div>';

      /* the shot log */
      html += '<div class="wc-card wc-mt"><div class="wc-section-label" style="margin-top:0">Shot log</div><table class="wc-table"><thead><tr><th>Min</th><th>Team</th><th>Player</th><th>Situation</th><th class="num">xG</th><th class="num">Outcome</th></tr></thead><tbody>';
      rows.forEach(function (s) {
        html += '<tr><td class="num">' + s.minute + "'" + '</td><td>' + U.esc(s.team) + '</td><td>' + U.esc(s.player) + '</td><td>' + U.esc(s.situation || '–') + '</td><td class="num">' + (s.xg != null ? s.xg.toFixed(2) : '–') + '</td><td class="num">' + (s.is_goal ? '<span style="color:var(--accent)">Goal</span>' : '·') + '</td></tr>';
      });
      html += '</tbody></table></div>';

      root.innerHTML = html;
      bindYearChips(root);
      U.on(U.qs('#wc-match-sel', root), 'change', function (e) { router.navigate('race', e.target.value); });
    }
  };

  /* ================= view: Creators (leaderboard + radar) ================= */

  function radarSvg(rowA, rowB) {
    /* Six axes, values normalized 0..1 against the field's max for that metric. */
    var METRICS = [
      ['avg_rating', 'Rating'],
      ['duel_win_pct', 'Duels won %'],
      ['dribble_success_pct', 'Dribbles %'],
      ['tackle_success_pct', 'Tackles %'],
      ['passes_per_90', 'Passes /90'],
      ['matches_played', 'Matches']
    ];
    var field = TC.data.radar;
    var maxes = {};
    METRICS.forEach(function (m) {
      maxes[m[0]] = Math.max.apply(null, field.map(function (r) { return r[m[0]] || 0; }).concat([1]));
    });
    var W = 460, H = 420, CX = W / 2, CY = H / 2 + 6, R = 140;
    function pt(i, frac) {
      var ang = -Math.PI / 2 + i * 2 * Math.PI / METRICS.length;
      return [(CX + Math.cos(ang) * R * frac).toFixed(1), (CY + Math.sin(ang) * R * frac).toFixed(1)];
    }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var d = METRICS.map(function (_, i) { var p = pt(i, f); return p[0] + ',' + p[1]; }).join(' ');
      svg += '<polygon points="' + d + '" fill="none" class="wc-gridline"/>';
    });
    METRICS.forEach(function (m, i) {
      var p = pt(i, 1), pl = pt(i, 1.17);
      svg += '<line class="wc-gridline" x1="' + CX + '" y1="' + CY + '" x2="' + p[0] + '" y2="' + p[1] + '"/>';
      svg += '<text x="' + pl[0] + '" y="' + pl[1] + '" text-anchor="middle">' + m[1] + '</text>';
    });
    [[rowA, 'var(--accent)'], [rowB, 'var(--turquoise)']].forEach(function (spec) {
      var r = spec[0];
      if (!r) return;
      var d = METRICS.map(function (m, i) {
        var p = pt(i, Math.min(1, (r[m[0]] || 0) / maxes[m[0]]));
        return p[0] + ',' + p[1];
      }).join(' ');
      svg += '<polygon points="' + d + '" fill="' + spec[1] + '" opacity="0.18" stroke="' + spec[1] + '" stroke-width="2"/>';
    });
    svg += '</svg>';
    return svg;
  }

  TC.views.creators = {
    render: function (root, param) {
      var rows = playersFiltered(TC.data.creators).slice().sort(function (a, b) { return b.big_chances_created_sum - a.big_chances_created_sum || b.key_passes_sum - a.key_passes_sum; });
      var positions = Object.keys(groupBy(TC.data.creators, 'position_group')).sort();
      var parts = (param ? decodeURIComponent(param) : '').split('~');
      function findRadar(nameYear) {
        if (!nameYear) return null;
        var p = nameYear.split('|');
        return TC.data.radar.filter(function (r) { return r.name === p[0] && String(r.tournament_year || 'all') === p[1]; })[0] || null;
      }
      var selA = findRadar(parts[0]) || (rows[0] ? findRadar(rows[0].name + '|' + rows[0].tournament_year) : null);
      var selB = findRadar(parts[1]);

      var html = headHtml('Creators', 'The players who make the chances',
        'Goals get the replays; someone made them possible. Ranked by big chances created, with expected assists beside actual assists so luck cannot hide. Click one row to profile a player, a second to compare.');
      if (TC.data.meta.players_have_years) html += yearChips(true);
      html += playerYearsLabel();
      html += '<div class="wc-filters"><span class="wc-filter-label">Position</span>' +
        '<button type="button" class="wc-chipbtn' + (TC.state.pos === 'all' ? ' on' : '') + '" data-pos="all">All</button>' +
        positions.map(function (p) { return '<button type="button" class="wc-chipbtn' + (TC.state.pos === p ? ' on' : '') + '" data-pos="' + U.esc(p) + '">' + U.esc(p) + '</button>'; }).join('') + '</div>';

      html += '<div class="wc-grid wc-grid-split" style="--split:1.35fr 1fr;">';
      html += '<div class="wc-card"><table class="wc-table"><thead><tr><th>Player</th><th class="num">Year</th><th class="num">Key passes</th><th class="num">Big chances</th><th class="num">Assists</th><th class="num">xA</th><th class="num">Δ</th></tr></thead><tbody>';
      rows.slice(0, 24).forEach(function (r) {
        var key = encodeURIComponent(r.name + '|' + (r.tournament_year || 'all'));
        var isA = selA && selA.name === r.name && String(selA.tournament_year || 'all') === String(r.tournament_year || 'all');
        var isB = selB && selB.name === r.name && String(selB.tournament_year || 'all') === String(r.tournament_year || 'all');
        html += '<tr data-key="' + key + '" class="' + (isA || isB ? 'sel' : '') + '"><td>' + (isA ? '<span class="wc-dot" style="background:var(--accent)"></span>' : (isB ? '<span class="wc-dot" style="background:var(--turquoise)"></span>' : '')) + U.esc(r.name) + ' <span class="wc-pos-tag">' + U.esc(r.position_group || '') + '</span></td>' +
          '<td class="num">' + (r.tournament_year || 'All') + '</td>' +
          '<td class="num">' + U.fmt(r.key_passes_sum) + '</td>' +
          '<td class="num">' + U.fmt(r.big_chances_created_sum) + '</td>' +
          '<td class="num">' + U.fmt(r.assists_sum) + '</td>' +
          '<td class="num">' + (r.expected_assists_sum != null ? r.expected_assists_sum.toFixed(1) : '–') + '</td>' +
          '<td class="num" style="color:' + (r.assists_minus_xa >= 0 ? 'var(--pos)' : 'var(--neg)') + '">' + (r.assists_minus_xa >= 0 ? '+' : '') + (r.assists_minus_xa != null ? r.assists_minus_xa.toFixed(1) : '–') + '</td></tr>';
      });
      html += '</tbody></table><p class="wc-note" style="margin-bottom:0">Δ is assists minus expected assists. A big positive delta usually means teammates finished well, not that the passes were better.</p></div>';

      html += '<div><div class="wc-card wc-chart-card">' +
        '<div class="wc-section-label" style="margin-top:0">Profile' + (selB ? ' · comparison' : '') + '</div>' +
        radarSvg(selA, selB) +
        '<div class="wc-legend">' +
        (selA ? '<span><span class="wc-dot" style="background:var(--accent)"></span>' + U.esc(selA.name) + (selA.tournament_year ? ' · ' + selA.tournament_year : '') + '</span>' : '') +
        (selB ? '<span><span class="wc-dot" style="background:var(--turquoise)"></span>' + U.esc(selB.name) + (selB.tournament_year ? ' · ' + selB.tournament_year : '') + '</span>' : '<span>Click a second row to compare</span>') +
        '</div>' +
        (selA ? '<div class="wc-detail-kv">' +
          '<span class="wc-kv">Minutes <b>' + U.fmt(selA.minutes_sum) + '</b></span>' +
          '<span class="wc-kv">Matches <b>' + U.fmt(selA.matches_played) + '</b></span>' +
          '<span class="wc-kv">Rating <b>' + (selA.avg_rating != null ? selA.avg_rating.toFixed(2) : '–') + '</b></span>' +
          '<span class="wc-kv">Team <b>' + U.esc(selA.team || '–') + '</b></span>' +
          '</div>' : '') +
        '<p class="wc-note" style="margin-bottom:0">Each axis is scaled to the best value in the whole field, so the shape reads as "how close to the ceiling", not raw units.</p>' +
        '</div></div>';
      html += '</div>';

      root.innerHTML = html;
      bindYearChips(root);
      U.qsa('[data-pos]', root).forEach(function (b) {
        U.on(b, 'click', function () { TC.state.pos = b.getAttribute('data-pos'); router.render(); });
      });
      U.qsa('[data-key]', root).forEach(function (tr) {
        U.on(tr, 'click', function () {
          var k = decodeURIComponent(tr.getAttribute('data-key'));
          var a = selA ? selA.name + '|' + (selA.tournament_year || 'all') : '';
          if (!selA || k === a) { router.navigate('creators', encodeURIComponent(k)); }
          else { router.navigate('creators', encodeURIComponent(a) + '~' + encodeURIComponent(k)); }
        });
      });
    }
  };

  /* ================= boot ================= */

  function start() {
    initDesign();
    initTheme();
    initScenario();
    initNavToggle();
    U.qs('#wc-meta-line').textContent = 'Tournaments ' + TC.data.meta.years.join(' · ') + ' — ' + U.fmt(TC.data.shots.length) + ' shots';
    /* hash links route through the router so the sandbox never sees a
       navigation; outside the sandbox the URL still updates normally */
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#/"]') : null;
      if (!a) return;
      e.preventDefault();
      var segs = a.getAttribute('href').replace(/^#\/?/, '').split('/');
      closeNav();
      router.navigate(segs[0] || 'tournament', segs.slice(1).join('/') || null);
    });
    if (!SANDBOXED) window.addEventListener('hashchange', router.render);
    router.render();
  }

  WCData.load().then(function (d) {
    TC.data = d;
    start();
  }).catch(function (err) {
    U.qs('#wc-root').innerHTML = '<div class="wc-card" style="margin-top:40px"><b>Could not load data.</b><p class="wc-note">' + U.esc(err && err.message || err) + '</p></div>';
  });
})();
