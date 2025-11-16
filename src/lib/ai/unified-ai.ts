/**
 * Unified AI Interface - Единый интерфейс для всех AI сервисов
 *
 * Объединяет Ollama (LLM), Stable Diffusion (Images) и кеширование
 * в единый простой API для использования во всем приложении.
 *
 * Основные возможности:
 * - Генерация текста через локальные модели Ollama
 * - Генерация изображений через Stable Diffusion
 * - Автоматическое кеширование результатов
 * - Fallback на облачные сервисы при недоступности локальных
 * - Мониторинг производительности
 * - Rate limiting
 */

import { getOllamaClient, TaskType, QwenMode } from './ollama-client';
import { getSDClient, ImageGenerationConfig, ImageGenerationResult, UnsplashResult } from './sd-client';
import {
  ModelSelector,
  TaskCharacteristics,
  createOutlineTaskCharacteristics,
  createSlideTaskCharacteristics,
  createCodeTaskCharacteristics,
} from './model-selector';
import { z } from 'zod';

// =============================================================================
// ТИПЫ
// =============================================================================

/**
 * Опции для генерации текста
 */
export interface GenerateTextOptions {
  taskType?: TaskType;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  systemPrompt?: string;
  useCache?: boolean;
  cacheKey?: string;
}

/**
 * Опции для генерации JSON
 */
export interface GenerateJSONOptions<T = any> extends GenerateTextOptions {
  schema?: z.ZodSchema<T>;
}

/**
 * Опции для генерации изображения
 */
export interface GenerateImageOptions {
  style?: 'professional' | 'artistic' | 'minimal';
  width?: number;
  height?: number;
  useCache?: boolean;
  cacheKey?: string;
}

/**
 * Схема outline презентации
 */
