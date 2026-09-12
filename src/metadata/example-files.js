'use strict';

const PDFIUM_EXAMPLES_ROOT = 'Examples-Obsidian-PDFium-Gate';
const PDFIUM_EXAMPLE_ACTIVE_RECORD_ID = '11111111-1111-4111-8111-111111111111';
const PDFIUM_EXAMPLE_MISSING_RECORD_ID = '22222222-2222-4222-8222-222222222222';
const PDFIUM_EXAMPLE_INSTALLER_LOCALES = Object.freeze(['en','nb','de','es','sv','da','fr']);
const PDFIUM_EXAMPLE_INSTALLER_TEXT = Object.freeze({
  en:Object.freeze({
    name:'Example files for Obsidian Bases',
    description:'Copies the canonical Markdown and Bases examples to {{path}}. Nothing is copied automatically.',
    button:'Copy examples…',
    confirm:'Copy the example files to {{path}}? Existing files with the same example filenames in that folder will be overwritten. Other files in the folder are not changed.',
    success:'Copied {{count}} example files to {{path}}. {{overwritten}} existing example file(s) were overwritten.',
    failed:'Could not copy example files: {{error}}'
  }),
  nb:Object.freeze({
    name:'Eksempelfiler for Obsidian Bases',
    description:'Kopierer de kanoniske Markdown- og Bases-eksemplene til {{path}}. Ingenting kopieres automatisk.',
    button:'Kopier eksempler…',
    confirm:'Kopiere eksempelfilene til {{path}}? Eksisterende filer med de samme eksempelfilnavnene i denne mappen blir overskrevet. Andre filer i mappen endres ikke.',
    success:'Kopierte {{count}} eksempelfiler til {{path}}. {{overwritten}} eksisterende eksempelfil(er) ble overskrevet.',
    failed:'Kunne ikke kopiere eksempelfiler: {{error}}'
  }),
  de:Object.freeze({
    name:'Beispieldateien für Obsidian Bases',
    description:'Kopiert die kanonischen Markdown- und Bases-Beispiele nach {{path}}. Es wird nichts automatisch kopiert.',
    button:'Beispiele kopieren…',
    confirm:'Beispieldateien nach {{path}} kopieren? Vorhandene Dateien mit denselben Beispieldateinamen in diesem Ordner werden überschrieben. Andere Dateien im Ordner bleiben unverändert.',
    success:'{{count}} Beispieldateien nach {{path}} kopiert. {{overwritten}} vorhandene Beispieldatei(en) wurden überschrieben.',
    failed:'Beispieldateien konnten nicht kopiert werden: {{error}}'
  }),
  es:Object.freeze({
    name:'Archivos de ejemplo para Obsidian Bases',
    description:'Copia los ejemplos canónicos de Markdown y Bases en {{path}}. No se copia nada automáticamente.',
    button:'Copiar ejemplos…',
    confirm:'¿Copiar los archivos de ejemplo en {{path}}? Los archivos existentes con los mismos nombres de ejemplo en esa carpeta se sobrescribirán. Los demás archivos de la carpeta no se modificarán.',
    success:'Se copiaron {{count}} archivos de ejemplo en {{path}}. Se sobrescribieron {{overwritten}} archivo(s) de ejemplo existente(s).',
    failed:'No se pudieron copiar los archivos de ejemplo: {{error}}'
  }),
  sv:Object.freeze({
    name:'Exempelfiler för Obsidian Bases',
    description:'Kopierar de kanoniska Markdown- och Bases-exemplen till {{path}}. Inget kopieras automatiskt.',
    button:'Kopiera exempel…',
    confirm:'Kopiera exempelfilerna till {{path}}? Befintliga filer med samma exempelfilnamn i mappen skrivs över. Andra filer i mappen ändras inte.',
    success:'Kopierade {{count}} exempelfiler till {{path}}. {{overwritten}} befintlig(a) exempelfil(er) skrevs över.',
    failed:'Det gick inte att kopiera exempelfilerna: {{error}}'
  }),
  da:Object.freeze({
    name:'Eksempelfiler til Obsidian Bases',
    description:'Kopierer de kanoniske Markdown- og Bases-eksempler til {{path}}. Intet kopieres automatisk.',
    button:'Kopiér eksempler…',
    confirm:'Kopiér eksempelfilerne til {{path}}? Eksisterende filer med de samme eksempelfilnavne i mappen bliver overskrevet. Andre filer i mappen ændres ikke.',
    success:'Kopierede {{count}} eksempelfiler til {{path}}. {{overwritten}} eksisterende eksempelfil(er) blev overskrevet.',
    failed:'Eksempelfilerne kunne ikke kopieres: {{error}}'
  }),
  fr:Object.freeze({
    name:'Fichiers d’exemple pour Obsidian Bases',
    description:'Copie les exemples Markdown et Bases canoniques dans {{path}}. Rien n’est copié automatiquement.',
    button:'Copier les exemples…',
    confirm:'Copier les fichiers d’exemple dans {{path}} ? Les fichiers existants portant les mêmes noms d’exemple dans ce dossier seront remplacés. Les autres fichiers du dossier ne seront pas modifiés.',
    success:'{{count}} fichiers d’exemple copiés dans {{path}}. {{overwritten}} fichier(s) d’exemple existant(s) ont été remplacés.',
    failed:'Impossible de copier les fichiers d’exemple : {{error}}'
  })
});

function metadataExampleUiText(i18n, key, params = {}) {
  const locale = i18n?.getResolvedLanguage?.() || 'en';
  const dictionary = PDFIUM_EXAMPLE_INSTALLER_TEXT[locale] || PDFIUM_EXAMPLE_INSTALLER_TEXT.en;
  const template = dictionary[key] || PDFIUM_EXAMPLE_INSTALLER_TEXT.en[key] || key;
  return String(template).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match,name) => {
    return Object.prototype.hasOwnProperty.call(params,name) ? String(params[name]) : `{{${name}}}`;
  });
}

