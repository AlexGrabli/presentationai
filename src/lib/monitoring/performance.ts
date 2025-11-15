/**
 * Performance Monitor - Мониторинг производительности GPU и системы
 *
 * Отслеживает:
 * - GPU утилизацию через nvidia-smi
 * - VRAM использование
 * - Температуру GPU
 * - Latency AI запросов
 * - Throughput (токены/сек)
 * - CPU и RAM
 *
 * Особенности:
 * - Реалтайм мониторинг через nvidia-smi
 * - История метрик
 * - Алерты при перегреве/переполнении VRAM
 * - Экспорт метрик для dashboard
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// =============================================================================
// ТИПЫ
// =============================================================================

/**
 * Метрики GPU
 */
export interface GPUMetrics {
  index: number;                     // Индекс GPU
  name: string;                      // Название (RTX 4070ti)
  utilization: number;               // Утилизация GPU (0-100%)
  memoryUsed: number;                // Использовано VRAM (MB)
  memoryTotal: number;               // Всего VRAM (MB)
  memoryUtilization: number;         // Утилизация VRAM (0-100%)
  temperature: number;               // Температура (°C)
  powerDraw: number;                 // Потребление энергии (W)
  fanSpeed: number;                  // Скорость вентилятора (0-100%)
  timestamp: number;                 // Время измерения
}

/**
 * Метрики AI запроса
 */
export interface AIRequestMetrics {
  id: string;
  model: string;
  taskType: string;
  startTime: number;
  endTime?: number;
  duration?: number;                 // Длительность (ms)
  tokensGenerated?: number;
  tokensPerSecond?: number;
  vramUsed?: number;                 // VRAM во время запроса
  success: boolean;
  error?: string;
}

/**
 * Сводная статистика
 */
export interface PerformanceStats {
  gpu: GPUMetrics[];
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageDuration: number;
    averageTokensPerSecond: number;
  };
  system: {
    cpuUsage: number;
    ramUsed: number;
    ramTotal: number;
  };
}

/**
 * Алерт
 */
export interface PerformanceAlert {
  type: 'gpu_temp' | 'vram_full' | 'slow_request';
  severity: 'warning' | 'critical';
  message: string;
  timestamp: number;
  data?: any;
}

// =============================================================================
// PERFORMANCE MONITOR
// =============================================================================

export class PerformanceMonitor {
  private isEnabled: boolean;
  private monitoringInterval: NodeJS.Timeout | null = null;

  // История метрик (последние 100 измерений)
  private gpuHistory: GPUMetrics[] = [];
  private requestHistory: AIRequestMetrics[] = [];
  private alerts: PerformanceAlert[] = [];

  // Пороги для алертов
  private thresholds = {
    gpuTempWarning: 75,                // °C
    gpuTempCritical: 85,               // °C
    vramWarning: 90,                   // %
    vramCritical: 95,                  // %
    slowRequestWarning: 30000,         // ms
  };

  constructor() {
    this.isEnabled = process.env.ENABLE_GPU_MONITORING === 'true';

    if (this.isEnabled) {
      this.logInfo('Performance Monitor инициализирован');
      this.startMonitoring();
    }
  }

  // ---------------------------------------------------------------------------
  // МОНИТОРИНГ GPU
  // ---------------------------------------------------------------------------

