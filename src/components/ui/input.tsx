import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-line bg-card px-3.5 text-base text-ink transition-colors placeholder:text-placeholder focus-visible:border-violet focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-violet/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-late md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
