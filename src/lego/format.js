export function money(value) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function pad(n) {
  return String(n).padStart(2, '0')
}

export function slug(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'course'
  )
}

function csvCell(value) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(model) {
  const lines = [
    ['Quantity', 'Part', 'Part number', 'Color', 'Color ID', 'Est. unit USD', 'Est. line USD'].join(','),
  ]
  for (const line of model.bill) {
    lines.push(
      [
        line.qty,
        line.name,
        line.number,
        line.colorName,
        line.colorId,
        line.price.toFixed(2),
        (line.price * line.qty).toFixed(2),
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\n') + '\n'
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** BrickLink wanted-list XML. No declaration — their uploader rejects one. */
export function toBricklinkXml(model) {
  const remark = xmlEscape(model.name.slice(0, 80))
  const items = model.bill
    .map(
      (line) => `  <ITEM>
    <ITEMTYPE>P</ITEMTYPE>
    <ITEMID>${line.number}</ITEMID>
    <COLOR>${line.colorId}</COLOR>
    <MINQTY>${line.qty}</MINQTY>
    <CONDITION>N</CONDITION>
    <REMARKS>${remark}</REMARKS>
  </ITEM>`,
    )
    .join('\n')
  return `<INVENTORY>\n${items}\n</INVENTORY>\n`
}

export function shoppingList(model) {
  const lines = [
    model.name,
    `${model.stats.parts} parts · ${model.stats.lots} lots · ${model.stats.courses} courses · about ${money(model.stats.dollars)}`,
    `${model.stats.width} × ${model.stats.depth} studs · ${(model.stats.mm.h / 10).toFixed(1)} cm tall`,
    '',
  ]
  for (const line of model.bill) {
    lines.push(
      `${String(line.qty).padStart(4, ' ')}×  ${line.name.padEnd(22, ' ')}  ${line.colorName.padEnd(20, ' ')}  ${line.number}`,
    )
  }
  lines.push('', 'Estimates are for planning. Upload the BrickLink XML for live lots.')
  return lines.join('\n')
}

export function download(filename, text, type) {
  const blob = new Blob([text], { type })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}
