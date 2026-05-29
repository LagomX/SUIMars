"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  Store,
  Folder,
  ShoppingCart,
  Gift,
  Activity,
  Menu,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"

const navItems = [
  { name: "Marketplace", icon: Store, href: "/" },
  { name: "My Assets", icon: Folder, href: "/assets" },
  { name: "Purchases", icon: ShoppingCart, href: "/purchases" },
  { name: "Rewards", icon: Gift, href: "/rewards" },
  { name: "Protocol Status", icon: Activity, href: "/status" },
]

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-4 top-4 z-50 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-border bg-sidebar transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground">
            <span className="text-sm font-bold text-background">M</span>
          </div>
          <span className="text-xl font-semibold tracking-tight">Mars</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Protocol info */}
        <div className="border-t border-border p-4">
          <div className="rounded-lg bg-secondary p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-accent" />
              <span className="text-xs font-medium text-muted-foreground">
                Protocol Healthy
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-lg font-semibold">99.9%</span>
              <span className="text-xs text-muted-foreground">uptime</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
