# StaffSwipe — Swipe UI V2

Цель: сделать два главных экрана продукта визуально сильнее, не переписывая рабочую swipe-механику и не придумывая данные, которых нет в API.

## 1. Принципы

1. **Карточка — главный объект экрана.** Она занимает максимум доступного пространства.
2. **Фото крупное и эмоциональное.** Для смены — заведение; для employer — человек.
3. **Информация читается слоями:** сначала фото + главный факт, затем дата/роль/доверие, затем детали.
4. **Одна primary CTA.** Второстепенное — спокойнее.
5. **Stack должен быть виден.** Следующая карточка выглядывает из-под текущей.
6. **Свайп остаётся физическим.** Right = positive, left = skip. Haptic и возврат карточки при ошибке сохраняются.
7. **Никаких fake metrics.** Показывать только то, что реально есть в `Vacancy` / `Seeker`.
8. **Дизайн-токены, dark mode, large mode и reduced motion обязательны.**

## 2. Базовый mobile frame

Design reference: 390 × 844 px.

- horizontal page padding: 16px;
- touch target: минимум 44px;
- swipe card radius: `--radius-lg` (24px);
- card shadow: design token / существующий `--shadow`;
- карточка должна занимать примерно 70–78% полезной высоты feed;
- card stack: 3 visible cards — уже реализовано в `SwipeDeck.tsx`.

Точные размеры в runtime не фиксировать жёсткими координатами: приложение должно работать на реальных Telegram viewport'ах. Таблица ниже — визуальный ориентир, а не повод заменить responsive CSS на absolute pixel layout.

## 3. Swipe смены — seeker

### Визуальная иерархия

1. Фото заведения.
2. Сумма за смену.
3. Название + verified.
4. Роль.
5. Дата/время.
6. Дистанция / срочность.
7. Рейтинг и закрытые смены, если есть.
8. Способ оплаты / медкнижка / места.
9. Подробнее.
10. Основное действие «Откликнуться».

### Reference grid 390×844

| Блок | X | Y | W | H |
| --- | ---: | ---: | ---: | ---: |
| Header | 16 | 22 | 358 | 42 |
| Main filters | 16 | 68 | 358 | ~44 |
| Back-card peek | 24 | ~116 | 342 | dynamic |
| Main card | 16 | ~106 | 358 | dynamic |
| Action area | 24 | dynamic | 342 | ~72 |
| Bottom nav | 0 | bottom | 390 | existing |

### Данные, которые уже можно использовать

Из текущего `Vacancy` / компонентов:

- `companyName`;
- `role`;
- `rate`, `rateType`, `estimatedPay()`;
- `date`, `startTime`, `endTime`;
- `distanceKm`;
- `interiorPhotoUrl`;
- `employerVerified`;
- `employerRating`;
- `employerShiftsDone`;
- `payMethod`;
- `requireMedBook`;
- `headcount`, `slotsLeft`;
- urgency через `isUrgentShift()`.

Не показывать как факт без нового backend field:

- «Ответ 5 минут»;
- live online;
- гарантированная выплата;
- ETA «выйдет через N минут».

### Текстовая модель карточки

Пример на реальных типах:

```text
[Сегодня]                         [1,2 км]

Bella Tavola ✓
Бариста
5 500 ₽ за смену

12 октября · 16:00–00:00
★ 4,8 · 12 смен закрыто

На карту · Медкнижка · свободно 2 из 4

Подробнее
```

Сумма должна быть визуально крупнее текущей обычной строки при наличии фото.

## 4. Swipe кандидата — employer

### Визуальная иерархия

1. Портрет.
2. Имя + возраст.
3. Основная роль.
4. Rating.
5. Reliability / история смен.
6. Available today.
7. Район.
8. Медкнижка.
9. Дополнительные роли / опыт.
10. Подробнее.
11. Основное действие «Позвать» / «Пригласить».

### Данные, которые уже можно использовать

Из текущего `Seeker` / компонентов:

- `name`;
- `age`;
- `roles`;
- `photoUrls`;
- `rating`;
- `availableToday`;
- `shiftsTotal`, `shiftsAttended`, `employersTotal` через `reliabilityText()`;
- `district`;
- `medBook`;
- `experienceTags`.

Не показывать без backend field:

- «может выйти через 2 часа»;
- exact response time;
- realtime online status;
- документ «подтверждён», если модель данных даёт только пользовательский статус без верификации.

### Текстовая модель карточки

```text
[★ 4,8]                    [Может сегодня]

Максим, 24
Повар
Надёжность: 96% / текущая формулировка reliabilityText()

Центральный район
Медкнижка: есть
Доп. роли: Бариста · Помощник повара

Подробнее
```

## 5. Action controls — фирменная система

Текущий продукт использует две основные действия под колодой. Не нужно добавлять третью CTA только ради макета: сохранение уже существует как bookmark на карточке.

