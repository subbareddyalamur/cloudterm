import { useRef, useCallback, useEffect, useMemo } from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useInstanceStore } from "@/stores/useInstanceStore"
import type { EC2Instance } from "@/types"

function matchesFilter(inst: EC2Instance, terms: string[]): boolean {
  if (terms.length === 0) return true
  const haystack = [
    inst.name,
    inst.instance_id,
    inst.private_ip,
    inst.public_ip ?? "",
    inst.tag1_value,
    inst.tag2_value,
    ...(inst.tags ? Object.values(inst.tags) : []),
  ]
    .join(" ")
    .toLowerCase()
  return terms.every((t) => haystack.includes(t))
}

export function SidebarSearch() {
  const filterText = useInstanceStore((s) => s.filterText)
  const setFilter = useInstanceStore((s) => s.setFilter)
  const flatInstances = useInstanceStore((s) => s.flatInstances)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filterTerms = useMemo(
    () =>
      filterText
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0),
    [filterText],
  )

  const filteredCount = useMemo(
    () => flatInstances.filter((i) => matchesFilter(i, filterTerms)).length,
    [flatInstances, filterTerms],
  )

  const totalCount = flatInstances.length

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setFilter(value), 150)
    },
    [setFilter],
  )

  const handleClear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setFilter("")
    inputRef.current?.blur()
  }, [setFilter])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        if (timerRef.current) clearTimeout(timerRef.current)
        setFilter("")
        inputRef.current?.blur()
      }
    },
    [setFilter],
  )

  // Ctrl+K / Cmd+K focuses search input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div data-testid="sidebar-search" className="px-2 pb-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Filter instances… (Ctrl+K)"
          className="h-7 pl-7 pr-7 text-xs"
          defaultValue={filterText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          key={filterText === "" ? "cleared" : "active"}
        />
        {filterText && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-1 top-1/2 size-5 -translate-y-1/2"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <X className="size-3" />
          </Button>
        )}
      </div>
      {filterText && totalCount > 0 && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          {filteredCount} of {totalCount} instances
        </p>
      )}
    </div>
  )
}
