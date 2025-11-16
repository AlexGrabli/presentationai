import { NextResponse } from 'next/server'
import { getUnifiedAI } from '@/lib/ai/unified-ai'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { topic, slideCount } = body

    console.log('[API] Получен запрос:', { topic, slideCount })

    if (!topic) {
      return NextResponse.json(
        { error: 'Тема презентации обязательна' },
        { status: 400 }
      )
    }

    const ai = getUnifiedAI()

    // Проверяем здоровье Ollama
    console.log('[API] Проверка здоровья Ollama...')
    const health = await ai.checkHealth()
    console.log('[API] Результат проверки:', health)

    if (!health.ollama) {
      return NextResponse.json(
        { error: 'Ollama сервер недоступен. Запустите: ollama serve' },
        { status: 503 }
      )
    }

    // Генерируем outline
    console.log(`[API] Генерация outline для темы: "${topic}", слайдов: ${slideCount}`)
    const outline = await ai.generatePresentationOutline(topic, slideCount || 10)

    console.log(`[API] Outline сгенерирован успешно:`, outline)

    return NextResponse.json({
      status: 'ok',
      outline,
    })
  } catch (error) {
    console.error('[API] Ошибка генерации презентации:', error)
    console.error('[API] Stack trace:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        details: 'Убедитесь что Ollama запущен и модели установлены',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
