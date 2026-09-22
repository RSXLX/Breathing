"""Real-browser smoke tests. Requires Python Playwright and an installed Chromium.
Normal use: python tests/browser_smoke.py --url http://localhost:3000/legacy.html
Restricted CI rendering only: python tests/browser_smoke.py --render-only
Render-only tests are NOT origin, IndexedDB durability, camera or API end-to-end tests.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3000/legacy.html')
parser.add_argument('--render-only', action='store_true')
parser.add_argument('--browser', default='/usr/bin/chromium')
parser.add_argument('--output', default=str(ROOT / 'test-results'))
args = parser.parse_args()
out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
checks = []; errors = []
def check(name, condition):
    if not condition: raise AssertionError(name)
    checks.append({'name': name, 'passed': True})

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser, headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1040}, device_scale_factor=1, accept_downloads=True)
    page.on('pageerror', lambda e: errors.append(str(e)))
    if args.render_only:
        page.set_content((ROOT/'dist/breathe-city-legacy-preview.html').read_text(), wait_until='load')
    else:
        page.goto(args.url, wait_until='networkidle')
    page.wait_for_timeout(1000)
    check('initial demo is explicitly non-AI', '预设蒙版' in page.locator('#analysis-status').inner_text())
    check('canvas contains real rendered pixels', page.locator('#stage').evaluate('(c)=>c.getContext("2d").getImageData(100,100,1,1).data[3]') == 255)
    check('empty gallery is not pre-populated', page.locator('#gallery-count').inner_text() == '0')
    for demo, title in [('blocks','建筑微光'),('rooftop','云间漂浮'),('park','树冠呼吸')]:
        page.locator(f'[data-demo="{demo}"]').click();page.wait_for_timeout(350)
        check(f'{demo} selects matching effect', title in page.locator('#effect-badge').inner_text())
    before = page.locator('#energy-fill').evaluate('(e)=>parseFloat(e.style.width)||0')
    # Keyboard represents a real supported interaction without inventing capture state.
    page.keyboard.down('Space');page.wait_for_timeout(650)
    after = page.locator('#energy-fill').evaluate('(e)=>parseFloat(e.style.width)||0')
    check('hold gesture changes visible energy', after > before + 15)
    page.keyboard.up('Space')
    page.locator('#ratio').select_option('portrait');page.wait_for_timeout(350)
    check('portrait changes export dimensions', page.locator('#stage').evaluate('(c)=>[c.width,c.height]') == [720,1280])
    page.locator('#ratio').select_option('landscape');page.wait_for_timeout(350)
    check('landscape changes export dimensions', page.locator('#stage').evaluate('(c)=>[c.width,c.height]') == [1280,720])
    page.locator('#strength').fill('85');page.locator('#cycle').fill('4.5')
    check('sliders update displayed values', page.locator('#strength-value').inner_text() == '85%' and page.locator('#cycle-value').inner_text() == '4.5 s')
    page.locator('.advanced summary').click();page.locator('#effect-toggle').uncheck();page.wait_for_timeout(100)
    original=page.locator('#stage').evaluate('(c)=>c.toDataURL()')
    page.locator('#effect-toggle').check();page.wait_for_timeout(100)
    check('VFX changes actual canvas pixels', original != page.locator('#stage').evaluate('(c)=>c.toDataURL()'))
    page.locator('#mask-toggle').check();page.wait_for_timeout(100)
    masked=page.locator('#stage').evaluate('(c)=>c.toDataURL()')
    check('mask diagnosis changes actual canvas', masked != original)
    page.locator('#mask-toggle').uncheck();page.locator('.advanced summary').click()
    page.screenshot(path=str(out/'desktop.png'), full_page=True)
    page.locator('#snapshot').click();page.locator('#work-dialog').wait_for(state='visible')
    check('snapshot is a real PNG', 'PNG' in page.locator('#work-meta').inner_text())
    with page.expect_download() as downloaded: page.locator('#download-work').click()
    still = out/'capture.png';downloaded.value.save_as(str(still))
    check('PNG export contains image bytes', still.read_bytes().startswith(b'\x89PNG') and still.stat().st_size>10000)
    page.locator('#work-title').fill('陌生街角 · 测试作品');page.locator('#rename-work').click()
    check('renamed work appears in gallery', '陌生街角 · 测试作品' in page.locator('#gallery-grid').inner_text())
    if args.render_only:
        check('restricted storage explicitly marked temporary', '本次会话' in page.locator('#gallery-storage-mode').inner_text())
    page.locator('#close-work').click()
    page.locator('#duration').select_option('6');page.locator('#record').click()
    check('source switching locked during recording', page.locator('#source-camera').is_disabled())
    page.wait_for_function("document.querySelector('#work-dialog').open", timeout=15000)
    check('recording auto-stops and yields a playable video element', page.locator('#work-media video').count()==1 and 'video/' in page.locator('#work-meta').inner_text())
    with page.expect_download() as downloaded:page.locator('#download-work').click()
    video = out/('demo.mp4' if downloaded.value.suggested_filename.endswith('.mp4') else 'demo.webm')
    downloaded.value.save_as(str(video));check('video export contains encoded data', video.stat().st_size>10000)
    page.locator('#work-media video').evaluate('(v)=>v.play()');page.wait_for_timeout(450)
    check('exported video decodes and plays', page.locator('#work-media video').evaluate('(v)=>v.videoWidth===1280&&v.currentTime>0'))
    page.locator('#close-work').click();page.locator('[data-page="gallery"]').click()
    check('both generated works are listed', page.locator('.work-card').count()==2)
    page.screenshot(path=str(out/'gallery.png'),full_page=True)
    page.locator('.work-card').last.click();page.locator('#delete-work').click();page.locator('#confirm-dialog button[value="ok"]').click()
    page.wait_for_timeout(200);check('delete removes only chosen work',page.locator('.work-card').count()==1)
    page.locator('[data-page="studio"]').click();page.locator('#media-file').set_input_files(str(still));page.wait_for_timeout(1000)
    check('image import is local and explicitly heuristic', '本地图片' in page.locator('#input-badge').inner_text() and '颜色规则' in page.locator('#analysis-status').inner_text())
    page.locator('#media-file').set_input_files(str(video));page.wait_for_timeout(1000)
    check('video import decodes as a local source', '本地视频' in page.locator('#input-badge').inner_text())
    page.locator('#source-demo').click();page.wait_for_timeout(250)
    page.locator('[data-page="connections"]').click();page.wait_for_timeout(650)
    check('GLB parses and previews actual geometry', '3,072' in page.locator('#model-label').inner_text() and page.locator('#apply-model').is_enabled())
    page.locator('#tripo-form button[type="submit"]').click();page.wait_for_timeout(1700)
    if not args.render_only:page.locator('#refresh-services').click();page.wait_for_timeout(300)
    check('demo result labelled as not Tripo-generated', 'procedural-demo-not-tripo' in page.locator('#job-list').inner_text())
    page.locator('#world-form button[type="submit"]').click();page.wait_for_timeout(1700)
    check('unconfigured realtime is disabled', page.locator('#start-live').is_disabled())
    page.locator('#tripo-mode').select_option('real');page.locator('#tripo-form button[type="submit"]').click()
    check('unconfigured paid action is rejected rather than faked', '真实服务未配置' in page.locator('#toast').inner_text())
    page.locator('#tripo-mode').select_option('demo');page.wait_for_timeout(6500)
    page.screenshot(path=str(out/'connections.png'),full_page=True)
    page.locator('#apply-model').click();check('model apply returns to studio',page.locator('#page-studio').is_visible())
    page.wait_for_timeout(400)
    page.locator('[data-page="connections"]').click();page.locator('#clear-model').click();page.locator('[data-page="studio"]').click()
    page.wait_for_timeout(3800)
    for width in (390,320):
        page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(300)
        check(f'mobile {width}px has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'))
        if width==390:page.screenshot(path=str(out/'mobile.png'),full_page=True)
    page.locator('#show-guide').click();check('help opens a usable dialog',page.locator('#guide-dialog').is_visible());page.locator('#close-guide').click()
    check('no uncaught application errors',not errors)
    browser.close()
report={'mode':'render-only (opaque origin)' if args.render_only else 'HTTP browser e2e', 'checks':checks,'count':len(checks),'pageErrors':errors,'limitations':['No real camera or paid provider credentials tested.','Opaque origin tests do not validate IndexedDB durability, localhost networking, model downloads or WebRTC.'] if args.render_only else ['No real camera or paid provider credentials tested.']}
(out/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(checks),'mode':report['mode'],'output':str(out)},ensure_ascii=False))
