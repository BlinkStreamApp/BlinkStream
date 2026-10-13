export default function ToggleSwitch({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      type="button"
      aria-label={label}
      className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-twitch cursor-pointer"
      role="switch"
      aria-checked={active}
    >
      <span aria-hidden="true" className={`inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${active ? 'bg-twitch' : 'bg-bg-tertiary'}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${active ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
      </span>
    </button>
  )
}
