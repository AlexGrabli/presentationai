#!/usr/bin/env tsx
/**
 * Test Models Script - Тестирование всех локальных моделей
 *
 * Проверяет доступность и работоспособность:
 * - Ollama моделей (qwen3:14b, qwen3-coder:30b, llama3.1:8b, deepseek-r1:14b)
 * - Stable Diffusion WebUI
 * - Redis кеша
 *
 * Запуск: npm run test:models
 */

import { getOllamaClient, TaskType } from '../src/lib/ai/ollama-client';
import { getSDClient } from '../src/lib/ai/sd-client';
import { getRedisCache } from '../src/lib/cache/redis-cache';
import { getPerformanceMonitor } from '../src/lib/monitoring/performance';

// =============================================================================
// ЦВЕТА ДЛЯ ВЫВОДА
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'cyan');
}

function logHeader(message: string) {
  console.log();
  log(`${'='.repeat(80)}`, 'bright');
  log(message, 'bright');
  log(`${'='.repeat(80)}`, 'bright');
  console.log();
}

// =============================================================================
// ТЕСТЫ
// =============================================================================

/**
 * Тест Ollama подключения
 */
async function testOllamaConnection() {
  logHeader('ТЕСТ: Подключение к Ollama');

  const client = getOllamaClient();

  try {
    const isHealthy = await client.checkHealth();

    if (isHealthy) {
      logSuccess('Ollama сервер доступен');
      return true;
    } else {
      logError('Ollama сервер недоступен');
      return false;
    }
  } catch (error) {
    logError(`Ошибка подключения к Ollama: ${error}`);
    return false;
  }
}

/**
 * Тест списка моделей
 */
async function testOllamaModels() {
  logHeader('ТЕСТ: Список доступных моделей Ollama');

  const client = getOllamaClient();

  try {
    const models = await client.listModels();

    if (models.length === 0) {
      logWarning('Нет доступных моделей');
      return false;
    }

    logSuccess(`Найдено моделей: ${models.length}`);
    models.forEach(model => {
      log(`  • ${model}`, 'cyan');
    });

    // Проверяем наличие ожидаемых моделей
    const expectedModels = ['qwen3:14b', 'qwen3-coder:30b', 'llama3.1:8b', 'deepseek-r1:14b'];

    expectedModels.forEach(expected => {
      if (models.includes(expected)) {
        logSuccess(`Модель ${expected} найдена`);
      } else {
        logWarning(`Модель ${expected} не найдена`);
      }
    });

    return true;
  } catch (error) {
    logError(`Ошибка получения списка моделей: ${error}`);
    return false;
  }
}

/**
 * Тест генерации текста
 */
async function testTextGeneration() {
  logHeader('ТЕСТ: Генерация текста');

  const client = getOllamaClient();
  const monitor = getPerformanceMonitor();

  const testCases = [
    {
      name: 'Qwen3 14B (Simple)',
      taskType: TaskType.QUICK_TASK,
      prompt: 'Напиши краткое приветствие на русском языке (одно предложение)',
    },
    {
      name: 'Qwen3 14B (Outline)',
      taskType: TaskType.OUTLINE_GENERATION,
      prompt: 'Создай структуру презентации на тему "Искусственный интеллект" из 5 слайдов. Верни только названия слайдов списком.',
    },
  ];

  let allPassed = true;

  for (const testCase of testCases) {
    logInfo(`Тест: ${testCase.name}`);

    const requestId = monitor.startRequest('test-model', testCase.taskType);

    try {
      const startTime = Date.now();
      const result = await client.generate(testCase.prompt, {
        taskType: testCase.taskType,
        maxTokens: 256,
      });
      const duration = Date.now() - startTime;

      await monitor.endRequest(requestId, true, result.length);

      logSuccess(`Генерация успешна (${duration}ms)`);
      log(`Ответ: ${result.substring(0, 100)}...`, 'blue');

      // Проверяем VRAM
      const vram = await monitor.getVRAMUsage();
      if (vram) {
        logInfo(`VRAM: ${vram.used.toFixed(0)}MB / ${vram.total.toFixed(0)}MB (${vram.percentage.toFixed(1)}%)`);
      }
    } catch (error) {
      await monitor.endRequest(requestId, false, undefined, String(error));
      logError(`Ошибка генерации: ${error}`);
      allPassed = false;
    }

    console.log();
  }

  return allPassed;
}

