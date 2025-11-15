/**
 * Model Selector - Умный выбор модели по типу задачи
 *
 * Автоматически определяет оптимальную модель и параметры генерации
 * на основе характеристик задачи, контекста и требований к производительности.
 *
 * Поддерживаемые сценарии:
 * - Генерация структуры презентации (thinking mode)
 * - Генерация контента слайдов (non-thinking mode)
 * - Генерация кода и технических деталей
 * - Быстрые задачи (перевод, форматирование)
 * - Сложные математические задачи
 */

import { TaskType, QwenMode } from './ollama-client';

// =============================================================================
// ТИПЫ И ИНТЕРФЕЙСЫ
// =============================================================================

/**
 * Характеристики задачи для выбора модели
 */
export interface TaskCharacteristics {
  type: TaskType;                    // Тип задачи
  complexity: 'simple' | 'medium' | 'complex';  // Сложность задачи
  requiresReasoning: boolean;        // Требуется ли подробное рассуждение
  requiresCode: boolean;             // Генерация кода
  requiresStructure: boolean;        // Генерация структурированных данных
  maxLatency?: number;               // Максимальная допустимая задержка (мс)
  expectedLength?: 'short' | 'medium' | 'long';  // Ожидаемая длина ответа
}

/**
 * Рекомендация по выбору модели
 */
export interface ModelRecommendation {
  model: string;                     // Название модели
  temperature: number;               // Температура генерации
  maxTokens: number;                 // Максимум токенов
  qwenMode?: QwenMode;              // Режим для Qwen3
  reasoning: string;                 // Объяснение выбора
  estimatedLatency: number;          // Ожидаемая задержка (мс)
  vramUsage: number;                // Примерное использование VRAM (GB)
}

/**
 * Конфигурация моделей с их характеристиками
 */
interface ModelConfig {
  name: string;
  vramUsage: number;                // VRAM в GB
  tokensPerSecond: number;          // Скорость генерации
  bestFor: TaskType[];              // Лучше всего подходит для
  supportsThinking: boolean;        // Поддержка thinking режима
  complexity: 'simple' | 'medium' | 'complex';
}

// =============================================================================
// КОНФИГУРАЦИЯ МОДЕЛЕЙ
// =============================================================================

/**
 * Характеристики доступных моделей
 * (значения основаны на RTX 4070ti с 12GB VRAM)
 */
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'qwen3:14b': {
    name: 'qwen3:14b',
    vramUsage: 8.5,
    tokensPerSecond: 25,
    bestFor: [
      TaskType.OUTLINE_GENERATION,
      TaskType.SLIDE_CONTENT,
      TaskType.GENERAL,
    ],
    supportsThinking: true,
    complexity: 'medium',
  },
  'qwen3-coder:30b': {
    name: 'qwen3-coder:30b',
    vramUsage: 11.5,
    tokensPerSecond: 15,
    bestFor: [TaskType.CODE_GENERATION],
    supportsThinking: false,
    complexity: 'complex',
  },
  'llama3.1:8b': {
    name: 'llama3.1:8b',
    vramUsage: 5.0,
    tokensPerSecond: 40,
    bestFor: [TaskType.QUICK_TASK],
    supportsThinking: false,
    complexity: 'simple',
  },
  'deepseek-r1:14b': {
    name: 'deepseek-r1:14b',
    vramUsage: 8.0,
    tokensPerSecond: 20,
    bestFor: [TaskType.COMPLEX_REASONING],
    supportsThinking: true,
    complexity: 'complex',
  },
};

// =============================================================================
// MODEL SELECTOR
// =============================================================================

export class ModelSelector {
  /**
   * Выбрать оптимальную модель и параметры для задачи
   */
  static selectModel(characteristics: TaskCharacteristics): ModelRecommendation {
    // Получаем базовую модель по типу задачи
    let selectedModel = this.getBaseModelForTask(characteristics.type);

    // Проверяем доступность модели и VRAM
    if (!this.isModelAvailable(selectedModel)) {
      selectedModel = this.getFallbackModel(characteristics);
    }

    const modelConfig = MODEL_CONFIGS[selectedModel];

    // Определяем параметры генерации
    const temperature = this.selectTemperature(characteristics);
    const maxTokens = this.selectMaxTokens(characteristics);
    const qwenMode = this.selectQwenMode(selectedModel, characteristics);

    // Оцениваем производительность
    const estimatedLatency = this.estimateLatency(selectedModel, maxTokens);

    // Формируем объяснение
    const reasoning = this.explainSelection(selectedModel, characteristics);

    return {
      model: selectedModel,
      temperature,
      maxTokens,
      qwenMode,
      reasoning,
      estimatedLatency,
      vramUsage: modelConfig.vramUsage,
    };
  }

