/**
 * Ollama Client - Клиент для работы с локальными LLM моделями через Ollama
 *
 * Поддерживаемые модели:
 * - qwen3:14b - основная модель для генерации текста
 * - qwen3-coder:30b - для генерации кода
 * - llama3.1:8b - быстрая модель для простых задач
 * - deepseek-r1:14b - для сложных математических задач
 *
 * Особенности:
 * - Автоматический выбор модели по типу задачи
 * - Поддержка thinking/non-thinking режимов для Qwen3
 * - Парсинг JSON из ответов
 * - Обработка ошибок и retry логика
 * - Интеграция с кешированием
 */

import { z } from 'zod';

// =============================================================================
// ТИПЫ И СХЕМЫ ВАЛИДАЦИИ
// =============================================================================

/**
 * Тип задачи для автоматического выбора модели
 */
export enum TaskType {
  OUTLINE_GENERATION = 'outline_generation',     // Генерация структуры презентации
  SLIDE_CONTENT = 'slide_content',               // Генерация контента слайда
  CODE_GENERATION = 'code_generation',           // Генерация кода
  QUICK_TASK = 'quick_task',                     // Быстрые простые задачи
  COMPLEX_REASONING = 'complex_reasoning',       // Сложные математические задачи
  GENERAL = 'general',                           // Общие задачи
}

/**
 * Режим работы модели Qwen3
 */
export enum QwenMode {
  THINKING = 'thinking',       // Режим с подробным рассуждением
  NON_THINKING = 'non_thinking', // Режим без промежуточных рассуждений
}

/**
 * Конфигурация для запроса к Ollama
 */
export interface OllamaRequestConfig {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  repeat_penalty?: number;
  stream?: boolean;
  format?: 'json' | null;
}

/**
 * Ответ от Ollama API
 */
export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Конфигурация клиента
 */
export interface OllamaClientConfig {
  baseURL: string;
  defaultModel: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Схема для валидации JSON ответа
 */
const OllamaResponseSchema = z.object({
  model: z.string(),
  created_at: z.string(),
  response: z.string(),
  done: z.boolean(),
  context: z.array(z.number()).optional(),
  total_duration: z.number().optional(),
  load_duration: z.number().optional(),
  prompt_eval_count: z.number().optional(),
  prompt_eval_duration: z.number().optional(),
  eval_count: z.number().optional(),
  eval_duration: z.number().optional(),
});

// =============================================================================
// OLLAMA CLIENT
// =============================================================================

export class OllamaClient {
  private config: OllamaClientConfig;

  constructor(config?: Partial<OllamaClientConfig>) {
    this.config = {
      baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      defaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'qwen3:14b',
      timeout: parseInt(process.env.OLLAMA_TIMEOUT || '120000', 10),
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };

    this.logInfo('Ollama Client инициализирован', {
      baseURL: this.config.baseURL,
      defaultModel: this.config.defaultModel,
    });
  }

  // ---------------------------------------------------------------------------
  // ОСНОВНЫЕ МЕТОДЫ
  // ---------------------------------------------------------------------------

  /**
   * Отправить запрос к модели с автоматической обработкой ошибок
   */
  async generate(
    prompt: string,
    options: {
      model?: string;
      system?: string;
      temperature?: number;
      maxTokens?: number;
      format?: 'json' | null;
      taskType?: TaskType;
      qwenMode?: QwenMode;
    } = {}
  ): Promise<string> {
    const startTime = Date.now();

    // Определяем модель (из опций, по типу задачи или дефолтная)
    const model = options.model || this.getModelForTask(options.taskType || TaskType.GENERAL);

    // Подготавливаем промпт (добавляем инструкции для Qwen3 если нужно)
    const processedPrompt = this.preparePrompt(prompt, model, options.qwenMode);

    const requestConfig: OllamaRequestConfig = {
      model,
      prompt: processedPrompt,
      system: options.system,
      temperature: options.temperature ?? parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7'),
      max_tokens: options.maxTokens ?? parseInt(process.env.OLLAMA_MAX_TOKENS || '4096', 10),
      stream: false,
      format: options.format || null,
    };

    this.logDebug('Отправка запроса к Ollama', {
      model,
      promptLength: prompt.length,
      taskType: options.taskType,
    });

    try {
      const response = await this.sendRequest(requestConfig);

      // Парсим ответ (извлекаем JSON если нужно, убираем thinking tags)
      const parsedResponse = this.parseResponse(response.response, options.format === 'json', options.qwenMode);

      const duration = Date.now() - startTime;
      this.logInfo('Запрос выполнен успешно', {
        model,
        duration: `${duration}ms`,
        responseLength: parsedResponse.length,
        tokensGenerated: response.eval_count,
      });

      return parsedResponse;
    } catch (error) {
      this.logError('Ошибка при генерации', error);
      throw error;
    }
  }

