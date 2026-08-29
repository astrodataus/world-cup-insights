/* WCData — one accessor, three modes: fetch (GitHub Pages), embedded
   (standalone.html), omni (published Omni app via saved workbook queries). */
var WCData = (function () {
  'use strict';
  var MODE = '__WC_MODE__'; /* build.py sets: fetch | embedded | omni */

  /* ---- normalization ---- */
  function normKey(k) {
    return String(k || '').trim().toLowerCase()
      .replace(/^.*\./, '')            /* strip omni view prefixes */
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  var ALIAS = {
    tournament_year: ['tournament_year', 'year'],
    matchup: ['matchup', 'match'],
    round_name: ['round_name', 'round'],
    team: ['team', 'teams_name', 'team_name', 'ee_sandbox_ee_fifa_parsed_teams_parsed_name'],
    player: ['shooter', 'player', 'players_name', 'name_1'],
    minute: ['time_minute', 'minute'],
    x: ['player_x', 'x'],
    y: ['player_y', 'y'],
    xg: ['xg', 'expected_goals'],
    shot_type: ['shot_type'],
    situation: ['situation'],
    body_part: ['body_part'],
    is_goal: ['is_goal', 'goal'],
    name: ['name', 'players_name', 'player', 'ee_sandbox_ee_fifa_parsed_players_parsed_name'],
    position_group: ['position_group', 'position'],
    minutes_sum: ['minutes_sum', 'minutes', 'minutes_played'],
    expected_goals_sum: ['expected_goals_sum', 'xg'],
    goals_sum: ['goals_sum', 'goals'],
    assists_sum: ['assists_sum', 'assists'],
    expected_assists_sum: ['expected_assists_sum', 'xa'],
    key_passes_sum: ['key_passes_sum', 'key_passes'],
    big_chances_created_sum: ['big_chances_created_sum', 'big_chances_created'],
    assists_minus_xa: ['assists_minus_xa', 'assists_xa'],
    avg_rating: ['avg_rating', 'rating'],
    duel_win_pct: ['duel_win_pct', 'duel_win'],
    dribble_success_pct: ['dribble_success_pct', 'dribble_success'],
    tackle_success_pct: ['tackle_success_pct', 'tackle_success'],
    passes_per_90: ['passes_per_90'],
    matches_played: ['matches_played', 'matches']
  };
  function remap(rows, wanted, numeric, boolish) {
    if (!rows.length) return [];
    var keys = Object.keys(rows[0]);
    var lookup = {};
    keys.forEach(function (k) { lookup[normKey(k)] = k; });
    var pick = {};
    wanted.forEach(function (w) {
      var srcs = ALIAS[w] || [w];
      for (var i = 0; i < srcs.length; i++) {
        if (lookup[srcs[i]] != null) { pick[w] = lookup[srcs[i]]; return; }
      }
    });
    return rows.map(function (r) {
      var out = {};
      wanted.forEach(function (w) {
        var v = pick[w] != null ? r[pick[w]] : null;
        if (v === '' || v == null || v === '∅') v = null;
        if (numeric.indexOf(w) !== -1 && v != null) v = parseFloat(v);
        if (boolish.indexOf(w) !== -1) v = (v === true || v === 'true' || v === 'TRUE' || v === '1' || v === 1 || v === 'Yes');
        out[w] = v;
      });
      return out;
    });
  }

  var SHOT_COLS = ['tournament_year', 'matchup', 'round_name', 'team', 'player', 'minute', 'x', 'y', 'xg', 'shot_type', 'situation', 'body_part', 'is_goal'];
  var SHOT_NUM = ['tournament_year', 'minute', 'x', 'y', 'xg'];
  var FIN_COLS = ['tournament_year', 'name', 'team', 'position_group', 'minutes_sum', 'matches_played', 'expected_goals_sum', 'goals_sum', 'assists_sum', 'expected_assists_sum'];
  var FIN_NUM = ['tournament_year', 'minutes_sum', 'matches_played', 'expected_goals_sum', 'goals_sum', 'assists_sum', 'expected_assists_sum'];
  var RAD_COLS = ['tournament_year', 'name', 'team', 'position_group', 'avg_rating', 'duel_win_pct', 'dribble_success_pct', 'tackle_success_pct', 'passes_per_90', 'minutes_sum', 'matches_played'];
  var RAD_NUM = ['tournament_year', 'avg_rating', 'duel_win_pct', 'dribble_success_pct', 'tackle_success_pct', 'passes_per_90', 'minutes_sum', 'matches_played'];
  var CRE_COLS = ['tournament_year', 'name', 'team', 'position_group', 'key_passes_sum', 'big_chances_created_sum', 'assists_sum', 'expected_assists_sum', 'assists_minus_xa'];
  var CRE_NUM = ['tournament_year', 'key_passes_sum', 'big_chances_created_sum', 'assists_sum', 'expected_assists_sum', 'assists_minus_xa'];

  function assemble(raw) {
    /* Shots with no xG value in the source (about a third: posts, blocks,
       some set pieces) are kept for the map and logs; only xG sums skip them. */
    var shots = remap(raw.shots, SHOT_COLS, SHOT_NUM, ['is_goal'])
      .filter(function (s) { return s.x != null && s.y != null; });
    var finishing = remap(raw.finishing, FIN_COLS, FIN_NUM, []).filter(function (r) { return r.name; });
    var radar = remap(raw.radar, RAD_COLS, RAD_NUM, []).filter(function (r) { return r.name; });
    var creators = remap(raw.creators, CRE_COLS, CRE_NUM, []).filter(function (r) { return r.name; });

    /* Radar percentages arrive as 0-1 fractions; present as 0-100. */
    radar.forEach(function (r) {
      ['duel_win_pct', 'dribble_success_pct', 'tackle_success_pct'].forEach(function (k) {
        if (r[k] != null && r[k] <= 1.5) r[k] = Math.round(r[k] * 1000) / 10;
      });
    });

    /* The player tables may arrive without a tournament_year column
       (all three tournaments combined per player). Flag it so views adapt. */
    var playersHaveYears = finishing.some(function (r) { return r.tournament_year != null; });

    var yearSet = {};
    shots.forEach(function (s) { if (s.tournament_year) yearSet[s.tournament_year] = 1; });
    var years = Object.keys(yearSet).map(Number).sort();
    var xs = shots.map(function (s) { return s.x; }), ys = shots.map(function (s) { return s.y; });
    var meta = {
      years: years,
      players_have_years: playersHaveYears,
      extents: {
        x_min: Math.min.apply(null, xs), x_max: Math.max.apply(null, xs),
        y_min: Math.min.apply(null, ys), y_max: Math.max.apply(null, ys)
      }
    };
    return { shots: shots, finishing: finishing, radar: radar, creators: creators, meta: meta };
  }

  /* ---- tiny CSV parser (quoted fields, CRLF) ---- */
  function parseCsv(text) {
    var rows = [], row = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    if (!rows.length) return [];
    var head = rows[0];
    return rows.slice(1).map(function (r) {
      var o = {};
      head.forEach(function (h, i) { o[h] = r[i]; });
      return o;
    });
  }

  function loadFetch() {
    var files = { shots: 'shot_map.csv', finishing: 'player_finishing_metrics.csv', radar: 'player_profile_radar.csv', creators: 'creator_leaderboard.csv' };
    var out = {}, ps = Object.keys(files).map(function (k) {
      return fetch('data/' + files[k]).then(function (r) {
        if (!r.ok) throw new Error('data/' + files[k] + ': HTTP ' + r.status);
        return r.text();
      }).then(function (t) { out[k] = parseCsv(t); });
    });
    return Promise.all(ps).then(function () { return assemble(out); });
  }

  function loadEmbedded() {
    return Promise.resolve(assemble(window.__WC_EMBEDDED__));
  }

  function loadOmni() {
    /* Rows arrive from saved workbook queries through omni.query(name).onData.
       Keys come prefixed with the view name ("wc_shots.player"), onData fires
       on load and again on refilter, and an empty payload can precede the real
       rows. Counts are asserted against the shipped snapshot so silent
       truncation cannot pass. */
    var NAMES = { shots: 'Shot Map', finishing: 'Player Finishing Metrics', radar: 'Player Profile Radar', creators: 'Creator Leaderboard' };
    var EXPECT = { /*__WC_EXPECT__*/ };
    return new Promise(function (resolve, reject) {
      var out = {}, finished = false, keys = Object.keys(NAMES);
      var timer = setTimeout(function () {
        if (finished) return;
        finished = true;
        var missing = keys.filter(function (k) { return !out[k]; }).map(function (k) { return NAMES[k]; });
        reject(new Error('Timed out waiting for saved queries: ' + missing.join(', ') + '. Check the workbook has queries with these exact names.'));
      }, 60000);
      function maybeDone() {
        if (finished) return;
        if (!keys.every(function (k) { return out[k]; })) return;
        finished = true;
        clearTimeout(timer);
        resolve(assemble(out));
      }
      omni.ready.then(function () {
        keys.forEach(function (k) {
          omni.query(NAMES[k]).onData(function (d) {
            if (finished) return;
            if (d && d.status === 'error') { finished = true; clearTimeout(timer); reject(new Error('Query failed: ' + NAMES[k])); return; }
            if (d && d.status && d.status !== 'complete' && d.status !== 'success') return;
            var rows = (d && (d.data || d.rows)) || (Array.isArray(d) ? d : []);
            if (!rows.length) return; /* empty payload before the real rows */
            if (EXPECT[k] && rows.length !== EXPECT[k]) {
              finished = true; clearTimeout(timer);
              reject(new Error(NAMES[k] + ' returned ' + rows.length + ' rows, expected ' + EXPECT[k] + '. Check the saved query row limit.'));
              return;
            }
            out[k] = rows;
            maybeDone();
          });
        });
        omni.runQueries(keys.map(function (k) { return NAMES[k]; }));
      });
    });
  }

  return {
    load: function () {
      if (MODE === 'omni') return loadOmni();
      if (MODE === 'embedded') return loadEmbedded();
      return loadFetch();
    }
  };
})();
