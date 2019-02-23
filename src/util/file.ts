export type Content = StrictUnion<ArrayBuffer | ArrayBufferView | Blob | string>

// NOTE: this should be called from a user-initiated DOM event, or else the
// below `a.click()` won't work.
export function saveFileWithDialog(content: Content, mime: string, filename: string) {
  const file = new Blob([content], {type: mime})
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.style.setProperty('display', 'none')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
}