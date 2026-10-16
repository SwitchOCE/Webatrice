export function extractInPage(sel) {
  const PROPS = ['background-color', 'background-image', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap', 'color', 'font-family', 'font-size', 'font-weight',
    'font-style', 'line-height', 'letter-spacing', 'text-transform', 'text-align', 'opacity', 'box-shadow', 'overflow'];
  const TAGS = new Set(['div', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'button', 'hr']);
  const DEFAULTS = { 'background-color': 'rgba(0, 0, 0, 0)', 'background-image': 'none', 'border-radius': '0px', gap: 'normal', opacity: '1',
    'box-shadow': 'none', overflow: 'visible', 'font-style': 'normal', 'letter-spacing': 'normal', 'text-transform': 'none', 'text-align': 'start' };
  const INHERITED = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-transform', 'text-align'];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  };
  const textOnly = (el) => [...el.childNodes].every((n) => n.nodeType === 3 || (n.nodeType === 1 && ['STRONG', 'EM', 'B', 'I', 'BR'].includes(n.tagName)));
  const firstText = (el, tags) => [...el.querySelectorAll(tags)].map((h) => h.innerText.trim()).find(Boolean);
  const clip = (s, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const isFlex = (cs) => cs.display.includes('flex');
  const isRow = (cs) => isFlex(cs) && cs.flexDirection.startsWith('row');

  function layerName(el, tag) {
    const label = el.getAttribute('aria-label');
    const heading = firstText(el, 'h1,h2,h3,h4');
    if (tag === 'section') return `Section: ${clip(heading ?? label ?? 'untitled')}`;
    if (tag === 'article' || (el.getAttribute('role') === 'listitem')) return `Card: ${clip(heading ?? el.innerText.trim().split('\n')[0] ?? '')}`;
    if (tag === 'button' || el.getAttribute('role') === 'button') return `Button: ${clip(label ?? el.innerText.trim())}`;
    if (tag === 'a') return `Link: ${clip(label ?? el.innerText.trim())}`;
    if (['header', 'footer', 'nav', 'aside', 'main'].includes(tag)) return tag[0].toUpperCase() + tag.slice(1) + (label ? `: ${clip(label)}` : '');
    if (label) return clip(label);
    return null;
  }

  function styleOf(el, parentCs, extra = {}) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const st = {};
    for (const p of PROPS) {
      let v = cs.getPropertyValue(p);
      if (p.startsWith('border-') && p !== 'border-radius') { if (v.startsWith('0px') || v.includes('none')) continue; }
      else if (p.startsWith('padding') && v === '0px') continue;
      else if (DEFAULTS[p] === v) continue;
      if (INHERITED.includes(p) && parentCs && parentCs.getPropertyValue(p) === v && !extra.__root) continue;
      if (p === 'font-family') v = v.split(',')[0].replace(/["']/g, '').trim();
      if (p === 'background-image' && !v.includes('url(') && !v.includes('gradient')) continue;
      st[p] = v.replace(/"/g, "'");
    }
    if (isFlex(cs)) {
      st.display = 'flex';
      st['flex-direction'] = cs.flexDirection;
      if (cs.justifyContent !== 'normal' && cs.justifyContent !== 'flex-start') st['justify-content'] = cs.justifyContent;
      st['align-items'] = cs.alignItems === 'normal' ? 'stretch' : cs.alignItems;
    }
    if (parentCs && isFlex(parentCs) && parseFloat(cs.flexGrow) > 0) st['flex-grow'] = cs.flexGrow;
    else if (parentCs && isRow(parentCs) && !textOnly(el)) st.width = `${Math.round(rect.width)}px`;
    const { __root, ...rest } = extra;
    Object.assign(st, rest);
    return Object.entries(st).map(([k, v]) => `${k}:${v}`).join(';');
  }

  const autoMargin = (el, side, row) => {
    const names = row
      ? (side === 'start' ? ['ml-auto', 'ms-auto', 'mx-auto', 'm-auto'] : ['mr-auto', 'me-auto', 'mx-auto', 'm-auto'])
      : (side === 'start' ? ['mt-auto', 'my-auto', 'm-auto'] : ['mb-auto', 'my-auto', 'm-auto']);
    return names.some((n) => el.classList.contains(n));
  };

  function spacer(el, parentCs, pad, side) {
    if (!parentCs || !isFlex(parentCs)) return '';
    const cs = getComputedStyle(el);
    const row = isRow(parentCs);
    const cross = `${row ? 'height' : 'width'}:1px`;
    if (autoMargin(el, side, row)) return `${pad}<div layer-name="Spacer" style="flex-grow:1;${cross}"></div>\n`;
    const m = parseFloat(side === 'start' ? (row ? cs.marginLeft : cs.marginTop) : (row ? cs.marginRight : cs.marginBottom));
    return m > 0.5 ? `${pad}<div layer-name="Spacer" style="${row ? 'width' : 'height'}:${Math.round(m)}px;${cross}"></div>\n` : '';
  }

  function walk(el, parentCs, depth) {
    if (!visible(el)) return '';
    const pad = '  '.repeat(depth);
    return spacer(el, parentCs, pad, 'start') + node(el, parentCs, depth, pad) + spacer(el, parentCs, pad, 'end');
  }

  function node(el, parentCs, depth, pad) {
    const tag = el.tagName.toLowerCase();
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (tag === 'svg') {
      const clone = el.cloneNode(true);
      clone.setAttribute('width', rect.width);
      clone.setAttribute('height', rect.height);
      clone.removeAttribute('class');
      return `${pad}${clone.outerHTML.replace(/currentColor/g, cs.color).replace(/\s+/g, ' ')}\n`;
    }
    if (tag === 'img') {
      const src = el.currentSrc || el.src;
      if (src.startsWith('data:image/svg+xml,')) {
        const svg = decodeURIComponent(src.slice('data:image/svg+xml,'.length)).replace(/<svg/, `<svg width="${rect.width}" height="${rect.height}"`).replace(/\s+/g, ' ');
        return `${pad}${svg}\n`;
      }
      return `${pad}<img layer-name="${esc(clip(el.alt || 'Image'))}" src="${src}" style="width:${rect.width}px;height:${rect.height}px;border-radius:${cs.borderRadius};object-fit:${cs.objectFit}">\n`;
    }
    const boxy = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || !cs.borderTopWidth.startsWith('0') || cs.paddingLeft !== '0px' || cs.paddingTop !== '0px' || isFlex(cs);
    let out = TAGS.has(tag) ? tag : 'div';
    if ((out === 'span' || out === 'a') && (!textOnly(el) || boxy)) out = 'div';
    const name = layerName(el, tag);
    const ln = name ? ` layer-name="${esc(name)}"` : '';
    const fixed = {};
    if (depth === 0) { fixed.width = `${Math.round(rect.width)}px`; fixed.__root = true; }
    if (cs.backgroundImage.includes('url(') || (el.children.length === 0 && !el.textContent.trim())) {
      fixed.width = `${Math.round(rect.width)}px`;
      fixed.height = `${Math.round(rect.height)}px`;
    }
    if (cs.display === 'grid' || cs.display === 'inline-grid') {
      const rows = [];
      for (const k of [...el.children].filter(visible)) {
        const top = Math.round(k.getBoundingClientRect().top);
        let row = rows.find((r) => Math.abs(r.top - top) < 4);
        if (!row) rows.push((row = { top, kids: [] }));
        row.kids.push(k);
      }
      const colGap = cs.columnGap === 'normal' ? '0px' : cs.columnGap;
      const rowGap = cs.rowGap === 'normal' ? '0px' : cs.rowGap;
      let s = `${pad}<${out}${ln} style="${styleOf(el, parentCs, { ...fixed, display: 'flex', 'flex-direction': 'column', gap: rowGap })}">\n`;
      const rowCs = { display: 'flex', flexDirection: 'row', getPropertyValue: () => '' };
      for (const [ri, r] of rows.entries()) {
        s += `${pad}  <div layer-name="Row ${ri + 1}" style="display:flex;flex-direction:row;gap:${colGap};align-items:stretch">\n`;
        for (const k of r.kids) s += walk(k, rowCs, depth + 2);
        s += `${pad}  </div>\n`;
      }
      return `${s}${pad}</${out}>\n`;
    }
    const st = styleOf(el, parentCs, fixed);
    if (textOnly(el)) {
      const t = el.innerText.trim();
      if (!t && !Object.keys(fixed).length && !boxy) return '';
      if (!t) return `${pad}<div${ln} style="${st}"></div>\n`;
      if (boxy || name) return `${pad}<div${ln} style="${st}">\n${pad}  <p>${esc(t)}</p>\n${pad}</div>\n`;
      return `${pad}<${out === 'div' || out === 'span' ? 'p' : out} style="${st}">${esc(t)}</${out === 'div' || out === 'span' ? 'p' : out}>\n`;
    }
    let s = `${pad}<${out}${ln} style="${st}">\n`;
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const t = n.textContent.trim();
        if (t) s += `${pad}  <p>${esc(t)}</p>\n`;
      } else if (n.nodeType === 1) s += walk(n, cs, depth + 1);
    }
    return `${s}${pad}</${out}>\n`;
  }

  const rootEl = document.querySelector(sel);
  if (!rootEl) throw new Error(`No element matches ${sel}`);
  return walk(rootEl, getComputedStyle(rootEl.parentElement), 0);
}

export function compact(html) {
  const sides = ['top', 'right', 'bottom', 'left'];
  return html
    .replace(/ style="([^"]*)"/g, (_, body) => {
      const d = Object.fromEntries(body.split(';').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf(':')), kv.slice(kv.indexOf(':') + 1)]));
      const b = sides.map((s) => d[`border-${s}`]);
      if (b.every(Boolean) && new Set(b).size === 1) { sides.forEach((s) => delete d[`border-${s}`]); d.border = b[0]; }
      if (sides.some((s) => `padding-${s}` in d)) {
        const [t, r, bo, l] = sides.map((s) => d[`padding-${s}`] ?? '0px');
        sides.forEach((s) => delete d[`padding-${s}`]);
        d.padding = new Set([t, r, bo, l]).size === 1 ? t : t === bo && r === l ? `${t} ${r}` : `${t} ${r} ${bo} ${l}`;
      }
      for (const k of Object.keys(d)) d[k] = d[k].replace(/(\d+\.\d{2})\d+px/g, '$1px');
      const s = Object.entries(d).map(([k, v]) => `${k}:${v}`).join(';');
      return s ? ` style="${s}"` : '';
    })
    .replace(/^( +)/gm, (m) => ' '.repeat(m.length / 2));
}
