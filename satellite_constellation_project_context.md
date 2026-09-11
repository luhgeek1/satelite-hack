# Контекст проекта для coding agent

> Этот файл — handoff / source of context для агента, который будет работать над проектом кейса **«Проектирование устойчивой спутниковой группировки»** КосмоХакатона 2026.
>
> Приоритет источников:
> 1. Официальные файлы кейса из архива.
> 2. Реальные расчёты через `geometry.py`.
> 3. Продуктовые/UI-решения, согласованные в обсуждении.
> 4. Mock-значения прототипа — только как визуальные заглушки, не как истинные результаты.

---

## 1. Суть проекта в одном абзаце

Мы делаем веб-сервис / digital twin спутниковой сети для инженера-проектировщика. Пользователь загружает сценарий спутниковой группировки, меняет этап развёртывания, RAAN/phase орбитальных плоскостей и периоды отказов спутников, запускает расчёт на 24 часа и видит состояние сети во времени: положения спутников, наземные пункты, доступные контакты и сквозной маршрут от клиентского пункта до gateway. Затем он сравнивает несколько конфигураций по доступности связи, перерывам и маршрутам, анализирует уязвимости и формирует рекомендацию по более устойчивой конфигурации.

Главная продуктовая формулировка:

**Мы не просто визуализируем спутники. Мы показываем инженеру, будет ли работать сеть, почему связь пропадёт и как изменение конфигурации повлияет на устойчивость.**

Короткий pitch:

> **Digital twin спутниковой сети, который позволяет моделировать её работу, анализировать отказы, находить слабые места и сравнивать варианты группировки.**

---

## 2. Официальная постановка задачи

Планируется развёртывание группировки из **48 спутников** на круговых орбитах высотой **550 км**.

Запуск выполняется в **3 очереди по 16 аппаратов** с интервалом в три месяца.

Группировка должна обеспечивать связь между северными клиентскими наземными пунктами и шлюзом выхода в наземную сеть.

Проблема состоит в том, что:

- наличие спутника над клиентом ещё не гарантирует сквозной маршрут до gateway;
- взаимное положение спутников меняется во времени;
- ISL-связи появляются и исчезают;
- отдельные аппараты могут быть недоступны;
- на ранних этапах развёртывания сеть существенно менее устойчива;
- отказ одного аппарата может затронуть несколько направлений связи.

**Целевой ориентир: доступность связи не менее 90% расчётного времени для каждого клиентского наземного пункта.**

---

## 3. Что обязательно должно уметь решение по кейсу

### 3.1. Подготовка и изменение конфигурации

Сервис должен:

- загрузить сценарий JSON;
- показать состав группировки;
- показать орбитальные плоскости;
- показать наземные пункты;
- показать параметры расчёта;
- позволить выбрать `launch_stage`;
- позволить менять `raan_deg`;
- позволить менять `phase_deg`;
- позволить добавлять периоды недоступности спутников;
- позволить сохранить вариант;
- позволить вернуться к сохранённому варианту и сравнить его.

### 3.2. Моделирование покрытия и сети

На каждом временном шаге сервис должен определять:

- положения активных спутников;
- геометрическую видимость спутников с ground sites;
- доступные ISL;
- контакты спутник ↔ ground site;
- состояние сети в выбранный момент;
- спутники, обслуживающие выбранный наземный пункт;
- интервалы наличия связи и перерывов.

### 3.3. Маршрутизация и реакция на отказы

Для выбранного `client` нужно строить маршрут до доступного `gateway`:

```text
client → satellite → ... → satellite → gateway
```

Маршрут пересчитывается при:

- движении спутников;
- изменении конфигурации;
- отказе аппарата;
- outage gateway.

Если маршрута нет, интерфейс должен уметь объяснить причину:

1. у клиента нет видимого активного спутника;
2. видимый спутник есть, но межспутниковая сеть разорвана;
3. нет доступного контакта спутников со шлюзом;
4. gateway недоступен.

### 3.4. Сравнение вариантов

Нужно сравнивать **минимум два сохранённых варианта** по:

- availability;
- длительности перерывов;
- характеристикам маршрутов;
- изменённым параметрам конфигурации.

Обязательно рассмотреть:

- полную группировку;
- промежуточный этап развёртывания;
- сценарий отказов.

### 3.5. Работа с данными

Нужно:

- принимать дополнительные сценарии того же формата;
- применять изменения из UI;
- повторно рассчитывать;
- сохранять параметры;
- выгружать результат;
- показывать понятные ошибки для некорректного файла;
- иметь reset/re-run сценария.

**Важно:** жюри сможет загрузить дополнительный JSON того же формата. Нельзя строить core-логику на жёстко заданных `C65`, `S01`, 48 спутниках или конкретных названиях. Дефолтный датасет можно использовать для демо, но парсер/UI должны строиться из входного JSON.

