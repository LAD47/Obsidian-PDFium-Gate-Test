const obsidianModule = require('obsidian');
const { FileView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, parseYaml, loadPdfJs } = obsidianModule;
const rendererElectronModule = require('electron');
const { clipboard: electronClipboard } = rendererElectronModule;
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const nodeFsModule = require('fs');

const VIEW_TYPE = 'pdfium-gate-test-view';
const PDF_EXTENSION = 'pdf';
const PLUGIN_VERSION = '0.1.221';
const OBSIDIAN_RUNTIME_VERSION = obsidianModule?.version || obsidianModule?.apiVersion || null;
const PLATFORM_CONTRACT_VERSION = '0.1';