export const PresentationOutlineSchema = z.object({
  title: z.string(),
  description: z.string(),
  slides: z.array(
    z.object({
      title: z.string(),
      type: z.enum(['title', 'content', 'image', 'code', 'conclusion']),
      content: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export type PresentationOutline = z.infer<typeof PresentationOutlineSchema>;

/**
 * Схема контента слайда
 */
export const SlideContentSchema = z.object({
  title: z.string(),
  bullet_points: z.array(z.string()).optional(),
  content: z.string().optional(),
  code: z.string().optional(),
  image_prompt: z.string().optional(),
});

export type SlideContent = z.infer<typeof SlideContentSchema>;

// =============================================================================
// UNIFIED AI CLASS
// =============================================================================

export class UnifiedAI {
  private ollamaClient = getOllamaClient();
  private sdClient = getSDClient();
  private cache: Map<string, any> = new Map();

  // Rate limiting
  private requestCounts: Map<string, number> = new Map();
  private maxRequestsPerMinute = 30;

  // ---------------------------------------------------------------------------
  // ГЕНЕРАЦИЯ ПРЕЗЕНТАЦИЙ
  // ---------------------------------------------------------------------------

  /**
   * Генерация структуры презентации (outline)
   */
  async generatePresentationOutline(
    topic: string,
    slideCount: number = 10
  ): Promise<PresentationOutline> {
    const cacheKey = `outline:${topic}:${slideCount}`;

    // Проверяем кеш
    if (this.cache.has(cacheKey)) {
      this.logInfo('Возврат outline из кеша', { topic });
      return this.cache.get(cacheKey);
    }

    const prompt = `Создай структуру презентации на тему: "${topic}"

Требования:
- Количество слайдов: ${slideCount}
- Первый слайд - титульный
- Последний слайд - заключение
- Остальные слайды - контент
- Логичная структура и последовательность

Верни JSON в формате:
{
  "title": "Название презентации",
  "description": "Краткое описание",
  "slides": [
    {
      "title": "Заголовок слайда",
      "type": "title|content|image|code|conclusion",
      "content": "Краткое описание содержимого",
      "notes": "Заметки для спикера (опционально)"
    }
  ]
}`;

    try {
      const characteristics = createOutlineTaskCharacteristics();
      const recommendation = ModelSelector.selectModel(characteristics);

      this.logInfo('Генерация outline презентации', {
        topic,
        slideCount,
        model: recommendation.model,
      });

      const outline = await this.ollamaClient.generateJSON<PresentationOutline>(
        prompt,
        {
          taskType: TaskType.OUTLINE_GENERATION,
          schema: PresentationOutlineSchema,
          temperature: 0.7,
        }
      );

      // Кешируем результат
      this.cache.set(cacheKey, outline);

      return outline;
    } catch (error) {
      this.logError('Ошибка генерации outline', error);
      throw error;
    }
  }

  /**
   * Генерация контента для слайда
   */
  async generateSlideContent(
    slideTitle: string,
    slideType: string,
    context?: string
  ): Promise<SlideContent> {
    const cacheKey = `slide:${slideTitle}:${slideType}`;

    if (this.cache.has(cacheKey)) {
      this.logInfo('Возврат контента слайда из кеша', { slideTitle });
      return this.cache.get(cacheKey);
    }

    let prompt = `Создай контент для слайда презентации.

Заголовок: ${slideTitle}
Тип слайда: ${slideType}`;

    if (context) {
      prompt += `\nКонтекст: ${context}`;
    }

    prompt += `\n\nВерни JSON в формате:
{
  "title": "Заголовок",
  "bullet_points": ["пункт 1", "пункт 2", "пункт 3"],
  "content": "Основной текст (если нужен)",
  "code": "Код (если тип слайда - code)",
  "image_prompt": "Описание для генерации изображения (если нужно)"
}`;

    try {
      const taskType = slideType === 'code' ? TaskType.CODE_GENERATION : TaskType.SLIDE_CONTENT;

      const content = await this.ollamaClient.generateJSON<SlideContent>(
        prompt,
        {
          taskType,
          schema: SlideContentSchema,
          temperature: 0.7,
        }
      );

      this.cache.set(cacheKey, content);

      return content;
    } catch (error) {
      this.logError('Ошибка генерации контента слайда', error);
      throw error;
    }
  }

  /**
   * Генерация изображения для слайда
   */
  async generateSlideImage(
    imagePrompt: string,
    options: GenerateImageOptions = {}
  ): Promise<ImageGenerationResult | UnsplashResult> {
    const cacheKey = options.cacheKey || `image:${imagePrompt}`;

    if (options.useCache && this.cache.has(cacheKey)) {
      this.logInfo('Возврат изображения из кеша', { prompt: imagePrompt.substring(0, 50) });
      return this.cache.get(cacheKey);
    }

    try {
      // Улучшаем промпт
      const enhancedPrompt = this.sdClient.constructor.enhancePrompt(
        imagePrompt,
        options.style || 'professional'
      );

      this.logInfo('Генерация изображения', {
        prompt: imagePrompt.substring(0, 50),
        style: options.style,
      });

      const config: ImageGenerationConfig = {
        prompt: enhancedPrompt,
        width: options.width,
        height: options.height,
      };

      const result = await this.sdClient.generateImage(config);

      if (options.useCache) {
        this.cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      this.logError('Ошибка генерации изображения', error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // БАЗОВЫЕ МЕТОДЫ ГЕНЕРАЦИИ
  // ---------------------------------------------------------------------------

  /**
   * Генерация текста (базовый метод)
   */
  async generateText(
    prompt: string,
    options: GenerateTextOptions = {}
  ): Promise<string> {
    try {
      // Применяем rate limiting
      await this.checkRateLimit('text');

      // Определяем характеристики задачи
      const characteristics: TaskCharacteristics = {
        type: options.taskType || TaskType.GENERAL,
        complexity: 'medium',
        requiresReasoning: false,
        requiresCode: options.taskType === TaskType.CODE_GENERATION,
        requiresStructure: false,
      };

      const recommendation = ModelSelector.selectModel(characteristics);

      this.logInfo('Генерация текста', {
        model: recommendation.model,
        taskType: options.taskType,
      });

      const result = await this.ollamaClient.generate(prompt, {
        model: options.model || recommendation.model,
        system: options.systemPrompt,
        temperature: options.temperature ?? recommendation.temperature,
        maxTokens: options.maxTokens ?? recommendation.maxTokens,
        taskType: options.taskType,
        qwenMode: recommendation.qwenMode,
      });

      return result;
    } catch (error) {
      this.logError('Ошибка генерации текста', error);
      throw error;
    }
  }

  /**
   * Генерация JSON (базовый метод)
   */
  async generateJSON<T = any>(
    prompt: string,
    options: GenerateJSONOptions<T> = {}
  ): Promise<T> {
    try {
      await this.checkRateLimit('json');

      const characteristics: TaskCharacteristics = {
        type: options.taskType || TaskType.GENERAL,
        complexity: 'medium',
        requiresReasoning: false,
        requiresCode: false,
        requiresStructure: true,
      };

      const recommendation = ModelSelector.selectModel(characteristics);

      this.logInfo('Генерация JSON', {
        model: recommendation.model,
      });

      const result = await this.ollamaClient.generateJSON<T>(prompt, {
        model: options.model || recommendation.model,
        system: options.systemPrompt,
        temperature: options.temperature ?? recommendation.temperature,
        taskType: options.taskType,
        schema: options.schema,
      });

      return result;
    } catch (error) {
      this.logError('Ошибка генерации JSON', error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // УТИЛИТЫ
  // ---------------------------------------------------------------------------

  /**
   * Проверка здоровья всех сервисов
   */
  async checkHealth(): Promise<{
    ollama: boolean;
    stableDiffusion: boolean;
  }> {
    const [ollama, sd] = await Promise.all([
      this.ollamaClient.checkHealth(),
      this.sdClient.checkHealth(),
    ]);

    return {
      ollama,
      stableDiffusion: sd,
    };
  }

  /**
   * Очистить кеш
   */
  clearCache(): void {
    this.cache.clear();
    this.logInfo('Кеш очищен');
  }

  /**
   * Получить статистику кеша
   */
  getCacheStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  // ---------------------------------------------------------------------------
  // RATE LIMITING
  // ---------------------------------------------------------------------------

  private async checkRateLimit(type: string): Promise<void> {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const key = `${type}:${minute}`;

    const count = this.requestCounts.get(key) || 0;

    if (count >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - (now % 60000);
      this.logWarn(`Rate limit достигнут для ${type}, ожидание ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.requestCounts.set(key, count + 1);

    // Очищаем старые счетчики
    for (const [k] of this.requestCounts) {
      const [, m] = k.split(':');
      if (parseInt(m) < minute - 1) {
        this.requestCounts.delete(k);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // ЛОГИРОВАНИЕ
  // ---------------------------------------------------------------------------

  private logInfo(message: string, data?: any): void {
    if (['debug', 'info'].includes(process.env.LOG_LEVEL || 'info')) {
      console.log(`[UnifiedAI] [INFO] ${message}`, data || '');
    }
  }

  private logWarn(message: string, data?: any): void {
    console.warn(`[UnifiedAI] [WARN] ${message}`, data || '');
  }

  private logError(message: string, error: any): void {
    console.error(`[UnifiedAI] [ERROR] ${message}`);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      if (error.stack) console.error('Stack:', error.stack);
    } else if (error) {
      console.error('Error details:', String(error));
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let unifiedAIInstance: UnifiedAI | null = null;

/**
 * Получить singleton инстанс UnifiedAI
 */
export function getUnifiedAI(): UnifiedAI {
  if (!unifiedAIInstance) {
    unifiedAIInstance = new UnifiedAI();
  }
  return unifiedAIInstance;
}

/**
 * Сбросить singleton инстанс (для тестирования)
 */
export function resetUnifiedAI(): void {
  unifiedAIInstance = null;
}

/**
 * Экспорт дефолтного инстанса
 */
export default getUnifiedAI();
