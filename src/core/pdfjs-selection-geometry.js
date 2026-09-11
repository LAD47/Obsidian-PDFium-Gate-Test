function normalizeObsidianLinkText(text) {
  const raw = String(text || '');
  let out = '';
  let lastSpace = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (isObsidianLinkIgnorableChar(ch)) continue;
    if (/\s/.test(ch)) {
      if (out && !lastSpace) { out += ' '; lastSpace = true; }
      continue;
    }
    out += ch;
    lastSpace = false;
  }
  return out.trim();
}

function buildPdfJsTextItemStream(items, separatorMode) {
  const text = [];
  const map = [];
  let lastSpace = false;
  const appendChar = (ch, pos) => {
    if (isObsidianLinkIgnorableChar(ch)) return;
    if (/\s/.test(ch)) {
      if (text.length && !lastSpace) {
        text.push(' '); map.push(pos || null); lastSpace = true;
      }
      return;
    }
    text.push(ch); map.push(pos || null); lastSpace = false;
  };
  const appendSeparator = (item, nextItem) => {
    if (!nextItem) return;
    let sep = '';
    if (separatorMode === 'space') sep = ' ';
    else if (separatorMode === 'eol-space') sep = item?.hasEOL ? '\n' : ' ';
    else if (separatorMode === 'eol') sep = item?.hasEOL ? '\n' : '';
    if (sep) appendChar(sep, null);
  };
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex] || {};
    const str = String(item.str || '');
    for (let offset = 0; offset < str.length; offset += 1) appendChar(str[offset], { itemIndex, offset });
    appendSeparator(item, items[itemIndex + 1]);
  }
  while (text.length && text[text.length - 1] === ' ') { text.pop(); map.pop(); }
  return { text:text.join(''), map };
}

function compactObsidianLinkText(text) {
  const raw = String(text || '');
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (isObsidianLinkIgnorableChar(ch) || /\s/.test(ch)) continue;
    out += ch;
  }
  return out;
}

function buildPdfJsCompactItemStream(items) {
  const text = [];
  const map = [];
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex] || {};
    const str = String(item.str || '');
    for (let offset = 0; offset < str.length; offset += 1) {
      const ch = str[offset];
      if (isObsidianLinkIgnorableChar(ch) || /\s/.test(ch)) continue;
      text.push(ch);
      map.push({ itemIndex, offset });
    }
  }
  return { text:text.join(''), map };
}

function pointRectDistance(px, py, left, bottom, right, top) {
  const dx = px < left ? left - px : (px > right ? px - right : 0);
  const dy = py < bottom ? bottom - py : (py > top ? py - top : 0);
  return Math.hypot(dx, dy);
}

function scorePdfJsItemRange(items, beginIndex, endIndex, hint) {
  if (!hint || !Number.isFinite(Number(hint.x)) || !Number.isFinite(Number(hint.yPdf))) return 0;
  let best = Infinity;
  for (let i = Math.max(0, beginIndex); i <= Math.min(items.length - 1, endIndex); i += 1) {
    const item = items[i] || {};
    const tr = Array.isArray(item.transform) ? item.transform : [];
    const x = Number(tr[4]), y = Number(tr[5]);
    const width = Math.abs(Number(item.width || 0));
    const height = Math.max(1, Math.abs(Number(item.height || tr[3] || 0)));
    if (![x,y,width,height].every(Number.isFinite)) continue;
    const left = Math.min(x, x + width), right = Math.max(x, x + width);
    // PDF.js text transform y is a baseline. A generous vertical band is safer
    // for click disambiguation than pretending it is an exact glyph rectangle.
    const bottom = y - height * 0.35, top = y + height * 1.05;
    best = Math.min(best, pointRectDistance(Number(hint.x), Number(hint.yPdf), left, bottom, right, top));
  }
  return Number.isFinite(best) ? best : 1e9;
}


