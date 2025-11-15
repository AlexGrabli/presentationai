/**
 * Stable Diffusion Client - Клиент для генерации изображений
 *
 * Интеграция с Stable Diffusion WebUI (AUTOMATIC1111)
 * Оптимизирован для RTX 4070ti (12GB VRAM)
 *
 * Особенности:
 * - Генерация изображений через SD WebUI API
 * - Оптимальные настройки для RTX 4070ti
 * - Fallback на Unsplash если SD недоступен
 * - Автоматическая очередь запросов (только 1 одновременно)
 * - Кеширование промптов
 */

import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';

// =============================================================================
// ТИПЫ И СХЕМЫ
// =============================================================================

/**
 * Конфигурация генерации изображения
 */
export interface ImageGenerationConfig {
  prompt: string;                    // Описание изображения
  negativePrompt?: string;           // Что НЕ должно быть на изображении
  width?: number;                    // Ширина (по умолчанию 1024)
  height?: number;                   // Высота (по умолчанию 576)
  steps?: number;                    // Количество шагов (20-30 оптимально)
  cfgScale?: number;                 // CFG Scale (7-12)
  sampler?: string;                  // Sampler (DPM++ 2M Karras)
  seed?: number;                     // Seed для воспроизводимости (-1 = случайный)
  batchSize?: number;                // Количество изображений
}

/**
 * Результат генерации
 */
export interface ImageGenerationResult {
  image: string;                     // Base64 изображение
  info: {
    prompt: string;
    seed: number;
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    sampler: string;
  };
  generationTime: number;            // Время генерации в мс
}

/**
 * Результат от Unsplash (fallback)
 */
export interface UnsplashResult {
  url: string;
  author: string;
  source: 'unsplash';
}

/**
 * Схема ответа SD WebUI
 */
const SDResponseSchema = z.object({
  images: z.array(z.string()),
  parameters: z.object({
    prompt: z.string(),
    negative_prompt: z.string().optional(),
    steps: z.number(),
    sampler_name: z.string(),
    cfg_scale: z.number(),
    width: z.number(),
    height: z.number(),
    seed: z.number(),
  }),
  info: z.string(),
});

// =============================================================================
// STABLE DIFFUSION CLIENT
// =============================================================================

export class StableDiffusionClient {
  private axiosInstance: AxiosInstance;
  private baseURL: string;
  private isGenerating: boolean = false;
  private queue: Array<() => Promise<void>> = [];

  // Дефолтные настройки для RTX 4070ti
  private defaultConfig = {
    width: parseInt(process.env.SD_WIDTH || '1024', 10),
    height: parseInt(process.env.SD_HEIGHT || '576', 10),
    steps: parseInt(process.env.SD_STEPS || '25', 10),
    cfgScale: parseFloat(process.env.SD_CFG_SCALE || '7.5'),
    sampler: process.env.SD_SAMPLER || 'DPM++ 2M Karras',
    negativePrompt: 'ugly, blurry, low quality, distorted, text, watermark, signature',
  };

  constructor() {
    this.baseURL = process.env.SD_WEBUI_URL || 'http://localhost:7860';

    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: parseInt(process.env.SD_TIMEOUT || '180000', 10),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Добавляем API ключ если есть
    if (process.env.SD_WEBUI_API_KEY) {
      this.axiosInstance.defaults.headers.common['Authorization'] =
        `Bearer ${process.env.SD_WEBUI_API_KEY}`;
    }

    this.logInfo('SD Client инициализирован', { baseURL: this.baseURL });
  }

  // ---------------------------------------------------------------------------
  // ОСНОВНЫЕ МЕТОДЫ
  // ---------------------------------------------------------------------------

  /**
   * Генерация изображения через SD WebUI
   */
  async generateImage(config: ImageGenerationConfig): Promise<ImageGenerationResult | UnsplashResult> {
    // Проверяем доступность SD
    const isAvailable = await this.checkHealth();

    if (!isAvailable && process.env.ENABLE_CLOUD_FALLBACK === 'true') {
      this.logWarn('SD WebUI недоступен, используем Unsplash fallback');
      return this.generateFromUnsplash(config.prompt);
    }

    if (!isAvailable) {
      throw new Error('SD WebUI недоступен и fallback отключен');
    }

    // Добавляем в очередь
    return this.enqueue(() => this.performGeneration(config));
  }

  /**
   * Проверка доступности SD WebUI
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseURL}/sdapi/v1/sd-models`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      this.logDebug('SD WebUI недоступен', error);
      return false;
    }
  }

  /**
   * Получить список доступных моделей SD
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await this.axiosInstance.get('/sdapi/v1/sd-models');
      return response.data.map((model: any) => model.model_name);
    } catch (error) {
      this.logError('Ошибка получения списка моделей', error);
      return [];
    }
  }

  /**
   * Получить текущую модель
   */
  async getCurrentModel(): Promise<string | null> {
    try {
      const response = await this.axiosInstance.get('/sdapi/v1/options');
      return response.data.sd_model_checkpoint || null;
    } catch (error) {
      this.logError('Ошибка получения текущей модели', error);
      return null;
    }
  }

  /**
   * Переключить модель
   */
  async setModel(modelName: string): Promise<boolean> {
    try {
      await this.axiosInstance.post('/sdapi/v1/options', {
        sd_model_checkpoint: modelName,
      });
      this.logInfo('Модель переключена', { model: modelName });
      return true;
    } catch (error) {
      this.logError('Ошибка переключения модели', error);
      return false;
    }
  }

  /**
   * Прервать текущую генерацию
   */
  async interrupt(): Promise<void> {
    try {
      await this.axiosInstance.post('/sdapi/v1/interrupt');
      this.logInfo('Генерация прервана');
    } catch (error) {
      this.logError('Ошибка прерывания генерации', error);
    }
  }

