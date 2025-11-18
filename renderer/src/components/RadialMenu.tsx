import React from 'react'

type Item = { id: string; label: string; onClick: () => void }

type Props = {
  items: Item[]
  interactive: boolean
  accentActive: string
  accentInactive: string
}

// erwartet #RRGGBB, hängt Alpha hinten dran (z.B. "33", "AA")
const withAlpha = (hex: string, alpha: string) => {
  if (!/^#([0-9a-fA-F]{6})$/.test(hex)) return hex
  return `${hex}${alpha}`
}

export default function RadialMenu({
  items,
  interactive,
  accentActive,
  accentInactive
}: Props) {
  const r = 100
  const btnSize = 48
  const paddingTop = -27

  const edgeColor = interactive ? accentActive : accentInactive || accentActive
  const btnColor  = interactive ? accentActive : accentInactive || accentActive
  const fillBase = interactive ? '33' : '18'
  const strokeAlpha = interactive ? 'CC' : '88'
  const glowAlpha = interactive ? 'AA' : '55'

  // Etwas Abstand von den Ecken: Start und Ende leicht nach unten versetzt
  const startAngle = 0.4
  const endAngle = Math.PI - 0.4
  const angles =
    items.length > 1
      ? items.map(
          (_, i) =>
            startAngle + (i * (endAngle - startAngle)) / (items.length - 1)
        )
      : [Math.PI / 2]

  return (
    <div
      className="no-drag"
      style={{
        position: 'relative',
        width: 2 * r,
        height: r + btnSize / 2 + paddingTop
      }}
    >
      <svg
        width={2 * r}
        height={r}
        viewBox={`0 0 ${2 * r} ${r}`}
        style={{
          position: 'absolute',
          left: 0,
          top: paddingTop,
          filter: `drop-shadow(0 0 14px ${withAlpha(edgeColor, glowAlpha)})`
        }}
      >
        <path
          d={`M 0 0 L ${2 * r} 0 A ${r} ${r} 0 0 1 0 0 Z`}
          fill={withAlpha(edgeColor, fillBase)} // Füllung
          stroke={withAlpha(edgeColor, strokeAlpha)} // leuchtende Linie
          strokeWidth={2}
        />
      </svg>

      {angles.map((theta, i) => {
        const item = items[i]
        const x = r + r * Math.cos(theta)
        const y = r * Math.sin(theta)

        return (
          <button
            key={item.id}
            onClick={item.onClick}
            className="no-drag"
            disabled={!interactive}
            tabIndex={interactive ? i + 1 : -1}  
            style={{
              position: 'absolute',
              left: x - btnSize / 2,
              top: paddingTop + y - btnSize / 2,
              width: btnSize,
              height: btnSize,
              borderRadius: '50%',
              border: 'none',
              background: btnColor,
              color: '#fff',
              cursor: interactive ? 'pointer' : 'default',
              opacity: interactive ? 1 : 0.55,
              pointerEvents: interactive ? 'auto' : 'none',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: interactive
                ? '0 4px 10px rgba(0,0,0,.25)'
                : '0 2px 6px rgba(0,0,0,.15)',
              transition: '.15s transform, .15s box-shadow, .2s opacity'
            }}
            onMouseEnter={(e) => {
              if (!interactive) return
              e.currentTarget.style.transform = 'scale(1.07)'
              e.currentTarget.style.boxShadow = '0 6px 14px rgba(0,0,0,.35)'
            }}
            onMouseLeave={(e) => {
              if (!interactive) return
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,.25)'
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
