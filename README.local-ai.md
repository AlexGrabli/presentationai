# 🤖 Presentation AI - Локальные AI Модели

Полная интеграция локальных AI моделей через **Ollama** и **Stable Diffusion** для генерации презентаций без облачных сервисов.

## 📋 Содержание

- [Возможности](#-возможности)
- [Системные требования](#-системные-требования)
- [Установка](#-установка)
- [Конфигурация](#-конфигурация)
- [Использование](#-использование)
- [API](#-api)
- [Мониторинг](#-мониторинг)
- [Оптимизация](#-оптимизация)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Возможности

### 🧠 Локальные LLM (Ollama)
- **4 специализированные модели**:
  - `qwen3:14b` - основная модель для текста (8.5GB VRAM, ~25 tok/s)
  - `qwen3-coder:30b` - генерация кода (11.5GB VRAM, ~15 tok/s)
  - `llama3.1:8b` - быстрые задачи (5GB VRAM, ~40 tok/s)
  - `deepseek-r1:14b` - сложные задачи (8GB VRAM, ~20 tok/s)

- **Автоматический выбор модели** по типу задачи
- **Thinking/non-thinking режимы** для Qwen3
- **Парсинг JSON** с валидацией через Zod
- **Retry логика** с экспоненциальной задержкой

### 🎨 Генерация изображений (Stable Diffusion)
- Интеграция с **SD WebUI (AUTOMATIC1111)**
- Оптимизация для **RTX 4070ti** (12GB VRAM)
- Очередь запросов (1 одновременно)
- **Fallback на Unsplash** при недоступности SD
- Управление моделями и настройками

### ⚡ Производительность
- **Redis кеширование** с TTL управлением
- **GPU мониторинг** через nvidia-smi
- **Rate limiting** (30 req/min)
- **Статистика** hit/miss, latency, tokens/sec
- **Алерты** при проблемах (температура, VRAM)

---

## 💻 Системные требования

### Минимальные требования
- **OS**: Linux / Windows / macOS
- **CPU**: 4+ ядра
- **RAM**: 16GB+
- **GPU**: NVIDIA с 8GB+ VRAM (рекомендуется 12GB+)
- **Диск**: 50GB+ свободного места

### Рекомендуемая конфигурация (ваша)
- **GPU**: RTX 4070ti (12GB VRAM) ✅
- **RAM**: 32GB ✅
- **CPU**: Intel i5-12400 ✅

### Программное обеспечение
- **Node.js**: 18.0.0+
- **Ollama**: последняя версия
- **NVIDIA Drivers**: 535+ (для GPU мониторинга)
- **Redis**: 6.0+ (опционально, для кеширования)
- **SD WebUI**: AUTOMATIC1111 (опционально, для изображений)

---

## 🚀 Установка

### 1. Установка Ollama

```bash
# Linux / macOS
curl -fsSL https://ollama.com/install.sh | sh

# Или через Docker
docker pull ollama/ollama
```

Запуск Ollama:
```bash
ollama serve
```

Установка моделей:
```bash
ollama pull qwen3:14b
ollama pull qwen3-coder:30b
ollama pull llama3.1:8b
ollama pull deepseek-r1:14b
```

### 2. Установка Stable Diffusion WebUI (опционально)

```bash
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
cd stable-diffusion-webui
./webui.sh --api --listen
```

### 3. Установка Redis (опционально)

```bash
# Linux (Ubuntu/Debian)
sudo apt-get install redis-server
sudo systemctl start redis

# macOS
brew install redis
brew services start redis

# Docker
docker run -d -p 6379:6379 redis:latest
```

### 4. Установка зависимостей проекта

```bash
cd presentation-ai
npm install
```

### 5. Конфигурация

Скопируйте `.env.example` в `.env.local`:
```bash
cp .env.example .env.local
```

Отредактируйте `.env.local` (минимальная конфигурация):
```env
# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=qwen3:14b

# Redis (если установлен)
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379

# GPU Monitoring
ENABLE_GPU_MONITORING=true

# Stable Diffusion (если установлен)
SD_WEBUI_URL=http://localhost:7860
```

---

## ⚙️ Конфигурация

### Переменные окружения

#### Ollama
```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=qwen3:14b
OLLAMA_TIMEOUT=120000                 # 2 минуты
OLLAMA_MAX_TOKENS=4096
OLLAMA_TEMPERATURE=0.7

# Модели по типу задачи
OLLAMA_OUTLINE_MODEL=qwen3:14b
OLLAMA_CONTENT_MODEL=qwen3:14b
OLLAMA_CODE_MODEL=qwen3-coder:30b
OLLAMA_QUICK_MODEL=llama3.1:8b
OLLAMA_REASONING_MODEL=deepseek-r1:14b
```

#### Stable Diffusion
```env
SD_WEBUI_URL=http://localhost:7860
SD_STEPS=25                           # Оптимально для RTX 4070ti
SD_WIDTH=1024
SD_HEIGHT=576
SD_CFG_SCALE=7.5
SD_SAMPLER=DPM++ 2M Karras
SD_TIMEOUT=180000                     # 3 минуты
```

#### Redis
```env
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
REDIS_OUTLINE_TTL=3600                # 1 час
REDIS_SLIDES_TTL=1800                 # 30 минут
REDIS_IMAGES_TTL=86400                # 24 часа
```

#### Мониторинг
```env
ENABLE_GPU_MONITORING=true
GPU_MONITORING_INTERVAL=5000          # 5 секунд
ENABLE_PERFORMANCE_LOGGING=true
LOG_LEVEL=info                        # debug | info | warn | error
```

---

## 📖 Использование

### Базовое использование

```typescript
import { getUnifiedAI } from '@/lib/ai/unified-ai';

const ai = getUnifiedAI();

// Генерация структуры презентации
const outline = await ai.generatePresentationOutline('Искусственный интеллект', 10);

// Генерация контента слайда
const slideContent = await ai.generateSlideContent(
  'Преимущества AI',
  'content',
  'Презентация об искусственном интеллекте'
);

// Генерация изображения
const image = await ai.generateSlideImage('modern AI neural network visualization', {
  style: 'professional',
  useCache: true,
});
```

### Продвинутое использование

```typescript
import { getOllamaClient, TaskType, QwenMode } from '@/lib/ai/ollama-client';
import { ModelSelector } from '@/lib/ai/model-selector';

const client = getOllamaClient();

// Автоматический выбор модели
const recommendation = ModelSelector.selectModel({
  type: TaskType.OUTLINE_GENERATION,
  complexity: 'medium',
  requiresReasoning: true,
  requiresCode: false,
  requiresStructure: true,
});

console.log(recommendation);
// {
//   model: 'qwen3:14b',
//   temperature: 0.7,
//   maxTokens: 2048,
//   qwenMode: 'thinking',
//   estimatedLatency: 12000,
//   vramUsage: 8.5
// }

// Генерация с thinking mode
const result = await client.generate('Создай план презентации...', {
  model: recommendation.model,
  temperature: recommendation.temperature,
  qwenMode: QwenMode.THINKING,
});

// Генерация JSON с валидацией
import { z } from 'zod';

const schema = z.object({
  title: z.string(),
  slides: z.number(),
});

const data = await client.generateJSON('...', {
  schema,
  taskType: TaskType.QUICK_TASK,
});
```

### Кеширование

```typescript
import { getRedisCache } from '@/lib/cache/redis-cache';

const cache = getRedisCache();

// Кешировать outline
await cache.cacheOutline('AI тема', 10, outlineData);

// Получить из кеша
const cached = await cache.getOutline('AI тема', 10);

// Статистика
const stats = await cache.getStats();
console.log(`Hit rate: ${stats.hitRate}%`);

// Очистка по тегу
await cache.deleteByTag('outline');
```

### Мониторинг

```typescript
import { getPerformanceMonitor } from '@/lib/monitoring/performance';

const monitor = getPerformanceMonitor();

// GPU метрики
const gpuMetrics = await monitor.getGPUMetrics();
console.log(`VRAM: ${gpuMetrics[0].memoryUsed}MB / ${gpuMetrics[0].memoryTotal}MB`);

// Отслеживание запроса
const requestId = monitor.startRequest('qwen3:14b', 'outline_generation');

// ... выполнение запроса ...

await monitor.endRequest(requestId, true, 1500); // success, 1500 tokens

// Статистика
const stats = await monitor.getStats();
console.log(`Avg latency: ${stats.requests.averageDuration}ms`);
console.log(`Avg speed: ${stats.requests.averageTokensPerSecond} tok/s`);

// Алерты
const alerts = monitor.getAlerts();
alerts.forEach(alert => {
  console.log(`[${alert.severity}] ${alert.message}`);
});
```

---

## 🔧 API

### UnifiedAI

Единый интерфейс для всех AI сервисов.

#### generatePresentationOutline(topic, slideCount)
Генерирует структуру презентации.

```typescript
const outline = await ai.generatePresentationOutline('Machine Learning', 8);
```

#### generateSlideContent(title, type, context?)
Генерирует контент для слайда.

```typescript
const content = await ai.generateSlideContent('Introduction', 'content');
```

#### generateSlideImage(prompt, options?)
Генерирует изображение для слайда.

```typescript
const image = await ai.generateSlideImage('AI concept', {
  style: 'professional',
  width: 1024,
  height: 576,
});
```

#### generateText(prompt, options?)
Базовая генерация текста.

```typescript
const text = await ai.generateText('Explain AI', {
  taskType: TaskType.GENERAL,
  temperature: 0.7,
});
```

#### generateJSON(prompt, options?)
Генерация с парсингом JSON.

```typescript
const data = await ai.generateJSON('Create JSON...', {
  schema: myZodSchema,
});
```

---

## 📊 Мониторинг

### Скрипты

#### Тестирование моделей
```bash
npm run test:models
```

Проверяет:
- ✅ Подключение к Ollama
- ✅ Доступность моделей
- ✅ Генерацию текста/JSON
- ✅ Stable Diffusion
- ✅ Redis кеш
- ✅ GPU мониторинг

#### Мониторинг GPU
```bash
npm run monitor:gpu
```

Отображает в реальном времени:
- 🎮 Утилизацию GPU
- 💾 VRAM usage
- 🌡️ Температуру
- ⚡ Мощность
- 🌀 Скорость вентилятора
- 🚨 Алерты

#### Бенчмарки
```bash
npm run benchmark
```

Измеряет:
- ⏱️ Latency для разных задач
- 🚀 Tokens/sec
- 💾 VRAM usage
- 📊 Сравнение моделей

---

## ⚡ Оптимизация

### Для RTX 4070ti (12GB VRAM)

#### Одновременное использование
- **1 большая модель** (qwen3-coder:30b) - ИСПОЛЬЗУЕТ ПОЧТИ ВСЮ VRAM
- **1-2 средние модели** (qwen3:14b, deepseek-r1:14b) - БЕЗОПАСНО
- **Несколько маленьких** (llama3.1:8b) - БЕЗОПАСНО

#### Рекомендации
```env
# Ограничьте одновременные запросы к Ollama
OLLAMA_MAX_CONCURRENT_REQUESTS=2

# Для SD используйте только 1 запрос одновременно
SD_MAX_CONCURRENT_REQUESTS=1

# Оптимальные настройки SD для RTX 4070ti
SD_STEPS=20-30
SD_WIDTH=1024
SD_HEIGHT=576
SD_SAMPLER=DPM++ 2M Karras
```

### Кеширование
- Включите Redis для значительного ускорения
- Настройте TTL по типу контента
- Используйте теги для группового удаления

### Мониторинг алертов
Настройте пороги в `performance.ts`:
```typescript
private thresholds = {
  gpuTempWarning: 75,      // °C
  gpuTempCritical: 85,     // °C
  vramWarning: 90,         // %
  vramCritical: 95,        // %
};
```

---

## 🐛 Troubleshooting

### Ollama не отвечает

**Проблема**: Запросы к Ollama зависают или не выполняются.

**Решение**:
```bash
# Проверьте статус Ollama
curl http://localhost:11434/api/tags

# Перезапустите Ollama
killall ollama
ollama serve

# Проверьте логи
journalctl -u ollama -f
```

### VRAM переполнена

**Проблема**: `CUDA out of memory` или медленная генерация.

**Решение**:
1. Закройте другие программы использующие GPU
2. Используйте более легкие модели (llama3.1:8b)
3. Ограничьте `OLLAMA_MAX_CONCURRENT_REQUESTS=1`
4. Уменьшите `max_tokens`

### SD WebUI недоступен

**Проблема**: Не удается сгенерировать изображения.

**Решение**:
```bash
# Проверьте SD WebUI
curl http://localhost:7860/sdapi/v1/sd-models

# Запустите с API
cd stable-diffusion-webui
./webui.sh --api --listen

# Включите fallback на Unsplash
ENABLE_CLOUD_FALLBACK=true
```

### Redis connection failed

**Проблема**: Кеш не работает.

**Решение**:
```bash
# Проверьте Redis
redis-cli ping
# должно вернуть: PONG

# Перезапустите Redis
sudo systemctl restart redis

# Или отключите кеш
REDIS_ENABLED=false
```

### Медленная генерация

**Проблема**: Модели генерируют слишком медленно (< 10 tok/s).

**Решение**:
1. Проверьте что Ollama использует GPU:
   ```bash
   nvidia-smi
   # Должен показывать активность
   ```

2. Проверьте температуру GPU:
   ```bash
   npm run monitor:gpu
   ```

3. Попробуйте более легкую модель:
   ```env
   OLLAMA_DEFAULT_MODEL=llama3.1:8b
   ```

---

## 📁 Структура проекта

```
presentation-ai/
├── src/
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── ollama-client.ts       # Ollama клиент
│   │   │   ├── model-selector.ts      # Выбор модели
│   │   │   ├── sd-client.ts           # Stable Diffusion клиент
│   │   │   └── unified-ai.ts          # Единый интерфейс
│   │   ├── cache/
│   │   │   └── redis-cache.ts         # Redis кеш
│   │   └── monitoring/
│   │       └── performance.ts         # GPU мониторинг
│   ├── app/                            # Next.js pages
│   └── components/                     # React компоненты
├── scripts/
│   ├── test-models.ts                  # Тестирование
│   ├── monitor-gpu.ts                  # GPU монитор
│   └── benchmark.ts                    # Бенчмарки
├── .env.example                        # Пример конфигурации
└── README.local-ai.md                  # Эта документация
```

---

## 🎯 Best Practices

1. **Всегда проверяйте здоровье сервисов** перед использованием:
   ```typescript
   const health = await ai.checkHealth();
   if (!health.ollama) {
     // fallback на облако или ошибка
   }
   ```

2. **Используйте кеширование** для повторяющихся запросов

3. **Мониторьте VRAM** при работе с большими моделями

4. **Логируйте все операции** для отладки:
   ```env
   LOG_LEVEL=debug
   ENABLE_PERFORMANCE_LOGGING=true
   ```

5. **Настройте алерты** для критических проблем

---

## 📝 Лицензия

MIT

## 🤝 Поддержка

Вопросы? Создайте Issue в GitHub.

---

**Создано для Presentation AI** | Powered by Ollama, Stable Diffusion, Redis
