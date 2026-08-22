"use client";

export function ConfirmForm({
  action,
  hidden,
  confirmMessage,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
