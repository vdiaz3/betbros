export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function page({ title, lang = 'es', body, head = '' }) {
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/assets/base.css">
${head}
</head>
<body>
<header class="brand"><span class="oval">Ford</span><span>IM</span></header>
<main>${body}</main>
</body>
</html>`;
}
