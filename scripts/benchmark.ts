#!/usr/bin/env tsx
/**
 * Benchmark Script - Тестирование производительности моделей
 *
 * Измеряет:
 * - Скорость генерации (tokens/sec)
 * - Latency для разных типов задач
 * - Использование VRAM
 * - Сравнение моделей
 *
 * Запуск: npm run benchmark
 */

import { getOllamaClient, TaskType } from '../src/lib/ai/ollama-client';
import { getPerformanceMonitor } from '../src/lib/monitoring/performance';
import { ModelSelector } from '../src/lib/ai/model-selector';

// =============================================================================
// ТИПЫ
// =============================================================================

interface BenchmarkResult {
  model: string;
  taskType: string;
  duration: number;                  // ms
  tokensGenerated: number;
  tokensPerSecond: number;
  vramUsed: number;                  // MB
  success: boolean;
}

// =============================================================================
// ЦВЕТА
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message: string) {
  console.log();
  log(`${'='.repeat(100)}`, 'bright');
  log(message, 'bright');
  log(`${'='.repeat(100)}`, 'bright');
  console.log();
}

// =============================================================================
// ТЕСТОВЫЕ КЕЙСЫ
// =============================================================================

const benchmarkTasks = [
  {
    name: 'Быстрая задача (перевод)',
    taskType: TaskType.QUICK_TASK,
    prompt: 'Переведи на английский: "Привет, как дела?"',
    expectedTokens: 50,
  },
  {
    name: 'Генерация контента слайда',
    taskType: TaskType.SLIDE_CONTENT,
    prompt: 'Создай 3 ключевых пункта для слайда на тему "Преимущества искусственного интеллекта"',
    expectedTokens: 150,
  },
  {
    name: 'Генерация структуры презентации',
    taskType: TaskType.OUTLINE_GENERATION,
    prompt: 'Создай структуру презентации на тему "Введение в машинное обучение" из 7 слайдов',
    expectedTokens: 300,
  },
  {
    name: 'Генерация кода',
    taskType: TaskType.CODE_GENERATION,
    prompt: 'Напиши функцию на TypeScript для сортировки массива чисел',
    expectedTokens: 200,
  },
  {
    name: 'Сложное рассуждение',
    taskType: TaskType.COMPLEX_REASONING,
    prompt: 'Объясни почему глубокое обучение эффективно для обработки изображений. Рассуждай пошагово.',
    expectedTokens: 400,
  },
];

// =============================================================================
// БЕНЧМАРКИ
// =============================================================================

/**
 * Запустить benchmark для одной задачи
 */
async function runSingleBenchmark(
  client: typeof import('../src/lib/ai/ollama-client').OllamaClient.prototype,
  monitor: typeof import('../src/lib/monitoring/performance').default,
  task: typeof benchmarkTasks[0]
): Promise<BenchmarkResult | null> {
  log(`  Тест: ${task.name}`, 'cyan');

  // Выбираем модель
  const recommendation = ModelSelector.selectModel({
    type: task.taskType,
    complexity: 'medium',
    requiresReasoning: task.taskType === TaskType.OUTLINE_GENERATION,
    requiresCode: task.taskType === TaskType.CODE_GENERATION,
    requiresStructure: true,
  });

  log(`  Модель: ${recommendation.model}`, 'gray');
  log(`  Ожидаемая задержка: ~${recommendation.estimatedLatency}ms`, 'gray');

  const requestId = monitor.startRequest(recommendation.model, task.taskType);

  try {
    // Получаем VRAM до запроса
    const vramBefore = await monitor.getVRAMUsage();

    // Запускаем генерацию
    const startTime = Date.now();
    const result = await client.generate(task.prompt, {
      model: recommendation.model,
      taskType: task.taskType,
      temperature: recommendation.temperature,
      maxTokens: task.expectedTokens,
    });
    const duration = Date.now() - startTime;

    // Получаем VRAM после запроса
    const vramAfter = await monitor.getVRAMUsage();

    // Примерное количество токенов (по символам, 1 токен ≈ 4 символа)
    const tokensGenerated = Math.round(result.length / 4);
    const tokensPerSecond = (tokensGenerated / duration) * 1000;

    await monitor.endRequest(requestId, true, tokensGenerated);

    const benchResult: BenchmarkResult = {
      model: recommendation.model,
      taskType: task.name,
      duration,
      tokensGenerated,
      tokensPerSecond,
      vramUsed: vramAfter?.used || 0,
      success: true,
    };

    log(`  ✅ Успех`, 'green');
    log(`  Длительность: ${duration}ms`, 'gray');
    log(`  Токены: ${tokensGenerated} (~${tokensPerSecond.toFixed(2)} tok/s)`, 'gray');
    log(`  VRAM: ${vramAfter?.used.toFixed(0)}MB`, 'gray');
    console.log();

    return benchResult;
  } catch (error) {
    await monitor.endRequest(requestId, false, undefined, String(error));

    log(`  ❌ Ошибка: ${error}`, 'red');
    console.log();

    return null;
  }
}

/**
 * Отобразить таблицу результатов
 */