  /**
   * Быстрый выбор модели только по типу задачи
   */
  static quickSelect(taskType: TaskType): string {
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
        return process.env.OLLAMA_DEFAULT_MODEL || 'qwen3:14b';
    }
  }

  /**
   * Получить рекомендуемый режим для Qwen3
   */
  static getQwenMode(taskType: TaskType, requiresReasoning: boolean): QwenMode {
    // Если задача требует рассуждений - thinking mode
    if (requiresReasoning) {
      return QwenMode.THINKING;
    }

    // Для outline generation - thinking mode (нужна структура)
    if (taskType === TaskType.OUTLINE_GENERATION) {
      return QwenMode.THINKING;
    }

    // Для генерации контента слайдов - non-thinking (быстрее)
    if (taskType === TaskType.SLIDE_CONTENT) {
      return QwenMode.NON_THINKING;
    }

    // По умолчанию - non-thinking для скорости
    return QwenMode.NON_THINKING;
  }

  // ---------------------------------------------------------------------------
  // ПРИВАТНЫЕ МЕТОДЫ
  // ---------------------------------------------------------------------------

  /**
   * Базовая модель по типу задачи
   */
  private static getBaseModelForTask(taskType: TaskType): string {
    return this.quickSelect(taskType);
  }

  /**
   * Проверка доступности модели
   */
  private static isModelAvailable(modelName: string): boolean {
    // Проверяем наличие в конфигурации
    const config = MODEL_CONFIGS[modelName];
    if (!config) {
      return false;
    }

    // Проверяем доступность VRAM (оставляем 1GB для системы)
    const availableVRAM = 12; // RTX 4070ti
    const requiredVRAM = config.vramUsage + 1;

    return requiredVRAM <= availableVRAM;
  }

  /**
   * Fallback модель если основная недоступна
   */
  private static getFallbackModel(characteristics: TaskCharacteristics): string {
    // Пытаемся найти более легкую модель
    if (characteristics.requiresCode) {
      // Для кода используем qwen3 если coder недоступен
      return 'qwen3:14b';
    }

    if (characteristics.complexity === 'simple') {
      return 'llama3.1:8b';
    }

    // Универсальный fallback
    return 'qwen3:14b';
  }

  /**
   * Выбор температуры генерации
   */
  private static selectTemperature(characteristics: TaskCharacteristics): number {
    // Для кода и структурированных данных - низкая температура
    if (characteristics.requiresCode || characteristics.requiresStructure) {
      return 0.3;
    }

    // Для простых задач - средняя
    if (characteristics.complexity === 'simple') {
      return 0.5;
    }

    // Для креативных задач - выше
    if (characteristics.type === TaskType.SLIDE_CONTENT) {
      return 0.7;
    }

    // Для reasoning задач - умеренная
    if (characteristics.requiresReasoning) {
      return 0.5;
    }

    // По умолчанию
    return parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7');
  }

  /**
   * Выбор максимального количества токенов
   */
  private static selectMaxTokens(characteristics: TaskCharacteristics): number {
    // На основе ожидаемой длины ответа
    switch (characteristics.expectedLength) {
      case 'short':
        return 512;
      case 'medium':
        return 2048;
      case 'long':
        return 4096;
      default:
        // Адаптивно на основе типа задачи
        if (characteristics.type === TaskType.OUTLINE_GENERATION) {
          return 2048;
        }
        if (characteristics.type === TaskType.SLIDE_CONTENT) {
          return 1024;
        }
        if (characteristics.type === TaskType.CODE_GENERATION) {
          return 3072;
        }
        if (characteristics.type === TaskType.QUICK_TASK) {
          return 512;
        }
        return parseInt(process.env.OLLAMA_MAX_TOKENS || '4096', 10);
    }
  }

  /**
   * Выбор режима для Qwen3
   */
  private static selectQwenMode(modelName: string, characteristics: TaskCharacteristics): QwenMode | undefined {
    // Только для Qwen моделей
    if (!modelName.includes('qwen')) {
      return undefined;
    }

    const config = MODEL_CONFIGS[modelName];
    if (!config.supportsThinking) {
      return undefined;
    }

    return this.getQwenMode(characteristics.type, characteristics.requiresReasoning);
  }

  /**
   * Оценка времени генерации
   */
  private static estimateLatency(modelName: string, maxTokens: number): number {
    const config = MODEL_CONFIGS[modelName];
    if (!config) {
      return 10000; // Дефолтная оценка
    }

    // Базовая задержка на загрузку модели (~2 секунды)
    const loadLatency = 2000;

    // Время генерации = количество токенов / скорость
    const generationLatency = (maxTokens / config.tokensPerSecond) * 1000;

    return loadLatency + generationLatency;
  }

  /**
   * Объяснение выбора модели
   */
  private static explainSelection(modelName: string, characteristics: TaskCharacteristics): string {
    const config = MODEL_CONFIGS[modelName];
    const reasons: string[] = [];

    // Тип задачи
    reasons.push(`Тип задачи: ${this.translateTaskType(characteristics.type)}`);

    // Модель
    reasons.push(`Модель: ${modelName} (${config.vramUsage}GB VRAM, ~${config.tokensPerSecond} tok/s)`);

    // Особенности
    if (characteristics.requiresCode) {
      reasons.push('Требуется генерация кода');
    }
    if (characteristics.requiresReasoning) {
      reasons.push('Требуется подробное рассуждение');
    }
    if (characteristics.requiresStructure) {
      reasons.push('Требуется структурированный вывод');
    }

    // Сложность
    reasons.push(`Сложность: ${this.translateComplexity(characteristics.complexity)}`);

    return reasons.join('; ');
  }

  /**
   * Перевод типа задачи на русский
   */
  private static translateTaskType(taskType: TaskType): string {
    const translations: Record<TaskType, string> = {
      [TaskType.OUTLINE_GENERATION]: 'Генерация структуры презентации',
      [TaskType.SLIDE_CONTENT]: 'Генерация контента слайда',
      [TaskType.CODE_GENERATION]: 'Генерация кода',
      [TaskType.QUICK_TASK]: 'Быстрая задача',
      [TaskType.COMPLEX_REASONING]: 'Сложное рассуждение',
      [TaskType.GENERAL]: 'Общая задача',
    };
    return translations[taskType] || 'Неизвестная задача';
  }

  /**
   * Перевод сложности на русский
   */
  private static translateComplexity(complexity: 'simple' | 'medium' | 'complex'): string {
    const translations = {
      simple: 'Простая',
      medium: 'Средняя',
      complex: 'Сложная',
    };
    return translations[complexity] || 'Неизвестная';
  }

  /**
   * Получить информацию о всех доступных моделях
   */
  static getAvailableModels(): ModelConfig[] {
    return Object.values(MODEL_CONFIGS);
  }

  /**
   * Получить конфигурацию конкретной модели
   */
  static getModelConfig(modelName: string): ModelConfig | null {
    return MODEL_CONFIGS[modelName] || null;
  }
}

