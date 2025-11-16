import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-4xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-bold text-gray-900">
            Presentation AI
          </h1>
          <p className="text-xl text-gray-600">
            Генерация презентаций с помощью локальных AI моделей
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <div className="text-3xl mb-3">🧠</div>
            <h3 className="text-xl font-semibold mb-2">Локальные LLM</h3>
            <p className="text-gray-600">
              4 специализированные модели через Ollama: qwen3:14b, qwen3-coder:30b, llama3.1:8b, deepseek-r1:14b
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <div className="text-3xl mb-3">🎨</div>
            <h3 className="text-xl font-semibold mb-2">Генерация изображений</h3>
            <p className="text-gray-600">
              Stable Diffusion WebUI для создания визуального контента презентаций
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-xl font-semibold mb-2">Redis кеширование</h3>
            <p className="text-gray-600">
              Быстрый доступ к ранее сгенерированному контенту с автоматическим TTL
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <div className="text-3xl mb-3">📊</div>
            <h3 className="text-xl font-semibold mb-2">GPU мониторинг</h3>
            <p className="text-gray-600">
              Отслеживание VRAM, температуры и производительности в реальном времени
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
          <Link
            href="/create"
            className="px-8 py-4 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors text-center text-lg"
          >
            🎨 Создать презентацию
          </Link>
          <Link
            href="/test-ai"
            className="px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors text-center"
          >
            Тестировать AI
          </Link>
          <a
            href="/README.local-ai.md"
            target="_blank"
            className="px-8 py-4 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors text-center"
          >
            Документация
          </a>
        </div>

        {/* System Status */}
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mt-8">
          <h3 className="text-lg font-semibold mb-4">Системные требования</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-500">GPU</div>
              <div className="font-semibold">RTX 4070ti (12GB VRAM)</div>
            </div>
            <div>
              <div className="text-gray-500">RAM</div>
              <div className="font-semibold">32GB</div>
            </div>
            <div>
              <div className="text-gray-500">CPU</div>
              <div className="font-semibold">Intel i5-12400</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 mt-8">
          <p>Powered by Ollama • Stable Diffusion • Redis</p>
        </div>
      </div>
    </div>
  )
}
