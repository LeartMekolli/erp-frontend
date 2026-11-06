import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent px-4 text-sm font-semibold whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-ink/85",
        secondary: "border-line bg-card text-ink hover:bg-ground",
        // shadcn's names, for the dialog, sheet and command: outline is AMI's secondary.
        outline: "border-line bg-card text-ink hover:bg-ground",
        ghost: "text-ink-2 hover:bg-ground hover:text-ink",
        link: "h-auto min-h-11 px-0 font-medium text-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "",
        icon: "size-11 p-0",
        // Smaller on a mouse, 44px on a touch screen.
        "icon-sm": "size-9 p-0 pointer-coarse:size-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