---

## 4. Критерии оценки — что приоритетно

Всего 100 баллов.

### Отраслевые эксперты — 50

| Критерий | Баллы |
|---|---:|
| Проектирование и сравнение конфигураций | 15 |
| Анализ устойчивости | 10 |
| Обоснованность рекомендаций | 10 |
| Удобство использования | 10 |
| Презентация решения | 5 |

### Технические эксперты — 50

| Критерий | Баллы |
|---|---:|
| Корректность расчётов | 15 |
| Алгоритмы маршрутизации | 15 |
| Работа с входными данными | 10 |
| Качество кода | 5 |
| Документация и запуск | 5 |

### Практический вывод

Перед дополнительными AI/optimizer-фичами обязательно должны работать:

1. корректный импорт;
2. расчёт;
3. маршруты;
4. timeline;
5. отказ аппарата;
6. изменение stage / RAAN / phase;
7. сохранение вариантов;
8. compare;
9. экспорт;
10. обработка нового JSON.

---

## 5. Состав официального архива

```text
Расчетный модуль/
└── geometry.py

Данные/
├── 01_full_constellation.json
├── 02_first_launch.json
├── 03_satellite_outages.json
└── 04_link_range.json

Проектирование устойчивой спутниковой группировки — Постановка задачи.pdf
Проектирование устойчивой спутниковой группировки — Описание данных.pdf
Проектирование устойчивой спутниковой группировки — Критерии оценки.pdf
```

`geometry.py` — официальный расчётный модуль для координат и доступных контактов.

---

## 6. Официальная схема входного JSON

```ts
type Scenario = {
  schema_version: "cosmo-A-1.0"

  meta: {
    id: string
    title: string
  }

  environment: {
    altitude_km: number
    inclination_deg: number
    earth_angle0_deg: number
    horizon_s: number
    step_s: number
    min_elevation_deg: number
    isl_range_km: number
    target_availability: number
  }

  design: {
    launch_stage: 1 | 2 | 3

    planes: Array<{
      id: string
      raan_deg: number
      phase_deg: number
    }>

    satellites: Array<{
      id: string
      plane_id: string
      slot_deg: number
      launch_batch: 1 | 2 | 3
    }>
  }

  ground_sites: Array<{
    id: string
    name: string
    role: "client" | "gateway"
    lat_deg: number
    lon_deg: number
  }>

  failures: Array<{
    satellite_id: string
    start_s: number
    end_s: number
  }>

  gateway_outages: Array<{
    gateway_id: string
    start_s: number
    end_s: number
  }>
}
```

---

## 7. Базовый официальный сценарий

Source of truth:

```text
Данные/01_full_constellation.json
```

### Environment

```yaml
schema_version: cosmo-A-1.0

altitude_km: 550
inclination_deg: 87
earth_angle0_deg: 12

horizon_s: 86400
step_s: 120

min_elevation_deg: 10
isl_range_km: 3000

target_availability: 0.9
```

Расчётные отсчёты:

```text
0, 120, 240, ..., 86280 seconds
```

Всего:

```text
86400 / 120 = 720 временных шагов
```

Каждый отсчёт представляет интервал длиной 120 секунд.

---

## 8. Реальные наземные пункты

В официальных данных **один gateway**, а не два.

### Gateway

```yaml
id: G_MUR
name: Murmansk reference gateway (synthetic installation)
role: gateway
lat: 68.97
lon: 33.07
```

### Clients

```yaml
C65:
  name: Northern terminal 65
  lat: 65.0
  lon: 60.0

C70:
  name: Northern terminal 70
  lat: 70.0
  lon: 90.0

C72:
  name: Northern terminal 72
  lat: 72.0
  lon: 130.0
```

Во фронте дефолтный экран должен показывать именно:

```text
◆ G_MUR    Gateway
▲ C65      Client
▲ C70      Client
▲ C72      Client
```

Не использовать выдуманные `GW-1`, `GW-2` как реальные данные кейса.

---

## 9. Реальные орбитальные плоскости

```text
P1
RAAN: 0°
Phase: 0°

P2
RAAN: 60°
Phase: 7.5°

P3
RAAN: 120°
Phase: 15°
```

Не использовать старый mock `0 / 120 / 240`.

### Распределение спутников

```text
P1: S01–S16
launch_batch = 1

P2: S17–S32
launch_batch = 2

P3: S33–S48
launch_batch = 3
```

В каждой плоскости 16 аппаратов.

`slot_deg`:

```text
0
22.5
45
67.5
90
112.5
135
157.5
180
202.5
225
247.5
270
292.5
315
337.5
```

---

## 10. Логика launch stage

Спутник участвует в сети, если:

```text
satellite.launch_batch <= design.launch_stage
```

и он не находится в интервале отказа.

Таким образом:

