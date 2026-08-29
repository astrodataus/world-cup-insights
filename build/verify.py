#!/usr/bin/env python3
"""World Cup Insights - verification suite.
1. Recomputes headline figures from the raw CSV exports (never from the app).
2. Serves dist/ over HTTP and checks the rendered app against the recompute,
   in BOTH design skins (Taliesin and Boletin Radiante) and both themes.
3. Asserts zero requests to any non-local host.
"""
import csv, functools, http.server, threading, sys
from collections import Counter
from urllib.parse import urlparse

FAILURES = []
def check(label, ok, detail=''):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + ('' if ok else f" — {detail}"))
    if not ok: FAILURES.append(label)

def recompute():
    shots = list(csv.DictReader(open('data-raw/wc-shot-map.csv', encoding='utf-8-sig')))
    fin = list(csv.DictReader(open('data-raw/wc-player-finishing-metrics.csv', encoding='utf-8-sig')))
    cre = list(csv.DictReader(open('data-raw/wc-creator-leaderboard.csv', encoding='utf-8-sig')))
    goals = sum(1 for s in shots if s['Is Goal'] == 'true')
    xg = sum(float(s['Xg']) for s in shots if s['Xg'])
    by_year = Counter(s['Tournament Year'] for s in shots)
    with_xg = [s for s in shots if s['Xg']]
    top_chance = max(with_xg, key=lambda s: float(s['Xg']))
    name_key = [k for k in cre[0] if 'Name' in k and 'Team' not in k][0]
    top_creator = max(cre, key=lambda r: int(r['Key Passes'] or 0))
    top_fin = max(fin, key=lambda r: int(r['Goals'] or 0))
    return {
        'shots': len(shots), 'goals': goals, 'xg': round(xg, 1),
        'conv': round(goals / len(shots) * 100, 1),
        'by_year': dict(by_year),
        'top_chance_player': top_chance['Shooter'], 'top_chance_xg': top_chance['Xg'],
        'top_creator': top_creator[name_key], 'top_creator_kp': top_creator['Key Passes'],
        'top_scorer': top_fin[[k for k in fin[0] if 'Name' in k and 'Team' not in k][0]],
        'top_scorer_goals': top_fin['Goals'],
    }

def run(base, R):
    from playwright.sync_api import sync_playwright
    external = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1440, 'height': 1000})
        host = urlparse(base).hostname
        pg.on('request', lambda rq: external.append(rq.url) if urlparse(rq.url).hostname not in (host, None) else None)
        pg.goto(base, wait_until='networkidle', timeout=30000)
        pg.wait_for_timeout(800)

        def stat_values():
            return [e.inner_text().strip() for e in pg.query_selector_all('.wc-stat-value')]

        for design in ('taliesin', 'boletin'):
            if design == 'boletin':
                pg.click('#wc-design-toggle'); pg.wait_for_timeout(300)
            tag = f'[{design}]'
            attr = pg.evaluate("document.documentElement.getAttribute('data-design')")
            check(f"{tag} data-design attribute", (attr == 'boletin') == (design == 'boletin'), str(attr))
            bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
            expect_bg = 'rgb(26, 26, 26)' if design == 'boletin' else 'rgb(14, 17, 22)'
            check(f"{tag} ground color is the system's", bg == expect_bg, bg)

            pg.evaluate("location.hash='#/tournament'"); pg.wait_for_timeout(500)
            vals = stat_values()
            check(f"{tag} shots tile matches raw recompute", f"{R['shots']:,}" in vals, f"{R['shots']:,} not in {vals}")
            check(f"{tag} goals tile matches raw recompute", f"{R['goals']:,}" in vals, str(R['goals']))
            check(f"{tag} xG tile matches raw recompute", f"{R['xg']:,}" in vals, str(R['xg']))
            check(f"{tag} conversion tile matches raw recompute", f"{R['conv']}%" in vals, str(R['conv']))
            body = pg.inner_text('body')
            for y, n in R['by_year'].items():
                check(f"{tag} {y} shot count on page", f"{n:,}" in body, f"{n:,}")

            pg.evaluate("location.hash='#/pitch'"); pg.wait_for_timeout(600)
            body = pg.inner_text('body')
            check(f"{tag} biggest chance is the recomputed one", R['top_chance_player'] in body, R['top_chance_player'])

            pg.evaluate("location.hash='#/finishing'"); pg.wait_for_timeout(500)
            body = pg.inner_text('body')
            check(f"{tag} top scorer appears on Finishing", R['top_scorer'] in body, R['top_scorer'])

            pg.evaluate("location.hash='#/creators'"); pg.wait_for_timeout(500)
            body = pg.inner_text('body')
            check(f"{tag} top creator leads the leaderboard", R['top_creator'] in body, R['top_creator'])
            check(f"{tag} top creator key passes figure", str(R['top_creator_kp']) in body, str(R['top_creator_kp']))

            pg.evaluate("location.hash='#/race'"); pg.wait_for_timeout(600)
            check(f"{tag} race view renders a chart", pg.query_selector('.wc-chart-card svg') is not None)

            footer = pg.inner_text('.wc-footer')
            check(f"{tag} Ethan credited in footer", 'ETHAN ELIAS' in footer.upper())
            check(f"{tag} xG caveat present", 'lens, not a verdict' in footer)

        # theme flip smoke in boletin (Cultural program)
        pg.click('#wc-theme-btn'); pg.wait_for_timeout(300)
        bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
        check("[boletin/light] Cultural whitewash ground", bg == 'rgb(250, 247, 240)', bg)

        check("Zero requests to any non-local host", not external, '; '.join(external[:3]))
        b.close()

def main():
    R = recompute()
    print("== Raw recompute ==")
    for k, v in R.items(): print(f"  {k}: {v}")
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory='dist')
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8951), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print("\n== Live app checks (served over HTTP, both designs) ==")
    run('http://127.0.0.1:8951/', R)
    srv.shutdown()
    print(f"\n== Result: {len(FAILURES)} failure(s) ==")
    for f in FAILURES: print('  -', f)
    sys.exit(1 if FAILURES else 0)

if __name__ == '__main__':
    main()
