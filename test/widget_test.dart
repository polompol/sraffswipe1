import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'package:staffswipe/app.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('ru', null);
  });

  testWidgets('Запуск показывает экран входа по телефону',
      (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: StaffSwipeApp()));
    await tester.pump();

    expect(find.text('Вход по телефону'), findsOneWidget);
    expect(find.text('Получить код'), findsOneWidget);
  });

  testWidgets('Кнопка получения кода активируется после ввода телефона',
      (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: StaffSwipeApp()));
    await tester.pump();

    await tester.enterText(find.byType(TextField), '+7 999 123 45 67');
    await tester.pump();

    final button = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(button.onPressed, isNotNull);
  });
}