function displayResultsTable(results: BenchmarkResult[]) {
  logHeader('РЕЗУЛЬТАТЫ БЕНЧМАРКОВ');

  // Заголовок таблицы
  log(`${'─'.repeat(140)}`, 'gray');
  log(
    `${'Задача'.padEnd(40)} | ${'Модель'.padEnd(20)} | ${'Длительность'.padEnd(15)} | ${'Токены'.padEnd(15)} | ${'Tok/s'.padEnd(12)} | ${'VRAM'.padEnd(12)}`,
    'bright'
  );
  log(`${'─'.repeat(140)}`, 'gray');

  // Строки таблицы
  results.forEach(result => {
    const durationColor = result.duration < 5000 ? 'green' : result.duration < 10000 ? 'yellow' : 'red';
    const speedColor = result.tokensPerSecond > 20 ? 'green' : result.tokensPerSecond > 10 ? 'yellow' : 'red';

    const row = `${result.taskType.padEnd(40)} | ${result.model.padEnd(20)} | ${colors[durationColor]}${result.duration.toFixed(0).padEnd(15)}${colors.reset} | ${result.tokensGenerated.toString().padEnd(15)} | ${colors[speedColor]}${result.tokensPerSecond.toFixed(2).padEnd(12)}${colors.reset} | ${result.vramUsed.toFixed(0).padEnd(12)}`;

    console.log(row);
  });

  log(`${'─'.repeat(140)}`, 'gray');
  console.log();
}

/**
 * Отобразить статистику
 */
function displayStatistics(results: BenchmarkResult[]) {
  logHeader('СТАТИСТИКА');

  const successfulResults = results.filter(r => r.success);

  if (successfulResults.length === 0) {
    log('Нет успешных результатов', 'yellow');
    return;
  }

  // Средние значения
  const avgDuration = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;
  const avgTokensPerSecond = successfulResults.reduce((sum, r) => sum + r.tokensPerSecond, 0) / successfulResults.length;
  const avgVRAM = successfulResults.reduce((sum, r) => sum + r.vramUsed, 0) / successfulResults.length;

  // Мин/макс
  const minDuration = Math.min(...successfulResults.map(r => r.duration));
  const maxDuration = Math.max(...successfulResults.map(r => r.duration));
  const minTokensPerSecond = Math.min(...successfulResults.map(r => r.tokensPerSecond));
  const maxTokensPerSecond = Math.max(...successfulResults.map(r => r.tokensPerSecond));

  log(`Всего тестов: ${results.length}`, 'cyan');
  log(`Успешных: ${successfulResults.length}`, 'green');
  log(`Провалено: ${results.length - successfulResults.length}`, 'red');
  console.log();

  log(`Средняя длительность: ${avgDuration.toFixed(0)}ms`, 'cyan');
  log(`  Мин: ${minDuration.toFixed(0)}ms | Макс: ${maxDuration.toFixed(0)}ms`, 'gray');
  console.log();

  log(`Средняя скорость: ${avgTokensPerSecond.toFixed(2)} tokens/sec`, 'cyan');
  log(`  Мин: ${minTokensPerSecond.toFixed(2)} | Макс: ${maxTokensPerSecond.toFixed(2)}`, 'gray');
  console.log();

  log(`Среднее VRAM: ${avgVRAM.toFixed(0)}MB`, 'cyan');
  console.log();

  // Группировка по моделям
  const byModel = successfulResults.reduce((acc, r) => {
    if (!acc[r.model]) {
      acc[r.model] = [];
    }
    acc[r.model].push(r);
    return acc;
  }, {} as Record<string, BenchmarkResult[]>);

  log('По моделям:', 'bright');
  Object.entries(byModel).forEach(([model, modelResults]) => {
    const modelAvgSpeed = modelResults.reduce((sum, r) => sum + r.tokensPerSecond, 0) / modelResults.length;
    log(`  ${model}: ${modelAvgSpeed.toFixed(2)} tokens/sec (${modelResults.length} тестов)`, 'cyan');
  });

  console.log();
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  logHeader('BENCHMARK - ТЕСТИРОВАНИЕ ПРОИЗВОДИТЕЛЬНОСТИ МОДЕЛЕЙ');
  log('Presentation AI - Local Models Benchmark', 'cyan');
  console.log();

  const client = getOllamaClient();
  const monitor = getPerformanceMonitor();

  // Проверяем подключение
  log('Проверка подключения к Ollama...', 'cyan');
  const isHealthy = await client.checkHealth();

  if (!isHealthy) {
    log('❌ Ollama сервер недоступен', 'red');
    process.exit(1);
  }

  log('✅ Ollama доступен', 'green');
  console.log();

  // Получаем список моделей
  const models = await client.listModels();
  log(`Доступные модели: ${models.join(', ')}`, 'gray');
  console.log();

  // Запускаем бенчмарки
  logHeader('ЗАПУСК ТЕСТОВ');

  const results: BenchmarkResult[] = [];

  for (const task of benchmarkTasks) {
    const result = await runSingleBenchmark(client, monitor, task);
    if (result) {
      results.push(result);
    }

    // Пауза между тестами для остывания GPU
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Отображаем результаты
  displayResultsTable(results);
  displayStatistics(results);

  // Рекомендации
  logHeader('РЕКОМЕНДАЦИИ');

  const avgSpeed = results.reduce((sum, r) => sum + r.tokensPerSecond, 0) / results.length;

  if (avgSpeed > 25) {
    log('✅ Отличная производительность! Система работает оптимально.', 'green');
  } else if (avgSpeed > 15) {
    log('⚠️  Хорошая производительность. Возможно стоит проверить VRAM.', 'yellow');
  } else {
    log('❌ Низкая производительность. Рекомендации:', 'red');
    log('  • Проверьте загрузку GPU', 'yellow');
    log('  • Убедитесь что используется GPU, а не CPU', 'yellow');
    log('  • Закройте другие программы использующие GPU', 'yellow');
  }

  console.log();

  log('Benchmark завершен!', 'green');
  process.exit(0);
}

// Запуск
main().catch(error => {
  log(`❌ Критическая ошибка: ${error}`, 'red');
  process.exit(1);
});
