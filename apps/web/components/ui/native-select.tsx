import React from "react";

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }
>(({ className, wrapperClassName, children, ...props }, ref) => {
  return (
    <div className={`relative inline-block min-w-[140px] ${wrapperClassName || ""}`}>
      <select
        ref={ref}
        className={`h-10 w-full appearance-none rounded-xl border border-border bg-secondary/50 px-3 pr-10 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed ${
          className || ""
        }`}
        {...props}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground">
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
});
NativeSelect.displayName = "NativeSelect";
