function yamlQuote(value) {
  return JSON.stringify(String(value == null ? '' : value));
}

function serializeCategoryConfig(config) {
  const lines = [
    '# PDFium Gate — menneskelesbare markeringskategorier',
    '# Denne filen kan redigeres manuelt, men plugin-editoren anbefales.',
    'version: 1',
    `inherit: ${config?.inherit === false ? 'false' : 'true'}`,
    '',
    'categories:'
  ];
  const cats = Array.isArray(config?.categories) ? config.categories : [];
  if (!cats.length) {
    lines[lines.length - 1] = 'categories: []';
  } else {
    for (const c of cats) {
      lines.push(`  - id: ${yamlQuote(c.id)}`);
      if (c.name !== undefined) lines.push(`    name: ${yamlQuote(c.name)}`);
      if (c.color !== undefined) lines.push(`    color: ${yamlQuote(normalizeHexColor(c.color))}`);
      if (c.shortcut !== undefined && c.shortcut !== null && c.shortcut !== '') lines.push(`    shortcut: ${Number(c.shortcut)}`);
      if (c.enabled === false) lines.push('    enabled: false');
      else if (c.enabled === true) lines.push('    enabled: true');
      if (Number.isFinite(Number(c.order))) lines.push(`    order: ${Number(c.order)}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
