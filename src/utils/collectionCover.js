export async function prepareCollectionCover(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Elige una imagen PNG, JPG o WebP.')
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen debe ocupar menos de 5 MB.')
  let bitmap, timer, cancelled = false
  try {
    bitmap = await Promise.race([
      createImageBitmap(file).then(image => {
        if (cancelled) { image.close(); throw new Error('Lectura cancelada.') }
        return image
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('La imagen tardó demasiado en abrirse.')), 10000) }),
    ])
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 32000000) throw new Error('La resolución de la imagen es demasiado grande.')
    const canvas = document.createElement('canvas')
    canvas.width = 285; canvas.height = 380
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo preparar la portada.')
    context.fillStyle = '#14121c'
    context.fillRect(0, 0, 285, 380)
    const scale = Math.max(285 / bitmap.width, 380 / bitmap.height)
    context.drawImage(bitmap, (285 - bitmap.width * scale) / 2, (380 - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale)
    const cover = canvas.toDataURL('image/jpeg', 0.75)
    if (cover.length > 120000) throw new Error('No se pudo reducir la imagen. Prueba una portada más sencilla.')
    return cover
  } finally { cancelled = true; clearTimeout(timer); bitmap?.close() }
}
