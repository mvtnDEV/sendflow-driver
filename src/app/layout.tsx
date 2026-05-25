import type { Metadata, Viewport } from 'next'
import './globals.css'
export const metadata: Metadata = {
  title:       'Moovex Conductor',
  description: 'App de reparto para conductores',
  manifest:    '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Moovex' },
  other: { 'mobile-web-app-capable': 'yes' },
}
export const viewport: Viewport = {
  width:            'device-width',
  initialScale:     1,
  maximumScale:     1,
  userScalable:     false,
  themeColor:       '#0B1628',
  viewportFit:      'cover',
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
      </head>
      <body>{children}</body>
    </html>
  )
}
