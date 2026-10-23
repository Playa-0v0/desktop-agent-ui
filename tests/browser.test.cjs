const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const audit = fs.readFileSync(path.join(root, 'scripts/clip-audit.js'), 'utf8');
const manual = fs.readFileSync(path.join(root, 'references/open-claude-manual.md'), 'utf8');
const css = manual.match(/```css\r?\n([\s\S]*?)```/)[1];
const composer = manual.match(/```javascript\r?\n([\s\S]*?)```/)[1];
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?
      { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  console.log('Browser: ' + browser.version());
});
after(async () => { await browser?.close(); });

async function pageTest(html, run) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try { await page.setContent(html); await run(page); }
  finally { await page.close(); }
}
function fixture({ overflow = 'hidden', shadow = '0 0 0 10px black', extra = '', content = '<div class="card"></div>' } = {}) {
  return `<style>body{margin:20px}.clip{position:relative;width:200px;height:100px;overflow:${overflow}}
  .card{position:absolute;left:20px;top:55px;width:40px;height:40px;background:white;box-shadow:${shadow}}
  .filler{position:absolute;top:200px;width:1px;height:1px}${extra}</style><div class="clip">${content}</div>`;
}
const diagnose = (page, opts = {}) => page.evaluate(`(${audit})(${JSON.stringify(opts)})`);

for (const color of ['black', 'red', 'rgb(32, 32, 32)', 'oklch(40% 0.1 30)']) {
  test('detects an opaque shadow: ' + color, async () => {
    await pageTest(fixture({ shadow: `0 0 0 10px ${color}` }), async (page) => {
      const result = await diagnose(page);
      assert.equal(result.ok, false);
      assert.equal(result.cut, 1);
      assert.equal(result.issues[0].clippedPx, 5);
    });
  });
}
test('ignores transparent and inset shadows', async () => {
  await pageTest(fixture({ shadow: '0 0 0 10px rgba(0,0,0,0), inset 0 0 10px black' }), async (page) => {
    assert.equal((await diagnose(page)).ok, true);
  });
});
test('allows a shadow with sufficient space inside rectangular bounds', async () => {
  await pageTest(fixture({ extra: '.card{top:30px}' }), async (page) => {
    const result = await diagnose(page);
    assert.equal(result.ok, true);
    assert.equal(result.cut, 0);
    assert.equal(result.warningCount, 0);
  });
});
for (const overflow of ['auto', 'scroll']) {
  test('checks the scrollport edge with overflow:' + overflow, async () => {
    await pageTest(fixture({ overflow, content: '<div class="card"></div><div class="filler"></div>' }), async (page) => {
      assert.equal((await diagnose(page)).cut, 1);
    });
  });
}
test('checks the selected root itself', async () => {
  await pageTest(fixture(), async (page) => {
    assert.equal((await diagnose(page, { root: '.card' })).cut, 1);
  });
});
test('preserves separate elements with identical class paths', async () => {
  await pageTest(fixture({ content: '<div class="card"></div><div class="card" style="left:120px"></div>' }), async (page) => {
    const result = await diagnose(page);
    assert.equal(result.cut, 2);
    assert.equal(new Set(result.issues.map((issue) => issue.elementId)).size, 2);
  });
});
test('marks a complex clipping shape for review instead of passing', async () => {
  await pageTest(fixture({ overflow: 'visible', extra: '.clip{clip-path:inset(0 0 20px 0)}.card{top:35px}' }), async (page) => {
    const result = await diagnose(page);
    assert.equal(result.ok, false);
    assert.ok(result.warnings.some((warning) => warning.reason.includes('clip-path')));
  });
});
test('marks masks and transforms for review', async () => {
  await pageTest(fixture({ extra: '.clip{mask-image:linear-gradient(black,transparent);transform:scale(1.1)}' }), async (page) => {
    const result = await diagnose(page);
    assert.equal(result.ok, false);
    assert.ok(result.warningCount >= 2);
  });
});
test('marks ancestor filters that alter descendant shadows for review', async () => {
  await pageTest(fixture({ extra: '.clip{filter:blur(3px)}.card{top:30px}' }), async (page) => {
    const result = await diagnose(page);
    assert.equal(result.ok, false);
    assert.ok(result.warnings.some((warning) => warning.reason.includes('滤镜')));
  });
});
test('reports generated pseudo-element shadows as unmeasured', async () => {
  await pageTest(fixture({ shadow: 'none', extra: '.card::before{content:"";position:absolute;inset:0;box-shadow:0 0 0 10px black}' }), async (page) => {
    assert.ok((await diagnose(page)).warnings.some((warning) => warning.reason.includes('::before')));
  });
});
test('measures actual hover state instead of guessing styles', async () => {
  await pageTest(fixture({ shadow: 'none', extra: '.card:hover{box-shadow:0 0 0 10px black}' }), async (page) => {
    assert.equal((await diagnose(page)).cut, 0);
    await page.locator('.card').hover();
    assert.equal((await diagnose(page)).cut, 1);
  });
});
test('uses the image border box for box-shadow even with transparent image pixels', async () => {
  await pageTest(fixture({ content: '<img class="card" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">' }), async (page) => {
    assert.equal((await diagnose(page)).cut, 1);
  });
});
test('distinguishes box blur radius from drop-shadow standard deviation', async () => {
  await pageTest(fixture({ shadow: '0 0 10px black', extra: '.card{top:50px}' }), async (page) => {
    const box = await diagnose(page);
    await page.locator('.card').evaluate((el) => { el.style.boxShadow = 'none'; el.style.filter = 'drop-shadow(0 0 10px black)'; });
    const drop = await diagnose(page);
    assert.ok(drop.issues[0].clippedPx > box.issues[0].clippedPx);
    assert.ok(drop.warningCount > 0);
    assert.equal(drop.ok, false);
  });
});
test('reports fully hidden edges and truncated details without losing counts', async () => {
  await pageTest(fixture({ extra: '.card{top:60px}' }), async (page) => {
    const result = await diagnose(page, { max: 0 });
    assert.equal(result.hidden, 1);
    assert.equal(result.ok, false);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.issues, []);
  });
});
test('fails clearly for missing or invalid roots', async () => {
  await pageTest(fixture(), async (page) => {
    for (const root of ['.missing', '[']) {
      const result = await diagnose(page, { root });
      assert.equal(result.ok, false);
      assert.ok(result.error);
    }
  });
});
test('checks CSS viewport clipping when requested', async () => {
  await pageTest('<div style="position:fixed;left:20px;bottom:5px;width:40px;height:40px;box-shadow:0 0 0 10px black"></div>', async (page) => {
    assert.equal((await diagnose(page, { viewport: true })).cut, 1);
  });
});

