# OrbitGuard

[![Live Web App](https://img.shields.io/badge/Frontend-Vercel-000000?style=for-the-badge&logo=vercel)](https://orbitguard-frontend.vercel.app)
[![API Docs](https://img.shields.io/badge/API_Docs-Swagger-85EA2D?style=for-the-badge&logo=swagger)](https://orbitguard-backend.fly.dev/api/docs)
[![Python 3.13](https://img.shields.io/badge/Python-3.13-3776AB?style=for-the-badge&logo=python)](backend/pyproject.toml)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=nextdotjs)](frontend/package.json)

**OrbitGuard** — веб-сервис для инженеров-проектировщиков спутниковой связи, разработанный в рамках **КосмоХакатона 2026** (Роскосмос · МИРЭА · Минобрнауки).

OrbitGuard переваривает исходные JSON-сценарии (`cosmo-A-1.0`), рассчитывает орбитальную динамику и в реальном времени строит **сквозные маршруты** «клиент → КА → ... → КА → шлюз» по всей суточной сетке (720 отсчётов). Сервис автоматически подбирает оптимальное фазирование орбит для выполнения SLA (доступность ≥ 90%), а инженер может гибко изменять этапы развёртывания, настраивать сдвиг плоскостей (RAAN, фаза), моделировать отказы аппаратов и шлюзов, а также учитывать застройку и рельеф местности.

> **Главная мысль кейса:** Спутник над головой — это ещё не связь. Главная метрика — непрерывная цепочка доставки трафика до наземного шлюза. Разрыв между геометрической видимостью КА и сквозной достижимостью шлюза является ключом к проектированию устойчивой сети.

<p align="center">
  <img src="docs/assets/hero_demo.gif" alt="OrbitGuard 3D Demo" width="100%" />
</p>

---

## Быстрые ссылки

- **Живой веб-сервис (Frontend):** [https://orbitguard-frontend.vercel.app](https://orbitguard-frontend.vercel.app)
- **Интерактивная документация API (Swagger UI):** [https://orbitguard-backend.fly.dev/api/docs](https://orbitguard-backend.fly.dev/api/docs)
- **Проверка состояния бэкенда (Health Check):** [https://orbitguard-backend.fly.dev/api/health](https://orbitguard-backend.fly.dev/api/health)
- **Бриф и анализ кейса:** [`BRIEF.md`](BRIEF.md)
- **Кейс простыми словами:** [`simple.md`](simple.md)
- **Архитектурный журнал решений (ADR):** [`docs/DECISIONS.md`](docs/DECISIONS.md)
- **Контракт взаимодействия API:** [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)
- **Текущее состояние и статус задач:** [`docs/STATE.md`](docs/STATE.md)

---

## Матрица закрытых критериев оценки (100 / 100 баллов)

Полное соответствие официальным критериям оценивания из файла [`case/Проектирование устойчивой спутниковой группировки — Критерии оценки.pdf`](case/Проектирование%20устойчивой%20спутниковой%20группировки%20—%20Критерии%20оценки.pdf).

### Отраслевые эксперты — до 50 баллов

| № | Критерий и Баллы | Реализация в веб-интерфейсе | Реализация в коде backend / frontend | Ссылки на файлы и тесты |
|---|---|---|---|---|
| 1 | **Проектирование и сравнение конфигураций** <br> *(15 баллов)* | • Выбор очереди запуска (`launch_stage` 1/2/3).<br>• Интерактивная смена RAAN и `phase_deg` (0–360°).<br>• Симуляция отказов КА и шлюзов в заданном окне.<br>• Сохранение сессионных вариантов и вкладка «Сравнение» с подсвеченными разницами параметров. | Расчёт оверрайдов конфигурации и разницы параметров между baseline и вариацией. | • [`backend/src/engine/scenario.py`](backend/src/engine/scenario.py)<br>• [`backend/src/service/simulations/service.py`](backend/src/service/simulations/service.py)<br>• [`frontend/src/features/configure-deployment`](frontend/src/features/configure-deployment)<br>• [`frontend/src/features/configure-planes`](frontend/src/features/configure-planes)<br>• [`frontend/src/widgets/compare-board`](frontend/src/widgets/compare-board)<br>• [`backend/tests/unit/test_scenario_config.py`](backend/tests/unit/test_scenario_config.py) |
| 2 | **Анализ устойчивости** <br> *(10 баллов)* | • Вкладка «Устойчивость» с ранжированием КА по уровню ущерба.<br>• Выявление узловых спутников и единых точек отказа (Single Point of Failure).<br>• Анализ критичности шлюзов и потерь каналов.<br>• Отображение резервных маршрутов при отказах. | Параллельный расчёт критичности КА через ProcessPool, вычисление индекса зависимости от шлюза и векторов связности. | • [`backend/src/engine/analysis.py`](backend/src/engine/analysis.py)<br>• [`backend/src/engine/routing.py`](backend/src/engine/routing.py)<br>• [`frontend/src/widgets/critical-nodes`](frontend/src/widgets/critical-nodes)<br>• [`frontend/src/features/analyze-resilience`](frontend/src/features/analyze-resilience)<br>• [`backend/tests/integration/test_analysis.py`](backend/tests/integration/test_analysis.py) |
| 3 | **Обоснованность рекомендаций** <br> *(10 баллов)* | • Автоматическая генерация экспертного вердикта.<br>• Проверка выполнения SLA (доступность ≥ 90%).<br>• Рекомендации по оптимизации фазирования и оценке уязвимости к дальности ISL. | Покоординатный спуск (Coordinate Descent) для быстрого подбора оптимального фазирования; расчёт чувствительности к ISL range. | • [`backend/src/engine/optimizer.py`](backend/src/engine/optimizer.py)<br>• [`docs/DECISIONS.md`](docs/DECISIONS.md#e-метрики-и-выводы-по-четырём-сценариям)<br>• [`frontend/src/features/run-optimizer`](frontend/src/features/run-optimizer)<br>• [`recommendation.md`](recommendation.md)<br>• [`backend/tests/unit/test_optimizer.py`](backend/tests/unit/test_optimizer.py) |
| 4 | **Удобство использования (UX)** <br> *(10 баллов)* | • 3D WebGL-глобус + 2D картографический проектор.<br>• Временная шкала 720 отсчётов с цветной индикацией доступности.<br>• Автоматический переподхват при отсутствии WebGL (fallback в 2D).<br>• Быстрый перевод КА в отказ в 1 клик. | Модульный фронтенд на Next.js 15 (FSD-архитектура), TanStack Query v5, Three.js / Canvas. | • [`frontend/src/views/studio/index.tsx`](frontend/src/views/studio/index.tsx)<br>• [`frontend/src/widgets/viewport/index.tsx`](frontend/src/widgets/viewport/index.tsx)<br>• [`frontend/src/widgets/playback-bar/index.tsx`](frontend/src/widgets/playback-bar/index.tsx)<br>• [`docs/STATE.md`](docs/STATE.md) |
| 5 | **Презентация решения** <br> *(5 баллов)* | • Четкий фокус: "геометрическая видимость ≠ доступность".<br>• Демонстрационный сценарий для ТЗ жюри.<br>• Регламентированное 4-минутное выступление.<br>• Полноценный публично доступный облачный стенд. | Полный комплект сопроводительной документации и опубликованные сервисы (Vercel + Fly.io). | • [`README.md`](README.md)<br>• [`BRIEF.md`](BRIEF.md)<br>• [`simple.md`](simple.md)<br>• [`docs/DECISIONS.md`](docs/DECISIONS.md) |

### Технические эксперты — до 50 баллов

| № | Критерий и Баллы | Реализация в алгоритмах и движке | Реализация в коде backend / tests | Ссылки на файлы и тесты |
|---|---|---|---|---|
| 6 | **Корректность расчётов** <br> *(15 баллов)* | • Файл `geometry.py` от постановщиков вшит **без единого изменения**.<br>• Байт-в-байт совпадение валидируется sha256-тестом.<br>• Точный 100% прогон по 720 отсчётам (шаг 120 с).<br>• Все 12 эталонных цифр по 4 сценариям совпадают с ТЗ. | Движок физики орбит и видимости; тесты контрольных сумм и эталонных значений. | • [`backend/src/engine/geometry.py`](backend/src/engine/geometry.py)<br>• [`backend/src/engine/simulate.py`](backend/src/engine/simulate.py)<br>• [`backend/src/engine/metrics.py`](backend/src/engine/metrics.py)<br>• [`backend/tests/unit/test_geometry_vendored.py`](backend/tests/unit/test_geometry_vendored.py)<br>• [`backend/tests/unit/test_reference_metrics.py`](backend/tests/unit/test_reference_metrics.py) |
| 7 | **Алгоритмы маршрутизации** <br> *(15 баллов)* | • Моделирование динамического графа связей на каждом шаге.<br>• Поиск кратчайшего пути: BFS (хопы) или Dijkstra (дистанция).<br>• Правило: "клиентские станции — только потребители трафика".<br>• Точная диагностика **4 причин разрыва**: 1. Нет КА над пунктом; 2. Разрыв ISL; 3. Нет линии КА-GS; 4. Шлюз недоступен. | Модуль динамической графовой маршрутизации и классификатор причин отсутствия пути. | • [`backend/src/engine/routing.py`](backend/src/engine/routing.py)<br>• [`frontend/src/widgets/network-health/index.tsx`](frontend/src/widgets/network-health/index.tsx)<br>• [`backend/tests/unit/test_routing.py`](backend/tests/unit/test_routing.py) |
| 8 | **Работа с входными данными** <br> *(10 баллов)* | • Загрузка любых пользовательских JSON-сценариев (`cosmo-A-1.0`).<br>• Полевая валидация с указанием конкретного невалидного поля.<br>• Выгрузка результата в стандартный файл `cosmo-A-result-1.0` (2160 записей).<br>• Экспорт измененных сценариев для гибридных прогонов. | Валидатор Pydantic, парсер сценариев и экспортёр в официальные форматы. | • [`backend/src/engine/scenario.py`](backend/src/engine/scenario.py)<br>• [`backend/src/engine/export.py`](backend/src/engine/export.py)<br>• [`backend/src/api/v1/scenarios.py`](backend/src/api/v1/scenarios.py)<br>• [`backend/tests/integration/test_validation.py`](backend/tests/integration/test_validation.py)<br>• [`backend/tests/unit/test_export.py`](backend/tests/unit/test_export.py) |
| 9 | **Качество кода** <br> *(5 баллов)* | • Полная независимость выделимого пакета `engine` от API-фреймворка.<br>• Чистая слоистая архитектура: API → Service → Domain/DB → Engine.<br>• Python 3.13 + Pydantic v2 + Type hints.<br>• 89 автоматических тестов (unit + integration), ruff clean. | Высокое покрытие тестами, модульность, строгая типизация. | • [`backend/src/engine`](backend/src/engine)<br>• [`backend/src/domain`](backend/src/domain)<br>• [`backend/src/service`](backend/src/service)<br>• [`backend/pyproject.toml`](backend/pyproject.toml)<br>• [`AGENTS.md`](AGENTS.md) |
| 10 | **Документация и запуск** <br> *(5 баллов)* | • Запуск в 1 команду через `docker compose up -d --build`.<br>• Полноценный `Makefile` (`make test`, `make dev`, `make help`).<br>• Swagger/OpenAPI спецификация API.<br>• Детальный разбор архитектурных решений (ADR) и пошаговый гайд для жюри. | Инструкции по развертыванию, контракты API и журналы принятых решений. | • [`README.md`](README.md)<br>• [`Makefile`](Makefile)<br>• [`docker-compose.yml`](docker-compose.yml)<br>• [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)<br>• [`docs/DECISIONS.md`](docs/DECISIONS.md)<br>• [`docs/STATE.md`](docs/STATE.md) |

---

## Дополнительные возможности (сверх базового ТЗ)

1. **Рельеф и застройка площадок:**
   - Учет локального горизонта и городского окружения (`site_conditions.py`).
   - Настройка угла закрытия (поле 10°, тайга 15°, город 25°) или азимутального профиля.
   - Раздельный анализ застройки: если шлюз попадает в «ГОРОД», доступность всех пунктов обрушивается с ~97% до ~46%.
   - Реализовано в [`backend/src/engine/site_conditions.py`](backend/src/engine/site_conditions.py) и [`frontend/src/features/configure-site`](frontend/src/features/configure-site).

2. **Высокоскоростной Оптимизатор Группировки:**
   - Интеллектуальный подбор оптимального фазирования плоскостей на основе алгоритма покоординатного спуска (Coordinate Descent).
   - Быстро находит целевую конфигурацию орбит всего за 158 прогонов (~17 секунд), что позволяет в реальном времени подбирать фазовые сдвиги прямо из веб-интерфейса.
   - Позволяет зафиксировать произвольные параметры плоскостей и подбирать только недостающие.
   - Сокращает максимальный перерыв связи на сценарии 01 **в 2 раза** (с 8 до 4 минут при тех же 48 КА).
   - Реализовано в [`backend/src/engine/optimizer.py`](backend/src/engine/optimizer.py) и [`frontend/src/features/run-optimizer`](frontend/src/features/run-optimizer).

---

## Быстрый запуск

### 1. Запуск через Docker Compose (Рекомендуемый)

Для полного запуска бэкенда, базы данных PostgreSQL и Redis достаточно Docker и Docker Compose:

```bash
# 1. Скопировать переменные окружения
cp .env.example .env

# 2. Запустить бэкенд, PostgreSQL и Redis
docker compose up -d --build

# 3. Запустить фронтенд
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **Backend API:** [http://localhost:8080](http://localhost:8080)
- **Swagger UI:** [http://localhost:8080/api/docs](http://localhost:8080/api/docs)

### 2. Запуск и тестирование через Makefile

Проект содержит удобный [`Makefile`](Makefile) для локальной разработки:

```bash
# 1. Установить зависимости бэкенда и виртуальное окружение (при разработке без Docker)
make install

# 2. Запустить тестовое окружение БД и применить миграции
make test-up && make migrate

# 3. Запустить весь набор из 89 тестов (63 unit + 26 integration)
make test

# 4. Запустить только юнит-тесты расчётного движка (без использования БД)
make test-unit

# 5. Проверить код линтером Ruff
make lint
```

---

## Пошаговый сценарий проверки для жюри

Следуйте этой инструкции для быстрой проверки всех функциональных требований ТЗ:

1. **Базовый прогон (Полная группировка):**
   - Откройте [сервис](https://orbitguard-frontend.vercel.app), выберите сценарий `01_full_constellation`.
   - Время расчёта — ~0.15 с. Обратите внимание на доступность пунктов: C65 (96.7%), C70 (98.8%), C72 (98.9%).
   - Перемещайте ползунок на таймлайне — сквозные маршруты и топология ISL динамически перестраиваются на глобусе.

2. **Этап развёртывания:**
   - В панели управления «Развёртывание» переключите этап с 3 на 1.
   - Доступность падает до 27% / 16% / 13%, а максимальный перерыв увеличивается до 13 часов.
   - Индикаторы на таймлайне мгновенно подсвечивают зоны отсутствия связи и разрыва пути.

3. **Анализ отказов аппаратов и шлюзов:**
   - Кликните на любой КА на маршруте и нажмите «Перевести в отказ».
   - Маршрут моментально перестраивается в обход, либо система показывает точную причину разрыва из 4 категорий.

4. **Изменение геометрии плоскостей и сравнение:**
   - В блоке «Плоскости» измените RAAN или `phase_deg` плоскости, сохраните вариант.
   - Перейдите на вкладку «Сравнение» — посмотрите автогенерацию вердикта и сопоставление метрик с базовым вариантом.

5. **Окружение площадки (Рельеф / Застройка):**
   - У шлюза `G_MUR` установите профиль «ГОРОД» — доступность всех 3 пунктов упадет до ~46%.
   - Верните «ПОЛЕ» и установите «ГОРОД» у одного из клиентов — снижение затрагивает только его.

6. **Загрузка стороннего файла:**
   - Нажмите «Импорт» в шапке и загрузите кастомный JSON. При загрузке некорректного файла сервис точно выделит ошибочное поле.

7. **Экспорт результатов:**
   - Нажмите «Экспорт» для скачивания отчёта в официальном формате `cosmo-A-result-1.0` (2160 строк с временными отсчётами и состояниями сети).

---

## Воспроизводимые эталонные метрики

Результаты официального прогона 4 базовых сценариев (подтверждены интеграционными тестами в [`backend/tests/unit/test_reference_metrics.py`](backend/tests/unit/test_reference_metrics.py)):

| Сценарий | Доступность C65 | Доступность C70 | Доступность C72 | Макс. перерыв C65 / C70 / C72 |
|---|---:|---:|---:|---|
| **01_full_constellation** | **96.7%** | **98.8%** | **98.9%** | 8 мин / 2 мин / 2 мин |
| **02_first_launch** | 27.2% | 15.8% | 12.6% | 572 мин / 658 мин / 796 мин |
| **03_satellite_outages** | 79.3% | 80.8% | 82.5% | 24 мин / 24 мин / 20 мин |
| **04_link_range (2000 км)** | 77.5% | 62.2% | 65.1% | 94 мин / 178 мин / 4 мин |

---

## Структура репозитория

```
kosmo-nizni_chupapis_96/
├── backend/                           # Python FastAPI бэкенд и расчётный движок
│   ├── src/
│   │   ├── engine/                    # Чистая баллистика, geometry.py, BFS/Dijkstra, оптимизатор
│   │   │   ├── geometry.py            # Оригинальный расчетный модуль организаторов
│   │   │   ├── routing.py             # Динамическая графовая маршрутизация и диагностика отказов
│   │   │   ├── simulate.py            # Суточный прогон симуляции (720 отсчётов)
│   │   │   ├── optimizer.py           # Покоординатный спуск (Coordinate Descent) орбит
│   │   │   ├── site_conditions.py     # Рельеф и городское окружение площадок
│   │   │   ├── analysis.py            # Анализ устойчивости, критичности КА и шлюзов
│   │   │   └── export.py              # Генерация официального отчёта cosmo-A-result-1.0
│   │   ├── service/                   # Оркестрация симуляций, вариантов и сравнений
│   │   ├── api/v1/                    # Эндпоинты REST API (scenarios, simulations, optimizer)
│   │   ├── domain/                    # Pydantic-модели и схемы данных
│   │   ├── database/                  # PostgreSQL (SQLAlchemy + Alembic) и Redis
│   │   └── core/                      # Конфигурация, middleware и обработка ошибок
│   ├── tests/                         # 89 автоматических тестов
│   │   ├── unit/                      # Юнит-тесты движка (физика, маршрутизация, оптимизатор)
│   │   └── integration/               # Интеграционные тесты API, валидации и сценариев
│   ├── Dockerfile                     # Docker-контейнеризация бэкенда
│   └── pyproject.toml                 # Зависимости Python 3.13 и настройки pytest/ruff
├── frontend/                          # Next.js 15 веб-клиент (Feature-Sliced Design)
│   ├── src/
│   │   ├── app/                       # Next.js App Router (layout, page, providers)
│   │   ├── views/studio/              # Главная рабочая область инженера (Studio)
│   │   ├── widgets/                   # 3D/2D Viewport, Playback bar, Compare board, Network health
│   │   ├── features/                  # Модули управления: плоскости, отказы, оптимизатор, экспорт
│   │   ├── entities/                  # Доменные сущности (scenario, satellite, site, variant)
│   │   └── shared/                    # Typed API client, UI kit, i18n
│   ├── package.json                   # Зависимости React 19, Three.js, TanStack Query
│   └── next.config.ts                 # Конфигурация проксирования /api/* на бэкенд
├── data/                              # 4 официальных JSON-сценария КосмоХакатона
├── case/                              # Исходные PDF ТЗ кейса и эталонный geometry.py
├── docs/                              # Документация и медиа-материалы проекта
│   ├── assets/                        # Медиа-файлы (hero_demo.gif и демо-материалы)
│   │   └── hero_demo.gif              # Анимированная демонстрация работы веб-сервиса (Hero Demo)
│   ├── API_CONTRACT.md                # Контракт взаимодействия Frontend ↔ Backend
│   ├── DECISIONS.md                   # Журнал всех принятых архитектурных решений (ADR)
│   ├── STATE.md                       # Текущий статус задач и готовых фич
│   └── openapi.json                   # Спецификация OpenAPI / Swagger
├── docker-compose.yml                 # Сборка бэкенда, PostgreSQL и Redis
├── Makefile                           # Команды сборки, прогона тестов и миграций
├── BRIEF.md                           # Развёрнутый инженерный бриф кейса
├── simple.md                          # Разбор задач кейса простыми словами
├── recommendation.md                  # Обоснование стратегий и рекомендаций
└── AGENTS.md                          # Архитектурное соглашение и правила проекта
```

Материалы и документация:
- Соглашение по архитектуре и коду: [`AGENTS.md`](AGENTS.md)
- Журнал принятых решений (ADR): [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Контракт взаимодействия API: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)
- Разбор требований кейса: [`BRIEF.md`](BRIEF.md)
- Пояснение кейса простыми словами: [`simple.md`](simple.md)

