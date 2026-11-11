import * as React from "react"
import { cn } from "cn"

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-line bg-card px-3 text-base text-ink transition-colors focus-visible:border-violet focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-violet/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-late md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { NativeSelect }
