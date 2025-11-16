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

    // Генерируем outline
    const outline = await ai.generatePresentationOutline(
      topic,
      slideCount || 5
    )

    return NextResponse.json({
      status: 'ok',
      outline,
      cached: false, // TODO: проверить кеш
    })
  } catch (error) {
    console.error('Ошибка генерации outline:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        details: 'Убедитесь что Ollama запущен и модели установлены',
      },
      { status: 500 }
    )
  }
}
