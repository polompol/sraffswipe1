import 'enums.dart';

/// Мэтч между соискателем и работодателем по конкретной вакансии.
class MatchModel {
  MatchModel({
    required this.id,
    required this.seekerId,
    required this.employerId,
    required this.vacancyId,
    required this.status,
    this.confirmedBySeeker = false,
    this.confirmedByEmployer = false,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final String id;
  final String seekerId;
  final String employerId;
  final String vacancyId;
  final MatchStatus status;
  final bool confirmedBySeeker;
  final bool confirmedByEmployer;
  final DateTime createdAt;

  bool get bothConfirmed => confirmedBySeeker && confirmedByEmployer;

  MatchModel copyWith({
    MatchStatus? status,
    bool? confirmedBySeeker,
    bool? confirmedByEmployer,
  }) {
    return MatchModel(
      id: id,
      seekerId: seekerId,
      employerId: employerId,
      vacancyId: vacancyId,
      status: status ?? this.status,
      confirmedBySeeker: confirmedBySeeker ?? this.confirmedBySeeker,
      confirmedByEmployer: confirmedByEmployer ?? this.confirmedByEmployer,
      createdAt: createdAt,
    );
  }
}

/// Сообщение в чате (коллекция `messages`).
class Message {
  Message({
    required this.id,
    required this.chatId,
    required this.senderId,
    required this.text,
    this.isSystem = false,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  final String id;
  final String chatId;
  final String senderId;
  final String text;
  final bool isSystem;
  final DateTime timestamp;
}
