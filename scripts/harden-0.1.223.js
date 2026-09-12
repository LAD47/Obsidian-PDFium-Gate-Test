'use strict';
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const write=(rel,text)=>fs.writeFileSync(path.join(ROOT,rel),text,'utf8');
function replaceRequired(rel,from,to){
  const before=read(rel);
  if(!before.includes(from)) throw new Error(`${rel}: expected text not found`);
  write(rel,before.replace(from,to));
}

replaceRequired(
  'src/metadata/record-contract.js',
  'const METADATA_RECORD_SYSTEM_PROPERTY_SET = new Set(METADATA_RECORD_SYSTEM_PROPERTIES);\nconst METADATA_RECORD_UUID_V4_PATTERN',
  "const METADATA_RECORD_SYSTEM_PROPERTY_SET = new Set(METADATA_RECORD_SYSTEM_PROPERTIES);\nconst METADATA_RECORD_LEGACY_PREFIX = 'pdfmeta_';\nconst METADATA_RECORD_UUID_V4_PATTERN"
);
replaceRequired(
  'src/metadata/record-contract.js',
  "  const unknownSystem=Object.keys(frontmatter).filter(key=>String(key).startsWith('filemeta_') && !METADATA_RECORD_SYSTEM_PROPERTY_SET.has(key));",
  "  const legacySystem=Object.keys(frontmatter).filter(key=>String(key).startsWith(METADATA_RECORD_LEGACY_PREFIX));\n  if(legacySystem.length) return {ok:false,error:`legacy pdfmeta_ systemfelter støttes ikke: ${legacySystem.join(', ')}`};\n  const unknownSystem=Object.keys(frontmatter).filter(key=>String(key).startsWith('filemeta_') && !METADATA_RECORD_SYSTEM_PROPERTY_SET.has(key));"
);
replaceRequired(
  'src/metadata/record-contract.js',
  "  for(const key of Object.keys(values).sort((a,b)=>a.localeCompare(b))) if(!seen.has(key) && !String(key).startsWith('filemeta_')) ordered.push(key);",
  "  for(const key of Object.keys(values).sort((a,b)=>a.localeCompare(b))) if(!seen.has(key) && !String(key).startsWith('filemeta_') && !String(key).startsWith(METADATA_RECORD_LEGACY_PREFIX)) ordered.push(key);"
);
replaceRequired(
  'src/metadata/record-contract.js',
  '  METADATA_RECORD_SYSTEM_PROPERTIES,\n  METADATA_RECORD_SUPPORTED,',
  '  METADATA_RECORD_SYSTEM_PROPERTIES,\n  METADATA_RECORD_LEGACY_PREFIX,\n  METADATA_RECORD_SUPPORTED,'
);

replaceRequired(
  'src/metadata/schema-contract.js',
  "const METADATA_RESERVED_PREFIX = 'filemeta_';",
  "const METADATA_RESERVED_PREFIX = 'filemeta_';\nconst METADATA_LEGACY_RESERVED_PREFIX = 'pdfmeta_';"
);
replaceRequired(
  'src/metadata/schema-contract.js',
  "        if (String(field.property).startsWith(METADATA_RESERVED_PREFIX)) errors.push(`${path}.property: reserved prefix ${METADATA_RESERVED_PREFIX}`);",
  "        if (String(field.property).startsWith(METADATA_RESERVED_PREFIX)) errors.push(`${path}.property: reserved prefix ${METADATA_RESERVED_PREFIX}`);\n        if (String(field.property).startsWith(METADATA_LEGACY_RESERVED_PREFIX)) errors.push(`${path}.property: reserved legacy prefix ${METADATA_LEGACY_RESERVED_PREFIX}`);"
);
replaceRequired(
  'src/metadata/schema-contract.js',
  '  METADATA_RESERVED_PREFIX,\n  METADATA_PROPERTY_PATTERN,',
  '  METADATA_RESERVED_PREFIX,\n  METADATA_LEGACY_RESERVED_PREFIX,\n  METADATA_PROPERTY_PATTERN,'
);

replaceRequired(
  'scripts/verify/contracts/12-metadata-schema.js',
  "  if(metadataValidateSchema(reserved).ok) fail('reserved filemeta_ prefix was accepted');",
  "  if(metadataValidateSchema(reserved).ok) fail('reserved filemeta_ prefix was accepted');\n  const legacyReserved=metadataClone(schema);\n  legacyReserved.fields[0].property='pdfmeta_user_field';\n  if(metadataValidateSchema(legacyReserved).ok) fail('legacy reserved pdfmeta_ prefix was accepted');"
);

replaceRequired(
  'scripts/check-filemeta-foundation.js',
  "if(old.ok) fail('old 0.1.222 persisted record format must not be accepted');",
  "if(old.ok) fail('old 0.1.222 persisted record format must not be accepted');\nconst mixed=record.metadataRecordFromFrontmatter({...frontmatter,pdfmeta_id:id},{fields:[]});\nif(mixed.ok) fail('mixed filemeta_/pdfmeta_ record must fail closed');\nconst legacyValueMarkdown=record.metadataRecordSerializeMarkdown({id,fileType:'pdf',profile:'document',filePath:'Example/test.pdf',status:'active',values:{pdfmeta_fake:'legacy'}},{fields:[]});\nif(legacyValueMarkdown.includes('pdfmeta_fake:')) fail('serializer emitted legacy reserved user value');"
);

replaceRequired(
  'docs/architecture/08-metadata-schema.md',
  'System metadata will use the reserved `filemeta_*` namespace. User properties must match `^[a-z][a-z0-9_]{0,63}$` and may not collide with reserved Obsidian/Bases names declared by the schema contract.',
  'System metadata uses the reserved `filemeta_*` namespace. The former pre-release `pdfmeta_*` namespace also remains reserved so legacy-looking fields cannot be created as user metadata. User properties must match `^[a-z][a-z0-9_]{0,63}$` and may not collide with reserved Obsidian/Bases names declared by the schema contract.'
);

console.log('0.1.223 legacy namespace hardening applied.');
