import { NextResponse } from 'next/server'
import { getUnifiedAI } from '@/lib/ai/unified-ai'

export async function POST(request: Request) {
  try {
    const { title, type, context } = await request.json()

    if (!title) {
      return NextResponse.json(
        { error: 'Заголовок слайда обязателен' },
        { status: 400 }
      )
    }

    const ai = getUnifiedAI()

    console.log(`[API] Генерация слайда: "${title}", тип: ${type}`)

    // Генерируем контент слайда
    const slide = await ai.generateSlideContent(title, type, context)

    console.log(`[API] Слайд сгенерирован успешно`)

    return NextResponse.json({
      status: 'ok',
      slide,
    })
  } catch (error) {
    console.error('[API] Ошибка генерации слайда:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      },
      { status: 500 }
    )
  }
}
