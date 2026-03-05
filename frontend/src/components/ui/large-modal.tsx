"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface LargeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  title?: React.ReactNode
  description?: string
  showCloseButton?: boolean
  className?: string
}

export function LargeModal({
  open,
  onOpenChange,
  children,
  title,
  description,
  showCloseButton = true,
  className
}: LargeModalProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[1400] bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal Content */}
      <div
        className={cn(
          "fixed top-[50%] left-[50%] z-[1401] transform -translate-x-1/2 -translate-y-1/2",
          "bg-white rounded-lg border shadow-lg",
          "w-[66vw] max-w-[66vw]",
          "h-[90vh] max-h-[90vh] flex flex-col overflow-hidden",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description || showCloseButton) && (
          <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {title && (
                  <h2 className="text-lg font-semibold leading-none mb-2">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="text-sm text-slate-500">
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <button
                  onClick={() => onOpenChange(false)}
                  className="rounded-xs opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 p-1"
                >
                  <XIcon className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-8">
          {children}
        </div>
      </div>
    </>
  )
}
