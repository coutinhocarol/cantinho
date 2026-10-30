import { failureFromResponse, networkFailure } from './failure'

const MAX_SIDE = 1600

/** Reduz a foto (lado maior de 1600 px) e recomprime, para ocupar pouco espaço no banco. */
export async function prepareImage(file: Blob): Promise<Blob> {
  if (file.type === 'image/gif') return file // preserva a animação
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  const toBlob = (type: string) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, 0.85))
  const out = (await toBlob('image/webp')) ?? (await toBlob('image/jpeg')) ?? file
  return out.size < file.size || scale < 1 ? out : file
}

/** Envia a foto para a conta e devolve o id dela. */
export async function uploadImage(blob: Blob, base = '/api'): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${base}/images`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob })
  } catch {
    throw networkFailure()
  }
  if (!res.ok) {
    const failure = await failureFromResponse(res.clone())
    if (failure) throw failure
    let detail = ''
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? ''
    } catch {
      /* sem corpo */
    }
    throw new Error(detail || `Não consegui enviar a foto (${res.status})`)
  }
  return ((await res.json()) as { id: string }).id
}

export const imageUrl = (id: string) => `/api/images/${id}`