```text
launch_stage = 1 → 16 активируемых спутников
launch_stage = 2 → 32
launch_stage = 3 → 48
```

---

## 11. Официальные тестовые сценарии

### 01_full_constellation.json

Полная группировка:

- stage 3;
- 48 спутников;
- ISL range 3000 км;
- отказов нет.

### 02_first_launch.json

Первая очередь:

- `launch_stage = 1`;
- фактически участвуют первые 16 аппаратов.

### 03_satellite_outages.json

С 6-го часа (`21600 s`) до конца расчёта недоступны 10 аппаратов:

```text
S31
S14
S48
S16
S26
S15
S08
S05
S32
S34
```

Интервал каждого отказа:

```text
[21600, 86400)
```

### 04_link_range.json

Полная группировка, но:

```text
isl_range_km = 2000
```

вместо baseline 3000 км.

---

## 12. geometry.py — что он делает

Официальный модуль предоставляет:

```py
load(path)
validate(scenario)
positions(scenario, t_s)
snapshot(scenario, t_s)
sunlight(...)
```

Основная для проекта функция:

```py
snapshot(scenario, t_s)
```

возвращает примерно:

```ts
{
  t_s: number,

  satellites: Array<{
    id: string
    x_km: number
    y_km: number
    z_km: number
    active: boolean
  }>,

  edges: Array<
    [nodeA: string, nodeB: string, distanceKm: number]
  >,

  elevation_deg: Record<
    groundSiteId,
    Record<satelliteId, number>
  >
}
```

### Важно

`geometry.py`:

- считает положения;
- активность;
- наземную видимость;
- ISL;
- контакты ground ↔ satellite.

Он **не реализует**:

- маршрутизацию;
- сохранение вариантов;
- comparison;
- optimizer;
- UI.

Это часть нашего решения.

---

## 13. Правила геометрии

Модель использует:

- сферическую Землю;
- круговые орбиты;
- `R = 6371 km`;
- `μ = 398600.435507 km³/s²`;
- сидерический период вращения Земли `86164.09054 s`.

Наземный контакт допустим, когда:

```text
elevation >= min_elevation_deg
```

В baseline:

```text
min_elevation_deg = 10°
```

ISL допустим, если:

1. оба спутника активны;
2. расстояние между ними меньше `isl_range_km`;
3. отрезок связи не пересекает Землю.

Все контакты двунаправленные.

Недоступный спутник сохраняет своё расчётное положение, но исключается из связей.

---

## 14. Маршрутизация

Маршрут:

```text
client → satellite → satellite → ... → gateway
```

Ground clients нельзя использовать как промежуточные ретрансляторы.

### Рекомендуемый MVP-алгоритм

Для существования маршрута и минимального числа hops достаточно BFS по текущему графу.

Псевдологика:

```text
build graph from snapshot.edges

start = selected client
targets = all available gateways

allowed intermediate nodes:
  satellites only

BFS until gateway found
```

Если хочется оптимизировать distance / latency — можно перейти на Dijkstra, но это не обязательное требование.

### Детерминированность

Если несколько shortest paths равнозначны, сортировать соседей по ID перед обходом, чтобы один сценарий давал воспроизводимый путь.

---

## 15. Причина отсутствия маршрута

Нужно классифицировать outage понятным текстом.

Рекомендуемая последовательность:

```text
1. Is gateway itself in gateway_outage?
   → GATEWAY_UNAVAILABLE

2. Does client have at least one active visible satellite?
   → if no: NO_VISIBLE_SATELLITE

3. Does any active satellite have ground contact with an available gateway?
   → if no: NO_GATEWAY_CONTACT

4. Otherwise:
   → NETWORK_PARTITION
```

UI labels:

```text
No visible satellite
Inter-satellite network partition
No satellite-to-gateway contact
Gateway unavailable
```

---

## 16. Официальные показатели результата

Для каждого `client` необходимо рассчитывать:

### Visibility

Доля шагов, когда виден хотя бы один активный спутник.

### Availability

Доля шагов, когда существует полный путь:

```text
client → satellite(s) → gateway
```

### Maximum outage

Самая длинная последовательность шагов без маршрута:

```text
maxConsecutiveMissingSteps * step_s
```

Перерывы в начале и конце периода учитываются.

### Route hops

Число рёбер маршрута.

Включает:

- client → satellite;
- ISL;
- satellite → gateway.

Если пути нет — hops отсутствует.

---

## 17. Реальные reference-метрики, пересчитанные через geometry.py

Ниже не mock. Эти числа были независимо получены на официальном `geometry.py` с BFS shortest-hop routing.

Округление отображения во фронте можно делать до 1 десятичного знака.

### 01_full_constellation.json

| Client | Visibility | Availability | Max outage |
|---|---:|---:|---:|
| C65 | 97.778% | **96.667%** | **8 min** |
| C70 | 99.861% | **98.750%** | **2 min** |
| C72 | 100.000% | **98.889%** | **2 min** |

