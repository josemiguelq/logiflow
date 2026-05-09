import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const BUCKET       = process.env.STORAGE_BUCKET ?? 'logiflow'

const s3 = new S3Client({
  endpoint:        `${SUPABASE_URL}/storage/v1/s3`,
  region:          process.env.STORAGE_REGION ?? 'auto',
  credentials: {
    accessKeyId:     process.env.STORAGE_ACCESS_KEY_ID     ?? '',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? '',
  },
  forcePathStyle: true,
})

function mimeToExt(mime: string): string {
  if (mime.includes('png'))  return 'png'
  if (mime.includes('gif'))  return 'gif'
  if (mime.includes('webp')) return 'webp'
  return 'jpg'
}

/** Returns a public URL for a stored path, or the value as-is if it's already a URL/data-URI. */
export function getPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
}

/**
 * Uploads a base64 data-URI to Supabase Storage via S3 protocol.
 * Returns the stored path (without bucket or base URL).
 */
export async function uploadBase64(pathWithoutExt: string, dataUri: string): Promise<string> {
  const commaIdx = dataUri.indexOf(',')
  if (commaIdx === -1) throw new Error('Invalid data URI')

  const header = dataUri.slice(0, commaIdx)
  const base64 = dataUri.slice(commaIdx + 1)
  const mimeMatch = header.match(/data:([^;]+);/)
  const mime = mimeMatch?.[1] ?? 'image/jpeg'
  const ext  = mimeToExt(mime)
  const path = `${pathWithoutExt}.${ext}`

  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         path,
    Body:        Buffer.from(base64, 'base64'),
    ContentType: mime,
  }))

  return path
}
