'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'

interface Props {
  onChange: (dataUri: string | null) => void
}

export function SignaturePad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  function getPos(e: PointerEvent | Touch) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX || (e as Touch).clientX) - rect.left,
      y: (e.clientY || (e as Touch).clientY) - rect.top,
    }
  }

  function startDrawing(e: React.PointerEvent) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e.nativeEvent)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setDrawing(true)
  }

  function draw(e: React.PointerEvent) {
    if (!drawing) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e.nativeEvent)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  function stopDrawing(e: React.PointerEvent) {
    if (!drawing) return
    e.preventDefault()
    setDrawing(false)
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(canvas.toDataURL('image/jpeg', 0.4))
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Rubrica</p>
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Limpar
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-32 rounded-xl border border-gray-300 bg-white touch-none cursor-crosshair"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <p className="text-xs text-gray-400">Desenhe sua rubrica acima</p>
    </div>
  )
}
