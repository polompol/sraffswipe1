/// Конфигурация приложения из `--dart-define` (без хардкода ключей в коде).
///
/// Пример запуска с бэкендом:
/// ```
/// flutter run \
///   --dart-define=USE_BACKEND=true \
///   --dart-define=API_BASE_URL=http://10.0.2.2:8000
/// ```
class AppConfig {
  AppConfig._();

  /// Использовать реальный backend (иначе — mock-данные).
  static const bool useBackend =
      bool.fromEnvironment('USE_BACKEND', defaultValue: false);

  /// Базовый URL FastAPI-сервера.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );

  /// Токены интеграций (заполняются при сборке, не коммитятся).
  static const String yandexMapKitApiKey =
      String.fromEnvironment('YANDEX_MAPKIT_API_KEY', defaultValue: '');
  static const String dadataToken =
      String.fromEnvironment('DADATA_TOKEN', defaultValue: '');

  static bool get hasYandexMaps => yandexMapKitApiKey.isNotEmpty;
  static bool get hasDadata => dadataToken.isNotEmpty;
}
