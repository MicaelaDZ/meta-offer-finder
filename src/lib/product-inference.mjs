const normalized = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function inferProduct(ad) {
  const copy = String(ad?.copy || '').replace(/https?:\/\/\S+/g, '').trim();
  const value = normalized(copy);
  const kinds = [
    ['pack', /\b(pack digital|kit digital|digital bundle|bundle digital)\b/],
    ['curso', /\b(curso|online course|video course|clases en video|formacion online)\b/],
    ['software', /\b(software|saas|aplicacion|app)\b/],
    ['ebook', /\b(e-?book|recetario digital)\b/],
    ['plantilla', /\b(plantillas?|digital templates?|templates? digitais)\b/],
    ['imprimible', /\b(imprimibles?|printable|planner digital)\b/],
  ];
  const category = kinds.find(([, pattern]) => pattern.test(value))?.[0] || null;
  if (!category || ad?.copyTruncated) return { category, probableName: null, nameInferred: false };
  const type = /(?:e-?book|recetario digital|curso(?: online| grabado)?|online course|video course|software|saas|plantillas?(?: digital(?:es)?)?|digital templates?|pack digital|kit digital|digital bundle|imprimibles?|printable|planner digital)\s*(?:de\s+|sobre\s+|[:—-]\s*)?/i;
  const matched = type.exec(copy);
  let name = matched ? copy.slice(matched.index + matched[0].length).split(/\n|[.!?]|\b(?:por|precio|price|comprar|compralo|buy|solo|for|a partir)\b|[$€]/i)[0].trim() : '';
  name = name.replace(/^["“'\s]+|["”'\s]+$/g, '').replace(/^PDF\s*/i, '').trim();
  if (name.length < 4 || name.length > 120 || /^(gratis|gratuito|online|digital|pdf|ahora|now)$/i.test(name)) name = '';
  return { category, probableName: name || null, nameInferred: Boolean(name) };
}
