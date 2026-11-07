import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App, { basePath } from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter basename={basePath || '/'}><App /></BrowserRouter></React.StrictMode>,
)