/**
 * Тест генерации JSON
 */
async function testJSONGeneration() {
  logHeader('ТЕСТ: Генерация JSON');

  const client = getOllamaClient();

  try {
    logInfo('Генерация JSON структуры...');

    const prompt = `Создай простой JSON объект с информацией о презентации:
{
  "title": "название",
  "slides": 5,
  "topic": "тема"
}`;

    const result = await client.generateJSON(prompt, {
      taskType: TaskType.QUICK_TASK,
    });

    logSuccess('JSON сгенерирован успешно');
    log(JSON.stringify(result, null, 2), 'blue');

    return true;
  } catch (error) {
    logError(`Ошибка генерации JSON: ${error}`);
    return false;
  }
}

/**
 * Тест Stable Diffusion
 */
async function testStableDiffusion() {
  logHeader('ТЕСТ: Stable Diffusion WebUI');

  const sdClient = getSDClient();

  try {
    const isHealthy = await sdClient.checkHealth();

    if (!isHealthy) {
      logWarning('Stable Diffusion WebUI недоступен (это нормально если не запущен)');
      return true; // Не критично
    }

    logSuccess('Stable Diffusion WebUI доступен');

    // Получаем текущую модель
    const currentModel = await sdClient.getCurrentModel();
    if (currentModel) {
      logInfo(`Текущая модель SD: ${currentModel}`);
    }

    // Получаем список моделей
    const models = await sdClient.listModels();
    if (models.length > 0) {
      logInfo(`Доступные модели SD: ${models.length}`);
      models.forEach(model => {
        log(`  • ${model}`, 'cyan');
      });
    }

    return true;
  } catch (error) {
    logWarning(`Stable Diffusion недоступен: ${error}`);
    return true; // Не критично
  }
}

/**
 * Тест Redis кеша
 */
async function testRedisCache() {
  logHeader('ТЕСТ: Redis Cache');

  const cache = getRedisCache();

  try {
    // Тест записи
    logInfo('Тест записи в кеш...');
    const testKey = 'test:key';
    const testValue = { test: true, timestamp: Date.now() };

    const setResult = await cache.set(testKey, testValue);

    if (!setResult) {
      logWarning('Redis недоступен (это нормально если не запущен)');
      return true; // Не критично
    }

    logSuccess('Запись в кеш успешна');

    // Тест чтения
    logInfo('Тест чтения из кеша...');
    const getValue = await cache.get(testKey);

    if (getValue) {
      logSuccess('Чтение из кеша успешно');
      log(JSON.stringify(getValue, null, 2), 'blue');
    } else {
      logError('Не удалось прочитать из кеша');
      return false;
    }

    // Тест удаления
    logInfo('Тест удаления из кеша...');
    await cache.delete(testKey);

    const deletedValue = await cache.get(testKey);
    if (!deletedValue) {
      logSuccess('Удаление из кеша успешно');
    } else {
      logError('Не удалось удалить из кеша');
      return false;
    }

    // Статистика
    const stats = await cache.getStats();
    logInfo('Статистика кеша:');
    log(`  Hits: ${stats.hits}`, 'cyan');
    log(`  Misses: ${stats.misses}`, 'cyan');
    log(`  Hit Rate: ${stats.hitRate}%`, 'cyan');
    log(`  Total Keys: ${stats.totalKeys}`, 'cyan');

    return true;
  } catch (error) {
    logWarning(`Redis недоступен: ${error}`);
    return true; // Не критично
  }
}

