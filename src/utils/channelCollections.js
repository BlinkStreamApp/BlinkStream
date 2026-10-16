export const MAX_COLLECTIONS = 20
export const MAX_COLLECTION_CHANNELS = 100
export const COLLECTION_COLORS = ['violet', 'pink', 'cyan', 'green', 'orange', 'blue']
export const validCollectionCover = value => typeof value === 'string' && value.length <= 120000 && /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/]+=*$/.test(value)
export const collectionsKey = owner => `blinkstream_collections_v1:${owner.toLowerCase()}`

export function normalizeCollections(value) {
  const ids = new Set(), names = new Set()
  return (Array.isArray(value) ? value : []).flatMap(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || typeof item.name !== 'string') return []
    const name = item.name.trim().slice(0, 40)
    if (!name || ids.has(item.id) || names.has(name.toLowerCase())) return []
    ids.add(item.id); names.add(name.toLowerCase())
    const channels = [...new Set((Array.isArray(item.channels) ? item.channels : [])
      .filter(ch => typeof ch === 'string').map(ch => ch.trim().toLowerCase())
      .filter(ch => /^[a-z0-9_]{1,25}$/.test(ch)))].slice(0, MAX_COLLECTION_CHANNELS)
    return [{ id: item.id, name, channels,
      ...(validCollectionCover(item.cover) ? { cover: item.cover } : {}),
      ...(COLLECTION_COLORS.includes(item.color) ? { color: item.color } : {}),
    }]
  }).slice(0, MAX_COLLECTIONS)
}

export function changeCollections(items, action) {
  if (action.type === 'create' || action.type === 'rename') {
    const name = action.name.trim()
    if (!name || name.length > 40) throw new Error('Usa un nombre de 1 a 40 caracteres.')
    if (items.some(item => item.id !== action.id && item.name.toLowerCase() === name.toLowerCase())) throw new Error('Ya existe una colección con ese nombre.')
    if (action.type === 'create') {
      if (items.length >= MAX_COLLECTIONS) throw new Error('Puedes crear hasta 20 colecciones.')
      return [...items, { id: action.id, name, channels: [] }]
    }
    return items.map(item => item.id === action.id ? { ...item, name } : item)
  }
  if (action.type === 'delete') return items.filter(item => item.id !== action.id)
  if (action.type === 'appearance') {
    if (action.cover && !validCollectionCover(action.cover)) throw new Error('La portada no es válida o es demasiado grande.')
    if (action.color && !COLLECTION_COLORS.includes(action.color)) throw new Error('Color no válido.')
    return items.map(item => item.id === action.id ? { ...item,
      ...(action.cover !== undefined ? { cover: action.cover } : {}),
      ...(action.color !== undefined ? { color: action.color } : {}),
    } : item)
  }
  if (action.type === 'moveCollection') return move(items, items.findIndex(item => item.id === action.id), action.delta)
  return items.map(item => {
    if (item.id !== action.id) return item
    const channel = action.channel?.trim().toLowerCase()
    if (action.type === 'add') {
      if (!/^[a-z0-9_]{1,25}$/.test(channel || '')) throw new Error('Introduce el nombre del canal, no una URL.')
      if (item.channels.includes(channel)) return item
      if (item.channels.length >= MAX_COLLECTION_CHANNELS) throw new Error('Puedes añadir hasta 100 canales por colección.')
      return { ...item, channels: [...item.channels, channel] }
    }
    if (action.type === 'remove') return { ...item, channels: item.channels.filter(ch => ch !== channel) }
    if (action.type === 'moveChannel') return { ...item, channels: move(item.channels, item.channels.indexOf(channel), action.delta) }
    return item
  })
}

function move(items, index, delta) {
  const target = index + delta
  if (index < 0 || ![-1, 1].includes(delta) || target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
