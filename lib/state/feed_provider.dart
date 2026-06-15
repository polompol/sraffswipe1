import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/enums.dart';
import '../data/models/seeker.dart';
import '../data/models/vacancy.dart';
import '../data/mock/mock_data.dart';

/// Лента вакансий для соискателя (отсортирована по близости).
final vacanciesFeedProvider = Provider<List<Vacancy>>((ref) {
  final list = [...MockData.vacancies];
  list.sort((a, b) {
    final da = MockData.currentLocation.distanceKm(a.location);
    final db = MockData.currentLocation.distanceKm(b.location);
    return da.compareTo(db);
  });
  return list;
});

/// Лента кандидатов для работодателя.
final candidatesFeedProvider = Provider<List<Seeker>>((ref) {
  return [...MockData.seekers];
});

/// Запись свайпов (в проде — таблица `swipes` с уникальностью пары).
class SwipeLog extends StateNotifier<List<({String targetId, SwipeDirection dir})>> {
  SwipeLog() : super([]);

  void record(String targetId, SwipeDirection dir) {
    state = [...state, (targetId: targetId, dir: dir)];
  }
}

final swipeLogProvider =
    StateNotifierProvider<SwipeLog, List<({String targetId, SwipeDirection dir})>>(
        (ref) => SwipeLog());