function metadataExampleReadmeMarkdown() {
  return `# PDFium Gate examples

This folder contains optional PDFium Gate examples for inspecting the plugin's metadata model with ordinary Obsidian files.

The files in this folder are **examples only**. They are deliberately stored outside \`File Metadata/\`, so PDFium Gate does not index them as real document records. Obsidian Bases can still read their YAML/frontmatter directly.

## Included files

- \`Example - Active PDF record.md\` — a complete example using all current factory metadata fields.
- \`Example - Missing PDF record.md\` — an example of a preserved record whose PDF is missing.
- \`Example PDF Document Register.base\` — a native Obsidian Bases table that reads the two example Markdown notes directly, without the PDFium Gate custom Base view.

## Important

Do not move these example Markdown files unchanged into \`File Metadata/\`. They contain fixed sample UUIDs and placeholder PDF links.

The examples are copied only when you choose the example-file action in PDFium Gate Settings. Running that action again restores the canonical example set and overwrites these four example filenames after an explicit warning. Other files in this folder are not changed.
`;
}

function metadataExampleActiveRecordMarkdown() {
  const schema = metadataDefaultSchema();
  return metadataRecordSerializeMarkdown({
    id:PDFIUM_EXAMPLE_ACTIVE_RECORD_ID,
    filePath:'Example Documents/example-letter.pdf',
    status:METADATA_RECORD_STATUS_ACTIVE,
    values:{
      document_date:'2016-03-17',
      document_time:'14:35',
      sender:'Example Municipality',
      document_type:'letter',
      response_received:true,
      response_received_date:'2016-03-24',
      response_sent:true,
      response_sent_date:'2016-03-25',
      response_sent_link:'[[Example Documents/example-response.md]]'
    }
  }, schema) + '# Example active PDF metadata record\n\nThis is an ordinary Markdown note with YAML/frontmatter. Obsidian Bases can use the properties directly.\n';
}

function metadataExampleMissingRecordMarkdown() {
  const schema = metadataDefaultSchema();
  return metadataRecordSerializeMarkdown({
    id:PDFIUM_EXAMPLE_MISSING_RECORD_ID,
    filePath:'Example Documents/missing-example-decision.pdf',
    status:METADATA_RECORD_STATUS_MISSING,
    values:{
      document_date:'2015-11-02',
      sender:'Example Public Office',
      document_type:'decision',
      response_received:false,
      response_sent:false
    }
  }, schema) + '# Example missing-PDF metadata record\n\nThe metadata survives even when the linked PDF is missing. The record can later be explicitly relinked by PDFium Gate.\n';
}

function metadataExampleNativeBaseYaml() {
  const schema = metadataDefaultSchema();
  const fields = metadataDocumentRegisterBaseFields(schema);
  const q = value => JSON.stringify(String(value));
  const lines = [
    '# PDFium Gate examples — native Obsidian Bases view',
    '# This Base intentionally uses the built-in table view, not the PDFium Gate custom view.',
    'filters:',
    '  and:',
    `    - ${q(`file.inFolder("${PDFIUM_EXAMPLES_ROOT}")`)}`,
    `    - ${q('filemeta_type == "pdf"')}`,
    `    - ${q('filemeta_profile == "document"')}`,
    'properties:'
  ];
  for (const field of fields) {
    lines.push(`  ${field.property}:`);
    lines.push(`    displayName: ${q(field.label)}`);
  }
  lines.push('  filemeta_status:');
  lines.push(`    displayName: ${q('Status')}`);
  lines.push('  filemeta_file:');
  lines.push(`    displayName: ${q('PDF')}`);
  lines.push('  filemeta_id:');
  lines.push(`    displayName: ${q('Metadata ID')}`);
  lines.push('views:');
  lines.push('  - type: table');
  lines.push(`    name: ${q('PDF metadata examples')}`);
  lines.push('    order:');
  for (const field of fields) lines.push(`      - ${field.property}`);
  lines.push('      - filemeta_status');
  lines.push('      - filemeta_file');
  lines.push('      - filemeta_id');
  lines.push('    sort:');
  lines.push('      - property: document_date');
  lines.push('        direction: DESC');
  return `${lines.join('\n')}\n`;
}

function metadataExampleFiles() {
  return Object.freeze([
    Object.freeze({ path:`${PDFIUM_EXAMPLES_ROOT}/README.md`, content:metadataExampleReadmeMarkdown() }),
    Object.freeze({ path:`${PDFIUM_EXAMPLES_ROOT}/Example - Active PDF record.md`, content:metadataExampleActiveRecordMarkdown() }),
    Object.freeze({ path:`${PDFIUM_EXAMPLES_ROOT}/Example - Missing PDF record.md`, content:metadataExampleMissingRecordMarkdown() }),
    Object.freeze({ path:`${PDFIUM_EXAMPLES_ROOT}/Example PDF Document Register.base`, content:metadataExampleNativeBaseYaml() })
  ]);
}

module.exports = {
  PDFIUM_EXAMPLES_ROOT,
  PDFIUM_EXAMPLE_ACTIVE_RECORD_ID,
  PDFIUM_EXAMPLE_MISSING_RECORD_ID,
  PDFIUM_EXAMPLE_INSTALLER_LOCALES,
  PDFIUM_EXAMPLE_INSTALLER_TEXT,
  metadataExampleUiText,
  metadataExampleReadmeMarkdown,
  metadataExampleActiveRecordMarkdown,
  metadataExampleMissingRecordMarkdown,
  metadataExampleNativeBaseYaml,
  metadataExampleFiles
};
