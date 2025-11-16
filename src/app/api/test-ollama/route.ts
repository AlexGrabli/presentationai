import { NextResponse } from 'next/server'
import { getOllamaClient } from '@/lib/ai/ollama-client'

export async function GET() {
  try {
    const client = getOllamaClient()

    // Проверяем здоровье Ollama
    const isHealthy = await client.checkHealth()

    if (!isHealthy) {
      return NextResponse.json(
        { error: 'Ollama сервер недоступен. Запустите: ollama serve' },
        { status: 503 }
      )
    }

    // Получаем список моделей
    const models = await client.listModels()

    // Тестируем простую генерацию
    const testResult = await client.generate('Скажи привет на русском языке (одно предложение)', {
      maxTokens: 50,
    })

    return NextResponse.json({
      status: 'ok',
      message: 'Ollama работает корректно',
      models,
      testGeneration: testResult,
    })
  } catch (error) {
    console.error('Ошибка тестирования Ollama:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        details: 'Убедитесь что Ollama запущен и доступен на http://localhost:11434',
      },
      { status: 500 }
    )
  }
}
