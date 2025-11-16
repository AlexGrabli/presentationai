/**
 * PPTX Exporter - Утилита для экспорта презентаций в PowerPoint формат
 *
 * Использует pptxgenjs для создания .pptx файлов
 */

import PptxGenJS from 'pptxgenjs';
import type { PresentationOutline, SlideContent } from '@/lib/ai/unified-ai';

/**
 * Экспортировать презентацию в PPTX
 */
export async function exportToPPTX(
  outline: PresentationOutline,
  slides: SlideContent[]
): Promise<Buffer> {
  const pptx = new PptxGenJS();

  // Настройки презентации
  pptx.author = 'Presentation AI';
  pptx.title = outline.title;
  pptx.subject = outline.description;

  // Титульный слайд
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: '1F2937' }; // Темно-серый фон

  titleSlide.addText(outline.title, {
    x: 0.5,
    y: 2.5,
    w: 9,
    h: 1.5,
    fontSize: 44,
    bold: true,
    color: 'FFFFFF',
    align: 'center',
  });

  if (outline.description) {
    titleSlide.addText(outline.description, {
      x: 1,
      y: 4.5,
      w: 8,
      h: 0.8,
      fontSize: 20,
      color: 'E5E7EB',
      align: 'center',
    });
  }

  // Слайды с контентом
  for (let i = 0; i < slides.length; i++) {
    const slideData = slides[i];
    const slide = pptx.addSlide();

    // Фон
    slide.background = { color: 'FFFFFF' };

    // Заголовок
    slide.addText(slideData.title, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: '1F2937',
    });

    // Линия под заголовком
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: 1.4,
      w: 9,
      h: 0.05,
      fill: { color: '3B82F6' },
    });

    // Bullet points
    if (slideData.bullet_points && slideData.bullet_points.length > 0) {
      slide.addText(
        slideData.bullet_points.map(point => ({ text: point, options: { bullet: true } })),
        {
          x: 0.8,
          y: 2.0,
          w: 8.4,
          h: 3.5,
          fontSize: 18,
          color: '374151',
          lineSpacing: 28,
        }
      );
    }

    // Основной текст (если нет bullet points)
    if (!slideData.bullet_points && slideData.content) {
      slide.addText(slideData.content, {
        x: 0.8,
        y: 2.0,
        w: 8.4,
        h: 3.5,
        fontSize: 18,
        color: '374151',
        valign: 'top',
      });
    }

    // Код (если есть)
    if (slideData.code) {
      slide.addText(slideData.code, {
        x: 0.8,
        y: 2.0,
        w: 8.4,
        h: 3.5,
        fontSize: 14,
        fontFace: 'Courier New',
        color: '1F2937',
        fill: { color: 'F3F4F6' },
        valign: 'top',
      });
    }

    // Номер слайда
    slide.addText(`${i + 1}`, {
      x: 9.2,
      y: 5.2,
      w: 0.5,
      h: 0.3,
      fontSize: 12,
      color: '9CA3AF',
      align: 'right',
    });
  }

  // Заключительный слайд
  const endSlide = pptx.addSlide();
  endSlide.background = { color: '1F2937' };

  endSlide.addText('Спасибо за внимание!', {
    x: 0.5,
    y: 2.5,
    w: 9,
    h: 1.5,
    fontSize: 44,
    bold: true,
    color: 'FFFFFF',
    align: 'center',
  });

  endSlide.addText('Создано с помощью Presentation AI', {
    x: 1,
    y: 4.5,
    w: 8,
    h: 0.5,
    fontSize: 16,
    color: 'E5E7EB',
    align: 'center',
  });

  // Генерируем и возвращаем Buffer
  const pptxData = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
  return pptxData;
}

/**
 * Получить имя файла для презентации
 */
export function getPPTXFilename(title: string): string {
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  const timestamp = new Date().toISOString().split('T')[0];
  return `${sanitized}-${timestamp}.pptx`;
}