### V2 layout

- Skip: компактная secondary action, примерно 56–64px, светлая / outline.
- Like: **одна крупная branded CTA**, вытянутая, crimson fill.
- Favorite: остаётся на карточке как 44×44 secondary control.

Тексты:

- seeker: `Пропустить` / `Откликнуться`;
- employer: `Не подходит` или `Пропустить` / `Позвать`.

В коде терминология должна совпадать с `aria-label`.

### Stamp language

Во время жеста можно использовать фирменный stamp overlay:

- seeker right: `ОТКЛИК` или `ГОТОВ К СМЕНЕ`;
- employer right: `ЗОВУ`;
- left: `МИМО` / `ПРОПУСТИТЬ`.

Не использовать romantic `LIKE`, heart-heavy copy или «любовные» формулировки.

## 6. Motion

Сохраняем существующую механику из `SwipeDeck.tsx`:

- drag follows finger;
- fling вправо/влево;
- rotation during fling;
- lower cards restack;
- haptic: light/medium;
- one-time nudge hint;
- server rejection returns the card;
- `prefers-reduced-motion` respected.

Допустимые улучшения без изменения смысла:

- slightly more visible stack offset;
- softer scale difference between cards;
- stamp opacity tied to drag distance;
- CTA press scale ~0.96–0.97;
- subtle image parallax only if reduced-motion fallback exists.

## 7. CSS direction

Менять через существующие classes/tokens, не через inline-палитру.

Ключевые классы:

- `.deck`;
- `.swipe-card`;
- `.swipe-photo`;
- `.swipe-shade`;
- `.swipe-top`;
- `.swipe-body`;
- `.swipe-title`;
- `.card-meta`;
- `.swipe-cond`;
- `.actions`;
- `.act`, `.act-skip`, `.act-like`;
- `.act-label`.

### Желательный эффект V2

- фото визуально доминирует;
- нижний gradient глубокий, но не превращает карточку в чёрный прямоугольник;
- pay/role/name получают display hierarchy;
- action row выглядит как фирменный элемент StaffSwipe;
- за карточкой явно видно следующую;
- на 320–430px ширины ничего не обрезается;
- large mode и short screen остаются функциональными.

## 8. Что менять в коде

Основные файлы:

### `tma/src/features/feed/Cards.tsx`

- Vacancy: сделать сумму за смену крупнее и заметнее также при наличии фото;
- Seeker: сделать основную роль явным визуальным подзаголовком, а дополнительные роли — secondary tags;
- сохранить доступность `DetailsButton` и `CardFavButton`;
- не возвращать длинные описания на лицевую сторону: детали уже есть на flip/sheet.

### `tma/src/features/feed/FeedPage.tsx`

- обновить action bar: secondary skip + более сильная primary positive CTA;
- тексты/aria-label должны зависеть от роли;
- не менять API вызов `controller.current?.("like" | "dislike")`.

### `tma/src/index.css`

- card depth, spacing, typography hierarchy;
- branded action bar;
- responsive short/large rules;
- dark mode consistency;
- focus-visible и 44px touch targets.

### `SwipeDeck.tsx`

Менять только если нужен визуальный stack/stamp motion. Не переписывать core behavior.

## 9. Acceptance criteria

### Visual

- [ ] Сумма смены читается за 1 секунду.
- [ ] Основная роль кандидата читается без открытия деталей.
- [ ] Следующая карточка видна краем.
- [ ] Primary positive CTA визуально сильнее skip.
- [ ] Favorite не конкурирует с positive CTA.
- [ ] Crimson/ivory/gold preserved.
- [ ] Нет синих/фиолетовых случайных акцентов.

### Product

- [ ] Seeker понимает сколько, когда, кем и где примерно.
- [ ] Employer понимает кто, кем готов работать и насколько надёжен.
- [ ] Нет данных, которых не существует в API.
- [ ] Match создаёт только server response.
- [ ] Employer без vacancy не может бессмысленно позвать человека.

### Accessibility

- [ ] Все действия доступны с клавиатуры.
- [ ] Touch targets ≥44px.
- [ ] `aria-label` соответствует видимому действию.
- [ ] Контраст не падает ниже проектных правил.
- [ ] Large mode работает.
- [ ] Reduced motion работает.

### Regression

```bash
cd tma
npm run lint
npx tsc --noEmit
npx vitest run
npm run build

cd ..
bash scripts/e2e.sh
```

## 10. Future fields — только отдельной задачей

Если позже нужны richer marketplace signals, сначала согласовать доменную модель. Возможные поля:

- median response time;
- last active / realtime presence;
- exact earliest arrival time;
- verified document status;
- venue response SLA;
- cancellation/no-show quality score.

Каждый такой field требует определения источника данных, privacy policy, anti-abuse правил, backend schema, migration, API, TS types, mock и tests. Не добавлять только ради красивого badge.
