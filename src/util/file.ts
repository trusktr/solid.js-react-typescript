export type Content = StrictUnion<ArrayBuffer | ArrayBufferView | Blob | string>

/**
 * Opens a save dialog to save the given content of given mime type, with
 * default pre-filled filename.
 */
export function saveFileWithDialog(content: Content, mime: string, filename: string): void {
  const file = new Blob([content], {type: mime})
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.style.setProperty('display', 'none')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  URL.revokeObjectURL(url)
}