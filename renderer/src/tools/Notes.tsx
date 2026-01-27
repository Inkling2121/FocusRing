import React, { useEffect, useMemo, useState } from 'react'
import { invoke } from '../ipc'
import { marked } from 'marked'

type Note = {
  id?: number
  title: string
  content: string
  pinned?: number | boolean
}

const accent = '#22c55e'

const Notes: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<number | undefined>()
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const selected = useMemo(
    () => notes.find(n => n.id === selectedId),
    [notes, selectedId]
  )

  const loadNotes = async () => {
    setLoading(true)
    try {
      const data = await invoke<Note[]>('notes/list')
      setNotes(data || [])
      // Nur wenn noch nichts ausgewaehlt ist, automatisch erste Notiz setzen
      if (!selectedId && data && data.length > 0) {
        setSelectedId(data[0].id)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotes()
  }, [])

  const handleSelect = (id: number | undefined) => {
    setSelectedId(id)
  }

  const handleCreate = async () => {
    if (busy) return
    setBusy(true)
    try {
      // Neue Notiz im Backend anlegen
      const created = await invoke<Note>('notes/create', {
        title: 'Neue Notiz',
        content: '',
        pinned: 0
      })

      // Liste aus der DB neu laden, damit IDs usw. sicher stimmen
      await loadNotes()

      // Wenn die API eine ID zurueckgibt, diese Notiz direkt auswaehlen
      if (created && created.id) {
        setSelectedId(created.id)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!selected?.id) return

    // Only confirm if note has content
    if (selected.content.trim() || selected.title.trim()) {
      const ok = window.confirm(
        `Notiz "${selected.title || 'Ohne Titel'}" wirklich löschen?`
      )
      if (!ok) return
    }

    setBusy(true)
    try {
      await invoke('notes/delete', selected.id)
      // State lokal updaten
      setNotes(prev => prev.filter(n => n.id !== selected.id))
      const remaining = notes.filter(n => n.id !== selected.id)
      setSelectedId(remaining[0]?.id)
    } finally {
      setBusy(false)
    }
  }

  const updateNote = async (partial: Partial<Note>) => {
    if (!selected) return
    const updated: Note = { ...selected, ...partial }

    // Optimistisch lokal updaten
    setNotes(prev => prev.map(n => (n.id === updated.id ? updated : n)))

    if (!updated.id) return
    try {
      await invoke('notes/update', updated)
    } catch {
      // Im Fehlerfall koenntest du z.B. loadNotes() rufen,
      // aber wir lassen es hier minimal
    }
  }

  const handleTitleChange = (value: string) => {
    updateNote({ title: value })
  }

  const handleContentChange = (value: string) => {
    updateNote({ content: value })
  }

  const handleTogglePin = () => {
    const current = selected
    if (!current) return
    const nextPinned =
      current.pinned === 1 || current.pinned === true ? 0 : 1
    updateNote({ pinned: nextPinned })
  }

  // Render markdown to plain text for preview (remove HTML tags)
  const renderMarkdownPreview = (text: string): string => {
    if (!text) return ''
    try {
      const html = marked.parse(text, { breaks: true }) as string
      // Remove HTML tags for plain text preview
      return html.replace(/<[^>]*>/g, '').substring(0, 100)
    } catch {
      return text.substring(0, 100)
    }
  }

  const filteredNotes = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const base = query
      ? notes.filter(
          n =>
            n.title.toLowerCase().includes(query) ||
            n.content.toLowerCase().includes(query)
        )
      : notes
    return base
      .slice()
      .sort(
        (a, b) =>
          Number(b.pinned ? 1 : 0) - Number(a.pinned ? 1 : 0) ||
          (b.id || 0) - (a.id || 0)
      )
  }, [notes, filter])

  const renderedContent = useMemo(() => {
    if (!selected?.content) return ''
    try {
      return marked.parse(selected.content, { breaks: true })
    } catch (e) {
      return selected.content
    }
  }, [selected?.content])

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        height: '100%',
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          width: '35%',
          minWidth: 200,
          maxWidth: 400,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center'
          }}
        >
          <button
            onClick={handleCreate}
            disabled={busy}
            style={{
              flexShrink: 0,
              padding: '4px 10px',
              borderRadius: 999,
              border: 'none',
              background: accent,
              color: '#000000ff',
              cursor: busy ? 'default' : 'pointer',
              fontSize: 12
            }}
          >
            Neue Notiz
          </button>
          <input
            type="text"
            placeholder="Suchen..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              flex: 1,
              minWidth: 80,
              padding: '4px 6px',
              borderRadius: 8,
              border: '1px solid #444',
              background: 'rgba(20,20,20,0.9)',
              color: '#f9fafb',
              fontSize: 12
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            borderRadius: 10,
            border: '1px solid #2f3135',
            background: 'rgba(15,15,15,0.9)',
            padding: 4
          }}
        >
          {loading && (
            <div style={{ fontSize: 12, opacity: 0.7, padding: 6 }}>
              Lade Notizen...
            </div>
          )}
          {!loading && filteredNotes.length === 0 && (
            <div style={{ fontSize: 12, opacity: 0.7, padding: 6 }}>
              Keine Notizen vorhanden.
            </div>
          )}
          {!loading &&
            filteredNotes.map(n => {
              const isSelected = n.id === selectedId
              const isPinned = n.pinned === 1 || n.pinned === true
              return (
                <button
                  key={n.id ?? Math.random()}
                  onClick={() => handleSelect(n.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    borderRadius: 8,
                    marginBottom: 4,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    background: isSelected
                      ? 'rgba(34,197,94,0.15)'
                      : 'transparent',
                    color: '#e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    outline: isSelected
                      ? `1px solid ${accent}`
                      : '1px solid transparent'
                  }}
                >
                  {isPinned && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: accent
                      }}
                    />
                  )}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      overflow: 'hidden'
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden'
                      }}
                    >
                      {n.title || 'Ohne Titel'}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        opacity: 0.6,
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden'
                      }}
                    >
                      {renderMarkdownPreview(n.content) || 'Leer'}
                    </span>
                  </div>
                </button>
              )
            })}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        {!selected && !loading && (
          <div
            style={{
              fontSize: 13,
              opacity: 0.7,
              marginTop: 4
            }}
          >
            Wähle oder erstelle eine Notiz.
          </div>
        )}

        {selected && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <input
                type="text"
                value={selected.title}
                onChange={e => handleTitleChange(e.target.value)}
                placeholder="Titel"
                maxLength={200}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: '1px solid #444',
                  background: 'rgba(20,20,20,0.9)',
                  color: '#f9fafb',
                  fontSize: 14
                }}
              />
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: `1px solid ${accent}`,
                  background: showPreview ? accent : 'transparent',
                  color: showPreview ? '#0b1120' : accent,
                  cursor: 'pointer',
                  fontSize: 12
                }}
              >
                {showPreview ? 'Editor' : 'Vorschau'}
              </button>
              <button
                type="button"
                onClick={handleTogglePin}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: `1px solid ${accent}`,
                  background:
                    selected.pinned === 1 || selected.pinned === true
                      ? accent
                      : 'transparent',
                  color:
                    selected.pinned === 1 || selected.pinned === true
                      ? '#0b1120'
                      : accent,
                  cursor: 'pointer',
                  fontSize: 12
                }}
              >
                Pin
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  cursor: busy ? 'default' : 'pointer',
                  fontSize: 12
                }}
              >
                Löschen
              </button>
            </div>

            {!showPreview ? (
              <textarea
                value={selected.content}
                onChange={e => handleContentChange(e.target.value)}
                placeholder="Notizinhalt... (Markdown unterstützt)"
                style={{
                  flex: 1,
                  resize: 'none',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid #444',
                  background: 'rgba(20,20,20,0.9)',
                  color: '#f9fafb',
                  fontSize: 13,
                  lineHeight: 1.6,
                  fontFamily: 'monospace'
                }}
              />
            ) : (
              <div
                className="markdown-preview"
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid #444',
                  background: 'rgba(20,20,20,0.9)',
                  color: '#f9fafb',
                  fontSize: 13,
                  lineHeight: 1.6,
                  overflow: 'auto'
                }}
                dangerouslySetInnerHTML={{ __html: renderedContent }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Notes
