import 'package:intl/intl.dart';

import 'enums.dart';
import 'geo.dart';

/// Вакансия/смена (коллекция `vacancies`).
class Vacancy {
  Vacancy({
    required this.id,
    required this.employerId,
    required this.companyName,
    required this.companyPhotoUrl,
    required this.role,
    required this.date,
    required this.startTime, // минуты от полуночи
    required this.endTime,
    required this.rate,
    required this.rateType,
    required this.description,
    required this.requireMedBook,
    required this.requireExperience,
    required this.location,
    required this.address,
    required this.interiorPhotoUrl,
    this.employerVerified = false,
    this.status = 'active',
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final String id;
  final String employerId;
  final String companyName;
  final String companyPhotoUrl;
  final StaffRole role;
  final DateTime date;
  final int startTime;
  final int endTime;
  final int rate;
  final RateType rateType;
  final String description;
  final bool requireMedBook;
  final bool requireExperience;
  final GeoPoint location;
  final String address;
  final String interiorPhotoUrl;
  final bool employerVerified;
  final String status;
  final DateTime createdAt;

  String _fmt(int minutes) {
    final h = (minutes ~/ 60).toString().padLeft(2, '0');
    final m = (minutes % 60).toString().padLeft(2, '0');
    return '$h:$m';
  }

  String get timeLabel => '${_fmt(startTime)}–${_fmt(endTime)}';

  String get dateLabel => DateFormat('d MMMM, EEEE', 'ru').format(date);

  String get shortDateLabel => DateFormat('d MMM', 'ru').format(date);

  String get rateLabel => '$rate ${rateType.suffix}';

  /// Грубая оценка дохода за смену (для перчасовой ставки).
  int get estimatedPay {
    if (rateType == RateType.perShift) return rate;
    final hours = ((endTime - startTime) / 60).clamp(0, 24);
    return (rate * hours).round();
  }
}