function multiplyPdfJsTransform(a, b) {
  if (!Array.isArray(a) || a.length < 6 || !Array.isArray(b) || b.length < 6) return null;
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function pdfJsItemViewportTransform(pdfjsLib, viewport, item) {
  const vt = Array.isArray(viewport?.transform) ? viewport.transform : null;
  const it = Array.isArray(item?.transform) ? item.transform : null;
  if (!vt || !it) return null;
  try {
    if (pdfjsLib?.Util && typeof pdfjsLib.Util.transform === 'function') {
      const tx = pdfjsLib.Util.transform(vt, it);
      if (Array.isArray(tx) && tx.length >= 6) return tx.map(Number);
    }
  } catch (_) {}
  const tx = multiplyPdfJsTransform(vt, it);
  return tx ? tx.map(Number) : null;
}

function pdfJsItemCaretFractions(item, style, fontHeight) {
  const str = String(item?.str || '');
  const n = str.length;
  if (!n) return [0];
  // Geometry is authoritative. Platform text metrics are only used to
  // distribute caret boundaries *inside* the item; if measurement is
  // unavailable, preserve the existing deterministic uniform-width fallback.
  const measured = textMetricsAdapter.measurePrefixFractions(str, {
    fontFamily:style?.fontFamily || 'sans-serif',
    fontSize:Math.max(1, Number(fontHeight) || 12)
  });
  if (measured?.ok && Array.isArray(measured.fractions) && measured.fractions.length === n + 1) {
    return measured.fractions;
  }
  return Array.from({length:n + 1}, (_, i) => i / n);
}

function pdfJsItemEndpointCandidates(items, styles, viewport, pdfjsLib, point, maxItems = 10) {
  const px = Number(point?.x), py = Number(point?.y);
  if (![px,py].every(Number.isFinite)) return [];
  const itemRows = [];
  const scale = Math.max(0.0001, Math.abs(Number(viewport?.scale || 1)));
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex] || {};
    const str = String(item.str || '');
    if (!str) continue;
    const tx = pdfJsItemViewportTransform(pdfjsLib, viewport, item);
    if (!tx || !tx.every(Number.isFinite)) continue;
    let ux = Number(tx[0]), uy = Number(tx[1]);
    const ulen = Math.hypot(ux, uy);
    if (!(ulen > 1e-6)) { ux = 1; uy = 0; }
    else { ux /= ulen; uy /= ulen; }
    let vx = Number(tx[2]), vy = Number(tx[3]);
    const vlen = Math.hypot(vx, vy);
    if (!(vlen > 1e-6)) { vx = uy; vy = -ux; }
    else { vx /= vlen; vy /= vlen; }
    const fontHeight = Math.max(1, vlen > 1e-6 ? vlen : Math.abs(Number(item.height || 0)) * scale || ulen || 1);
    const width = Math.max(0.5, Math.abs(Number(item.width || 0)) * scale || ulen * Math.max(1, str.length));
    const ox = Number(tx[4]), oy = Number(tx[5]);
    const dx = px - ox, dy = py - oy;
    let along = dx * ux + dy * uy;
    // PDF.js preserves logical string order even for RTL text. For ordinary
    // horizontal RTL items, geometry runs opposite to string offsets.
    const rtl = String(item.dir || '').toLowerCase() === 'rtl';
    if (rtl) along = width - along;
    const vertical = dx * vx + dy * vy;
    const clampedAlong = Math.max(0, Math.min(width, along));
    const minVertical = -fontHeight * 0.35;
    const maxVertical = fontHeight * 1.10;
    const dAlong = along < 0 ? -along : (along > width ? along - width : 0);
    const dVertical = vertical < minVertical ? minVertical - vertical : (vertical > maxVertical ? vertical - maxVertical : 0);
    const rectDistance = Math.hypot(dAlong, dVertical);
    itemRows.push({itemIndex,item,str,tx,style:styles?.[item.fontName] || null,ux,uy,vx,vy,fontHeight,width,ox,oy,along,vertical,clampedAlong,rectDistance,rtl});
  }
  itemRows.sort((a,b) => a.rectDistance - b.rectDistance || a.itemIndex - b.itemIndex);
  const chosenItems = itemRows.slice(0, Math.max(1, maxItems));
  const out = [];
  for (const row of chosenItems) {
    const fractions = pdfJsItemCaretFractions(row.item, row.style, row.fontHeight);
    const positions = fractions.map(f => f * row.width);
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < positions.length; i += 1) {
      const d = Math.abs(row.clampedAlong - positions[i]);
      if (d < best) { best = d; nearest = i; }
    }
    const offsets = new Set();
    for (let d = -3; d <= 3; d += 1) {
      const off = Math.max(0, Math.min(row.str.length, nearest + d));
      offsets.add(off);
    }
    for (const offset of offsets) {
      const caretAlong = positions[offset] ?? (offset / Math.max(1,row.str.length)) * row.width;
      const horizontalError = Math.abs(row.clampedAlong - caretAlong);
      // Being on the correct text item matters more than fractional caret
      // position. Local length scoring below resolves the final boundary.
      const score = row.rectDistance * 3 + horizontalError;
      out.push({
        itemIndex:row.itemIndex, offset, score, rectDistance:row.rectDistance,
        horizontalError, itemTextLength:row.str.length,
        point:{x:px,y:py}, itemOrigin:{x:row.ox,y:row.oy},
        fontHeight:row.fontHeight, width:row.width
      });
    }
  }
  out.sort((a,b) => a.score - b.score || a.itemIndex - b.itemIndex || a.offset - b.offset);
  return out.slice(0, 36);
}

