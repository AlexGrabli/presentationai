/**
 * Redis Cache - Кеширование AI результатов через Redis
 *
 * Оптимизирует производительность путем кеширования:
 * - Outline презентаций
 * - Контента слайдов
 * - Сгенерированных изображений (base64)
 * - JSON ответов моделей
 *
 * Особенности:
 * - Автоматическое управление TTL
 * - Статистика hit/miss
 * - Graceful degradation (работает без Redis)
 * - Очистка старых записей
 */

import Redis from 'ioredis';

// =============================================================================
// ТИПЫ
// =============================================================================

/**
 * Тип кешируемых данных
 */
export enum CacheType {
  OUTLINE = 'outline',
  SLIDE = 'slide',
  IMAGE = 'image',
  JSON = 'json',
  TEXT = 'text',
}

/**
 * Опции для кеширования
 */
export interface CacheOptions {
  ttl?: number;                      // Time to live в секундах
  type?: CacheType;                  // Тип данных
  tags?: string[];                   // Теги для группировки
}

/**
 * Статистика кеша
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: number;               // В байтах
}

// =============================================================================
// REDIS CACHE CLIENT
// =============================================================================

export class RedisCacheClient {
  private client: Redis | null = null;
  private isEnabled: boolean;
  private isConnected: boolean = false;

  // Статистика
  private stats = {
    hits: 0,
    misses: 0,
  };

  // TTL по типу (в секундах)
  private defaultTTL: Record<CacheType, number> = {
    [CacheType.OUTLINE]: parseInt(process.env.REDIS_OUTLINE_TTL || '3600', 10), // 1 час
    [CacheType.SLIDE]: parseInt(process.env.REDIS_SLIDES_TTL || '1800', 10),   // 30 мин
    [CacheType.IMAGE]: parseInt(process.env.REDIS_IMAGES_TTL || '86400', 10),  // 24 часа
    [CacheType.JSON]: 3600,            // 1 час
    [CacheType.TEXT]: 3600,            // 1 час
  };

  constructor() {
    this.isEnabled = process.env.REDIS_ENABLED === 'true';

    if (this.isEnabled) {
      this.connect();
    } else {
      this.logWarn('Redis кеширование отключено');
    }
  }

  // ---------------------------------------------------------------------------
  // ОСНОВНЫЕ МЕТОДЫ
  // ---------------------------------------------------------------------------

  /**
   * Получить значение из кеша
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.isEnabled || !this.isConnected) {
      this.stats.misses++;
      return null;
    }

    try {
      const value = await this.client!.get(this.prefixKey(key));

      if (value) {
        this.stats.hits++;
        this.logDebug('Cache HIT', { key });
        return JSON.parse(value) as T;
      }

      this.stats.misses++;
      this.logDebug('Cache MISS', { key });
      return null;
    } catch (error) {
      this.logError('Ошибка чтения из кеша', error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Сохранить значение в кеш
   */
  async set<T = any>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<boolean> {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      const ttl = options.ttl || (options.type ? this.defaultTTL[options.type] : 3600);
      const serialized = JSON.stringify(value);

      await this.client!.setex(this.prefixKey(key), ttl, serialized);

      // Сохраняем теги если есть
      if (options.tags && options.tags.length > 0) {
        await this.setTags(key, options.tags);
      }

      this.logDebug('Сохранено в кеш', { key, ttl });
      return true;
    } catch (error) {
      this.logError('Ошибка записи в кеш', error);
      return false;
    }
  }

  /**
   * Удалить ключ из кеша
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      await this.client!.del(this.prefixKey(key));
      this.logDebug('Удалено из кеша', { key });
      return true;
    } catch (error) {
      this.logError('Ошибка удаления из кеша', error);
      return false;
    }
  }

  /**
   * Проверить наличие ключа
   */
  async has(key: string): Promise<boolean> {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      const exists = await this.client!.exists(this.prefixKey(key));
      return exists === 1;
    } catch (error) {
      this.logError('Ошибка проверки ключа', error);
      return false;
    }
  }

  /**
   * Очистить весь кеш
   */
  async clear(): Promise<boolean> {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      // Удаляем только ключи с нашим префиксом
      const keys = await this.client!.keys(this.prefixKey('*'));

      if (keys.length > 0) {
        await this.client!.del(...keys);
      }

      this.logInfo('Кеш очищен', { deletedKeys: keys.length });
      return true;
    } catch (error) {
      this.logError('Ошибка очистки кеша', error);
      return false;
    }
  }

  /**
   * Удалить ключи по тегу
   */
  async deleteByTag(tag: string): Promise<number> {
    if (!this.isEnabled || !this.isConnected) {
      return 0;
    }

    try {
      const tagKey = this.prefixKey(`tag:${tag}`);
      const keys = await this.client!.smembers(tagKey);

      if (keys.length > 0) {
        await this.client!.del(...keys.map(k => this.prefixKey(k)));
        await this.client!.del(tagKey);
      }

      this.logInfo('Удалены ключи по тегу', { tag, count: keys.length });
      return keys.length;
    } catch (error) {
      this.logError('Ошибка удаления по тегу', error);
      return 0;
    }
  }

  /**
   * Получить статистику кеша
   */
  async getStats(): Promise<CacheStats> {
    const totalKeys = this.isConnected
      ? (await this.client!.keys(this.prefixKey('*'))).length
      : 0;

    const memoryUsage = this.isConnected
      ? await this.getMemoryUsage()
      : 0;

    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: parseFloat(hitRate.toFixed(2)),
      totalKeys,
      memoryUsage,
    };
  }

  /**
   * Сбросить статистику
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.logInfo('Статистика сброшена');
  }

  // ---------------------------------------------------------------------------
  // СПЕЦИАЛИЗИРОВАННЫЕ МЕТОДЫ
  // ---------------------------------------------------------------------------

  /**
   * Кешировать outline презентации
   */
  async cacheOutline(topic: string, slideCount: number, outline: any): Promise<boolean> {
    const key = `outline:${topic}:${slideCount}`;
    return this.set(key, outline, {
      type: CacheType.OUTLINE,
      tags: ['outline', `topic:${topic}`],
    });
  }

  /**
   * Получить outline из кеша
   */
  async getOutline(topic: string, slideCount: number): Promise<any | null> {
    const key = `outline:${topic}:${slideCount}`;
    return this.get(key);
  }

  /**
   * Кешировать контент слайда
   */
  async cacheSlide(slideTitle: string, slideType: string, content: any): Promise<boolean> {
    const key = `slide:${slideTitle}:${slideType}`;
    return this.set(key, content, {
      type: CacheType.SLIDE,
      tags: ['slide', `type:${slideType}`],
    });
  }

  /**
   * Получить контент слайда из кеша
   */
  async getSlide(slideTitle: string, slideType: string): Promise<any | null> {
    const key = `slide:${slideTitle}:${slideType}`;
    return this.get(key);
  }

  /**
   * Кешировать изображение
   */
  async cacheImage(prompt: string, imageData: string): Promise<boolean> {
    const key = `image:${prompt}`;
    return this.set(key, imageData, {
      type: CacheType.IMAGE,
      tags: ['image'],
    });
  }

  /**
   * Получить изображение из кеша
   */
  async getImage(prompt: string): Promise<string | null> {
    const key = `image:${prompt}`;
    return this.get(key);
  }

  // ---------------------------------------------------------------------------
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ---------------------------------------------------------------------------

  /**
   * Подключение к Redis
   */
  private async connect(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const redisPassword = process.env.REDIS_PASSWORD;
      const redisDb = parseInt(process.env.REDIS_DB || '0', 10);

      this.client = new Redis(redisUrl, {
        password: redisPassword || undefined,
        db: redisDb,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logInfo('Redis подключен', { url: redisUrl });
      });

      this.client.on('error', (error) => {
        this.isConnected = false;
        this.logError('Redis ошибка', error);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.logWarn('Redis отключен');
      });

      // Ждем подключения
      await this.client.ping();
      this.isConnected = true;
    } catch (error) {
      this.logError('Не удалось подключиться к Redis', error);
      this.isConnected = false;
    }
  }

  /**
   * Добавить префикс к ключу
   */
  private prefixKey(key: string): string {
    return `presentation-ai:${key}`;
  }

  /**
   * Сохранить теги для ключа
   */
  private async setTags(key: string, tags: string[]): Promise<void> {
    if (!this.client) return;

    const promises = tags.map(tag => {
      const tagKey = this.prefixKey(`tag:${tag}`);
      return this.client!.sadd(tagKey, key);
    });

    await Promise.all(promises);
  }

  /**
   * Получить использование памяти
   */
  private async getMemoryUsage(): Promise<number> {
    if (!this.client) return 0;

    try {
      const info = await this.client.info('memory');
      const match = info.match(/used_memory:(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Закрыть соединение
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      this.logInfo('Redis отключен');
    }
  }

  // ---------------------------------------------------------------------------
  // ЛОГИРОВАНИЕ
  // ---------------------------------------------------------------------------

  private logDebug(message: string, data?: any): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[RedisCache] [DEBUG] ${message}`, data || '');
    }
  }

  private logInfo(message: string, data?: any): void {
    if (['debug', 'info'].includes(process.env.LOG_LEVEL || 'info')) {
      console.log(`[RedisCache] [INFO] ${message}`, data || '');
    }
  }

  private logWarn(message: string, data?: any): void {
    console.warn(`[RedisCache] [WARN] ${message}`, data || '');
  }

  private logError(message: string, error: any): void {
    console.error(`[RedisCache] [ERROR] ${message}`, error);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let redisCacheInstance: RedisCacheClient | null = null;

/**
 * Получить singleton инстанс Redis кеша
 */
export function getRedisCache(): RedisCacheClient {
  if (!redisCacheInstance) {
    redisCacheInstance = new RedisCacheClient();
  }
  return redisCacheInstance;
}

/**
 * Сбросить singleton инстанс (для тестирования)
 */
export function resetRedisCache(): void {
  if (redisCacheInstance) {
    redisCacheInstance.disconnect();
  }
  redisCacheInstance = null;
}

/**
 * Экспорт дефолтного инстанса
 */
export default getRedisCache();
