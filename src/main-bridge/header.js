'use strict';

const { app, globalShortcut, webContents, webFrameMain, clipboard, BrowserWindow, screen } = require('electron');

const VERSION = '0.1.194';
const categories = [
  { id: 'slot-1', label: 'Kategori 1', slot: 1, accelerator: 'CommandOrControl+Alt+1' },
  { id: 'slot-2', label: 'Kategori 2', slot: 2, accelerator: 'CommandOrControl+Alt+2' },
  { id: 'slot-3', label: 'Kategori 3', slot: 3, accelerator: 'CommandOrControl+Alt+3' },
  { id: 'slot-4', label: 'Kategori 4', slot: 4, accelerator: 'CommandOrControl+Alt+4' },
  { id: 'slot-5', label: 'Kategori 5', slot: 5, accelerator: 'CommandOrControl+Alt+5' }
];

const OWN_LISTENER = Symbol('pdfiumGateOwnContextListener');
const FILTER_WRAPPER = Symbol('pdfiumGateContextFilterWrapper');

// Keyboard integration for the canonical embedded PDF target. Ctrl/Cmd+P and Ctrl/Cmd+O still route to real Obsidian commands.
// Shift+Left/Right/Up/Down drive a plugin-owned PDFium selection state.
// Ctrl+Shift+Left/Right on Windows/Linux (Option+Shift+Left/Right on macOS)
// reuse the same state but move focus one word at a time. Shift+Home/End reuse
// the same state and move the active focus to the physical text-line edge.
// Ctrl/Cmd+Shift+Home/End reuse the same state and move to document edges.
// Shift+PageUp/PageDown reuse the same state and move roughly one visible viewport.
// Chromium's native mouse selection is only used to seed the first keyboard step.
// Plain arrows remain native PDF navigation.
const WORD_SELECTION_MODIFIER = process.platform === 'darwin' ? 'Alt' : 'Control';

const OBSIDIAN_RESERVED_SHORTCUTS = [
    { id: 'command-palette', accelerator: 'CommandOrControl+P', commandId: 'command-palette:open', routeType: 'obsidian' },
    { id: 'quick-switcher', accelerator: 'CommandOrControl+O', commandId: 'switcher:open', routeType: 'obsidian' },
    { id: 'selection-left', accelerator: 'Shift+Left', direction: 'left', unit: 'glyph', routeType: 'pdf-keyboard' },
    { id: 'selection-right', accelerator: 'Shift+Right', direction: 'right', unit: 'glyph', routeType: 'pdf-keyboard' },
    { id: 'selection-up', accelerator: 'Shift+Up', direction: 'up', unit: 'glyph', routeType: 'pdf-keyboard' },
    { id: 'selection-down', accelerator: 'Shift+Down', direction: 'down', unit: 'glyph', routeType: 'pdf-keyboard' },
    { id: 'selection-word-left', accelerator: `${WORD_SELECTION_MODIFIER}+Shift+Left`, direction: 'left', unit: 'word', routeType: 'pdf-keyboard' },
    { id: 'selection-word-right', accelerator: `${WORD_SELECTION_MODIFIER}+Shift+Right`, direction: 'right', unit: 'word', routeType: 'pdf-keyboard' },
    { id: 'selection-line-home', accelerator: 'Shift+Home', direction: 'left', unit: 'line-edge', routeType: 'pdf-keyboard' },
    { id: 'selection-line-end', accelerator: 'Shift+End', direction: 'right', unit: 'line-edge', routeType: 'pdf-keyboard' },
    { id: 'selection-document-home', accelerator: 'CommandOrControl+Shift+Home', direction: 'left', unit: 'document-edge', routeType: 'pdf-keyboard' },
    { id: 'selection-document-end', accelerator: 'CommandOrControl+Shift+End', direction: 'right', unit: 'document-edge', routeType: 'pdf-keyboard' },
    { id: 'selection-page-up', accelerator: 'Shift+PageUp', direction: 'up', unit: 'viewport', routeType: 'pdf-keyboard' },
    { id: 'selection-page-down', accelerator: 'Shift+PageDown', direction: 'down', unit: 'viewport', routeType: 'pdf-keyboard' },
    { id: 'selection-all', accelerator: 'CommandOrControl+A', direction: 'all', unit: 'select-all', routeType: 'pdf-keyboard' },
];
