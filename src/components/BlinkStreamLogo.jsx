import logoSrc from '../assets/logo.png'

export function BlinkStreamLogo({ size = 28, className = '' }) {
  return (
    <img
      src={logoSrc}
      alt="BlinkStream"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ objectFit: 'contain' }}
    />
  )
}

export default BlinkStreamLogo