  /**
   * Получить текущие метрики GPU через nvidia-smi
   */
  async getGPUMetrics(): Promise<GPUMetrics[]> {
    if (!this.isEnabled) {
      return [];
    }

    try {
      // Запрашиваем данные через nvidia-smi
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,fan.speed --format=csv,noheader,nounits'
      );

      const lines = stdout.trim().split('\n');
      const metrics: GPUMetrics[] = [];

      for (const line of lines) {
        const values = line.split(',').map(v => v.trim());

        const metric: GPUMetrics = {
          index: parseInt(values[0], 10),
          name: values[1],
          utilization: parseFloat(values[2]),
          memoryUsed: parseFloat(values[3]),
          memoryTotal: parseFloat(values[4]),
          memoryUtilization: (parseFloat(values[3]) / parseFloat(values[4])) * 100,
          temperature: parseFloat(values[5]),
          powerDraw: parseFloat(values[6]),
          fanSpeed: parseFloat(values[7] || '0'),
          timestamp: Date.now(),
        };

        metrics.push(metric);

        // Проверяем пороги и создаем алерты
        this.checkThresholds(metric);
      }

      // Сохраняем в историю (последние 100)
      this.gpuHistory.push(...metrics);
      if (this.gpuHistory.length > 100) {
        this.gpuHistory = this.gpuHistory.slice(-100);
      }

      return metrics;
    } catch (error) {
      this.logError('Ошибка получения GPU метрик', error);
      return [];
    }
  }

  /**
   * Получить текущее использование VRAM
   */
  async getVRAMUsage(): Promise<{ used: number; total: number; percentage: number } | null> {
    const metrics = await this.getGPUMetrics();

    if (metrics.length === 0) {
      return null;
    }

    const gpu = metrics[0]; // Используем первую GPU

    return {
      used: gpu.memoryUsed,
      total: gpu.memoryTotal,
      percentage: gpu.memoryUtilization,
    };
  }

  /**
   * Проверить доступность nvidia-smi
   */
  async checkNvidiaSMI(): Promise<boolean> {
    try {
      await execAsync('nvidia-smi --version');
      return true;
    } catch (error) {
      this.logWarn('nvidia-smi недоступен');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // МОНИТОРИНГ AI ЗАПРОСОВ
  // ---------------------------------------------------------------------------

  /**
   * Начать отслеживание запроса
   */
  startRequest(model: string, taskType: string): string {
    const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const metric: AIRequestMetrics = {
      id,
      model,
      taskType,
      startTime: Date.now(),
      success: false,
    };

    this.requestHistory.push(metric);

    return id;
  }

  /**
   * Завершить отслеживание запроса
   */
  async endRequest(
    id: string,
    success: boolean,
    tokensGenerated?: number,
    error?: string
  ): Promise<void> {
    const metric = this.requestHistory.find(r => r.id === id);

    if (!metric) {
      this.logWarn('Метрика запроса не найдена', { id });
      return;
    }

    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = success;
    metric.tokensGenerated = tokensGenerated;
    metric.error = error;

    // Рассчитываем токены/сек
    if (tokensGenerated && metric.duration) {
      metric.tokensPerSecond = (tokensGenerated / metric.duration) * 1000;
    }

    // Получаем VRAM на момент завершения
    const vram = await this.getVRAMUsage();
    if (vram) {
      metric.vramUsed = vram.used;
    }

    // Проверяем медленные запросы
    if (metric.duration && metric.duration > this.thresholds.slowRequestWarning) {
      this.createAlert({
        type: 'slow_request',
        severity: 'warning',
        message: `Медленный запрос: ${metric.duration}ms (модель: ${metric.model})`,
        timestamp: Date.now(),
        data: { id, duration: metric.duration, model: metric.model },
      });
    }

    // Ограничиваем историю
    if (this.requestHistory.length > 100) {
      this.requestHistory = this.requestHistory.slice(-100);
    }

    this.logDebug('Запрос завершен', {
      id,
      duration: metric.duration,
      tokensPerSecond: metric.tokensPerSecond?.toFixed(2),
      success,
    });
  }

  // ---------------------------------------------------------------------------
  // СТАТИСТИКА
  // ---------------------------------------------------------------------------

  /**
   * Получить сводную статистику
   */
  async getStats(): Promise<PerformanceStats> {
    const gpuMetrics = await this.getGPUMetrics();

    // Статистика запросов
    const completedRequests = this.requestHistory.filter(r => r.duration !== undefined);
    const successfulRequests = completedRequests.filter(r => r.success);

    const averageDuration =
      completedRequests.length > 0
        ? completedRequests.reduce((sum, r) => sum + (r.duration || 0), 0) / completedRequests.length
        : 0;

    const requestsWithTokens = completedRequests.filter(r => r.tokensPerSecond !== undefined);
    const averageTokensPerSecond =
      requestsWithTokens.length > 0
        ? requestsWithTokens.reduce((sum, r) => sum + (r.tokensPerSecond || 0), 0) / requestsWithTokens.length
        : 0;

    // Системные метрики
    const systemMetrics = await this.getSystemMetrics();

    return {
      gpu: gpuMetrics,
      requests: {
        total: this.requestHistory.length,
        successful: successfulRequests.length,
        failed: completedRequests.length - successfulRequests.length,
        averageDuration: parseFloat(averageDuration.toFixed(2)),
        averageTokensPerSecond: parseFloat(averageTokensPerSecond.toFixed(2)),
      },
      system: systemMetrics,
    };
  }

  /**
   * Получить последние алерты
   */
  getAlerts(limit: number = 10): PerformanceAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Очистить историю
   */
  clearHistory(): void {
    this.gpuHistory = [];
    this.requestHistory = [];
    this.alerts = [];
    this.logInfo('История очищена');
  }

  // ---------------------------------------------------------------------------
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ---------------------------------------------------------------------------

  /**
   * Запустить периодический мониторинг
   */
  private startMonitoring(): void {
    const interval = parseInt(process.env.GPU_MONITORING_INTERVAL || '5000', 10);

    this.monitoringInterval = setInterval(async () => {
      await this.getGPUMetrics();
    }, interval);

    this.logInfo('Мониторинг запущен', { interval: `${interval}ms` });
  }

  /**
   * Остановить мониторинг
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logInfo('Мониторинг остановлен');
    }
  }

  /**
   * Проверить пороги и создать алерты
   */
  private checkThresholds(metric: GPUMetrics): void {
    // Температура
    if (metric.temperature >= this.thresholds.gpuTempCritical) {
      this.createAlert({
        type: 'gpu_temp',
        severity: 'critical',
        message: `Критическая температура GPU: ${metric.temperature}°C`,
        timestamp: Date.now(),
        data: { temperature: metric.temperature, name: metric.name },
      });
    } else if (metric.temperature >= this.thresholds.gpuTempWarning) {
      this.createAlert({
        type: 'gpu_temp',
        severity: 'warning',
        message: `Высокая температура GPU: ${metric.temperature}°C`,
        timestamp: Date.now(),
        data: { temperature: metric.temperature, name: metric.name },
      });
    }

    // VRAM
    if (metric.memoryUtilization >= this.thresholds.vramCritical) {
      this.createAlert({
        type: 'vram_full',
        severity: 'critical',
        message: `VRAM почти заполнена: ${metric.memoryUtilization.toFixed(1)}%`,
        timestamp: Date.now(),
        data: { utilization: metric.memoryUtilization, used: metric.memoryUsed, total: metric.memoryTotal },
      });
    } else if (metric.memoryUtilization >= this.thresholds.vramWarning) {
      this.createAlert({
        type: 'vram_full',
        severity: 'warning',
        message: `VRAM заполнена: ${metric.memoryUtilization.toFixed(1)}%`,
        timestamp: Date.now(),
        data: { utilization: metric.memoryUtilization, used: metric.memoryUsed, total: metric.memoryTotal },
      });
    }
  }

  /**
   * Создать алерт (с дедупликацией)
   */
  private createAlert(alert: PerformanceAlert): void {
    // Проверяем последний алерт того же типа (не спамим)
    const lastAlert = this.alerts[this.alerts.length - 1];
    if (
      lastAlert &&
      lastAlert.type === alert.type &&
      Date.now() - lastAlert.timestamp < 60000 // Не чаще раза в минуту
    ) {
      return;
    }

    this.alerts.push(alert);

    // Ограничиваем историю алертов
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }

    // Логируем
    if (alert.severity === 'critical') {
      this.logError('CRITICAL ALERT', alert);
    } else {
      this.logWarn('WARNING ALERT', alert);
    }
  }

  /**
   * Получить системные метрики
   */
  private async getSystemMetrics(): Promise<{ cpuUsage: number; ramUsed: number; ramTotal: number }> {
    try {
      // CPU usage (примерное, через uptime)
      const { stdout: uptimeOut } = await execAsync('cat /proc/loadavg');
      const loadAvg = parseFloat(uptimeOut.split(' ')[0]);
      const cpuUsage = Math.min(loadAvg * 100, 100);

      // RAM usage
      const { stdout: memOut } = await execAsync('free -m');
      const memLines = memOut.split('\n');
      const memValues = memLines[1].split(/\s+/).filter(v => v);

      const ramTotal = parseInt(memValues[1], 10);
      const ramUsed = parseInt(memValues[2], 10);

      return { cpuUsage, ramUsed, ramTotal };
    } catch (error) {
      return { cpuUsage: 0, ramUsed: 0, ramTotal: 0 };
    }
  }

  // ---------------------------------------------------------------------------
  // ЛОГИРОВАНИЕ
  // ---------------------------------------------------------------------------

  private logDebug(message: string, data?: any): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[PerfMonitor] [DEBUG] ${message}`, data || '');
    }
  }

  private logInfo(message: string, data?: any): void {
    if (['debug', 'info'].includes(process.env.LOG_LEVEL || 'info')) {
      console.log(`[PerfMonitor] [INFO] ${message}`, data || '');
    }
  }

  private logWarn(message: string, data?: any): void {
    console.warn(`[PerfMonitor] [WARN] ${message}`, data || '');
  }

  private logError(message: string, error: any): void {
    console.error(`[PerfMonitor] [ERROR] ${message}`, error);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let performanceMonitorInstance: PerformanceMonitor | null = null;

/**
 * Получить singleton инстанс монитора
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitorInstance) {
    performanceMonitorInstance = new PerformanceMonitor();
  }
  return performanceMonitorInstance;
}

/**
 * Сбросить singleton инстанс (для тестирования)
 */
export function resetPerformanceMonitor(): void {
  if (performanceMonitorInstance) {
    performanceMonitorInstance.stopMonitoring();
  }
  performanceMonitorInstance = null;
}

/**
 * Экспорт дефолтного инстанса
 */
export default getPerformanceMonitor();
