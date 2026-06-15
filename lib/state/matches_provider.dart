import 'package:collection/collection.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../data/models/enums.dart';
import '../data/models/match.dart';
import '../data/models/vacancy.dart';
import '../data/mock/mock_data.dart';

const _uuid = Uuid();

/// Хранилище мэтчей и сообщений (в проде — `matches`, `chats`, `messages`).
class MatchesNotifier extends StateNotifier<List<MatchModel>> {
  MatchesNotifier() : super([]);

  final Map<String, List<Message>> _messagesByMatch = {};

  /// Создаёт мэтч по вакансии. Возвращает созданный мэтч.
  MatchModel createMatchForVacancy(Vacancy vacancy) {
    final existing = state.where((m) => m.vacancyId == vacancy.id).firstOrNull;
    if (existing != null) return existing;

    final match = MatchModel(
      id: _uuid.v4(),
      seekerId: MockData.me.id,
      employerId: vacancy.employerId,
      vacancyId: vacancy.id,
      status: MatchStatus.matched,
    );
    state = [match, ...state];
    _seedConversation(match, vacancy);
    return match;
  }

  void _seedConversation(MatchModel match, Vacancy vacancy) {
    _messagesByMatch[match.id] = [
      Message(
        id: _uuid.v4(),
        chatId: match.id,
        senderId: 'system',
        text:
            'Это мэтч! Смена «${vacancy.role.label}» в «${vacancy.companyName}» '
            '${vacancy.shortDateLabel}, ${vacancy.timeLabel}. Договоритесь о деталях.',
        isSystem: true,
        timestamp: DateTime.now().subtract(const Duration(minutes: 1)),
      ),
      Message(
        id: _uuid.v4(),
        chatId: match.id,
        senderId: vacancy.employerId,
        text: 'Здравствуйте! Готовы выйти на смену? Какие вопросы?',
        timestamp: DateTime.now(),
      ),
    ];
  }

  List<Message> messages(String matchId) =>
      List.unmodifiable(_messagesByMatch[matchId] ?? const []);

  void sendMessage(String matchId, String senderId, String text) {
    final list = _messagesByMatch[matchId] ?? [];
    list.add(Message(
      id: _uuid.v4(),
      chatId: matchId,
      senderId: senderId,
      text: text,
    ));
    _messagesByMatch[matchId] = list;
    // триггерим обновление, пересоздавая state.
    state = [...state];
  }

  void postSystem(String matchId, String text) {
    final list = _messagesByMatch[matchId] ?? [];
    list.add(Message(
      id: _uuid.v4(),
      chatId: matchId,
      senderId: 'system',
      text: text,
      isSystem: true,
    ));
    _messagesByMatch[matchId] = list;
    state = [...state];
  }

  /// Подтверждение смены одной из сторон.
  void confirmShift(String matchId, {required bool bySeeker}) {
    state = [
      for (final m in state)
        if (m.id == matchId)
          m.copyWith(
            confirmedBySeeker: bySeeker ? true : m.confirmedBySeeker,
            confirmedByEmployer: bySeeker ? m.confirmedByEmployer : true,
          )
        else
          m,
    ];

    final match = state.firstWhere((m) => m.id == matchId);
    if (match.bothConfirmed && match.status == MatchStatus.matched) {
      state = [
        for (final m in state)
          if (m.id == matchId) m.copyWith(status: MatchStatus.confirmed) else m,
      ];
      postSystem(matchId,
          'Смена подтверждена обеими сторонами ✅. Сформирован акт для самозанятого.');
    }
  }

  Vacancy vacancyFor(MatchModel match) =>
      MockData.vacancies.firstWhere((v) => v.id == match.vacancyId);
}

final matchesProvider =
    StateNotifierProvider<MatchesNotifier, List<MatchModel>>(
        (ref) => MatchesNotifier());

/// Подтверждённые смены — для раздела «Мои смены».
final confirmedShiftsProvider = Provider<List<MatchModel>>((ref) {
  final all = ref.watch(matchesProvider);
  return all
      .where((m) =>
          m.status == MatchStatus.confirmed ||
          m.status == MatchStatus.completed)
      .toList();
});
