const manifests = import.meta.glob('/src/assets/brand-icons/manifest.json', { eager: true, import: 'default' })
const manifest = manifests['/src/assets/brand-icons/manifest.json'] || {}

export const images = import.meta.glob('/src/assets/brand-icons/*.{png,gif}', { eager: true, query: '?url', import: 'default' })
export { manifest }