Target 90% выполнен для всех трёх.

Среднее число hops при наличии пути:

```text
C65 ≈ 2.287
C70 ≈ 2.655
C72 ≈ 3.153
```

### 02_first_launch.json

| Client | Visibility | Availability | Max outage |
|---|---:|---:|---:|
| C65 | 38.194% | **27.222%** | **572 min** |
| C70 | 48.750% | **15.833%** | **658 min** |
| C72 | 58.472% | **12.639%** | **796 min** |

Stage 1 очень далеко от target 90%.

Это сильный comparison для питча:

```text
Stage 1 → Full constellation
```

### 03_satellite_outages.json

| Client | Visibility | Availability | Max outage |
|---|---:|---:|---:|
| C65 | 84.583% | **79.306%** | **24 min** |
| C70 | 90.278% | **80.833%** | **24 min** |
| C72 | 93.056% | **82.500%** | **20 min** |

Все клиенты падают ниже target после сценария отказов.

### 04_link_range.json

| Client | Visibility | Availability | Max outage |
|---|---:|---:|---:|
| C65 | 97.778% | **77.500%** | **94 min** |
| C70 | 99.861% | **62.222%** | **178 min** |
| C72 | 100.000% | **65.139%** | **4 min** |

Очень хороший пример тезиса:

> Геометрическая видимость спутников почти не меняется, но из-за недостаточной дальности ISL рушится сквозная достижимость до gateway.

### Важное замечание по маршрутам

Availability зависит от существования пути и не зависит от tie-break между несколькими равными shortest paths.

Конкретная последовательность спутников может меняться в зависимости от порядка обхода графа.

---

## 18. Примеры реальных маршрутов baseline

При deterministic BFS возможны, например:

### t = 0

```text
C65 → S20 → G_MUR
C70 → S20 → G_MUR
C72 → S35 → S20 → G_MUR
```

### t = 21600 (06:00)

```text
C65 → S39 → G_MUR
C70 → S09 → G_MUR
C72 → S25 → S09 → G_MUR
```

### t = 64800 (18:00), baseline

```text
C65 → S15 → S16 → S48 → G_MUR
C70 → S15 → S16 → S48 → G_MUR
C72 → S16 → S48 → G_MUR
```

В официальном outage-сценарии `S15`, `S16`, `S48` в это время отключены, и в районе этого момента могут исчезать маршруты полностью.

---

## 19. Официальный формат выгрузки результата

Результат должен содержать:

```json
{
  "schema_version": "cosmo-A-result-1.0",
  "effective_scenario": {},
  "routes": []
}
```

Для каждой пары:

```text
(time step, client)
```

должна присутствовать одна route-запись:

```json
{
  "t_s": 120,
  "client_id": "C65",
  "path": ["C65", "S20", "G_MUR"]
}
```

Если маршрута нет:

```json
{
  "t_s": 120,
  "client_id": "C65",
  "path": []
}
```

Можно добавлять summary/пояснения, но обязательное ядро сохранять.

---

# PRODUCT / FRONTEND CONTEXT

## 20. Как мы видим продукт

Интерфейс должен ощущаться как:

```text
Mission Control × Grafana × engineering CAD
```

Не как:

- SaaS landing;
- маркетинговый сайт;
- «космический» UI с фиолетовыми градиентами;
- dashboard из случайных карточек.

Главный экран — инженерный workspace.

---

## 21. Три основных раздела

Основные tabs:

```text
Simulation
Resilience
Compare
```

`Simulation` и `Compare` закрывают обязательные сценарии.

`Resilience` — наша продуктовая надстройка для более сильного анализа устойчивости.

Не делать отдельные:

- Login;
- Registration;
- Profile;
- Billing;
- Pricing;
- About.

Для хакатона они не дают ценности.

---

