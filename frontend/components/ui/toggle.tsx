"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean
  onPressedChange?: (pressed: boolean) => void
}

function Toggle({
  className,
  pressed,
  onPressedChange,
  children,
  ...props
}: ToggleProps) {
  const handleClick = () => {
    onPressedChange?.(!pressed)
  }

  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-white transition-colors",
        "hover:bg-gray-100 hover:text-gray-700",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        pressed
          ? "bg-primary text-white hover:bg-primary/90"
          : "bg-gray-200 text-gray-700",
        "h-10 px-4 py-2",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export { Toggle }