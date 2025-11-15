#!/usr/bin/env tsx
/**
 * GPU Monitor Script - Реалтайм мониторинг GPU
 *
 * Отображает в реальном времени:
 * - Утилизацию GPU
 * - Использование VRAM
 * - Температуру
 * - Мощность и вентиляторы
 * - Алерты при проблемах
 *
 * Запуск: npm run monitor:gpu
 */

import { getPerformanceMonitor } from '../src/lib/monitoring/performance';

// =============================================================================
// УТИЛИТЫ ОТОБРАЖЕНИЯ
// =============================================================================

/**
 * Очистить консоль
 */
function clearScreen() {
  console.clear();
}

/**
 * Создать progress bar
 */
function createProgressBar(value: number, max: number = 100, width: number = 40): string {
  const percentage = Math.min((value / max) * 100, 100);
  const filledWidth = Math.round((percentage / 100) * width);
  const emptyWidth = width - filledWidth;

  const filled = '█'.repeat(filledWidth);
  const empty = '░'.repeat(emptyWidth);

  // Цвет в зависимости от значения
  let color = '\x1b[32m'; // Зеленый
  if (percentage > 70) color = '\x1b[33m'; // Желтый
  if (percentage > 90) color = '\x1b[31m'; // Красный

  return `${color}${filled}${empty}\x1b[0m ${percentage.toFixed(1)}%`;
}

/**
 * Форматировать байты
 */
