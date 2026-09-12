'use strict';
const fs=require('fs');
const path=require('path');
const helper=path.join(__dirname,'refactor-0.1.223.js');
let source=fs.readFileSync(helper,'utf8');

function replaceRegion(startMarker,endMarker,replacement) {
  const start=source.indexOf(startMarker);
  if(start<0) throw new Error(`start marker missing: ${startMarker}`);
  const end=source.indexOf(endMarker,start);
  if(end<0) throw new Error(`end marker missing: ${endMarker}`);
  source=source.slice(0,start)+replacement+source.slice(end);
}

replaceRegion(
  '// The standard PDF document register is a profile-specific view over the generic',
  "replaceRequired('src/metadata/example-files.js', \"    pdfPath:'Example Documents/example-letter.pdf',\"",
  `// The standard PDF document register and native example Base are profile-specific\n// views over the generic record layer. Duplicate the existing type-filter line so\n// quoting style remains exactly native to each file.\nfunction insertProfileFilterLine(rel) {\n  let text=read(rel);\n  const lines=text.split('\\n');\n  const index=lines.findIndex(line=>line.includes('filemeta_type') && line.includes('pdf'));\n  if(index<0) throw new Error(\\`${'${rel}'}: filemeta_type/pdf filter line missing\\`);\n  if(lines.some(line=>line.includes('filemeta_profile') && line.includes('document'))) return;\n  const profileLine=lines[index].replace('filemeta_type','filemeta_profile').replace('pdf','document');\n  lines.splice(index+1,0,profileLine);\n  write(rel,lines.join('\\n'));\n}\ninsertProfileFilterLine('src/metadata/document-register-base-config.js');\ninsertProfileFilterLine('src/metadata/example-files.js');\n\n`
);

replaceRegion(
  "replaceRequired(\n  'docs/examples/Example PDF Document Register.base',",
  '// Keep the example verifier synchronized with the new six system properties.',
  `insertProfileFilterLine('docs/examples/Example PDF Document Register.base');\n\n`
);

fs.writeFileSync(helper,source,'utf8');
require(helper);
