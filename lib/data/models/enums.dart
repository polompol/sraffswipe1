import 'package:flutter/material.dart';

/// Роль пользователя в приложении.
enum AppRole { jobSeeker, employer }

/// Должности в общепите.
enum StaffRole {
  waiter,
  barista,
  cook,
  dishwasher,
  hostess,
  bartender;

  String get label => switch (this) {
        StaffRole.waiter => 'Официант',
        StaffRole.barista => 'Бариста',
        StaffRole.cook => 'Повар',
        StaffRole.dishwasher => 'Посудомой',
        StaffRole.hostess => 'Хостес',
        StaffRole.bartender => 'Бармен',
      };

  IconData get icon => switch (this) {
        StaffRole.waiter => Icons.room_service_outlined,
        StaffRole.barista => Icons.coffee_outlined,
        StaffRole.cook => Icons.restaurant_outlined,
        StaffRole.dishwasher => Icons.local_dining_outlined,
        StaffRole.hostess => Icons.support_agent_outlined,
        StaffRole.bartender => Icons.local_bar_outlined,
      };
}

/// Статус медицинской книжки.
enum MedBookStatus {
  yes,
  no,
  expired;

  String get label => switch (this) {
        MedBookStatus.yes => 'Есть',
        MedBookStatus.no => 'Нет',
        MedBookStatus.expired => 'Просрочена',
      };
}

/// Направление свайпа.
enum SwipeDirection {
  like, // вправо
  superlike, // вверх — «срочно»
  dislike, // влево
}

/// Тип ставки в вакансии.
enum RateType {
  perHour,
  perShift;

  String get suffix => switch (this) {
        RateType.perHour => '₽/час',
        RateType.perShift => '₽/смена',
      };
}

/// Статус мэтча/смены.
enum MatchStatus {
  matched, // взаимный лайк
  confirmed, // смена подтверждена обеими сторонами
  completed; // смена отработана

  String get label => switch (this) {
        MatchStatus.matched => 'Мэтч',
        MatchStatus.confirmed => 'Смена подтверждена',
        MatchStatus.completed => 'Завершено',
      };
}

/// Теги опыта/навыков соискателя.
enum ExperienceTag {
  medBook,
  experienced,
  english,
  cashRegister,
  selfEmployed;

  String get label => switch (this) {
        ExperienceTag.medBook => 'Медкнижка',
        ExperienceTag.experienced => 'Опыт > 2 лет',
        ExperienceTag.english => 'Английский',
        ExperienceTag.cashRegister => 'Работа с кассой',
        ExperienceTag.selfEmployed => 'Самозанятый',
      };
}