## 22. Основной layout Simulation

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Project / Scenario      Simulation  Resilience  Compare      Import/Export │
├──────────────────┬───────────────────────────────────────┬─────────────────┤
│ CONFIGURATION    │                                       │ NETWORK HEALTH  │
│                  │                                       │                 │
│ Deployment       │                                       │ C65  96.7%      │
│ Stage 1/2/3      │              3D GLOBE                 │ C70  98.8%      │
│                  │                                       │ C72  98.9%      │
│ Plane P1         │      satellites / links / route       │                 │
│ RAAN / Phase     │                                       │ Target ≥ 90%    │
│                  │                                       │                 │
│ Plane P2         │                                       │ Max outage      │
│ Plane P3         │                                       │                 │
│                  │                                       │ Current route   │
│ Failures         │                                       │                 │
│                  │                                       │ Outage reason   │
│ [Run]            │                                       │                 │
├──────────────────┴───────────────────────────────────────┴─────────────────┤
│ Client [C65 ▼]  00:00 ━━━ available ━━━ outage ━━━━━━━━ 24:00           │
│                      ▲ current time       ▶ play x1/x4/x16               │
└────────────────────────────────────────────────────────────────────────────┘
```

Desktop-first:

```text
1440×900
1920×1080
```

---

## 23. Globe — главный визуальный объект

Показывать:

- Earth;
- активные спутники;
- неактивные/failed спутники;
- орбитальные плоскости;
- clients;
- gateway;
- ISL;
- ground contacts;
- selected route.

### Важно не создать «паутину»

Default:

```text
satellites        visible
orbit lines       low opacity
all ISL           ~10–20% opacity
ground links      low opacity / optionally hidden
active route      100% + glow
```

После выбора клиента:

- неактивные для current route связи приглушить;
- current route выделить;
- остальные спутники оставить видимыми, но вторичными.

### IDs

Использовать реальные:

```text
S01, S02, ...
P1, P2, P3
G_MUR
C65, C70, C72
```

Не `SAT-17`, если UI работает с официальным сценарием.

---

## 24. Преобразование координат для globe

`geometry.py` отдаёт Earth-fixed:

```text
x_km, y_km, z_km
```

Для globe:

```ts
lon = atan2(y, x)
lat = atan2(z, sqrt(x*x + y*y))
```

перевести радианы в градусы.

Altitude можно показывать как фиксированные 550 км или нормализовать под конкретную библиотеку globe.

---

## 25. Configuration panel

### Deployment

```text
Deployment Stage

1 — 16 satellites
2 — 32 satellites
3 — 48 satellites
```

### Orbital planes

Для каждой плоскости:

```text
P1

RAAN
[ 0° ]

Phase
[ 0° ]
```

и аналогично P2/P3.

Значения должны строиться динамически из `design.planes`.

### Network

Показывать как минимум:

```text
Altitude
Inclination
Min elevation
ISL range
Target availability
```

Не обязательно давать менять все эти поля, если не успеваем, но отображать используемые параметры полезно для воспроизводимости.

### Failures

Добавление:

```text
Satellite: [Sxx]
Start:     [HH:MM / seconds]
End:       [HH:MM / seconds]
```

Нужна возможность удалить событие.

---

## 26. Network Health panel

Для каждого client:

```text
C65

96.7%
Target ≥ 90%
```

Цветовая логика:

```text
>= target      success
near target    warning
below target   danger
```

Также:

- current route;
- hops;
- max outage;
- route status;
- outage reason.

Не показывать fake «criticality 93» как реальную метрику, пока алгоритм не реализован.

---

## 27. Timeline

Timeline — обязательная часть UX и один из критериев оценки.

Для выбранного клиента:

```text
00:00                                            24:00
━━━━━━━━━ available ━━━ outage ━━━━━━━━━━━━━━━━━━━━━
                         ▲
                       06:42
```

Функции:

- клик/drag → смена `t_s`;
- current snapshot обновляет globe;
- зелёные/красные intervals;
- dropdown клиента;
- Play;
- x1/x4/x16.

Каждый sample относится к интервалу:

```text
[t_s, t_s + step_s)
```

---

## 28. Satellite details drawer

При клике на спутник:

```text
S17

Plane: P2
Launch batch: 2
Slot: 0°
Status: Active / Failed

Current contacts:
Sxx
Syy
...

Used by selected route: yes/no

[Simulate failure]
```

`Criticality` добавлять только после реализации реального анализа.

---

## 29. Resilience tab

Цель — объяснить, **какие элементы сети создают уязвимость и почему**.

Пример layout:

```text
┌─────────────────────────────────────┬──────────────────────────────┐
│ GLOBE / NETWORK RISK MAP            │ CRITICAL NODES              │
│                                     │                              │
│ highlighted vulnerable satellites   │ Sxx                         │
│                                     │ impact on availability       │
└─────────────────────────────────────┴──────────────────────────────┘

IMPACT ANALYSIS
availability before/after failure
max outage before/after
affected clients
```

Это дополнительная feature, но хорошо закрывает критерий «Анализ устойчивости».

---

## 30. Как считать critical nodes — предлагаемая логика

Это **не официальный алгоритм**, а наша продуктовая надстройка.

Для каждого спутника:

1. взять baseline scenario;
2. временно сделать satellite unavailable на всём периоде или заданном окне;
3. пересчитать metrics;
4. сравнить с baseline.

Можно хранить:

```ts
type NodeImpact = {
  satelliteId: string
  availabilityDropByClient: Record<string, number>
  worstAvailabilityDrop: number
  maxOutageIncreaseSec: number
  affectedSamples: number
}
```

Для ранжирования можно использовать либо понятный lexicographic sort, либо score.

Лучше не показывать score типа `93/100`, если нельзя объяснить формулу.

Вместо этого в MVP можно показывать:

```text
S17

