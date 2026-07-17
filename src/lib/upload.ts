const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

/**
 * Upload mechanism — Option A from wtd.html §4: base64-in-DB.
 * Converts a submitted `File` (read from FormData) into a `data:<mimetype>;base64,<data>`
 * string suitable for storing directly in a String column (idDocUrl, selfieUrl, photoUrl).
 * Zero infra, works immediately on SQLite/local dev.
 */
export async function fileToDataUrl(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File "${file.name}" exceeds the 5MB size limit.`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')
  const mimeType = file.type || 'application/octet-stream'
  return `data:${mimeType};base64,${base64}`
}
