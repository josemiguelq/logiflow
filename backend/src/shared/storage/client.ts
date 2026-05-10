import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

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

/**
 * Resolves a stored path to a URL ready to be sent to clients.
 * - null/undefined → null
 * - data: or http(s): URIs → returned as-is (legacy values)
 * - storage path (e.g. "proof/abc.jpg") → S3 presigned URL valid for 1 hour
 */
export async function resolveImageUrl(
  path: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path
  }
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: path })
  return getSignedUrl(s3, command, { expiresIn })
}

/** @deprecated Use resolveImageUrl for proper signed URLs. */
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
 * Throws a plain Error with a human-readable message on failure.
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

  try {
    await s3.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         path,
      Body:        Buffer.from(base64, 'base64'),
      ContentType: mime,
    }))
  } catch (err: unknown) {
    // Supabase returns JSON errors but the S3 SDK expects XML, so the real
    // HTTP status is buried in $metadata. Expose a readable message instead.
    const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
    const status = meta?.httpStatusCode ?? 'unknown'
    throw new Error(`Storage upload failed (HTTP ${status}): bucket "${BUCKET}" may not exist or credentials are invalid`)
  }

  return path
}
