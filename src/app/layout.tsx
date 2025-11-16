import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Presentation AI',
  description: 'AI-powered presentation generator with local Ollama models',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-gray-50">
        {children}
      </body>
    </html>
  )
}
