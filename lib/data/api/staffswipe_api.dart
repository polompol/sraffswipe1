import '../models/enums.dart';
import '../models/geo.dart';
import '../models/match.dart';
import '../models/vacancy.dart';
import 'api_client.dart';

/// Тонкий типизированный клиент StaffSwipe API поверх [ApiClient].
///
/// Используется, когда `AppConfig.useBackend == true`. UI по умолчанию работает
/// на mock-провайдерах; здесь — мост к реальному FastAPI-бэкенду.
class StaffSwipeApi {
  StaffSwipeApi(this._client);

  final ApiClient _client;

  // ---- auth ----

  /// Запрос SMS-кода. Возвращает dev-код (в dev-режиме сервера) или null.
  Future<String?> requestCode(String phone, {String role = 'seeker'}) async {
    final r = await _client.dio.post('/auth/request-code',
        data: {'phone': phone, 'role': role});
    return r.data['dev_code'] as String?;
  }

  /// Проверка кода. Сохраняет JWT и возвращает (userId, role).
  Future<({String userId, String role})> verify(
    String phone,
    String code, {
    String role = 'seeker',
  }) async {
    final r = await _client.dio.post('/auth/verify',
        data: {'phone': phone, 'code': code, 'role': role});
    await _client.saveToken(r.data['access_token'] as String);
    return (
      userId: r.data['user_id'] as String,
      role: r.data['role'] as String,
    );
  }

  // ---- vacancies ----

  Future<List<Vacancy>> vacancies({double? lat, double? lng}) async {
    final r = await _client.dio.get('/vacancies', queryParameters: {
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
    });
    return (r.data as List).map((j) => _vacancyFromJson(j)).toList();
  }

  // ---- swipes / matches ----

  /// Записать свайп. Возвращает id мэтча, если возник мэтч.
  Future<String?> swipe({
    required String targetId,
    required String targetType, // vacancy|user
    required SwipeDirection direction,
  }) async {
    final r = await _client.dio.post('/swipes', data: {
      'target_id': targetId,
      'target_type': targetType,
      'direction': direction.name,
    });
    return (r.data['matched'] == true) ? r.data['match_id'] as String? : null;
  }

  Future<List<MatchModel>> matches() async {
    final r = await _client.dio.get('/matches');
    return (r.data as List).map((j) => _matchFromJson(j)).toList();
  }

  Future<void> confirmShift(String matchId) =>
      _client.dio.post('/matches/$matchId/confirm');

  Future<List<Message>> messages(String matchId) async {
    final r = await _client.dio.get('/matches/$matchId/messages');
    return (r.data as List).map((j) => _messageFromJson(j)).toList();
  }

  Future<Message> sendMessage(String matchId, String text) async {
    final r = await _client.dio
        .post('/matches/$matchId/messages', data: {'text': text});
    return _messageFromJson(r.data);
  }

  // ---- mappers ----

  StaffRole _role(String s) =>
      StaffRole.values.firstWhere((r) => r.name == s,
          orElse: () => StaffRole.waiter);

  Vacancy _vacancyFromJson(Map<String, dynamic> j) => Vacancy(
        id: j['id'] as String,
        employerId: j['employer_id'] as String,
        companyName: j['company_name'] as String? ?? '',
        companyPhotoUrl: j['company_photo_url'] as String? ?? '',
        role: _role(j['role'] as String),
        date: DateTime.tryParse(j['date'] as String? ?? '') ?? DateTime.now(),
        startTime: j['start_time'] as int,
        endTime: j['end_time'] as int,
        rate: j['rate'] as int,
        rateType: j['rate_type'] == 'perShift'
            ? RateType.perShift
            : RateType.perHour,
        description: j['description'] as String? ?? '',
        requireMedBook: j['require_med_book'] as bool? ?? false,
        requireExperience: j['require_experience'] as bool? ?? false,
        location: GeoPoint(
            (j['lat'] as num?)?.toDouble() ?? 0, (j['lng'] as num?)?.toDouble() ?? 0),
        address: j['address'] as String? ?? '',
        interiorPhotoUrl: j['interior_photo_url'] as String? ?? '',
        employerVerified: j['employer_verified'] as bool? ?? false,
        status: j['status'] as String? ?? 'active',
      );

  MatchModel _matchFromJson(Map<String, dynamic> j) => MatchModel(
        id: j['id'] as String,
        seekerId: j['user_id'] as String,
        employerId: j['employer_id'] as String,
        vacancyId: j['vacancy_id'] as String,
        status: switch (j['status']) {
          'confirmed' => MatchStatus.confirmed,
          'completed' => MatchStatus.completed,
          _ => MatchStatus.matched,
        },
        confirmedBySeeker: j['confirmed_by_seeker'] as bool? ?? false,
        confirmedByEmployer: j['confirmed_by_employer'] as bool? ?? false,
      );

  Message _messageFromJson(Map<String, dynamic> j) => Message(
        id: j['id'] as String,
        chatId: j['match_id'] as String,
        senderId: j['sender_id'] as String,
        text: j['text'] as String,
        isSystem: j['is_system'] as bool? ?? false,
      );
}
