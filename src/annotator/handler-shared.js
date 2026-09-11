'use strict';

function pdfiumGateHighlightGroupKey(annotationId) {
    const m = String(annotationId || '').match(/^(pdfiumgate-[0-9a-f]{32})-p\d+$/i);
    return m ? String(m[1]).toLowerCase() : null;
}

module.exports = { pdfiumGateHighlightGroupKey };
