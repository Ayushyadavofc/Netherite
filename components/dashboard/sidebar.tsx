"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  FileText,
  Layers,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Target,
  GitBranch,
} from "lucide-react"

const navItems = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/notes", icon: FileText, label: "Notes" },
  { href: "/flashcards", icon: Layers, label: "Flashcards" },
  { href: "/habits", icon: Target, label: "Habits" },
  { href: "/graph", icon: GitBranch, label: "Graph" },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [vaultName, setVaultName] = useState("My Vault")

  useEffect(() => {
    const currentVault = localStorage.getItem("netherite-current-vault")
    if (currentVault) {
      setVaultName(currentVault)
    }
  }, [])

  return (
    <aside
      className={`flex flex-col bg-zinc-900 border-r border-zinc-800 transition-all duration-300 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      {/* Logo Header */}
      <div className="p-4 flex items-center justify-between border-b border-zinc-800">
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
              <span className="text-zinc-950 font-bold text-sm">N</span>
            </div>
            <span className="text-amber-500 font-bold text-lg">Netherite</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center mx-auto">
            <span className="text-zinc-950 font-bold text-sm">N</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`text-zinc-500 hover:text-zinc-300 transition-colors p-1 ${collapsed ? "hidden" : ""}`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors mx-auto mt-2"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? "bg-amber-500/10 text-amber-500"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  }`}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!collapsed && <span className="font-medium">{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom Section - Vault Name + Settings + Exit */}
      <div className="p-2 border-t border-zinc-800">
        {/* Vault Name */}
        <div className="flex items-center justify-between px-3 py-2 mb-1">
          {!collapsed && (
            <span className="text-sm text-zinc-300 font-medium truncate">{vaultName}</span>
          )}
          <button className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 shrink-0">
            <Settings className="w-4 h-4" />
          </button>
        </div>
        
        {/* Exit Vault */}
        <Link
          href="/"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="font-medium">Exit Vault</span>}
        </Link>
      </div>
    </aside>
  )
}
