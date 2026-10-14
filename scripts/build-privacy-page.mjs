import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../PRIVACY.md', import.meta.url))
const output = fileURLToPath(new URL('../docs/privacy.html', import.meta.url))
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const inline = value => escape(value)
  .replace(/\[([^\]]+)\]\(((?:https:\/\/|mailto:)[^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

// Deliberately supports only the Markdown constructs used in PRIVACY.md.
const lines = readFileSync(source, 'utf8').replaceAll('\r\n', '\n').trim().split('\n')
const blocks = []
for (let index = 0; index < lines.length;) {
  const line = lines[index]
  if (!line.trim()) { index++; continue }
  if (/^#{1,2} /.test(line)) {
    const level = line.startsWith('## ') ? 2 : 1
    blocks.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`)
    index++; continue
  }
  if (line.startsWith('|')) {
    const rows = []
    while (lines[index]?.startsWith('|')) rows.push(lines[index++])
    const cells = row => row.slice(1, -1).split('|').map(value => value.trim())
    const headers = cells(rows[0]).map(value => `<th scope="col">${inline(value)}</th>`).join('')
    const body = rows.slice(2).map(row => `<tr>${cells(row).map(value => `<td>${inline(value)}</td>`).join('')}</tr>`).join('\n')
    blocks.push(`<div class="table-wrap" tabindex="0" role="region" aria-label="Datos utilizados por función"><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`)
    continue
  }
  if (line.startsWith('- ')) {
    const items = []
    while (lines[index]?.startsWith('- ')) items.push(`<li>${inline(lines[index++].slice(2))}</li>`)
    blocks.push(`<ul>${items.join('\n')}</ul>`); continue
  }
  const paragraph = []
  while (index < lines.length && lines[index].trim() && !/^(#{1,2} |\||- )/.test(lines[index])) paragraph.push(lines[index++])
  blocks.push(`<p>${inline(paragraph.join(' '))}</p>`)
}

const html = `<!doctype html>
<!-- Generated from PRIVACY.md by scripts/build-privacy-page.mjs; edit the source. -->
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Política de privacidad de BlinkStream, publicado por APX Studio: datos, servicios externos, seguridad y derechos del usuario.">
  <title>Política de privacidad · BlinkStream · APX Studio</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #0b0b10; color: #e8e8f0; }
    * { box-sizing: border-box; }
    body { margin: 0; line-height: 1.75; }
    main { max-width: 960px; margin: auto; padding: 32px clamp(16px, 4vw, 40px) 64px; }
    h1 { font-size: clamp(1.8rem, 5vw, 2.6rem); line-height: 1.2; }
    h2 { margin-top: 2.3rem; font-size: 1.3rem; line-height: 1.4; }
    a { color: #c7a0ff; text-underline-offset: 3px; overflow-wrap: anywhere; }
    a:focus-visible, .table-wrap:focus-visible { outline: 2px solid #c7a0ff; outline-offset: 4px; }
    p, li { overflow-wrap: anywhere; }
    li { margin: 12px 0; }
    ul { padding-left: 24px; }
    .table-wrap { overflow-x: auto; border: 1px solid #33333f; border-radius: 12px; }
    table { width: 100%; min-width: 640px; border-collapse: collapse; text-align: left; }
    th, td { padding: 14px; vertical-align: top; border-bottom: 1px solid #33333f; }
    th { background: #211832; } tr:last-child td { border-bottom: 0; }
    footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #33333f; }
  </style>
</head>
<body>
  <main>
    <nav aria-label="Navegación"><a href="./">← Volver a BlinkStream</a></nav>
    <article>
${blocks.join('\n')}
    </article>
    <footer>APX Studio · BlinkStream</footer>
  </main>
</body>
</html>
`
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== html) throw new Error('Regenerate docs/privacy.html from PRIVACY.md')
  console.log('Privacy page matches PRIVACY.md')
} else {
  writeFileSync(output, html)
  console.log('Generated docs/privacy.html from PRIVACY.md')
}
