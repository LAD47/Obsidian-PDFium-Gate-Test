'use strict';
const fs=require('fs');
const path=require('path');
const helper=path.join(__dirname,'refactor-0.1.223.js');
let source=fs.readFileSync(helper,'utf8');

function replaceRegion(startMarker,endMarker,lines) {
  const start=source.indexOf(startMarker);
  if(start<0) throw new Error('start marker missing: '+startMarker);
  const end=source.indexOf(endMarker,start);
  if(end<0) throw new Error('end marker missing: '+endMarker);
  source=source.slice(0,start)+lines.join('\n')+'\n'+source.slice(end);
}

replaceRegion(
  '// The standard PDF document register is a profile-specific view over the generic',
  "replaceRequired('src/metadata/example-files.js', \"    pdfPath:'Example Documents/example-letter.pdf',\"",
  [
    '// The standard PDF document register and native example Base are profile-specific',
    '// views over the generic record layer. Duplicate the existing type-filter line so',
    '// quoting style remains exactly native to each file.',
    'function insertProfileFilterLine(rel) {',
    '  let text=read(rel);',
    "  const lines=text.split('\\n');",
    "  const index=lines.findIndex(line=>line.includes('filemeta_type') && line.includes('pdf'));",
    "  if(index<0) throw new Error(rel+': filemeta_type/pdf filter line missing');",
    "  if(lines.some(line=>line.includes('filemeta_profile') && line.includes('document'))) return;",
    "  const profileLine=lines[index].replace('filemeta_type','filemeta_profile').replace('pdf','document');",
    '  lines.splice(index+1,0,profileLine);',
    "  write(rel,lines.join('\\n'));",
    '}',
    "insertProfileFilterLine('src/metadata/document-register-base-config.js');",
    "insertProfileFilterLine('src/metadata/example-files.js');",
    ''
  ]
);

replaceRegion(
  "replaceRequired(\n  'docs/examples/Example PDF Document Register.base',",
  '// Keep the example verifier synchronized with the new six system properties.',
  [
    "insertProfileFilterLine('docs/examples/Example PDF Document Register.base');",
    ''
  ]
);

fs.writeFileSync(helper,source,'utf8');
require(helper);