  // ---------------------------------------------------------------------------
  // ПРИВАТНЫЕ МЕТОДЫ
  // ---------------------------------------------------------------------------

  /**
   * Выполнить генерацию (основная логика)
   */
  private async performGeneration(config: ImageGenerationConfig): Promise<ImageGenerationResult> {
    const startTime = Date.now();

    const payload = {
      prompt: config.prompt,
      negative_prompt: config.negativePrompt || this.defaultConfig.negativePrompt,
      width: config.width || this.defaultConfig.width,
      height: config.height || this.defaultConfig.height,
      steps: config.steps || this.defaultConfig.steps,
      cfg_scale: config.cfgScale || this.defaultConfig.cfgScale,
      sampler_name: config.sampler || this.defaultConfig.sampler,
      seed: config.seed ?? -1,
      batch_size: config.batchSize || 1,
      n_iter: 1,
      override_settings: {
        sd_model_checkpoint: process.env.SD_MODEL,
      },
    };

    this.logInfo('Начало генерации изображения', {
      prompt: config.prompt.substring(0, 50) + '...',
      width: payload.width,
      height: payload.height,
      steps: payload.steps,
    });

    try {
      const response = await this.axiosInstance.post('/sdapi/v1/txt2img', payload);

      // Валидация ответа
      const validated = SDResponseSchema.parse(response.data);

      const generationTime = Date.now() - startTime;

      this.logInfo('Изображение сгенерировано', {
        time: `${generationTime}ms`,
        seed: validated.parameters.seed,
      });

      return {
        image: validated.images[0],
        info: {
          prompt: validated.parameters.prompt,
          seed: validated.parameters.seed,
          width: validated.parameters.width,
          height: validated.parameters.height,
          steps: validated.parameters.steps,
          cfgScale: validated.parameters.cfg_scale,
          sampler: validated.parameters.sampler_name,
        },
        generationTime,
      };
    } catch (error) {
      this.logError('Ошибка генерации изображения', error);
      throw error;
    }
  }

  /**
   * Fallback на Unsplash
   */
  private async generateFromUnsplash(query: string): Promise<UnsplashResult> {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;

    if (!accessKey) {
      throw new Error('Unsplash API ключ не настроен');
    }

    try {
      this.logInfo('Поиск изображения на Unsplash', { query });

      const response = await axios.get('https://api.unsplash.com/search/photos', {
        params: {
          query,
          per_page: 1,
          orientation: 'landscape',
        },
        headers: {
          'Authorization': `Client-ID ${accessKey}`,
        },
        timeout: 10000,
      });

      const photo = response.data.results[0];

      if (!photo) {
        throw new Error('Изображение не найдено на Unsplash');
      }

      return {
        url: photo.urls.regular,
        author: photo.user.name,
        source: 'unsplash',
      };
    } catch (error) {
      this.logError('Ошибка поиска на Unsplash', error);
      throw error;
    }
  }

  /**
   * Очередь запросов (только 1 генерация одновременно для экономии VRAM)
   */
  private async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          this.isGenerating = true;
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.isGenerating = false;
          this.processQueue();
        }
      };

      this.queue.push(wrappedTask);

      // Если очередь не обрабатывается, запускаем
      if (!this.isGenerating) {
        this.processQueue();
      }
    });
  }

  /**
   * Обработка очереди
   */
  private processQueue(): void {
    if (this.queue.length > 0 && !this.isGenerating) {
      const task = this.queue.shift();
      if (task) {
        task();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // УТИЛИТЫ
  // ---------------------------------------------------------------------------

  /**
   * Улучшить промпт для Stable Diffusion
   */
  static enhancePrompt(basicPrompt: string, style?: 'professional' | 'artistic' | 'minimal'): string {
    const styleEnhancements = {
      professional: 'professional, clean, corporate, business style, high quality',
      artistic: 'artistic, creative, vibrant colors, detailed, masterpiece',
      minimal: 'minimal, clean, simple, modern, flat design',
    };

    const baseEnhancement = 'high quality, detailed, 8k, professional photography';
    const styleAddition = style ? styleEnhancements[style] : '';

    return `${basicPrompt}, ${styleAddition}, ${baseEnhancement}`.trim();
  }

  /**
   * Получить негативный промпт по умолчанию
   */
  static getDefaultNegativePrompt(): string {
    return 'ugly, blurry, low quality, distorted, deformed, bad anatomy, text, watermark, signature, cropped, out of frame, worst quality, low quality jpeg artifacts, duplicate, morbid, mutilated';
  }

  // ---------------------------------------------------------------------------
  // ЛОГИРОВАНИЕ
  // ---------------------------------------------------------------------------

  private logDebug(message: string, data?: any): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[SDClient] [DEBUG] ${message}`, data || '');
    }
  }

  private logInfo(message: string, data?: any): void {
    if (['debug', 'info'].includes(process.env.LOG_LEVEL || 'info')) {
      console.log(`[SDClient] [INFO] ${message}`, data || '');
    }
  }

  private logWarn(message: string, data?: any): void {
    console.warn(`[SDClient] [WARN] ${message}`, data || '');
  }

  private logError(message: string, error: any): void {
    console.error(`[SDClient] [ERROR] ${message}`, error);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let sdClientInstance: StableDiffusionClient | null = null;

/**
 * Получить singleton инстанс клиента
 */
export function getSDClient(): StableDiffusionClient {
  if (!sdClientInstance) {
    sdClientInstance = new StableDiffusionClient();
  }
  return sdClientInstance;
}

/**
 * Сбросить singleton инстанс (для тестирования)
 */
export function resetSDClient(): void {
  sdClientInstance = null;
}
