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
  'src/metadata/base-presentation.js',
  "  if (String(frontmatter.filemeta_type || '') !== 'pdf') return { ok:false, reason:'not-pdf-document-record', fields:[] };",
  "  if (String(frontmatter.filemeta_type || '') !== 'pdf' || String(frontmatter.filemeta_profile || '') !== 'document') return { ok:false, reason:'not-pdf-document-record', fields:[] };"
);

replaceRequired(
  'scripts/check-filemeta-foundation.js',
  "const record=require(path.join(root,'src/metadata/record-contract.js'));",
  "const record=require(path.join(root,'src/metadata/record-contract.js'));\nconst basePresentation=require(path.join(root,'src/metadata/base-presentation.js'));"
);
replaceRequired(
  'scripts/check-filemeta-foundation.js',
  "const id='11111111-1111-4111-8111-111111111111';",
  "const presentationSchema={fields:[{property:'sender',label:'Sender',type:'text',active:true,show_in_default_base:true}]};\nconst presentationRegistry={format(_field,value){return String(value ?? '');}};\nif(!basePresentation.metadataBasePresentFrontmatter({filemeta_type:'pdf',filemeta_profile:'document',sender:'Example'},presentationSchema,{},presentationRegistry).ok) fail('PDF/document profile is not accepted by Base presentation');\nif(basePresentation.metadataBasePresentFrontmatter({filemeta_type:'pdf',filemeta_profile:'other',sender:'Example'},presentationSchema,{},presentationRegistry).ok) fail('Base presentation accepted a non-document PDF profile');\nconst id='11111111-1111-4111-8111-111111111111';"
);

replaceRequired(
  'scripts/verify/contracts/18-document-register-bases.js',
  "    filemeta_type:'pdf',\n    filemeta_version:1,",
  "    filemeta_type:'pdf',\n    filemeta_profile:'document',\n    filemeta_version:2,"
);
replaceRequired(
  'scripts/verify/contracts/18-document-register-bases.js',
  "if(!standardBaseYaml.includes('file.inFolder(\\\\\"File Metadata\\\\\")')||!standardBaseYaml.includes('filemeta_type == \\\\\"pdf\\\\\"')) fail('standard Dokumentregister Base does not scope query to canonical PDF metadata records');",
  "if(!standardBaseYaml.includes('file.inFolder(\\\\\"File Metadata\\\\\")')||!standardBaseYaml.includes('filemeta_type == \\\\\"pdf\\\\\"')||!standardBaseYaml.includes('filemeta_profile == \\\\\"document\\\\\"')) fail('standard Dokumentregister Base does not scope query to canonical PDF/document metadata records');"
);

const i18nReplacements={
  'src/i18n/en.json':['Hides only the technical File Metadata folder visually in Obsidian File Explorer.','Hides only the File Metadata record folder visually in Obsidian File Explorer.'],
  'src/i18n/nb.json':['Skjuler bare den tekniske File Metadata-mappen visuelt i Obsidian File Explorer.','Skjuler bare mappen File Metadata med metadataregistreringene visuelt i Obsidian File Explorer.'],
  'src/i18n/de.json':['Blendet nur den technischen Ordner File Metadata im Obsidian-Datei-Explorer visuell aus.','Blendet nur den Ordner File Metadata mit den Metadatensätzen im Obsidian-Datei-Explorer visuell aus.'],
  'src/i18n/es.json':['Solo oculta visualmente la carpeta técnica File Metadata en el explorador de archivos de Obsidian.','Solo oculta visualmente la carpeta File Metadata que contiene los registros de metadatos en el explorador de archivos de Obsidian.'],
  'src/i18n/fr.json':['Masque uniquement visuellement le dossier technique File Metadata dans l’explorateur de fichiers d’Obsidian.','Masque uniquement visuellement le dossier File Metadata contenant les enregistrements de métadonnées dans l’explorateur de fichiers d’Obsidian.'],
  'src/i18n/da.json':['Skjuler kun den tekniske mappe File Metadata visuelt i Obsidians filoversigt.','Skjuler kun mappen File Metadata med metadataregistreringerne visuelt i Obsidians filoversigt.'],
  'src/i18n/sv.json':['Döljer endast den tekniska mappen File Metadata visuellt i Obsidians filutforskare.','Döljer endast mappen File Metadata med metadataposterna visuellt i Obsidians filutforskare.']
};
for(const [rel,[from,to]] of Object.entries(i18nReplacements)) replaceRequired(rel,from,to);

console.log('0.1.223 profile boundary and user-facing metadata-folder wording polished.');
