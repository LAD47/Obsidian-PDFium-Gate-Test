#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const LOCALES=['en','nb'];

function fail(message){ throw new Error(message); }
function localePath(locale){ return path.join(ROOT,'src','i18n',`${locale}.json`); }
function rawLocale(locale){ return fs.readFileSync(localePath(locale),'utf8'); }
function duplicateKeys(raw, locale){
  const seen=new Set();
  const duplicates=[];
  for(const line of String(raw).split(/\r?\n/)) {
    const match=/^\s*"((?:\\.|[^"\\])+)"\s*:/.exec(line);
    if(!match) continue;
    const key=JSON.parse(`"${match[1]}"`);
    if(seen.has(key)) duplicates.push(key);
    seen.add(key);
  }
  if(duplicates.length) fail(`${locale}: duplicate translation keys: ${duplicates.join(', ')}`);
}
function placeholders(value){
  return [...String(value).matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map(match=>match[1]).sort();
}
function loadLocale(locale){
  const raw=rawLocale(locale);
  duplicateKeys(raw,locale);
  let parsed;
  try { parsed=JSON.parse(raw); } catch(error) { fail(`${locale}: invalid JSON: ${error.message}`); }
  if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) fail(`${locale}: locale root must be an object`);
  for(const [key,value] of Object.entries(parsed)) {
    if(typeof value!=='string') fail(`${locale}: ${key} must be a string`);
    if(!key || key.trim()!==key) fail(`${locale}: invalid translation key ${JSON.stringify(key)}`);
  }
  return parsed;
}

const dictionaries=Object.fromEntries(LOCALES.map(locale=>[locale,loadLocale(locale)]));
const english=dictionaries.en;
if(!Object.keys(english).length) fail('en: canonical locale is empty');
const canonicalKeys=Object.keys(english);
const canonicalSet=new Set(canonicalKeys);
const report={canonical:'en',canonicalKeys:canonicalKeys.length,locales:{}};

for(const locale of LOCALES) {
  const dict=dictionaries[locale];
  const unknown=Object.keys(dict).filter(key=>!canonicalSet.has(key));
  if(unknown.length) fail(`${locale}: unknown translation keys: ${unknown.join(', ')}`);
  const missing=canonicalKeys.filter(key=>!Object.prototype.hasOwnProperty.call(dict,key));
  for(const key of Object.keys(dict)) {
    const expected=placeholders(english[key]);
    const actual=placeholders(dict[key]);
    if(expected.join('\0')!==actual.join('\0')) fail(`${locale}: placeholder mismatch for ${key}: expected [${expected.join(', ')}], got [${actual.join(', ')}]`);
  }
  report.locales[locale]={
    translated:Object.keys(dict).length,
    missing:missing.length,
    coverage:Number(((Object.keys(dict).length/canonicalKeys.length)*100).toFixed(1))
  };
}

console.log(JSON.stringify({ok:true,...report},null,2));