Worst availability impact: -8.4 pp
Max outage increase: +18 min
Affected clients: 3
```

Это более честно и объяснимо.

---

## 31. Compare tab

Это обязательный и очень важный экран.

Выбор:

```text
Variant A: Baseline
Variant B: Stage 1 / Failures / Modified RAAN / Saved Variant
```

Показывать:

| Metric | A | B | Delta |
|---|---:|---:|---:|
| C65 availability | ... | ... | ... |
| C70 availability | ... | ... | ... |
| C72 availability | ... | ... | ... |
| Max outage | ... | ... | ... |
| Avg hops | ... | ... | ... |

Также:

### 24h availability timeline

Две строки:

```text
A  ━ available ━ outage ━ ...
B  ━━━━━━━━━ available ━ ...
```

### Changed parameters

Например:

```text
launch_stage: 3 → 1
P2 RAAN:      60° → 75°
P3 Phase:     15° → 25°
ISL range:    3000 → 2000 km
```

Жюри должно сразу понимать, **что изменили и что это дало**.

---

## 32. Optimization — optional / bonus

В официальном кейсе автоматический подбор конфигурации — дополнительная feature.

Нельзя делать optimizer ценой обязательной функциональности.

Если реализуем:

### Inputs

- RAAN;
- phase;
- возможно launch stage как constraint.

### Objective

Лучше использовать понятную цель:

1. максимизировать **minimum availability across clients**;
2. затем максимизировать average availability;
3. затем минимизировать worst max outage;
4. затем минимизировать route complexity.

То есть избегать оптимизации только среднего значения, когда один client может провалиться.

### MVP search

Подойдёт:

- coarse grid;
- random search;
- local search;
- небольшое число candidate configurations.

Результат должен объяснять:

```text
что изменилось
→ какие метрики улучшились
→ почему рекомендуем вариант
```

---

## 33. Главный demo flow

### Flow A — обязательный, самый безопасный

```text
1. Load 01_full_constellation.json

2. Run
   C65 96.7%
   C70 98.8%
   C72 98.9%

3. Выбрать C65
   Перемотать timeline
   Показать текущий route

4. Переключить launch_stage 3 → 1
   Run

5. Compare
   Full vs Stage 1

6. Показать огромный спад availability
```

Это использует официальный dataset и отлично демонстрирует смысл проекта.

### Flow B — отказ

```text
1. Baseline
2. Выбрать спутник текущего route
3. Add failure для периода
4. Run
5. Route меняется или исчезает
6. Timeline показывает outage
7. UI объясняет причину
8. Compare before/after
```

### Flow C — официальный outage scenario

Загрузить:

```text
03_satellite_outages.json
```

и показать:

```text
C65 ~79.3%
C70 ~80.8%
C72 ~82.5%
```

вместо target 90%.

### Flow D — сеть видна, но не связна

Загрузить:

```text
04_link_range.json
```

Очень сильная демонстрация:

```text
Visibility C70 ≈ 99.9%
Availability C70 ≈ 62.2%
```

То есть «спутник виден» ≠ «маршрут до gateway существует».

---

## 34. Старые mock-значения — НЕ считать истиной

В первом UI-прототипе использовались для демонстрации значения вроде:

```text
Max outage = 14 min
Criticality = 93/100
Optimized availability = 98.1%
Critical satellites = 5 → 2
```

Это были **визуальные mock values**.

Их нельзя смешивать с реальными результатами.

Реальный baseline max outage по нашему BFS:

```text
C65 = 8 min
C70 = 2 min
C72 = 2 min
```

Реальный optimizer пока не рассчитан.

Реальная criticality-модель пока не определена.

---

## 35. UI visual direction

Working aesthetic:

```text
Mission Control
Grafana
Linear
Engineering CAD
```

### Theme

- dark;
- almost-black background;
- restrained cards;
- thin borders;
- cyan/blue main accent;
- green success;
- amber warning;
- red failure.

Не использовать слишком много:

- glow;
- neon;
- decorative stars;
- purple gradients;
- flying particles.

### Typography

Подойдут:

```text
Inter
Geist
system sans
```

Section labels:

```text
NETWORK HEALTH
ORBITAL PLANES
FAILURES
```

маленьким uppercase.

Числа metrics — крупнее текста.

---

## 36. Existing frontend prototype

Пользователь уже сделал визуальный prototype в Google AI Studio:

```text
https://ai.studio/apps/7790de97-f572-4a45-85f5-b32be7e19352
```

Если агент имеет доступ к проекту/исходникам:

- сначала изучить существующую реализацию;
- не переписывать всё с нуля без причины;
- привести mock-данные к официальному JSON;
- заменить выдуманные gateways/plane values;
- сохранить удачные визуальные решения.

Если доступ к AI Studio app отсутствует — этот Markdown является достаточным продуктовым handoff.

---

## 37. Working name

В раннем прототипе использовалось:

```text
OrbitGuard
```

Это рабочее название, не финальное.

Лучше не зашивать его глубоко в код.

Вариант:

```text
AstraMesh
Satellite Constellation Resilience Platform
```

Но финальный нейминг пока не выбран.

---

# TECHNICAL ARCHITECTURE

## 38. Рекомендуемый стек frontend

Если проект создаётся/рефакторится на привычном стеке:

```text
React
TypeScript
Vite
TailwindCSS
shadcn/ui
Recharts
Framer Motion
react-globe.gl / Three.js
```

Использовать существующий stack проекта, если он уже отличается и работает.

---

## 39. Рекомендуемое разделение frontend

Примерно:

```text
src/
  app/
    App.tsx
    routes.ts

  domain/
    scenario.ts
    simulation.ts
    comparison.ts

  features/
    scenario-import/
    scenario-editor/
    simulation/
    timeline/
    routing/
    failures/
    comparison/
    resilience/

  components/
    globe/
    metrics/
    layout/
    ui/

  lib/
    api/
    formatting/
    time/

  mocks/
