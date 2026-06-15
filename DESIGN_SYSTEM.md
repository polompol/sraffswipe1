# 🎨 Design System — StaffSwipe

Дизайн-система вдохновлена **shadcn/ui** и **iOS Human Interface Guidelines**.  
Тема оптимизирована для мобильных устройств с акцентом на доступность и производительность.

---

## 🎯 Принципы дизайна

1. **Минимализм** — только необходимые элементы
2. **Контрастность** — удобно читать на солнце
3. **Дружелюбие** — теплые цвета, круглые углы
4. **Производительность** — анимации 60fps на старых устройствах
5. **Доступность** — поддержка темной темы, увеличенный шрифт

---

## 🎨 Цветовая палитра

### Основные цвета

| Цвет | Hex | Использование |
|------|-----|---|
| **Primary** (Оранжевый) | `#FF6B35` | Лайк, кнопки, акценты, ссылки |
| **Secondary** (Красный) | `#F72585` | Супер-лайк, критичные действия, внимание |
| **Success** (Зелёный) | `#10B981` | Подтверждение, статус "выполнено" |
| **Warning** (Жёлтый) | `#F59E0B` | Предупреждения, ожидание |
| **Info** (Голубой) | `#06B6D4` | Информация, верификация |
| **Danger** (Красный) | `#EF4444` | Ошибки, удаление |

### Нейтральные цвета

| Элемент | Light Mode | Dark Mode |
|---------|-----------|----------|
| **Background** | `#FFFFFF` | `#0F172A` |
| **Surface** | `#F9FAFB` | `#1E293B` |
| **Card** | `#FFFFFF` | `#1E293B` |
| **Border** | `#E5E7EB` | `#334155` |
| **Text** | `#1F2937` | `#F1F5F9` |
| **Muted** | `#9CA3AF` | `#94A3B8` |

### Статусы свайпов

| Статус | Цвет | Иконка | Точка |
|--------|------|--------|-------|
| **Лайк** | `#10B981` (зелёный) | ❤️ | Сердце |
| **Супер-лайк** | `#F72585` (розовый) | ⚡ | Звёзды |
| **Пропуск** | `#9CA3AF` (серый) | ✕ | Крест |
| **Мэтч** | `#FF6B35` (оранжевый) | 🔥 | Огонь |

---

## 📏 Типографика

### Семейства шрифтов

```dart
// Заголовки (Fraunces) — serif, запоминаемость
displaySmall: Fraunces(fontWeight: 800, fontSize: 32)
headlineMedium: Fraunces(fontWeight: 800, fontSize: 27)
titleLarge: Inter(fontWeight: 700, fontSize: 20)

// Основной текст (Inter) — читаемость
bodyLarge: Inter(fontSize: 16, height: 1.4)
bodyMedium: Inter(fontSize: 14, height: 1.4)
bodySmall: Inter(fontSize: 12.5, color: muted, height: 1.35)

// Лейблы и кнопки
labelLarge: Inter(fontWeight: 600, fontSize: 14)
```

### Размеры шрифтов

| Уровень | Размер | Вес | Использование |
|---------|--------|-----|---|
| **Display** | 32px | 800 | Крупные заголовки (редко) |
| **Headline** | 27px | 800 | Заголовки экранов |
| **Title Large** | 20px | 700 | Подзаголовки |
| **Title Medium** | 16px | 600 | Заголовки карточек |
| **Body Large** | 16px | 400 | Основной текст, кнопки |
| **Body Medium** | 14px | 400 | Вторичный текст |
| **Body Small** | 12.5px | 400 | Подсказки, ��етаинформация |
| **Label** | 12px | 600 | Теги, чипсы |

---

## 🔲 Радиус скругления

```dart
radius: 16,          // Карточки, модальные окна
radiusSm: 12,        // Кнопки, поля ввода, чипсы
radiusLg: 24,        // Крупные блоки (редко)
radiusCircle: 999,   // Аватары, чипсы
```

---

## 🎬 Анимации

### Длительность

| Тип | Длительность | Назначение |
|-----|---------|---|
| **Instant** | 0ms | Без задержки (редко) |
| **Fast** | 150ms | Быстрые интерации (нажатие кнопки) |
| **Normal** | 300ms | Стандартные переходы |
| **Slow** | 500ms | Привлечение внимания (мэтч) |
| **Slowest** | 800ms | Длительные анимации |

### Примеры

