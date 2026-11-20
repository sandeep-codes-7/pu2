import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installCsrfFetchInterceptor } from './utils/csrf.js'
import { clearAdSenseArtifacts } from './utils/adsense.js'
import App from './App.jsx'
import AdminPanel from './AdminPanel.jsx'
import ContentPage from './ContentPages.jsx'

installCsrfFetchInterceptor()

const rawPath = window.location.pathname || '/'
const cleanPath = rawPath.replace(/\/+$/, '') || '/'
const isAdminRoute = cleanPath === '/admin' || cleanPath.startsWith('/admin/')
const CONTENT_ROUTES = new Set(['/about', '/guidelines', '/privacy', '/terms'])
const isContentRoute = CONTENT_ROUTES.has(cleanPath)

if (isAdminRoute) {
  clearAdSenseArtifacts()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdminRoute ? (
      <AdminPanel />
    ) : isContentRoute ? (
      <ContentPage pathname={cleanPath} />
    ) : (
      <App />
    )}
  </StrictMode>,
)