```

Не смешивать:

- rendering globe;
- scenario editing;
- calculation model;
- API transport;
- mock state

в одном компоненте.

---

## 40. Backend / calculation boundary

Production/full hackathon version:

```text
Frontend
   ↓ scenario JSON / user edits
Backend
   ↓
geometry.py
   ↓
snapshot for each t
   ↓
routing
   ↓
metrics
   ↓
summary + snapshots + routes
   ↓
Frontend
```

Frontend не должен самостоятельно изобретать орбитальную физику, если backend использует официальный `geometry.py`.

---

## 41. Предлагаемый API контракт

Это **наша предлагаемая архитектура**, не официальный формат.

### Validate scenario

```http
POST /api/scenarios/validate
```

Body:

```json
{ "...scenario": "..." }
```

Response:

```json
{
  "valid": true,
  "errors": []
}
```

### Run simulation

```http
POST /api/simulations
```

Response:

```json
{
  "id": "sim_123",
  "status": "completed"
}
```

### Summary

```http
GET /api/simulations/:id/summary
```

```ts
type Summary = {
  scenario: Scenario

  clients: Array<{
    id: string
    visibility: number
    availability: number
    maxOutageS: number
    avgHops: number | null
  }>

  targetAvailability: number
}
```

### Snapshot

```http
GET /api/simulations/:id/snapshot?t_s=21600
```

```ts
type Snapshot = {
  t_s: number

  satellites: Array<{
    id: string
    x_km: number
    y_km: number
    z_km: number
    active: boolean
  }>

  edges: Array<{
    source: string
    target: string
    distanceKm: number
    type: "isl" | "ground"
  }>

  routes: Record<string, {
    path: string[]
    status:
      | "available"
      | "no_visible_satellite"
      | "network_partition"
      | "no_gateway_contact"
      | "gateway_unavailable"
  }>
}
```

### Compare

```http
POST /api/comparisons
```

with two simulation/variant IDs.

### Export

```http
GET /api/simulations/:id/export
```

должен выдавать официальный `cosmo-A-result-1.0`.

---

## 42. Frontend-only prototype mode

Пока backend не подключён, frontend может использовать mocks, но mocks должны:

- повторять официальную структуру;
- использовать реальные IDs;
- использовать реальные baseline metrics;
- явно отделять demo-only optimizer/criticality data.

Нельзя плодить типы, несовместимые с будущим API.

---

## 43. Input validation

Официальный `geometry.validate()` уже проверяет:

- `schema_version`;
- finite numbers;
- altitude;
- inclination;
- integer time grid;
- `horizon_s % step_s == 0`;
- elevation;
- ISL range;
- target availability;
- unique plane IDs;
- angle ranges;
- unique satellite IDs;
- launch stage;
- valid plane references;
- launch batch;
- ground IDs;
- наличие client и gateway;
- coordinates;
- failure satellite references;
- gateway outage references;
- outage intervals.

UI должен показывать понятную ошибку уровня:

```text
Invalid scenario

