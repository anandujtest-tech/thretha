import { api } from '@/lib/tc'

const CLOUDINARY_HOST = 'res.cloudinary.com'

function uploadToCloudinary({ file, signature, onProgress }) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(
      'POST',
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloud_name)}/${signature.resource_type}/upload`
    )

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    })
    request.addEventListener('error', () => reject(new Error('Could not connect to Cloudinary. Please try again.')))
    request.addEventListener('load', () => {
      let result
      try {
        result = JSON.parse(request.responseText)
      } catch {
        reject(new Error('Cloudinary returned an invalid upload response.'))
        return
      }

      if (request.status < 200 || request.status >= 300) {
        reject(new Error(result?.error?.message || 'Cloudinary upload failed. Please try again.'))
        return
      }

      let secureUrl
      try {
        secureUrl = new URL(result.secure_url)
      } catch {
        reject(new Error('Cloudinary returned an invalid media URL.'))
        return
      }
      if (secureUrl.protocol !== 'https:' || secureUrl.hostname !== CLOUDINARY_HOST || !result.public_id) {
        reject(new Error('Cloudinary returned an unexpected media URL.'))
        return
      }

      resolve({ url: secureUrl.toString(), type: signature.resource_type, public_id: result.public_id })
    })

    const body = new FormData()
    body.append('file', file)
    body.append('api_key', signature.api_key)
    body.append('timestamp', String(signature.timestamp))
    body.append('folder', signature.folder)
    body.append('signature', signature.signature)
    request.send(body)
  })
}

export async function uploadMediaFile(file, { token, folder = 'catalog', onProgress } = {}) {
  if (!(file instanceof File)) throw new Error('Choose a file to upload.')

  const resourceType = (file.type || '').startsWith('video/') ? 'video' : 'image'
  const signature = await api('/admin/media/signature', {
    method: 'POST',
    token,
    body: { folder, resourceType },
  })

  if (!signature?.cloud_name || !signature?.api_key || !signature?.signature || !signature?.timestamp || !signature?.folder) {
    throw new Error('The server returned an incomplete Cloudinary upload signature.')
  }

  return uploadToCloudinary({ file, signature, onProgress })
}
