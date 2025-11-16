import { NextResponse } from 'next/server'
import { getUnifiedAI } from '@/lib/ai/unified-ai'

export async function POST(request: Request) {
  try {
    const { topic, slideCount } = await request.json()

    if (!topic) {
      return NextResponse.json(
        { error: 'Тема презентации обязательна' },
        { status: 400 }
      )
    }

    const ai = getUnifiedAI()

    // Проверяем здоровье Ollama
    const health = await ai.checkHealth()
    if (!health.ollama) {
      return NextResponse.json(
        { error: 'Ollama сервер недоступен. Запустите: ollama serve' },
        { status: 503 }
      )
    }

    // Генерируем outline
    console.log(`[API] Генерация outline для темы: "${topic}", слайдов: ${slideCount}`)
    const outline = await ai.generatePresentationOutline(topic, slideCount || 10)

    console.log(`[API] Outline сгенерирован успешно: ${outline.slides.length} слайдов`)

    return NextResponse.json({
      status: 'ok',
      outline,
    })
  } catch (error) {
    console.error('[API] Ошибка генерации презентации:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        details: 'Убедитесь что Ollama запущен и модели установлены',
      },
      { status: 500 }
    )
  }
}
