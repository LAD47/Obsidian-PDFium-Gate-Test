'use strict';

// Canonical parent <-> annotator request/result contract. Both the renderer
// transport and generated annotator runtime consume this same source at build
// time so message names and response policies cannot drift independently.
const ANNOTATOR_MESSAGE_CONTRACTS = Object.freeze({
  'prewarm-keyboard-model':Object.freeze({resultType:'prewarm-keyboard-model-result',timeoutMs:90000,timeoutMessage:'Tidsavbrudd ved keyboard-model prewarm.',failureMessage:'Keyboard-model prewarm feilet.',responsePolicy:'ok'}),
  'keyboard-expand-selection':Object.freeze({resultType:'keyboard-expand-result',timeoutMs:90000,timeoutMessage:'Tidsavbrudd mens PDFium utvidet tastatur-selection.',failureMessage:'Keyboard-selection kunne ikke utvides.',responsePolicy:'ok'}),
  'filter-selection-artifacts':Object.freeze({resultType:'filter-selection-result',timeoutMs:90000,timeoutMessage:'Tidsavbrudd mens PDFium filtrerte topp-/bunntekst.',failureMessage:'Artifact-filter feilet.',responsePolicy:'ok'}),
  'find-selection':Object.freeze({resultType:'selection-result',timeoutMs:90000,timeoutMessage:'Tidsavbrudd mens PDFium søkte etter markert tekst.',failureMessage:'Selection-søk feilet.',responsePolicy:'ok'}),
  'inspect-point-highlights':Object.freeze({resultType:'inspect-point-result',timeoutMs:90000,timeoutMessage:'Tidsavbrudd mens PDFium hit-testet eksisterende highlights.',failureMessage:'Highlight hit-test feilet.',responsePolicy:'ok'}),
  'inspect-selection-highlights':Object.freeze({resultType:'inspect-selection-result',timeoutMs:90000,timeoutMessage:'Tidsavbrudd mens PDFium kontrollerte eksisterende highlights.',failureMessage:'Highlight-inspeksjon feilet.',responsePolicy:'ok'}),
  'read-existing-highlight-selection':Object.freeze({resultType:'read-highlight-selection-result',timeoutMs:90000,timeoutMessage:'Tidsavbrudd mens PDFium leste kategori-markeringen.',failureMessage:'Kunne ikke lese kategori-markeringen.',responsePolicy:'ok'}),
  'modify-existing-highlight':Object.freeze({resultType:'modify-highlight-result',timeoutMs:90000,timeoutMessage:'Tidsavbrudd mens PDFium endret eksisterende highlight.',failureMessage:'Kunne ikke endre eksisterende highlight.',responsePolicy:'ok-pdf-buffer'}),
  'write-selection-highlight':Object.freeze({resultType:'write-selection-result',timeoutMs:90000,timeoutMessage:'Tidsavbrudd mens PDFium skrev selection-highlight.',failureMessage:'Selection-highlight kunne ikke skrives.',responsePolicy:'allow-result'}),
  'write-highlight':Object.freeze({resultType:'write-result',timeoutMs:60000,timeoutMessage:'Tidsavbrudd mens PDFium skrev annotasjonen.',failureMessage:'Ukjent annotasjonsfeil.',responsePolicy:'ok-pdf-buffer'})
});

function getAnnotatorMessageContract(type) {
  return ANNOTATOR_MESSAGE_CONTRACTS[String(type||'')]||null;
}

function isAnnotatorRequestType(type) {
  return !!getAnnotatorMessageContract(type);
}

module.exports={ANNOTATOR_MESSAGE_CONTRACTS,getAnnotatorMessageContract,isAnnotatorRequestType};
