#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');

function fail(message){ throw new Error(message); }
function read(rel){ return fs.readFileSync(path.join(ROOT,rel),'utf8').replace(/\r\n?/g,'\n'); }

// A module/region is added here once its user-facing strings have been migrated.
// The gate then prevents hard-coded UI text (in any language) from re-entering it.
const PROTECTED_FILES=[
  'src/main/category-modals.js',
  'src/main/diagnostic-modals.js',
  'src/main/pdfium-gate-view.js',
  'src/main/metadata-schema-modal.js',
  'src/main/pdf-document-register-bases-view.js',
  'src/main/benchmark-modals.js',
  'src/plugin/features/03-diagnostics.js',
  'src/plugin/features/04-category-config.js',
  'src/plugin/features/05-context-menu.js',
  'src/plugin/features/06-selection-links.js',
  'src/plugin/features/07-main-bridge-routing.js',
  'src/plugin/features/11-annotation-io.js',
  'src/plugin/features/12-selection-diagnostics.js',
  'src/plugin/features/13-category-mutation.js',
  'src/plugin/features/14-metadata-schema.js',
  'src/plugin/features/17-document-record-visibility.js',
  'src/plugin/features/18-document-register-bases.js',
  'src/plugin/features/19-metadata-benchmark.js'
];
const PROTECTED_REGIONS=[
  {
    file:'src/plugin/features/01-lifecycle.js',
    name:'all PDF commands',
    start:"this.obsidianPluginRegistrationAdapter.addCommand({\n      id: 'full-page-go-to-page'",
    end:"this.ports.installOpenLinkTextHook();"
  }];

// Obvious Norwegian residue. This complements the UI-sink check and also keeps
// technical comments/diagnostic prose in migrated modules English for GitHub.
const NORWEGIAN=/[æøåÆØÅ]|\b(?:Ingen|Velg|Lagre|Avbryt|Rediger|Opprett|Slett|Fjern|Mappe|Kategori|kategorier|markering|Markering|Hurtigtast|Farge|Navn|Arvet|Arv|lokal|overordnet|Kunne|Mangler|ugyldig|feil|ukjent|sider|kopiert|lagret|deaktivert|overstyring|oppsettet|konfigurasjon|sikkerhetskopi)\b/u;

// These are user-visible sinks in our current Obsidian UI code. A direct text
// literal in one of these sinks is almost always a localization regression.
const SINKS=[
  /\.setName\(\s*([`'"])/,
  /\.setDesc\(\s*([`'"])/,
  /\.setButtonText\(\s*([`'"])/,
  /\.setPlaceholder\(\s*([`'"])/,
  /new Notice\(\s*([`'"])/,
  /\.confirm\(\s*([`'"])/,
  /\baddItem\(\s*([`'"])/,
  /\baddHeading\(\s*([`'"])/,
  /\baddNote\(\s*([`'"])/,
  /\.textContent\s*=\s*([`'"])/,
  /\btext\s*:\s*([`'"])/,
  /\bname\s*:\s*([`'"])/
];

function quotedLiteralFrom(line, quoteIndex){
  const quote=line[quoteIndex];
  let out='';
  let escaped=false;
  for(let i=quoteIndex+1;i<line.length;i++){
    const ch=line[i];
    if(escaped){ out+=ch; escaped=false; continue; }
    if(ch==='\\'){ escaped=true; continue; }
    if(ch===quote) return out;
    out+=ch;
  }
  return out;
}
function isHarmlessLiteral(value){
  const raw=String(value||'').trim();
  if(raw.startsWith('${')) return true; // dynamic-first template; translated/user data is supplied by the expression
  const text=raw.replace(/\$\{[^}]*\}/g,'').trim();
  if(!text) return true;
  // Symbols, icons and pure keyboard notation are language-neutral.
  if(!/[A-Za-zÆØÅæøå]/.test(text)) return true;
  if(/^(?:Ctrl|Alt|Shift|Enter|Esc|Tab|PDF|PDFium|UUID|YAML|JSON|Artifact|OK|ERROR|OFF)(?:[+\- /:A-Za-z0-9_.]*)?$/.test(text)) return true;
  return false;
}
function inspectSource(label, source){
  const failures=[];
  const lines=String(source).split(/\r?\n/);
  for(let index=0;index<lines.length;index++){
    const line=lines[index];
    if(NORWEGIAN.test(line)) failures.push(`${label}:${index+1}: Norwegian residue: ${line.trim()}`);
    for(const sink of SINKS){
      const match=sink.exec(line);
      if(!match) continue;
      const quote=match[1];
      const quoteIndex=line.indexOf(quote,match.index);
      const literal=quotedLiteralFrom(line,quoteIndex);
      if(!isHarmlessLiteral(literal)) failures.push(`${label}:${index+1}: hard-coded UI literal: ${JSON.stringify(literal)} :: ${line.trim()}`);
    }
  }
  return failures;
}

const failures=[];
for(const file of PROTECTED_FILES) failures.push(...inspectSource(file,read(file)));
for(const region of PROTECTED_REGIONS){
  const source=read(region.file);
  const start=source.indexOf(region.start);
  const end=source.indexOf(region.end,start+region.start.length);
  if(start<0||end<0||end<=start) fail(`Could not resolve protected i18n region ${region.name} in ${region.file}`);
  failures.push(...inspectSource(`${region.file} [${region.name}]`,source.slice(start,end)));
}
if(failures.length) fail(`Hard-coded UI text detected in migrated i18n surface(s):\n${failures.join('\n')}`);

console.log(JSON.stringify({
  ok:true,
  protectedFiles:PROTECTED_FILES.length,
  protectedRegions:PROTECTED_REGIONS.length,
  policy:'migrated UI surfaces must use translation keys; technical comments/diagnostics are English'
},null,2));
