'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function TestAIPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const testOllama = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/test-ollama')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка тестирования')
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  const testOutline = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/test-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'Искусственный интеллект', slideCount: 5 }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка генерации')
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
            ← Назад на главную
          </Link>
          <h1 className="text-4xl font-bold text-gray-900">Тестирование AI</h1>
          <p className="text-gray-600 mt-2">
            Проверьте работоспособность локальных моделей Ollama
          </p>
        </div>

        {/* Test Buttons */}
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-6">
          <h2 className="text-xl font-semibold mb-4">Доступные тесты</h2>
          <div className="space-y-3">
            <button
              onClick={testOllama}
              disabled={loading}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Тестирование...' : 'Проверить подключение к Ollama'}
            </button>

            <button
              onClick={testOutline}
              disabled={loading}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Генерация...' : 'Сгенерировать outline презентации'}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <h3 className="text-red-800 font-semibold mb-2">Ошибка</h3>
            <p className="text-red-700">{error}</p>
            <p className="text-sm text-red-600 mt-2">
              Убедитесь что Ollama запущен: <code className="bg-red-100 px-2 py-1 rounded">ollama serve</code>
            </p>
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-4">Результат</h3>
            <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        {/* Instructions */}
        {!loading && !result && !error && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-blue-900 font-semibold mb-2">Инструкции</h3>
            <ol className="text-blue-800 space-y-2 list-decimal list-inside">
              <li>Убедитесь что Ollama запущен: <code className="bg-blue-100 px-2 py-1 rounded">ollama serve</code></li>
              <li>Установлены модели: <code className="bg-blue-100 px-2 py-1 rounded">ollama pull qwen3:14b</code></li>
              <li>Нажмите на одну из кнопок тестирования выше</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
