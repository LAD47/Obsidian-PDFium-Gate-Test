'use strict';

// Canonical Main Bridge -> renderer event contract. Production actions travel
// only through these explicit events; diagnostics may mirror state but must not
// be used as a production transport.
const RENDERER_BRIDGE_EVENTS = Object.freeze({
  OBSIDIAN_COMMAND: 'pdfium-gate-obsidian-command',
  KEYBOARD_SELECTION: 'pdfium-gate-pdf-keyboard-selection',
  NATIVE_COPY: 'pdfium-gate-native-copy',
  KEYBOARD_COPY: 'pdfium-gate-keyboard-copy',
  PDF_CONTEXT_MENU: 'pdfium-gate-pdf-context-menu',
  CATEGORY_SHORTCUT: 'pdfium-gate-category-shortcut',
  ESCAPE_DISMISS: 'pdfium-gate-escape-dismiss',
  PDF_MOUSE_ACTIVATION: 'pdfium-gate-pdf-mouse-activation'
});

const RENDERER_BRIDGE_EVENT_NAMES = new Set(Object.values(RENDERER_BRIDGE_EVENTS));

function validateRendererBridgeEventDetail(eventName, detail) {
  const name=String(eventName||'');
  if(!RENDERER_BRIDGE_EVENT_NAMES.has(name)) return {ok:false,error:`ukjent renderer bridge-event: ${name}`};
  if(!detail || typeof detail!=='object' || Array.isArray(detail)) return {ok:false,error:`${name}: detail må være et objekt`};
  const token=String(detail.token||detail.keyboardSelectionState?.token||'').trim();
  const text=String(detail.selectedText||detail.keyboardSelectionState?.text||'');
  const finite=value=>Number.isFinite(Number(value));
  if(name===RENDERER_BRIDGE_EVENTS.OBSIDIAN_COMMAND && !String(detail.commandId||'').trim()) return {ok:false,error:'obsidian-command: commandId mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.KEYBOARD_SELECTION && (!token || !String(detail.direction||'').trim())) return {ok:false,error:'keyboard-selection: token/direction mangler'};
  if((name===RENDERER_BRIDGE_EVENTS.NATIVE_COPY || name===RENDERER_BRIDGE_EVENTS.KEYBOARD_COPY) && (!token || !text)) return {ok:false,error:'copy-event: token/selectedText mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.PDF_CONTEXT_MENU && (detail.isPdfContext!==true || !String(detail.token||'').trim())) return {ok:false,error:'pdf-context-menu: isPdfContext/token mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.CATEGORY_SHORTCUT && (!String(detail.id||'').trim() || !finite(detail.resultSeq))) return {ok:false,error:'category-shortcut: id/resultSeq mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.ESCAPE_DISMISS && !finite(detail.dismissSeq)) return {ok:false,error:'escape-dismiss: dismissSeq mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.PDF_MOUSE_ACTIVATION && (!String(detail.token||'').trim() || !finite(detail.activationSeq))) return {ok:false,error:'pdf-mouse-activation: token/activationSeq mangler'};
  return {ok:true,detail};
}

function readRendererBridgeEventDetail(eventName, event) {
  const detail=event && event.detail && typeof event.detail==='object' ? event.detail : null;
  return validateRendererBridgeEventDetail(eventName,detail);
}

module.exports={RENDERER_BRIDGE_EVENTS,RENDERER_BRIDGE_EVENT_NAMES,validateRendererBridgeEventDetail,readRendererBridgeEventDetail};
