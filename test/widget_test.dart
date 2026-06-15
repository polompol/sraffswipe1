import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'package:staffswipe/app.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('ru', null);
  });

  testWidgets('Старт показывает онбординг', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: StaffSwipeApp()));
    await tester.pump();

    expect(find.text('Смены рядом — за один свайп'), findsOneWidget);
    expect(find.text('Пропустить'), findsOneWidget);
  });

  testWidgets('Пропуск онбординга ведёт на вход по телефону',
      (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: StaffSwipeApp()));
    await tester.pump();

    await tester.tap(find.text('Пропустить'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('Вход по телефону'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, '+7 999 123 45 67');
    await tester.pump();

    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Получить код'),
    );
    expect(button.onPressed, isNotNull);
  });
}