const composerPage = `<textarea id="first"></textarea><textarea id="second"></textarea><script>${composer}
window.sent = {first:0, second:0};
for (const name of ['first','second']) {
  const el = document.getElementById(name);
  const handlers = createComposerHandlers(() => window.sent[name]++);
  for (const [type, handler] of Object.entries(handlers)) el.addEventListener(type, handler);
}
</script>`;
test('guards composition confirmation and allows immediate independent Enter', async () => {
  await pageTest(composerPage, async (page) => {
    await page.locator('#first').dispatchEvent('compositionstart');
    await page.locator('#first').press('Enter');
    assert.equal(await page.evaluate(() => window.sent.first), 0);
    await page.locator('#first').dispatchEvent('compositionend');
    await page.locator('#first').press('Enter');
    await page.locator('#first').press('Enter');
    assert.equal(await page.evaluate(() => window.sent.first), 2);
  });
});
test('honors native composition flags, modifiers, repeat and cancelled events', async () => {
  await pageTest(composerPage, async (page) => {
    const sent = await page.evaluate(() => {
      const el = document.querySelector('#first');
      for (const options of [{isComposing:true},{shiftKey:true},{ctrlKey:true},{metaKey:true},{altKey:true},{repeat:true},{cancelled:true}]) {
        const event = new KeyboardEvent('keydown', {key:'Enter',bubbles:true,cancelable:true,...options});
        if (options.cancelled) event.preventDefault();
        el.dispatchEvent(event);
      }
      return window.sent.first;
    });
    assert.equal(sent, 0);
  });
});
test('isolates composer state and resets on blur', async () => {
  await pageTest(composerPage, async (page) => {
    await page.locator('#first').dispatchEvent('compositionstart');
    await page.locator('#second').dispatchEvent('keydown', {key:'Enter',bubbles:true,cancelable:true});
    assert.equal(await page.evaluate(() => window.sent.second), 1);
    await page.locator('#first').dispatchEvent('blur');
    await page.locator('#first').press('Enter');
    assert.equal(await page.evaluate(() => window.sent.first), 1);
  });
});

async function fadeValues(page) {
  return page.locator('.scroll-container').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { top: parseFloat(cs.getPropertyValue('--agent-ui-fade-top')),
      bottom: parseFloat(cs.getPropertyValue('--agent-ui-fade-bottom')), mask: cs.maskImage };
  });
}
test('renders the documented fade at the top, middle and bottom', async () => {
  await pageTest(`<style>${css}</style><div class="scroll-container" style="height:100px"><div style="height:400px">content</div></div>`, async (page) => {
    await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.scroll-container')).getPropertyValue('--agent-ui-fade-bottom')) > 23);
    let values = await fadeValues(page);
    assert.notEqual(values.mask, 'none');
    assert.equal(values.top, 0);
    await page.locator('.scroll-container').evaluate((el) => { el.scrollTop = 150; });
    await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.scroll-container')).getPropertyValue('--agent-ui-fade-top')) > 23);
    values = await fadeValues(page);
    assert.equal(values.bottom, 24);
    await page.locator('.scroll-container').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.scroll-container')).getPropertyValue('--agent-ui-fade-bottom')) === 0);
    assert.equal((await fadeValues(page)).top, 24);
  });
});
test('keeps non-overflowing content readable and disables the mask for reduced motion', async () => {
  await pageTest(`<style>${css}</style><div class="scroll-container" style="height:100px"><div>short</div></div>`, async (page) => {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const values = await fadeValues(page);
    assert.equal(values.top, 0);
    assert.equal(values.bottom, 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal((await fadeValues(page)).mask, 'none');
  });
});
