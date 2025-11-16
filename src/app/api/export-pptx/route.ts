import { NextResponse } from 'next/server'
import { exportToPPTX, getPPTXFilename } from '@/lib/utils/pptx-exporter'
import type { PresentationOutline, SlideContent } from '@/lib/ai/unified-ai'

export async function POST(request: Request) {
  try {
    const { outline, slides } = await request.json() as {
      outline: PresentationOutline
      slides: SlideContent[]
    }

    if (!outline || !slides || slides.length === 0) {
      return NextResponse.json(
        { error: 'Outline и slides обязательны' },
        { status: 400 }
      )
    }

    console.log(`[API] Экспорт презентации: "${outline.title}", слайдов: ${slides.length}`)

    // Генерируем PPTX
    const pptxBuffer = await exportToPPTX(outline, slides)

    console.log(`[API] PPTX сгенерирован, размер: ${pptxBuffer.length} байт`)

    // Возвращаем файл
    const filename = getPPTXFilename(outline.title)

    // Кодируем имя файла для поддержки кириллицы в заголовках (RFC 5987)
    const encodedFilename = encodeURIComponent(filename)

    return new NextResponse(pptxBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="presentation.pptx"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': pptxBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('[API] Ошибка экспорта PPTX:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      },
      { status: 500 }
    )
  }
}
