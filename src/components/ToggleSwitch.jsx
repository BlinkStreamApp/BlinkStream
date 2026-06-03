export default function ToggleSwitch({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer ${active ? 'bg-twitch' : 'bg-bg-tertiary'}`}
      role="switch"
      aria-checked={active}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${active ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
    </button>
  )
}
