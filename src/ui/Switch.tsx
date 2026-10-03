// An on/off setting, as a toggle: blue when on, the one place a setting uses
// the accent. It is a button with role="switch", so a label pointing at its
// id names it, Space and Enter flip it, and a screen reader says on or off.
export function Switch({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" aria-hidden />
    </button>
  );
}
