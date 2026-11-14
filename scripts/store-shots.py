"""Store screenshots from the web build: python3 scripts/store-shots.py (serve dist/ on :8088 first)."""
import asyncio, json
from playwright.async_api import async_playwright

SHOTS = [  # (name, tab, scroll)
    ('1-payroll', 'payroll', 0),
    ('2-breakdown', 'payroll', 1150),
    ('3-sales', 'sales', 560),
    ('4-owner', 'owner', 380),
    ('5-corp', 'corp', 760),
]
TARGETS = [  # (folder, css width, css height, scale)
    ('fastlane/screenshots/{L}', 440, 956, 3),                       # App Store 6.9" (1320x2868)
    ('fastlane/metadata/android/{L}/images/phoneScreenshots', 400, 800, 2.7),  # Play (1080x2160)
]
PREFS = {
    'en-US': {'lang': 'en', 'theme': 'dark', 'onboarded': True, 'tipsSeen': ['payroll', 'sales', 'corp', 'owner'], 'prov': 'QC', 'payroll': {'amount': 85000, 'enterAnnual': True, 'periods': 26, 'eiExempt': True}},
    'fr-CA': {'lang': 'fr', 'theme': 'dark', 'onboarded': True, 'tipsSeen': ['payroll', 'sales', 'corp', 'owner'], 'prov': 'QC', 'payroll': {'amount': 85000, 'enterAnnual': True, 'periods': 26, 'eiExempt': True}},
}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for L, prefs in PREFS.items():
            for folder, w, h, scale in TARGETS:
                ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=scale, color_scheme='dark')
                pg = await ctx.new_page()
                await pg.goto('http://localhost:8088/')
                await pg.evaluate(f"localStorage.setItem('prefs.v1', {json.dumps(json.dumps(prefs))})")
                for i, (name, tab, scroll) in enumerate(SHOTS, 1):
                    await pg.goto(f'http://localhost:8088/?tab={tab}', wait_until='networkidle')
                    await pg.wait_for_timeout(1200)
                    if scroll:
                        await pg.mouse.move(w / 2, h / 2)
                        await pg.mouse.wheel(0, scroll)
                        await pg.wait_for_timeout(700)
                    out = folder.format(L=L) + (f'/{i}.png' if 'android' in folder else f'/{name}.png')
                    await pg.screenshot(path=out)
                await ctx.close()
        await b.close()
asyncio.run(main())
