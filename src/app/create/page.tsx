'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PresentationOutline, SlideContent } from '@/lib/ai/unified-ai'

export default function CreatePresentationPage() {
  const [topic, setTopic] = useState('')
  const [slideCount, setSlideCount] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outline, setOutline] = useState<PresentationOutline | null>(null)
  const [slides, setSlides] = useState<SlideContent[]>([])
  const [generatingSlides, setGeneratingSlides] = useState(false)
  const [currentSlide, setCurrentSlide] = useState(0)

  // Генерация outline
  const generateOutline = async () => {
    if (!topic.trim()) {
      setError('Введите тему презентации')
      return
    }

    setLoading(true)
    setError(null)
    setOutline(null)
    setSlides([])

    try {
      const response = await fetch('/api/generate-presentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, slideCount }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка генерации')
      }

      setOutline(data.outline)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  // Генерация всех слайдов
  const generateAllSlides = async () => {
    if (!outline) return

    setGeneratingSlides(true)
    setError(null)
    const generatedSlides: SlideContent[] = []

    try {
      for (let i = 0; i < outline.slides.length; i++) {
        setCurrentSlide(i + 1)
        const slideInfo = outline.slides[i]

        const response = await fetch('/api/generate-slide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: slideInfo.title,
            type: slideInfo.type,
            context: outline.description,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(`Ошибка генерации слайда ${i + 1}: ${data.error}`)
        }

        generatedSlides.push(data.slide)
      }

      setSlides(generatedSlides)
      setCurrentSlide(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка генерации слайдов')
    } finally {
      setGeneratingSlides(false)
    }
  }

  // Экспорт в PPTX
  const exportToPPTX = async () => {
    if (!outline || slides.length === 0) return

    try {
      const response = await fetch('/api/export-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline, slides }),
      })

      if (!response.ok) {
        throw new Error('Ошибка экспорта')
      }

      // Скачиваем файл
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${outline.title.toLowerCase().replace(/\s+/g, '-')}.pptx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка экспорта')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
            ← Назад на главную
          </Link>
          <h1 className="text-4xl font-bold text-gray-900">Создать презентацию</h1>
          <p className="text-gray-600 mt-2">
            Введите тему и получите готовую презентацию в формате PPTX
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Тема презентации
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Например: Искусственный интеллект в медицине"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading || generatingSlides}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Количество слайдов: {slideCount}
              </label>
              <input
                type="range"
                min="5"
                max="20"
                value={slideCount}
                onChange={(e) => setSlideCount(parseInt(e.target.value))}
                className="w-full"
                disabled={loading || generatingSlides}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>5</span>
                <span>20</span>
              </div>
            </div>

            <button
              onClick={generateOutline}
              disabled={loading || generatingSlides || !topic.trim()}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Генерация структуры...' : '1. Сгенерировать структуру'}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Outline Display */}
        {outline && (
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{outline.title}</h2>
                <p className="text-gray-600 mt-1">{outline.description}</p>
              </div>
              {slides.length === 0 && (
                <button
                  onClick={generateAllSlides}
                  disabled={generatingSlides}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400"
                >
                  {generatingSlides
                    ? `Генерация слайда ${currentSlide}/${outline.slides.length}...`
                    : '2. Сгенерировать контент'}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {outline.slides.map((slide, index) => (
                <div
                  key={index}
                  className="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-full font-semibold text-sm">
                    {index + 1}
                  </span>
                  <div className="ml-4 flex-1">
                    <h3 className="font-semibold text-gray-900">{slide.title}</h3>
                    <p className="text-sm text-gray-500">{slide.type}</p>
                  </div>
                  {slides[index] && (
                    <span className="text-green-600 font-semibold">✓</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Slides Preview */}
        {slides.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Предпросмотр слайдов</h2>
              <button
                onClick={exportToPPTX}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors"
              >
                3. Скачать PPTX
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {slides.map((slide, index) => (
                <div
                  key={index}
                  className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-400 transition-colors"
                >
                  <div className="flex items-center mb-2">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-blue-600 text-white rounded-full font-semibold text-xs">
                      {index + 1}
                    </span>
                    <h3 className="ml-2 font-bold text-gray-900">{slide.title}</h3>
                  </div>

                  {slide.bullet_points && slide.bullet_points.length > 0 && (
                    <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                      {slide.bullet_points.slice(0, 3).map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                      {slide.bullet_points.length > 3 && (
                        <li className="text-gray-500">...ещё {slide.bullet_points.length - 3}</li>
                      )}
                    </ul>
                  )}

                  {slide.content && !slide.bullet_points && (
                    <p className="text-sm text-gray-700 line-clamp-4">{slide.content}</p>
                  )}

                  {slide.code && (
                    <pre className="text-xs bg-gray-100 p-2 rounded mt-2 overflow-x-auto">
                      {slide.code.substring(0, 100)}...
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        {!outline && !loading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-blue-900 font-semibold mb-2">Как использовать</h3>
            <ol className="text-blue-800 space-y-2 list-decimal list-inside">
              <li>Введите тему презентации</li>
              <li>Выберите количество слайдов (5-20)</li>
              <li>Нажмите "Сгенерировать структуру" - AI создаст план презентации</li>
              <li>Нажмите "Сгенерировать контент" - AI наполнит каждый слайд</li>
              <li>Нажмите "Скачать PPTX" - получите готовую презентацию</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
