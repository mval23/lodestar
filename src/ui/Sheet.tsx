import { useEffect, useRef, type ReactNode } from 'react';

// Built on the native <dialog>: focus trapping, Esc and inertness come from
// the browser, and nothing injects a stylesheet, so the CSP stays at
// script-src/style-src 'self'.
export function Sheet({
  open,
  onClose,
  title,
  cancelLabel = 'Cancel',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  cancelLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="sheet-bar">
        <button type="button" className="btn btn-plain" onClick={onClose}>
          {cancelLabel}
        </button>
        <h2 className="headline">{title}</h2>
        <div className="sheet-bar-end">{footer}</div>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