function comparePdfJsCaret(a, b) {
  if (Number(a.itemIndex) !== Number(b.itemIndex)) return Number(a.itemIndex) - Number(b.itemIndex);
  return Number(a.offset) - Number(b.offset);
}

function compactPdfJsRangeLength(items, begin, end) {
  if (!begin || !end) return null;
  let count = 0;
  for (let i = begin.itemIndex; i <= end.itemIndex; i += 1) {
    const str = String(items[i]?.str || '');
    let from = i === begin.itemIndex ? Math.max(0, Math.min(str.length, begin.offset)) : 0;
    let to = i === end.itemIndex ? Math.max(0, Math.min(str.length, end.offset)) : str.length;
    if (to < from) [from,to] = [to,from];
    const slice = str.slice(from,to);
    for (let k = 0; k < slice.length; k += 1) {
      const ch = slice[k];
      if (!isObsidianLinkIgnorableChar(ch) && !/\s/u.test(ch)) count += 1;
    }
  }
  return count;
}

function lockPdfJsEndpointToNearestItem(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return { itemIndex:null, candidates:[] };
  // Geometry decides the text item absolutely. Selection length may
  // refine an offset inside that item, but it must never move an endpoint to
  // another occurrence of the same word elsewhere on the page.
  const ranked = candidates.slice().sort((a,b) =>
    Number(a.rectDistance) - Number(b.rectDistance) ||
    Number(a.horizontalError) - Number(b.horizontalError) ||
    Number(a.itemIndex) - Number(b.itemIndex) || Number(a.offset) - Number(b.offset)
  );
  const itemIndex = Number(ranked[0]?.itemIndex);
  if (!Number.isFinite(itemIndex)) return { itemIndex:null, candidates:[] };
  const locked = ranked.filter(c => Number(c.itemIndex) === itemIndex)
    .sort((a,b) => Number(a.horizontalError) - Number(b.horizontalError) || Number(a.offset) - Number(b.offset));
  return { itemIndex, candidates:locked };
}

function pdfJsCoordinateDiagnosticRows(items, styles, viewport, pdfjsLib, point, maxRows = 12) {
  const px = Number(point?.x), py = Number(point?.y);
  if (![px,py].every(Number.isFinite)) return [];
  const scale = Math.max(0.0001, Math.abs(Number(viewport?.scale || 1)));
  const rows = [];
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex] || {};
    const str = String(item.str || '');
    if (!str) continue;
    const tx = pdfJsItemViewportTransform(pdfjsLib, viewport, item);
    if (!tx || !tx.every(Number.isFinite)) continue;
    let ux = Number(tx[0]), uy = Number(tx[1]);
    const ulen = Math.hypot(ux, uy);
    if (!(ulen > 1e-6)) { ux = 1; uy = 0; }
    else { ux /= ulen; uy /= ulen; }
    let vx = Number(tx[2]), vy = Number(tx[3]);
    const vlen = Math.hypot(vx, vy);
    if (!(vlen > 1e-6)) { vx = uy; vy = -ux; }
    else { vx /= vlen; vy /= vlen; }
    const fontHeight = Math.max(1, vlen > 1e-6 ? vlen : Math.abs(Number(item.height || 0)) * scale || ulen || 1);
    const width = Math.max(0.5, Math.abs(Number(item.width || 0)) * scale || ulen * Math.max(1, str.length));
    const ox = Number(tx[4]), oy = Number(tx[5]);
    const dx = px - ox, dy = py - oy;
    let along = dx * ux + dy * uy;
    if (String(item.dir || '').toLowerCase() === 'rtl') along = width - along;
    const vertical = dx * vx + dy * vy;
    const minVertical = -fontHeight * 0.35;
    const maxVertical = fontHeight * 1.10;
    const dAlong = along < 0 ? -along : (along > width ? along - width : 0);
    const dVertical = vertical < minVertical ? minVertical - vertical : (vertical > maxVertical ? vertical - maxVertical : 0);
    const rectDistance = Math.hypot(dAlong, dVertical);
    rows.push({
      itemIndex, itemText:str, itemTextLength:str.length,
      itemOrigin:{x:ox,y:oy}, itemTransform:tx.slice(0,6),
      width, fontHeight, along, vertical, rectDistance,
      point:{x:px,y:py}
    });
  }
  rows.sort((a,b) => a.rectDistance - b.rectDistance || Math.abs(a.vertical) - Math.abs(b.vertical) || a.itemIndex - b.itemIndex);
  return rows.slice(0, Math.max(1,maxRows));
}

