import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import 'api_client.dart';
import 'staffswipe_api.dart';

/// Singleton HTTP-клиента.
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

/// Типизированный API-клиент StaffSwipe.
final staffSwipeApiProvider = Provider<StaffSwipeApi>(
  (ref) => StaffSwipeApi(ref.watch(apiClientProvider)),
);

/// Флаг режима данных: backend или mock.
final useBackendProvider = Provider<bool>((ref) => AppConfig.useBackend);
