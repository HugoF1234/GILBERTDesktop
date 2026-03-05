import { useRef, useEffect, useCallback, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react'
import getStroke from 'perfect-freehand'

// ============================================================================
// TYPES
// ============================================================================

interface Point {
  x: number
  y: number
  pressure: number
  timestamp: number
}

interface Stroke {
  id: number
  points: Point[]
}

interface DrawingCanvasProps {
  color?: string
  containerRef?: RefObject<HTMLDivElement | null>
}

interface StrokeOptions {
  size: number
  thinning: number
  smoothing: number
  streamline: number
  easing: (t: number) => number
  start: { taper: number; cap: boolean }
  end: { taper: number; cap: boolean }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FADE_DURATION_MS = 3000
const DEFAULT_PRESSURE = 0.5
const STROKE_OPTIONS: StrokeOptions = {
  size: 10,
  thinning: 0.5,
  smoothing: 0.8,
  streamline: 0.7,
  easing: (t: number): number => t * t,
  start: { taper: 0, cap: true },
  end: { taper: 25, cap: true },
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert stroke points from perfect-freehand to SVG path string
 */
function convertStrokeToSvgPath(strokePoints: number[][]): string {
  if (strokePoints.length === 0) return ''

  const pathData = strokePoints.reduce<(string | number)[]>(
    (acc, [x0, y0], i, arr) => {
      const nextIndex = (i + 1) % arr.length
      const [x1, y1] = arr[nextIndex]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ['M', ...strokePoints[0], 'Q']
  )

  pathData.push('Z')
  return pathData.join(' ')
}

/**
 * Calculate opacity based on stroke age (fades over time)
 */
function calculateStrokeOpacity(lastPointTimestamp: number, currentTime: number): number {
  const age = currentTime - lastPointTimestamp
  const normalizedAge = age / FADE_DURATION_MS
  const rawOpacity = Math.max(0, 1 - normalizedAge)
  return rawOpacity * 0.8
}

/**
 * Check if a stroke should still be visible (not fully faded)
 */
function isStrokeVisible(stroke: Stroke, currentTime: number): boolean {
  const lastPoint = stroke.points[stroke.points.length - 1]
  if (!lastPoint) return false
  return currentTime - lastPoint.timestamp < FADE_DURATION_MS
}

/**
 * Create a new point from pointer event using LIVE container bounds
 */
function createPointFromPointerEvent(
  event: ReactPointerEvent,
  containerElement: HTMLElement | null
): Point | null {
  if (!containerElement) return null

  // Toujours utiliser les bounds actuels du container, pas des valeurs en cache
  const rect = containerElement.getBoundingClientRect()

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure: event.pressure || DEFAULT_PRESSURE,
    timestamp: Date.now(),
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DrawingCanvas({ color = '#0A66FF', containerRef }: DrawingCanvasProps): JSX.Element | null {
  // Refs
  const svgRef = useRef<SVGSVGElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const currentStrokeIdRef = useRef<number>(0)
  const isDrawingRef = useRef<boolean>(false)
  const animationFrameRef = useRef<number | null>(null)

  // State pour les dimensions (pas la position - celle-ci est calculée en temps réel)
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const [, setRenderTrigger] = useState<number>(0)

  /**
   * Force a re-render of the canvas
   */
  const triggerRender = useCallback((): void => {
    setRenderTrigger((n) => n + 1)
  }, [])

  /**
   * Update dimensions from container
   */
  const updateDimensions = useCallback((): void => {
    if (!containerRef?.current) return

    const rect = containerRef.current.getBoundingClientRect()
    setDimensions({ width: rect.width, height: rect.height })
  }, [containerRef])

  /**
   * Create a new stroke and add it to the strokes array
   */
  const startNewStroke = useCallback((event: ReactPointerEvent): void => {
    const point = createPointFromPointerEvent(event, containerRef?.current ?? null)
    if (!point) return

    const newStroke: Stroke = {
      id: currentStrokeIdRef.current,
      points: [point],
    }
    currentStrokeIdRef.current += 1
    strokesRef.current.push(newStroke)
    triggerRender()
  }, [containerRef, triggerRender])

  /**
   * Add a point to the current stroke
   */
  const addPointToCurrentStroke = useCallback((event: ReactPointerEvent): void => {
    const strokes = strokesRef.current
    if (strokes.length === 0) return

    const point = createPointFromPointerEvent(event, containerRef?.current ?? null)
    if (!point) return

    const lastStroke = strokes[strokes.length - 1]
    lastStroke.points.push(point)
    triggerRender()
  }, [containerRef, triggerRender])

  /**
   * Remove faded strokes from the array
   */
  const cleanupFadedStrokes = useCallback((): void => {
    const now = Date.now()
    const hadStrokes = strokesRef.current.length > 0
    strokesRef.current = strokesRef.current.filter((stroke) => isStrokeVisible(stroke, now))

    if (hadStrokes) {
      triggerRender()
    }
  }, [triggerRender])

  // Effect: Setup dimensions updates avec plusieurs vérifications
  useEffect(() => {
    // Initial dimensions
    updateDimensions()

    // Vérifications multiples pour s'assurer que le container est rendu
    const timeouts = [50, 100, 200, 500].map(delay =>
      setTimeout(updateDimensions, delay)
    )

    // Event listeners
    window.addEventListener('resize', updateDimensions)

    // ResizeObserver
    let observer: ResizeObserver | null = null
    if (containerRef?.current) {
      observer = new ResizeObserver(updateDimensions)
      observer.observe(containerRef.current)
    }

    return (): void => {
      timeouts.forEach(t => clearTimeout(t))
      window.removeEventListener('resize', updateDimensions)
      observer?.disconnect()
    }
  }, [containerRef, updateDimensions])

  // Effect: Re-update when containerRef becomes available
  useEffect(() => {
    if (containerRef?.current) {
      updateDimensions()
      // Multiples vérifications car l'overlay peut s'animer
      const t1 = setTimeout(updateDimensions, 100)
      const t2 = setTimeout(updateDimensions, 300)
      return (): void => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [containerRef?.current, updateDimensions])

  // Effect: Animation loop for cleaning up faded strokes
  useEffect(() => {
    const animate = (): void => {
      cleanupFadedStrokes()
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return (): void => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [cleanupFadedStrokes])

  // Event Handlers
  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
    isDrawingRef.current = true
    startNewStroke(event)
  }, [startNewStroke])

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!isDrawingRef.current) return
    event.preventDefault()
    addPointToCurrentStroke(event)
  }, [addPointToCurrentStroke])

  const handlePointerUp = useCallback((): void => {
    isDrawingRef.current = false
  }, [])

  // Don't render if dimensions aren't set
  if (dimensions.width === 0 || dimensions.height === 0) {
    return null
  }

  const currentTime = Date.now()

  return (
    <svg
      ref={svgRef}
      width={dimensions.width}
      height={dimensions.height}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="drawing-canvas-svg"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: dimensions.width,
        height: dimensions.height,
        zIndex: 9999,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        pointerEvents: 'all',
      }}
    >
      {strokesRef.current.map((stroke) => {
        if (stroke.points.length < 2) return null

        const strokePoints = getStroke(
          stroke.points.map((p) => [p.x, p.y, p.pressure]),
          STROKE_OPTIONS
        )

        if (strokePoints.length === 0) return null

        const lastPoint = stroke.points[stroke.points.length - 1]
        const opacity = calculateStrokeOpacity(lastPoint.timestamp, currentTime)
        const pathData = convertStrokeToSvgPath(strokePoints)

        return (
          <g key={stroke.id}>
            {/* Shadow/glow effect */}
            <path
              d={pathData}
              fill={color}
              opacity={opacity * 0.3}
              style={{ filter: 'blur(8px)' }}
            />
            {/* Main stroke */}
            <path
              d={pathData}
              fill={color}
              opacity={opacity}
            />
          </g>
        )
      })}
    </svg>
  )
}

export default DrawingCanvas