  /**
   * Генерация с ожиданием JSON ответа (автоматический парсинг)
   */
  async generateJSON<T = any>(
    prompt: string,
    options: {
      model?: string;
      system?: string;
      temperature?: number;
      taskType?: TaskType;
      schema?: z.ZodSchema<T>;
    } = {}
  ): Promise<T> {
    const response = await this.generate(prompt, {
      ...options,
      format: 'json',
    });

    try {
      const parsed = JSON.parse(response);

      // Валидация через Zod схему если предоставлена
      if (options.schema) {
        return options.schema.parse(parsed);
      }

      return parsed as T;
    } catch (error) {
      this.logError('Ошибка парсинга JSON ответа', error);
      throw new Error(`Не удалось распарсить JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Проверка доступности Ollama сервера и модели
   */
  async checkHealth(modelName?: string): Promise<boolean> {
    try {
      const model = modelName || this.config.defaultModel;

      // Проверяем доступность API
      const response = await fetch(`${this.config.baseURL}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();

      // Проверяем наличие модели
      const models = data.models || [];
      const modelExists = models.some((m: any) => m.name === model);

      if (!modelExists) {
        this.logWarn(`Модель ${model} не найдена в Ollama`, {
          availableModels: models.map((m: any) => m.name),
        });
      }

      return modelExists;
    } catch (error) {
      this.logError('Ollama сервер недоступен', error);
      return false;
    }
  }

  /**
   * Получить список доступных моделей
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseURL}/api/tags`);
      const data = await response.json();
      return (data.models || []).map((m: any) => m.name);
    } catch (error) {
      this.logError('Ошибка получения списка моделей', error);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ---------------------------------------------------------------------------

  /**
   * Выбор модели на основе типа задачи
   */
  private getModelForTask(taskType: TaskType): string {
    switch (taskType) {
      case TaskType.OUTLINE_GENERATION:
        return process.env.OLLAMA_OUTLINE_MODEL || 'qwen3:14b';
      case TaskType.SLIDE_CONTENT:
        return process.env.OLLAMA_CONTENT_MODEL || 'qwen3:14b';
      case TaskType.CODE_GENERATION:
        return process.env.OLLAMA_CODE_MODEL || 'qwen3-coder:30b';
      case TaskType.QUICK_TASK:
        return process.env.OLLAMA_QUICK_MODEL || 'llama3.1:8b';
      case TaskType.COMPLEX_REASONING:
        return process.env.OLLAMA_REASONING_MODEL || 'deepseek-r1:14b';
      default:
        return this.config.defaultModel;
    }
  }

  /**
   * Подготовка промпта (добавление инструкций для Qwen3)
   */
  private preparePrompt(prompt: string, model: string, qwenMode?: QwenMode): string {
    // Если это Qwen3 и режим non-thinking, добавляем инструкцию
    if (model.includes('qwen3') && qwenMode === QwenMode.NON_THINKING) {
      return `${prompt}\n\nОтвечай кратко и по делу, без промежуточных рассуждений.`;
    }

    // Если это Qwen3 и режим thinking, добавляем инструкцию
    if (model.includes('qwen3') && qwenMode === QwenMode.THINKING) {
      return `${prompt}\n\nПодумай над задачей шаг за шагом перед ответом.`;
    }

    return prompt;
  }

  /**
   * Парсинг ответа (извлечение JSON, удаление thinking tags)
   */
  private parseResponse(response: string, expectJson: boolean, qwenMode?: QwenMode): string {
    let parsed = response;

    // Удаляем thinking теги если они есть (для Qwen3)
    if (qwenMode === QwenMode.THINKING || response.includes('<think>')) {
      parsed = parsed.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    // Извлекаем JSON если ожидается
    if (expectJson) {
      const jsonMatch = parsed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = jsonMatch[0];
      }
    }

    return parsed.trim();
  }

  /**
   * Отправка запроса с retry логикой
   */
  private async sendRequest(config: OllamaRequestConfig, retryCount = 0): Promise<OllamaResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(`${this.config.baseURL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Валидация ответа
      const validated = OllamaResponseSchema.parse(data);

      return validated;
    } catch (error) {
      // Retry логика
      if (retryCount < this.config.maxRetries) {
        const delay = this.config.retryDelay * Math.pow(2, retryCount);
        this.logWarn(`Повтор запроса через ${delay}ms (попытка ${retryCount + 1}/${this.config.maxRetries})`, { error });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendRequest(config, retryCount + 1);
      }

      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // ЛОГИРОВАНИЕ
  // ---------------------------------------------------------------------------

  private logDebug(message: string, data?: any): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[OllamaClient] [DEBUG] ${message}`, this.safeStringify(data));
    }
  }

  private logInfo(message: string, data?: any): void {
    if (['debug', 'info'].includes(process.env.LOG_LEVEL || 'info')) {
      console.log(`[OllamaClient] [INFO] ${message}`, this.safeStringify(data));
    }
  }

  private logWarn(message: string, data?: any): void {
    console.warn(`[OllamaClient] [WARN] ${message}`, this.safeStringify(data));
  }

  private logError(message: string, error: any): void {
    console.error(`[OllamaClient] [ERROR] ${message}`);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    } else {
      console.error('Error details:', this.safeStringify(error));
    }
  }

  private safeStringify(obj: any): string {
    if (obj === undefined || obj === null) {
      return '';
    }
    if (typeof obj === 'string') {
      return obj;
    }
    try {
      return JSON.stringify(obj, null, 2);
    } catch (err) {
      return String(obj);
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let ollamaClientInstance: OllamaClient | null = null;

/**
 * Получить singleton инстанс клиента
 */
export function getOllamaClient(): OllamaClient {
  if (!ollamaClientInstance) {
    ollamaClientInstance = new OllamaClient();
  }
  return ollamaClientInstance;
}

/**
 * Сбросить singleton инстанс (для тестирования)
 */
export function resetOllamaClient(): void {
  ollamaClientInstance = null;
}
