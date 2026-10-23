// 当前渲染状态的阴影裁切诊断；把整个函数交给浏览器的页面求值接口。
// 参数：root（选择器，包含根元素自身）、viewport（检查 CSS 视口）、tol（CSS px）、max（输出上限）。
// cut / hidden 是问题条数，issues[].clippedPx 是估算的单边越界距离。
// ok 只表示本次未发现问题或待复核项，不能证明像素正确或其他状态通过。
// 模糊按约 3σ 估计外扩；复杂裁切、变换和滤镜返回 warnings，需截图或真实窗口复核。
(opts = {}) => {
  const tol = Number.isFinite(opts.tol) ? Math.max(0, opts.tol) : 1;
  const max = Number.isInteger(opts.max) ? Math.max(0, opts.max) : 40;
  let scope;
  try { scope = opts.root ? document.querySelector(opts.root) : document.body; }
  catch { return { ok: false, error: 'root 选择器无效: ' + opts.root }; }
  if (!scope) return { ok: false, error: 'root 未找到: ' + opts.root };

  const issues = [], warnings = [], warningKeys = new Set(), ids = new WeakMap();
  let nextId = 1;
  const elementId = (el) => {
    if (!ids.has(el)) ids.set(el, nextId++);
    return ids.get(el);
  };
  const path = (el) => {
    const out = [];
    for (let n = el; n && out.length < 4; n = n.parentElement) {
      const classes = [...n.classList].slice(0, 3).join('.');
      out.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : classes ? '.' + classes : ''));
      if (n.id || n === document.body) break;
    }
    return out.join(' > ');
  };
  const warn = (el, reason) => {
    const key = elementId(el) + ':' + reason;
    if (!warningKeys.has(key)) {
      warningKeys.add(key);
      warnings.push({ elementId: elementId(el), el: path(el), reason });
    }
  };
  const px = (value) => parseFloat(value) || 0;

  // 只拆分浏览器已经计算完成的样式，保留颜色函数内部的空白与逗号。
  const split = (value, whitespace = false) => {
    const parts = []; let depth = 0, current = '';
    for (const ch of value) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (!depth && (whitespace ? /\s/.test(ch) : ch === ',')) {
        if (current.trim()) parts.push(current.trim());
        current = '';
      } else current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const alphaCache = new Map();
  const isTransparent = (color) => {
    if (!context) return false;
    if (!alphaCache.has(color)) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      alphaCache.set(color, context.getImageData(0, 0, 1, 1).data[3] === 0);
    }
    return alphaCache.get(color);
  };
  const shadowLengths = (value, el) => {
    const lengths = [];
    for (const token of split(value, true)) {
      if (CSS.supports('color', token)) {
        if (isTransparent(token)) return null;
      } else if (/^-?(?:\d*\.)?\d+(?:px)?$/.test(token)) lengths.push(px(token));
      else { warn(el, '无法解析已计算的阴影值: ' + value); return null; }
    }
    return lengths;
  };
  const extents = (value, el, drop = false) => {
    if (!value || value === 'none') return null;
    let shadows = split(value);
    if (drop) {
      const filters = split(value, true);
      shadows = filters.filter((filter) => filter.startsWith('drop-shadow('))
        .map((filter) => filter.slice(12, -1));
      if (!shadows.length) return null;
      warn(el, 'drop-shadow 依赖实际透明像素与后代绘制范围；这里只以元素边框盒估算');
      if (filters.length > 1) warn(el, '组合滤镜的外扩不能按独立阴影求最大值，需视觉复核');
    }
    const e = { t: 0, r: 0, b: 0, l: 0 };
    for (const shadow of shadows) {
      if (/\binset\b/.test(shadow)) continue;
      const lengths = shadowLengths(shadow, el);
      if (!lengths) continue;
      const [ox = 0, oy = 0, blur = 0, spread = 0] = lengths;
      // box-shadow 的 blur 约为 2σ；drop-shadow 第三个长度为 σ。3σ 仍只是诊断约定。
      const grow = (drop ? 3 : 1.5) * blur + spread;
      e.l = Math.max(e.l, grow - ox); e.r = Math.max(e.r, grow + ox);
      e.t = Math.max(e.t, grow - oy); e.b = Math.max(e.b, grow + oy);
    }
    return e.t + e.r + e.b + e.l > 0 ? e : null;
  };
  const geometryWarnings = (el, cs) => {
    if (cs.clipPath && cs.clipPath !== 'none') warn(el, 'clip-path 的实际形状未测量，边框矩形不能证明未裁切');
    if (cs.maskImage && cs.maskImage !== 'none') warn(el, 'mask-image 的实际透明区域未测量');
    if (cs.filter && cs.filter !== 'none') warn(el, '滤镜后的实际绘制范围未测量');
    if (cs.transform !== 'none' || (cs.scale && cs.scale !== 'none') ||
        (cs.rotate && cs.rotate !== 'none') || (cs.perspective && cs.perspective !== 'none')) {
      warn(el, '变换后的边框矩形与阴影长度可能不在同一坐标系');
    }
    if (cs.zoom && cs.zoom !== '1' && cs.zoom !== 'normal') warn(el, 'CSS zoom 的长度换算未测量');
  };
  const clipOf = (el, cs) => {
    geometryWarnings(el, cs);
    const x = cs.overflowX !== 'visible', y = cs.overflowY !== 'visible';
    const paint = /paint|strict|content/.test(cs.contain);
    if (!x && !y && !paint) return null;
    if ([cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius]
      .some((radius) => px(radius) > 0)) warn(el, '圆角裁切的角部像素未测量');
    if ((cs.overflowX === 'clip' || cs.overflowY === 'clip') && px(cs.overflowClipMargin) > 0) {
      warn(el, 'overflow-clip-margin 扩展的裁切边未测量');
    }
    const r = el.getBoundingClientRect();
    // clientWidth / clientHeight 排除占位滚动条；滚动轴也是真实裁切边，不能跳过。
    const left = r.left + el.clientLeft, top = r.top + el.clientTop;
    return { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight,
      x: x || paint, y: y || paint, why: paint ? 'contain:' + cs.contain : 'overflow:' + cs.overflow };
  };
  const check = (el, ext, kind, cs) => {
    geometryWarnings(el, cs);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const sh = { left: r.left - ext.l, right: r.right + ext.r, top: r.top - ext.t, bottom: r.bottom + ext.b };
    const bounds = [];
    for (let a = el.parentElement; a; a = a.parentElement) {
      const clip = clipOf(a, getComputedStyle(a));
      if (clip) bounds.push([a, clip]);
    }
    if (opts.viewport) bounds.push([document.documentElement, {
      left: 0, top: 0, right: document.documentElement.clientWidth, bottom: document.documentElement.clientHeight,
      x: true, y: true, why: 'viewport',
    }]);
    const add = (side, gap, clippedPx, ancestor, clip) => issues.push({
      elementId: elementId(el), el: path(el), kind, side, level: gap <= tol ? 'hidden' : 'cut',
      clippedPx: +clippedPx.toFixed(1), gap: +gap.toFixed(1), by: path(ancestor), why: clip.why,
    });
    for (const [ancestor, clip] of bounds) {
      // 本体已越界的边通常是正常滚动内容；不把这类情况自动判为缺陷。
      if (clip.x) {
        if (r.left >= clip.left - 0.5 && sh.left < clip.left - tol) add('left', r.left - clip.left, clip.left - sh.left, ancestor, clip);
        if (r.right <= clip.right + 0.5 && sh.right > clip.right + tol) add('right', clip.right - r.right, sh.right - clip.right, ancestor, clip);
      }
      if (clip.y) {
        if (r.top >= clip.top - 0.5 && sh.top < clip.top - tol) add('top', r.top - clip.top, clip.top - sh.top, ancestor, clip);
        if (r.bottom <= clip.bottom + 0.5 && sh.bottom > clip.bottom + tol) add('bottom', clip.bottom - r.bottom, sh.bottom - clip.bottom, ancestor, clip);
      }
    }
  };

  for (const el of [scope, ...scope.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue;
    if (el.shadowRoot) warn(el, '未遍历 Shadow DOM，请在对应根内另行检查');
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(el, pseudo);
      if (style.content !== 'none' && style.content !== 'normal' &&
          (style.boxShadow !== 'none' || style.filter.includes('drop-shadow('))) {
        warn(el, pseudo + ' 的阴影未测量');
      }
    }
    const box = extents(cs.boxShadow, el); if (box) check(el, box, 'box-shadow', cs);
    const drop = extents(cs.filter, el, true); if (drop) check(el, drop, 'drop-shadow', cs);
  }
  if (opts.hover === true) warn(scope, '不模拟 hover；请先用真实指针激活，再运行当前状态诊断');
  issues.sort((a, b) => (a.level === 'cut' ? 0 : 1) - (b.level === 'cut' ? 0 : 1) || b.clippedPx - a.clippedPx);
  const cut = issues.filter((issue) => issue.level === 'cut').length;
  const hidden = issues.length - cut;
  return { ok: !issues.length && !warnings.length, approximate: true, cut, hidden,
    warningCount: warnings.length, issues: issues.slice(0, max), warnings: warnings.slice(0, max),
    truncated: issues.length > max || warnings.length > max };
}