```dart
// Свайп карточки
duration: Duration(milliseconds: 300),
curve: Curves.easeOut,

// Появление мэтча (салют + рукопожатие)
duration: Duration(milliseconds: 800),
curve: Curves.easeInOut,

// Ripple эффект на кнопке
splashFactory: InkSparkle.splashFactory,
```

---

## 📐 Отступы и р��сстояния

```dart
// Системные отступы (8dp сетка)
4, 8, 12, 16, 20, 24, 32, 40, 48

// Стандартные значения
padding: EdgeInsets.all(16),           // Внутри карточки
margin: EdgeInsets.symmetric(h: 16),   // Между блоками
```

---

## 🔘 Компоненты

### Button (FilledButton)

```dart
FilledButton(
  onPressed: () {},
  child: Text('Лайк'),  // 54px высота, 16px padding
)
```

**Стили**:
- **Primary** (Filled) — основные действия, оранжевый фон
- **Secondary** (Outlined) — вторичные действия, только бордер
- **Tertiary** (Text) — низкий приоритет, только текст

### Card

```dart
Card(
  color: cardColor,
  shape: RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(16),
    side: BorderSide(color: borderColor),
  ),
)
```

**Использование**: вакансии, карточки соискателей, мэтчи.

### Tag / Chip

```dart
Chip(
  label: Text('Официант'),
  avatar: Icon(Icons.work),
  backgroundColor: primary.withOpacity(0.12),
)
```

**Стили**:
- **Filled** — выбранные/активные теги
- **Outlined** — доступные для выбора

### Input Field

```dart
TextField(
  decoration: InputDecoration(
    filled: true,
    hintText: 'Введите текст',
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
    ),
  ),
)
```

**Состояния**: `enabled`, `focused`, `error`, `disabled`

---

## 🌙 Темная тема

### Отличия от светлой темы

| Элемент | Light | Dark |
|---------|-------|------|
| **Background** | `#FFFFFF` | `#0F172A` |
| **Surface** | `#F9FAFB` | `#1E293B` |
| **Text** | `#1F2937` | `#F1F5F9` |
| **Contrast ratio** | 4.5:1 | 7:1 |

**Активация**:
```dart
themeMode: ThemeMode.system,  // Следить за системой
// или
darkTheme: AppTheme.dark,
```

---

## ♿ Доступность

### Требования

- **Контрастность**: минимум 4.5:1 для текста
- **Размер текста**: поддержка системного масштаба (80%-200%)
- **Касание**: минимум 48x48 dp для кнопок
- **Навигация**: поддержка TalkBack (Android) и VoiceOver (iOS)

### Примеры

```dart
// Хороший контраст
Text('Ла��к', style: TextStyle(color: Colors.white), 
  // на фоне primary (#FF6B35)
)

// Адаптивный размер шрифта
Text('Title', style: Theme.of(context).textTheme.titleLarge)
// автоматически масштабируется с системой

// Минимальная область касания
Material(
  child: InkWell(
    onTap: () {},
    child: SizedBox(width: 48, height: 48, child: Icon(Icons.add)),
  ),
)

// Доступное описание
IconButton(
  tooltip: 'Лайк вакансию',  // видно при длительном нажатии
  icon: Icon(Icons.favorite),
)
```

---

## 🎯 Экраны и макеты

### Стандартные размеры

| Устройство | Ширина | Высота | Плотность |
|-----------|--------|--------|----------|
| **Телефон (мин)** | 360dp | 640dp | 1x-2x |
| **Телефон (норм)** | 412dp | 732dp | 2x-3x |
| **Планшет** | 600dp+ | 800dp+ | 2x |

### Стандартная высота элементов

| Элемент | Высота |
|---------|--------|
| AppBar | 56dp |
| ListTile | 56dp |
| Button | 54dp |
| Input Field | 50dp |
| BottomNavigationBar | 56dp |

---

## 🚀 Использование в коде

```dart
import 'package:staffswipe/core/theme/app_colors.dart';
import 'package:staffswipe/core/theme/app_theme.dart';

// В любом месте приложения
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.primary,  // Оранжевый
        borderRadius: BorderRadius.circular(AppTheme.radius),
      ),
      child: Text(
        'Лайк',
        style: Theme.of(context).textTheme.titleMedium,
      ),
    );
  }
}
```

---

**Дизайн-система готова к использованию во всех компонентах приложения!** 🎉