design.satellites[12].plane_id:
Plane "P9" does not exist
```

а не просто:

```text
400 Bad Request
```

---

## 44. State model frontend

Полезно различать:

```ts
loadedScenario
workingScenario
lastSimulation
savedVariants
selectedVariant
selectedClient
selectedTimeS
selectedSatellite
```

Редактирование формы не должно автоматически портить результат предыдущего run.

Логика:

```text
loaded/saved variant
→ edit working copy
→ Run
→ result belongs to exact effective scenario
→ optionally Save Variant
```

---

## 45. Saved variant

Минимальная структура:

```ts
type Variant = {
  id: string
  name: string
  scenario: Scenario
  simulationId?: string
  createdAt: string
}
```

Пользователь должен иметь возможность:

```text
Duplicate
Rename
Run
Compare
Delete
Export scenario
```

Для MVP можно упростить до:

```text
Save current variant
Compare with...
```

---

## 46. Performance

Всего baseline:

```text
720 time steps
48 satellites
4 ground sites
```

Это небольшой объём для backend precompute.

Рекомендуется:

- backend считать все 720 шагов;
- хранить summary/routes;
- frontend не тащить одновременно тяжёлую геометрию всех кадров, если globe тормозит;
- загружать current snapshot по индексу либо компактный precomputed payload.

Для hackathon можно вернуть все snapshots сразу, если размер приемлем и UX быстрее реализовать.

---

## 47. Что агент не должен делать

Не надо:

- делать login/registration;
- строить billing/profile;
- тратить время на landing page;
- считать старые mock-значения официальными;
- добавлять второй gateway в baseline;
- использовать RAAN 0/120/240 вместо 0/60/120;
- hardcode UI исключительно под C65/C70/C72;
- считать satellite visibility эквивалентом network availability;
- позволять client ground sites выступать relay nodes;
- забывать о gateway outage;
- забывать export;
- скрывать, какие параметры использовались в расчёте;
- оптимизировать только красивый globe, забыв про compare и маршрутизацию.

---

# PRIORITY PLAN

## 48. P0 — must have

1. Import JSON.
2. Parse/validate.
3. Official baseline scenario.
4. Simulation for 720 steps.
5. Routing per client/time.
6. Availability.
7. Visibility.
8. Max outage.
9. Globe/map current snapshot.
10. Timeline.
11. Current route.
12. Outage reason.
13. launch_stage editing.
14. RAAN/phase editing.
15. satellite failure editing.
16. Re-run.
17. Save variant.
18. Compare two variants.
19. Export scenario/result.
20. Error UI.

---

## 49. P1 — strongly recommended

1. Polished Mission Control UI.
2. Route highlighting.
3. Play timeline.
4. Before/after delta visualization.
5. Official preset scenarios menu.
6. Resilience analysis.
7. Node impact calculation.
8. Deterministic routing.
9. Charts of availability over 24h.

---

## 50. P2 — bonus

1. Automatic optimizer.
2. Vulnerability heatmap.
3. Backup route analysis.
4. Alternative routing strategies.
5. Recommendation explanation.
6. Scenario presets/custom saved library.

---

# DEFINITION OF DONE

## 51. Минимальная полноценная демонстрация

Эксперт должен без разработчика суметь:

```text
1. Загрузить 01_full_constellation.json.
2. Запустить расчёт.
3. Увидеть 3 clients + gateway + satellites.
4. Выбрать client.
5. Перемотать timeline.
6. Увидеть его текущий route.
7. Увидеть availability и max outage.
8. Переключить stage 3 → stage 1.
9. Пересчитать.
10. Сохранить вариант.
11. Сравнить stage 1 vs full.
12. Добавить отказ спутника.
13. Пересчитать.
14. Понять, почему route изменился/исчез.
15. Выгрузить изменённый сценарий/результат.
16. Загрузить его обратно.
```

Если это работает стабильно — большая часть официального кейса закрыта.

---

## 52. Recommended five-minute pitch

### 0:00–0:30 — проблема

```text
Видимый спутник ещё не означает связь:
данные должны пройти через динамическую сеть до gateway.
```

### 0:30–1:30 — baseline

- Full constellation.
- 3 clients.
- Target 90%.
- Все проходят target.
- Показать текущий маршрут.

### 1:30–2:30 — early deployment

- Stage 3 → Stage 1.
- Availability резко падает.
- Compare.

### 2:30–3:30 — failure

- Добавить отказ спутника текущего route или открыть official outages preset.
- Пересчитать.
- Timeline/outage reason.

### 3:30–4:20 — resilience / recommendation

- Показать vulnerable nodes или влияние параметра.
- Обосновать рекомендацию цифрами.

### 4:20–5:00 — итог

- Compare.
- Import/export.
- Подчеркнуть поддержку arbitrary compatible scenario.

---

# FINAL PRODUCT PRINCIPLE

## 53. Что пользователь должен понять за 20 секунд

```text
I have a constellation
        ↓
I simulate it over time
        ↓
I see whether each client can reach the gateway
        ↓
I change deployment/orbits/failures
        ↓
I see what breaks and why
        ↓
I compare variants
        ↓
I choose and justify a more resilient configuration
```

---

## 54. Самая важная мысль для агента

Не строить «красивую анимацию спутников».

Строить **инструмент принятия инженерного решения**.

Главный цикл продукта:

```text
CONFIGURE
   ↓
SIMULATE
   ↓
DIAGNOSE
   ↓
COMPARE
   ↓
RECOMMEND
```

Любая feature должна усиливать хотя бы один шаг этого цикла.