function formatBytes(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(0)} MB`;
}

/**
 * Отобразить заголовок
 */
function displayHeader() {
  const divider = '='.repeat(100);
  console.log(`\x1b[1m\x1b[36m${divider}\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m${' '.repeat(35)}GPU MONITOR - PRESENTATION AI${' '.repeat(35)}\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m${divider}\x1b[0m`);
  console.log();
}

/**
 * Отобразить метрики GPU
 */
async function displayGPUMetrics(monitor: typeof import('../src/lib/monitoring/performance').default) {
  const metrics = await monitor.getGPUMetrics();

  if (metrics.length === 0) {
    console.log('\x1b[33m⚠️  GPU метрики недоступны (nvidia-smi не найден)\x1b[0m');
    console.log();
    return;
  }

  metrics.forEach((gpu, index) => {
    console.log(`\x1b[1m\x1b[34m🎮 GPU ${gpu.index}: ${gpu.name}\x1b[0m`);
    console.log(`${'─'.repeat(100)}`);
    console.log();

    // Утилизация GPU
    console.log(`  \x1b[1mУтилизация GPU:\x1b[0m`);
    console.log(`  ${createProgressBar(gpu.utilization)}`);
    console.log();

    // VRAM
    console.log(`  \x1b[1mVRAM:\x1b[0m`);
    console.log(`  ${createProgressBar(gpu.memoryUsed, gpu.memoryTotal)}`);
    console.log(`  ${formatBytes(gpu.memoryUsed)} / ${formatBytes(gpu.memoryTotal)}`);
    console.log();

    // Температура
    const tempColor = gpu.temperature > 75 ? '\x1b[31m' : gpu.temperature > 60 ? '\x1b[33m' : '\x1b[32m';
    console.log(`  \x1b[1mТемпература:\x1b[0m ${tempColor}${gpu.temperature}°C\x1b[0m`);
    console.log(`  ${createProgressBar(gpu.temperature, 100)}`);
    console.log();

    // Мощность
    console.log(`  \x1b[1mМощность:\x1b[0m ${gpu.powerDraw.toFixed(1)}W`);
    console.log();

    // Вентилятор
    console.log(`  \x1b[1mВентилятор:\x1b[0m ${gpu.fanSpeed}%`);
    console.log(`  ${createProgressBar(gpu.fanSpeed)}`);
    console.log();

    if (index < metrics.length - 1) {
      console.log();
    }
  });
}

/**
 * Отобразить статистику запросов
 */
async function displayRequestStats(monitor: typeof import('../src/lib/monitoring/performance').default) {
  const stats = await monitor.getStats();

  console.log(`\x1b[1m\x1b[35m📊 СТАТИСТИКА AI ЗАПРОСОВ\x1b[0m`);
  console.log(`${'─'.repeat(100)}`);
  console.log();

  console.log(`  \x1b[1mВсего запросов:\x1b[0m ${stats.requests.total}`);
  console.log(`  \x1b[32mУспешных:\x1b[0m ${stats.requests.successful}`);
  console.log(`  \x1b[31mОшибок:\x1b[0m ${stats.requests.failed}`);
  console.log();

  if (stats.requests.total > 0) {
    console.log(`  \x1b[1mСредняя длительность:\x1b[0m ${stats.requests.averageDuration.toFixed(0)}ms`);
    console.log(`  \x1b[1mСредняя скорость:\x1b[0m ${stats.requests.averageTokensPerSecond.toFixed(2)} tokens/sec`);
    console.log();
  }
}

/**
 * Отобразить системные метрики
 */
async function displaySystemMetrics(monitor: typeof import('../src/lib/monitoring/performance').default) {
  const stats = await monitor.getStats();

  console.log(`\x1b[1m\x1b[33m💻 СИСТЕМА\x1b[0m`);
  console.log(`${'─'.repeat(100)}`);
  console.log();

  console.log(`  \x1b[1mCPU:\x1b[0m`);
  console.log(`  ${createProgressBar(stats.system.cpuUsage)}`);
  console.log();

  const ramPercentage = (stats.system.ramUsed / stats.system.ramTotal) * 100;
  console.log(`  \x1b[1mRAM:\x1b[0m`);
  console.log(`  ${createProgressBar(stats.system.ramUsed, stats.system.ramTotal)}`);
  console.log(`  ${stats.system.ramUsed.toFixed(0)}MB / ${stats.system.ramTotal.toFixed(0)}MB`);
  console.log();
}

/**
 * Отобразить алерты
 */
function displayAlerts(monitor: typeof import('../src/lib/monitoring/performance').default) {
  const alerts = monitor.getAlerts(5);

  if (alerts.length === 0) {
    return;
  }

  console.log(`\x1b[1m\x1b[31m🚨 АЛЕРТЫ\x1b[0m`);
  console.log(`${'─'.repeat(100)}`);
  console.log();

  alerts.reverse().forEach(alert => {
    const icon = alert.severity === 'critical' ? '🔴' : '⚠️';
    const color = alert.severity === 'critical' ? '\x1b[31m' : '\x1b[33m';
    const timestamp = new Date(alert.timestamp).toLocaleTimeString();

    console.log(`  ${icon} ${color}[${timestamp}] ${alert.message}\x1b[0m`);
  });

  console.log();
}

/**
 * Отобразить footer
 */
function displayFooter(updateInterval: number) {
  const divider = '─'.repeat(100);
  console.log(divider);
  console.log();
  console.log(`\x1b[90mОбновление каждые ${updateInterval / 1000}s | Нажмите Ctrl+C для выхода\x1b[0m`);
}

// =============================================================================
// MAIN
// =============================================================================

async function updateDisplay(monitor: typeof import('../src/lib/monitoring/performance').default) {
  clearScreen();
  displayHeader();

  await displayGPUMetrics(monitor);
  console.log();

  await displayRequestStats(monitor);
  console.log();

  await displaySystemMetrics(monitor);
  console.log();

  displayAlerts(monitor);

  const updateInterval = parseInt(process.env.GPU_MONITORING_INTERVAL || '2000', 10);
  displayFooter(updateInterval);
}

async function main() {
  const monitor = getPerformanceMonitor();

  // Проверяем доступность nvidia-smi
  const hasNvidiaSMI = await monitor.checkNvidiaSMI();

  if (!hasNvidiaSMI) {
    console.error('\x1b[31m❌ nvidia-smi недоступен. Убедитесь что установлены NVIDIA драйверы.\x1b[0m');
    process.exit(1);
  }

  const updateInterval = parseInt(process.env.GPU_MONITORING_INTERVAL || '2000', 10);

  // Первое отображение
  await updateDisplay(monitor);

  // Периодическое обновление
  setInterval(async () => {
    await updateDisplay(monitor);
  }, updateInterval);

  // Обработка Ctrl+C
  process.on('SIGINT', () => {
    clearScreen();
    console.log('\n\x1b[36m👋 Мониторинг остановлен\x1b[0m\n');
    process.exit(0);
  });
}

// Запуск
main().catch(error => {
  console.error(`\x1b[31m❌ Критическая ошибка: ${error}\x1b[0m`);
  process.exit(1);
});