function pdfJsSelectionTextItemDiagnostics(items, styles, viewport, pdfjsLib, selectionText, maxRows = 12) {
  const query = String(selectionText || '').trim();
  if (!query) return [];
  const qLower = query.toLocaleLowerCase();
  const scale = Math.max(0.0001, Math.abs(Number(viewport?.scale || 1)));
  const rows = [];
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex] || {};
    const str = String(item.str || '');
    if (!str) continue;
    const sLower = str.toLocaleLowerCase();
    if (!(sLower === qLower || sLower.includes(qLower) || qLower.includes(sLower))) continue;
    const tx = pdfJsItemViewportTransform(pdfjsLib, viewport, item);
    if (!tx || !tx.every(Number.isFinite)) continue;
    const fontHeight = Math.max(1, Math.hypot(Number(tx[2]),Number(tx[3])) || Math.abs(Number(item.height || 0)) * scale || 1);
    const width = Math.max(0.5, Math.abs(Number(item.width || 0)) * scale || Math.hypot(Number(tx[0]),Number(tx[1])) * Math.max(1,str.length));
    rows.push({
      itemIndex, itemText:str, itemTextLength:str.length,
      matchType:sLower === qLower ? 'exact-item' : (sLower.includes(qLower) ? 'item-contains-selection' : 'selection-contains-item'),
      itemOrigin:{x:Number(tx[4]),y:Number(tx[5])}, itemTransform:tx.slice(0,6), width, fontHeight
    });
  }
  rows.sort((a,b) => {
    const rank=x => x.matchType === 'exact-item' ? 0 : (x.matchType === 'item-contains-selection' ? 1 : 2);
    return rank(a)-rank(b) || a.itemIndex-b.itemIndex;
  });
  return rows.slice(0, Math.max(1,maxRows));
}



function describeObsidianLinkDiagnosticChar(ch) {
  const text = ch == null ? '' : String(ch);
  if (!text) return { char:null, escaped:null, codePoint:null, codeUnit:null };
  const cp = text.codePointAt(0);
  const cu = text.charCodeAt(0);
  const escaped = JSON.stringify(text).slice(1,-1);
  return {
    char:text,
    escaped,
    codePoint:Number.isFinite(cp) ? `U+${cp.toString(16).toUpperCase().padStart(4,'0')}` : null,
    codeUnit:Number.isFinite(cu) ? `0x${cu.toString(16).toUpperCase().padStart(4,'0')}` : null
  };
}

function obsidianLinkMismatchWindow(text, index, radius = 36) {
  const value = String(text || '');
  const i = Math.max(0, Math.min(value.length, Number(index) || 0));
  const span = Math.max(1, Number(radius) || 36);
  const start = Math.max(0, i - span);
  const end = Math.min(value.length, i + span);
  return {
    start,
    end,
    mismatchOffset:i,
    text:value.slice(start,end),
    escaped:JSON.stringify(value.slice(start,end)).slice(1,-1),
    markerOffset:i-start
  };
}

function pdfJsItemsAroundCaretDiagnostics(items, caret, before = 4, after = 8) {
  const center = Number(caret?.itemIndex);
  if (!Number.isFinite(center)) return [];
  const first = Math.max(0, center - Math.max(0, Number(before) || 0));
  const last = Math.min(items.length - 1, center + Math.max(0, Number(after) || 0));
  const rows = [];
  for (let itemIndex = first; itemIndex <= last; itemIndex += 1) {
    const item = items[itemIndex] || {};
    const str = String(item.str || '');
    rows.push({
      itemIndex,
      itemText:str,
      itemTextEscaped:JSON.stringify(str).slice(1,-1),
      itemTextLength:str.length,
      hasEOL:!!item.hasEOL,
      isBeginItem:itemIndex === center,
      beginOffset:itemIndex === center ? Number(caret?.offset) : null,
      codePoints:Array.from(str.slice(0,80)).map(ch => describeObsidianLinkDiagnosticChar(ch))
    });
  }
  return rows;
}

