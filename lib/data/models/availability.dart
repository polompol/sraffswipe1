/// Слот доступности соискателя: день недели + временной интервал.
class AvailabilitySlot {
  const AvailabilitySlot({
    required this.weekday, // 1 = Пн ... 7 = Вс (как в DateTime)
    required this.start, // минуты от полуночи
    required this.end,
  });

  final int weekday;
  final int start;
  final int end;

  static const _days = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  String get dayLabel => _days[weekday];

  String _fmt(int minutes) {
    final h = (minutes ~/ 60).toString().padLeft(2, '0');
    final m = (minutes % 60).toString().padLeft(2, '0');
    return '$h:$m';
  }

  String get timeLabel => '${_fmt(start)}–${_fmt(end)}';

  String get label => '$dayLabel $timeLabel';

  AvailabilitySlot copyWith({int? weekday, int? start, int? end}) =>
      AvailabilitySlot(
        weekday: weekday ?? this.weekday,
        start: start ?? this.start,
        end: end ?? this.end,
      );
}
