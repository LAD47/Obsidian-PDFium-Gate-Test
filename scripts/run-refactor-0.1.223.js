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
  "for(const rel of ['docs/examples/Example - Active PDF record.md','docs/examples/Example - Missing PDF record.md']) {",
  '// Keep the example verifier synchronized with the new six system properties.',
  [
    "insertProfileFilterLine('docs/examples/Example - Active PDF record.md');",
    "insertProfileFilterLine('docs/examples/Example - Missing PDF record.md');",
    "insertProfileFilterLine('docs/examples/Example PDF Document Register.base');",
    ''
  ]
);

replaceRegion(
  "replaceRequired(\n  'scripts/check-examples.js',\n  \"if (!baseExample.includes('- type: table'))",
  '// Version bump is source-only here; generated runtime stays out of this refactor commit.',
  [
    'replaceRequired(',
    "  'scripts/check-examples.js',",
    "  \"if (!baseExample.includes('- type: table')) fail('example Base must use native Obsidian table view');\",",
    "  \"if (!baseExample.includes('filemeta_profile') || !baseExample.includes('document')) fail('native Base must filter the document profile');\\nif (!baseExample.includes('- type: table')) fail('example Base must use native Obsidian table view');\"",
    ');',
    ''
  ]
);

replaceRegion(
  '// Active source/docs must no longer define or document the old persisted namespace/root.',
  "console.log('Prepared 0.1.223 file-type-neutral metadata foundation.');",
  [
    '// Audit actual persistence and shipped examples, while allowing tests/docs to mention',
    '// the old pre-release format when explicitly proving that it is rejected.',
    "const repositorySource=read('src/metadata/record-repository.js');",
    "if(repositorySource.includes('frontmatter.pdfmeta_')) throw new Error('record repository still writes old pdfmeta_ fields');",
    "if(repositorySource.includes('pdfmeta_file=')) throw new Error('record repository still writes old pdfmeta_file');",
    "const registerSource=read('src/metadata/document-register-base-config.js');",
    "if(registerSource.includes('pdfmeta_') || registerSource.includes('PDF Metadata') || registerSource.includes('pdf_document')) throw new Error('standard Base still targets old record identity');",
    "for(const rel of ['docs/examples/Example - Active PDF record.md','docs/examples/Example - Missing PDF record.md','docs/examples/Example PDF Document Register.base']) {",
    '  const text=read(rel);',
    "  if(text.includes('pdfmeta_') || text.includes('PDF Metadata') || text.includes('pdf_document')) throw new Error(rel+': shipped example still contains old record identity');",
    '}',
    ''
  ]
);

fs.writeFileSync(helper,source,'utf8');
require(helper);
