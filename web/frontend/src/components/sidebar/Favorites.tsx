import { useState, useCallback, useRef } from "react"
import { Star, GripVertical } from "lucide-react"
import { useInstanceStore } from "@/stores/useInstanceStore"
import { cn } from "@/lib/utils"
import type { EC2Instance } from "@/types"

interface FavoritesProps {
  onConnect: (instance: EC2Instance) => void
}

function platformIcon(inst: EC2Instance) {
  const isWindows =
    inst.platform === "windows" ||
    inst.os?.toLowerCase().includes("windows")
  return isWindows ? "🪟" : "🐧"
}

export function Favorites({ onConnect }: FavoritesProps) {
  const favoriteOrder = useInstanceStore((s) => s.favoriteOrder)
  const flatInstances = useInstanceStore((s) => s.flatInstances)
  const toggleFavorite = useInstanceStore((s) => s.toggleFavorite)
  const reorderFavorites = useInstanceStore((s) => s.reorderFavorites)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const dragCounter = useRef(0)

  // Build ordered list of favorite instances
  const favoriteInstances: EC2Instance[] = []
  const instanceMap = new Map(flatInstances.map((i) => [i.instance_id, i]))
  for (const id of favoriteOrder) {
    const inst = instanceMap.get(id)
    if (inst) favoriteInstances.push(inst)
  }

  const handleDragStart = useCallback(
    (e: React.DragEvent, idx: number) => {
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", String(idx))
      setDragIndex(idx)
    },
    [],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }, [])

  const handleDragEnter = useCallback((_e: React.DragEvent, idx: number) => {
    dragCounter.current += 1
    setDropIndex(idx)
  }, [])

  const handleDragLeave = useCallback(() => {
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setDropIndex(null)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, toIdx: number) => {
      e.preventDefault()
      const fromIdx = Number(e.dataTransfer.getData("text/plain"))
      if (!isNaN(fromIdx) && fromIdx !== toIdx) {
        reorderFavorites(fromIdx, toIdx)
      }
      setDragIndex(null)
      setDropIndex(null)
      dragCounter.current = 0
    },
    [reorderFavorites],
  )

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDropIndex(null)
    dragCounter.current = 0
  }, [])

  return (
    <div className="border-b border-border px-1 pb-1">
      <div className="flex items-center gap-1 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Star className="size-3 fill-yellow-500 text-yellow-500" />
        Favorites
      </div>

      {favoriteInstances.length === 0 && (
        <p className="px-2 py-2 text-center text-[10px] text-muted-foreground">
          Star an instance to pin it here
        </p>
      )}

      {favoriteInstances.map((inst, idx) => (
        <div
          key={inst.instance_id}
          className={cn(
            "group flex w-full items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-accent",
            dragIndex === idx && "opacity-40",
            dropIndex === idx && dragIndex !== idx && "border-t border-primary",
          )}
          draggable
          onDragStart={(e) => handleDragStart(e, idx)}
          onDragOver={handleDragOver}
          onDragEnter={(e) => handleDragEnter(e, idx)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, idx)}
          onDragEnd={handleDragEnd}
          onDoubleClick={() => onConnect(inst)}
          title={`Double-click to connect · ${inst.instance_id}`}
        >
          <GripVertical className="size-3 shrink-0 cursor-grab text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              inst.state === "running" ? "bg-green-500" : "bg-red-500",
            )}
          />
          <span className="min-w-0 truncate">
            {inst.name || inst.instance_id}
          </span>
          <span className="ml-auto shrink-0 text-[10px]" title={inst.os || inst.platform}>
            {platformIcon(inst)}
          </span>
          <button
            className="shrink-0 text-yellow-500 hover:text-yellow-400"
            onClick={(e) => {
              e.stopPropagation()
              toggleFavorite(inst.instance_id)
            }}
            aria-label="Remove from favorites"
          >
            <Star className="size-3 fill-current" />
          </button>
        </div>
      ))}
    </div>
  )
}
