# Проверка загрузки сценариев

Файлы для ручной проверки импорта JSON. Каждый сделан из официального
`data/01_full_constellation.json` с одним изменением, поэтому у каждого отчёта
одна очевидная причина. Загружать кнопкой **JSON** в шапке студии.

Пересоздать набор: `backend/.venv/bin/python examples/import-checks/generate.py`

## Должны загрузиться

| Файл | Что проверяет | Ожидаемо |
|---|---|---|
| `ok-01-other-sites-and-ids.json` | Другие id плоскостей и спутников, пять других пунктов, другой шлюз — как файл жюри | Загружен, считается (≈95–97 %) |
| `ok-02-two-days-20s-step.json` | Горизонт 48 ч с шагом 20 с = 8640 шагов, ровно на пределе | Загружен |
| `ok-03-empty-stage-warning.json` | `launch_stage: 1`, но ни одного спутника первой очереди | Загружен **с предупреждением**: доступность везде 0 % |
| `ok-04-outages-and-gateway.json` | Пересекающиеся отказы одного спутника и простой шлюза | Загружен |
| `ok-05-result-file.json` | Файл результата `cosmo-A-result-1.0`, выгруженный сервисом | Загружен сценарий из `effective_scenario`, отмечено «это был файл результата» |

## Должны быть отклонены с указанием поля

| Файл | Поле в отчёте | Причина |
|---|---|---|
| `bad-01-not-json.json` | — | Файл не является корректным JSON |
| `bad-02-list-not-object.json` | — | Корень — список, нужен объект |
| `bad-03-wrong-schema-version.json` | `schema_version` | Версия не поддерживается |
| `bad-04-no-meta.json` | `meta` | Нет обязательного раздела (раньше — ошибка 500) |
| `bad-05-no-step.json` | `environment.step_s` | Нет обязательного поля |
| `bad-06-step-with-decimal-point.json` | `environment.step_s` | `120.0` вместо целого `120` |
| `bad-07-horizon-not-multiple.json` | `environment.horizon_s` | Горизонт не делится на шаг |
| `bad-08-altitude-out-of-range.json` | `environment.altitude_km` | 100 вне диапазона [200; 1200] |
| `bad-09-number-as-string.json` | `environment.altitude_km` | Число записано строкой `"550"` |
| `bad-10-phase-out-of-range.json` | `design.planes[1].phase_deg` | −5 вне [0; 360) |
| `bad-11-duplicate-plane-id.json` | `design.planes[1].id` | Повтор id плоскости, без лавины ошибок по её спутникам |
| `bad-12-unknown-plane.json` | `design.satellites[12].plane_id` | Ссылка на несуществующую плоскость `P9` |
| `bad-13-duplicate-satellite-id.json` | `design.satellites[12].id` | Повтор id спутника |
| `bad-14-launch-batch-4.json` | `design.satellites[40].launch_batch` | Очередь 4, допустимы 1, 2, 3 |
| `bad-15-launch-stage-0.json` | `design.launch_stage` | Этап 0, допустимы 1, 2, 3 |
| `bad-16-latitude-95.json` | `ground_sites[2].lat_deg` | Широта вне [−90; 90] |
| `bad-17-unknown-role.json` | `ground_sites[2].role` | Роль `relay`, допустимы client и gateway |
| `bad-18-site-id-is-satellite-id.json` | `ground_sites[2].id` | id пункта совпадает с id спутника |
| `bad-19-no-gateway.json` | `ground_sites` | Нет ни одного шлюза |
| `bad-20-failure-unknown-satellite.json` | `failures[0].satellite_id` | Отказ несуществующего спутника |
| `bad-21-failure-past-horizon.json` | `failures[0].end_s` | Интервал выходит за период расчёта |
| `bad-22-failure-empty-interval.json` | `failures[0].end_s` | Интервал нулевой длины |
| `bad-23-gateway-outage-on-client.json` | `gateway_outages[0].gateway_id` | Простой назначен клиентскому пункту, а не шлюзу |
| `bad-24-too-many-steps.json` | `environment.step_s` | 17 280 шагов, предел 8640 |
| `bad-25-too-many-satellites.json` | `design.satellites` | 501 спутник, предел 500 |
| `bad-26-five-problems-at-once.json` | пять полей | Все пять ошибок в одном отчёте |
| `bad-27-sixty-problems.json` | 60 полей | Показаны первые 8 и «и ещё 52» |
| `bad-28-result-file-without-scenario.json` | `effective_scenario` | Файл результата без сценария |

## Что ещё проверить руками

- Переключить язык на английский: те же отчёты по-английски.
- Изменить плоскость или этап, выгрузить сценарий из панели выгрузки и загрузить
  его обратно — должен открыться с изменениями.
- Закрыть отчёт крестиком. Отчёт об успешной загрузке без предупреждений
  закрывается сам через 8 секунд.
