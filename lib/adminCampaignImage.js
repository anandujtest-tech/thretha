export const MAX_CAMPAIGN_IMAGE_BYTES = 10 * 1024 * 1024

export async function validateCampaignImage(file) {
  if (!(file instanceof File)) throw new Error('Choose an image to upload.')
  if (file.size > MAX_CAMPAIGN_IMAGE_BYTES) throw new Error('Image is too large. Please choose an image under 10 MB.')
  if (!file.size) throw new Error('This image is empty.')

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  const avif = String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp' && ['avif', 'avis'].includes(String.fromCharCode(...bytes.slice(8, 12)))
  const valid = { 'image/jpeg': jpeg, 'image/png': png, 'image/webp': webp, 'image/avif': avif }
  if (!valid[file.type]) throw new Error("This image type isn't supported. Choose JPG, PNG, WebP or AVIF.")
}