// =============================================================================
// УТИЛИТЫ
// =============================================================================

/**
 * Создать характеристики задачи для генерации outline
 */
export function createOutlineTaskCharacteristics(): TaskCharacteristics {
  return {
    type: TaskType.OUTLINE_GENERATION,
    complexity: 'medium',
    requiresReasoning: true,
    requiresCode: false,
    requiresStructure: true,
    expectedLength: 'medium',
  };
}

/**
 * Создать характеристики задачи для генерации слайда
 */
export function createSlideTaskCharacteristics(): TaskCharacteristics {
  return {
    type: TaskType.SLIDE_CONTENT,
    complexity: 'medium',
    requiresReasoning: false,
    requiresCode: false,
    requiresStructure: true,
    expectedLength: 'short',
  };
}

/**
 * Создать характеристики задачи для генерации кода
 */
export function createCodeTaskCharacteristics(): TaskCharacteristics {
  return {
    type: TaskType.CODE_GENERATION,
    complexity: 'complex',
    requiresReasoning: false,
    requiresCode: true,
    requiresStructure: false,
    expectedLength: 'long',
  };
}

/**
 * Создать характеристики для быстрой задачи
 */
export function createQuickTaskCharacteristics(): TaskCharacteristics {
  return {
    type: TaskType.QUICK_TASK,
    complexity: 'simple',
    requiresReasoning: false,
    requiresCode: false,
    requiresStructure: false,
    expectedLength: 'short',
    maxLatency: 5000,
  };
}
