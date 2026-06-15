import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Локаль для форматирования дат (ru_RU).
  await initializeDateFormatting('ru', null);
  runApp(const ProviderScope(child: StaffSwipeApp()));
}