/**
 * Тест мониторинга производительности
 */
async function testPerformanceMonitoring() {
  logHeader('ТЕСТ: Мониторинг производительности');

  const monitor = getPerformanceMonitor();

  try {
    // Проверяем nvidia-smi
    const hasNvidiaSMI = await monitor.checkNvidiaSMI();

    if (!hasNvidiaSMI) {
      logWarning('nvidia-smi недоступен (нормально если нет NVIDIA GPU)');
      return true; // Не критично
    }

    logSuccess('nvidia-smi доступен');

    // Получаем метрики GPU
    const gpuMetrics = await monitor.getGPUMetrics();

    if (gpuMetrics.length > 0) {
      logSuccess(`Найдено GPU: ${gpuMetrics.length}`);

      gpuMetrics.forEach(gpu => {
        logInfo(`GPU ${gpu.index}: ${gpu.name}`);
        log(`  Утилизация: ${gpu.utilization.toFixed(1)}%`, 'cyan');
        log(`  VRAM: ${gpu.memoryUsed.toFixed(0)}MB / ${gpu.memoryTotal.toFixed(0)}MB (${gpu.memoryUtilization.toFixed(1)}%)`, 'cyan');
        log(`  Температура: ${gpu.temperature}°C`, 'cyan');
        log(`  Мощность: ${gpu.powerDraw.toFixed(1)}W`, 'cyan');
        log(`  Вентилятор: ${gpu.fanSpeed}%`, 'cyan');
      });
    }

    // Статистика
    const stats = await monitor.getStats();
    logInfo('Статистика запросов:');
    log(`  Всего: ${stats.requests.total}`, 'cyan');
    log(`  Успешных: ${stats.requests.successful}`, 'cyan');
    log(`  Ошибок: ${stats.requests.failed}`, 'cyan');

    return true;
  } catch (error) {
    logWarning(`Мониторинг недоступен: ${error}`);
    return true; // Не критично
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  logHeader('ТЕСТИРОВАНИЕ ЛОКАЛЬНЫХ AI МОДЕЛЕЙ');
  logInfo('Presentation AI - Local AI Integration Tests');
  console.log();

  const results = {
    ollamaConnection: false,
    ollamaModels: false,
    textGeneration: false,
    jsonGeneration: false,
    stableDiffusion: false,
    redisCache: false,
    performanceMonitoring: false,
  };

  // Запускаем тесты
  results.ollamaConnection = await testOllamaConnection();

  if (results.ollamaConnection) {
    results.ollamaModels = await testOllamaModels();
    results.textGeneration = await testTextGeneration();
    results.jsonGeneration = await testJSONGeneration();
  } else {
    logError('Пропускаем остальные тесты Ollama (сервер недоступен)');
  }

  results.stableDiffusion = await testStableDiffusion();
  results.redisCache = await testRedisCache();
  results.performanceMonitoring = await testPerformanceMonitoring();

  // Итоги
  logHeader('ИТОГИ ТЕСТИРОВАНИЯ');

  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(r => r).length;
  const failedTests = totalTests - passedTests;

  Object.entries(results).forEach(([test, passed]) => {
    const icon = passed ? '✅' : '❌';
    const color = passed ? 'green' : 'red';
    log(`${icon} ${test}: ${passed ? 'PASS' : 'FAIL'}`, color);
  });

  console.log();
  log(`Пройдено: ${passedTests}/${totalTests}`, passedTests === totalTests ? 'green' : 'yellow');

  if (failedTests > 0) {
    logWarning(`Провалено: ${failedTests} тестов`);
    process.exit(1);
  } else {
    logSuccess('Все тесты пройдены успешно!');
    process.exit(0);
  }
}

// Запуск
main().catch(error => {
  logError(`Критическая ошибка: ${error}`);
  process.exit(1);
});
