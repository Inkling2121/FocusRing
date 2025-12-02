import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#212121',
            color: '#ffffff',
            fontFamily: 'system-ui, sans-serif',
            padding: 20,
            boxSizing: 'border-box'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <h2>Ein Fehler ist aufgetreten</h2>
            <p style={{ opacity: 0.7, fontSize: 14 }}>
              {this.state.error?.message || 'Unbekannter Fehler'}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 20,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#22c55e',
                color: '#000',
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              Neu laden
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
