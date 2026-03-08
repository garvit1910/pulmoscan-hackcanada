import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Surface any silent crashes to the console
window.addEventListener('unhandledrejection', e => console.error('[pulmoscan]', e.reason))
window.addEventListener('error', e => console.error('[pulmoscan]', e.message, e.filename, e.lineno))

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
