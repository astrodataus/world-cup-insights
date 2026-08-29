#!/usr/bin/env python3
"""World Cup Insights - Astrodata build.
Reads the four workbook exports from data-raw/, normalizes headers to
snake_case, writes clean public CSVs, and renders three HTML outputs:
  dist/index.html   fetch mode (GitHub Pages)  -> synced to repo root
  standalone.html   embedded data, single file
  app-omni.html     omni.query mode            -> world-cup-omni-app.html
"""
import csv, io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'data-raw')
SRC = os.path.join(HERE, 'src')
DIST = os.path.join(HERE, 'dist')

RAW_FILES = {
    'shots': 'wc-shot-map.csv',
    'finishing': 'wc-player-finishing-metrics.csv',
    'radar': 'wc-player-profile-radar.csv',
    'creators': 'wc-creator-leaderboard.csv',
}
PUB_FILES = {
    'shots': 'shot_map.csv',
    'finishing': 'player_finishing_metrics.csv',
    'radar': 'player_profile_radar.csv',
    'creators': 'creator_leaderboard.csv',
}

def norm(k):
    k = re.sub(r'^.*\.', '', str(k).strip().lower())
    k = re.sub(r'[^a-z0-9]+', '_', k).strip('_')
    return k

def read_raw(name):
    path = os.path.join(RAW, RAW_FILES[name])
    with open(path, newline='', encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))
    out = []
    for r in rows:
        out.append({norm(k): ('' if v in (None, '∅') else v) for k, v in r.items()})
    return out

RENAME = {
    'ee_sandbox_ee_fifa_parsed_players_parsed_name': 'name',
    'ee_sandbox_ee_fifa_parsed_teams_parsed_name': 'team',
    'shooter': 'player',
    'minutes_played': 'minutes_sum',
    'goals': 'goals_sum',
    'assists': 'assists_sum',
    'matches_played': 'matches_played',
    'key_passes': 'key_passes_sum',
    'big_chances_created': 'big_chances_created_sum',
    'assists_xa': 'assists_minus_xa',
    'duel_win': 'duel_win_pct',
    'dribble_success': 'dribble_success_pct',
    'tackle_success': 'tackle_success_pct',
}

def write_pub(name, rows):
    if not rows:
        raise SystemExit(f'{name}: no rows')
    # xg/xa mean sums on the player tables but a per-shot value on shots
    per_table = dict(RENAME)
    if name != 'shots':
        per_table['xg'] = 'expected_goals_sum'
        per_table['xa'] = 'expected_assists_sum'
    rows = [{per_table.get(k, k): v for k, v in r.items()} for r in rows]
    fields = list(rows[0].keys())
    for d in (os.path.join(DIST, 'data'), os.path.join(HERE, 'data')):
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, PUB_FILES[name]), 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fields)
            w.writeheader(); w.writerows(rows)

def main():
    raw = {k: read_raw(k) for k in RAW_FILES}
    for k in raw:
        write_pub(k, raw[k])
        print(f'  {k}: {len(raw[k])} rows, cols: {", ".join(list(raw[k][0].keys())[:14])}')

    years = sorted({r.get('tournament_year') for r in raw['shots'] if r.get('tournament_year')})
    print('  years:', years)
    if len(years) < 2:
        print('  WARNING: fewer than 2 tournament years on shots - check the export filter!')

    expects = {k: len(raw[k]) for k in raw}

    fonts = build_fonts_css()
    css = open(os.path.join(SRC, 'app.css'), encoding='utf-8').read()
    import base64 as _b64
    with open(os.path.join(SRC, 'hero.jpg'), 'rb') as f:
        hero_b64 = _b64.b64encode(f.read()).decode('ascii')
    css = css.replace('/*__HERO_IMG__*/none', 'url(data:image/jpeg;base64,' + hero_b64 + ')')
    designs = open(os.path.join(SRC, 'designs.css'), encoding='utf-8').read()
    tpl = open(os.path.join(SRC, 'template.html'), encoding='utf-8').read()
    appjs = open(os.path.join(SRC, 'app.js'), encoding='utf-8').read()
    loader = open(os.path.join(SRC, 'loader.js'), encoding='utf-8').read()

    def render(mode, embed=None):
        l = loader.replace('__WC_MODE__', mode)
        l = l.replace('/*__WC_EXPECT__*/',
                      ', '.join(f'{k}: {v}' for k, v in expects.items()) if mode == 'omni' else '')
        if embed is not None:
            l = 'window.__WC_EMBEDDED__=' + embed + ';\n' + l
        page = tpl.replace('/*__FONTS__*/', fonts).replace('/*__APP_CSS__*/', css)
        page = page.replace('/*__DESIGNS_CSS__*/', designs)
        page = page.replace('/*__DATA_LOADER__*/', l).replace('/*__APP_JS__*/', appjs)
        return page

    os.makedirs(DIST, exist_ok=True)
    open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8').write(render('fetch'))
    embed = json.dumps(raw, separators=(',', ':'))
    open(os.path.join(HERE, 'standalone.html'), 'w', encoding='utf-8').write(render('embedded', embed))
    omni_page = render('omni')
    open(os.path.join(HERE, 'app-omni.html'), 'w', encoding='utf-8').write(omni_page)
    open(os.path.join(HERE, 'world-cup-omni-app.html'), 'w', encoding='utf-8').write(omni_page)
    # repo root = fetch build
    open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(render('fetch'))

    def fnv(t):
        h = 0x811c9dc5
        for c in t:
            h = ((h ^ ord(c)) * 0x01000193) & 0xffffffff
        return h
    for f in ('index.html', 'standalone.html', 'world-cup-omni-app.html'):
        t = open(os.path.join(HERE, f), encoding='utf-8').read()
        print(f'  {f}: {len(t)} chars, fnv {fnv(t)}')
    print('Build complete.')

def build_fonts_css():
    import base64
    font_files = {
        'Jost': [('200', os.path.join(SRC, 'fonts', 'jost-200.woff2')),
                 ('500', os.path.join(SRC, 'fonts', 'jost-500.woff2'))],
        'JetBrains Mono': [('400', os.path.join(SRC, 'fonts', 'jetbrains-mono-400.woff2'))],
        'Source Serif TC Italic': [('400', os.path.join(SRC, 'fonts', 'source-serif-italic-400.woff2'))],
        'Oswald': [('500', os.path.join(SRC, 'fonts', 'oswald-wght-500.woff2')),
                   ('600', os.path.join(SRC, 'fonts', 'oswald-wght-500.woff2')),
                   ('700', os.path.join(SRC, 'fonts', 'oswald-wght-700.woff2'))],
        'Inter': [('400', os.path.join(SRC, 'fonts', 'inter-wght-400.woff2'))],
        'Poppins': [('600', os.path.join(SRC, 'fonts', 'poppins-wght-600.woff2')),
                    ('700', os.path.join(SRC, 'fonts', 'poppins-wght-700.woff2'))],
        'Monoton': [('400', os.path.join(SRC, 'fonts', 'monoton.woff2'))],
    }
    parts = []
    for family, weights in font_files.items():
        for weight, path in weights:
            with open(path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('ascii')
            style = 'italic' if 'Italic' in family else 'normal'
            parts.append(
                f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};"
                f"font-display:swap;src:url(data:font/woff2;base64,{b64}) format('woff2');}}"
            )
    return '\n'.join(parts)


if __name__ == '__main__':
    main()
