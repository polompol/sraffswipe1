import '../models/availability.dart';
import '../models/employer.dart';
import '../models/enums.dart';
import '../models/geo.dart';
import '../models/seeker.dart';
import '../models/vacancy.dart';

/// Замоканные данные. Структура соответствует разделу 5 спецификации
/// (users / employers / vacancies). В проде заменяется на FastAPI + PostgreSQL.
class MockData {
  MockData._();

  // Центр Москвы — точка отсчёта для расчёта расстояний.
  static const GeoPoint currentLocation = GeoPoint(55.7558, 37.6173);

  static const _avatar =
      'https://images.unsplash.com/photo-1500000000000?w=600&q=80';

  static String _photo(String id) =>
      'https://images.unsplash.com/$id?w=900&q=80&auto=format&fit=crop';

  /// Текущий соискатель (для роли «Работодатель» он листает таких).
  static final Seeker me = Seeker(
    id: 'me',
    name: 'Алексей',
    birthDate: DateTime(2000, 4, 12),
    city: 'Москва',
    district: 'Хамовники',
    location: currentLocation,
    roles: [StaffRole.waiter, StaffRole.barista],
    medBook: MedBookStatus.yes,
    selfEmployed: true,
    inn: '770712345678',
    experienceTags: [
      ExperienceTag.medBook,
      ExperienceTag.experienced,
      ExperienceTag.cashRegister,
      ExperienceTag.selfEmployed,
    ],
    availableSlots: const [
      AvailabilitySlot(weekday: 5, start: 18 * 60, end: 23 * 60),
      AvailabilitySlot(weekday: 6, start: 12 * 60, end: 22 * 60),
      AvailabilitySlot(weekday: 7, start: 12 * 60, end: 20 * 60),
    ],
    rating: 4.8,
    about: 'Быстро учусь, опыт в кофейне 3 года. Люблю гостей и латте-арт.',
    photoUrls: [
      _photo('photo-1547425260-76bcadfb4f2c'),
      _photo('photo-1521119989659-a83eee488004'),
    ],
  );

  static final List<Employer> employers = [
    Employer(
      id: 'emp1',
      companyName: 'Кофейня «Дрова»',
      inn: '7701234567',
      ogrn: '1167746000000',
      address: 'Москва, ул. Льва Толстого, 16',
      location: const GeoPoint(55.7340, 37.5870),
      verified: true,
      contactPhone: '+7 (495) 111-22-33',
      photoUrl: _photo('photo-1554118811-1e0d58224f24'),
      rating: 4.7,
      about: 'Третья волна кофе, дружная команда, гибкий график.',
    ),
    Employer(
      id: 'emp2',
      companyName: 'Бар «Полночь»',
      inn: '7702345678',
      ogrn: '1167746111111',
      address: 'Москва, Покровка, 8',
      location: const GeoPoint(55.7600, 37.6440),
      verified: true,
      contactPhone: '+7 (495) 222-33-44',
      photoUrl: _photo('photo-1514933651103-005eec06c04b'),
      rating: 4.5,
      about: 'Коктейльный бар в центре. Ночные смены, хорошие чаевые.',
    ),
    Employer(
      id: 'emp3',
      companyName: 'Ресторан «Грядка»',
      inn: '7703456789',
      ogrn: '1167746222222',
      address: 'Москва, Никольская, 10',
      location: const GeoPoint(55.7570, 37.6230),
      verified: false,
      contactPhone: '+7 (495) 333-44-55',
      photoUrl: _photo('photo-1517248135467-4c7edcad34c4'),
      rating: 4.2,
      about: 'Сезонная кухня, фермерские продукты.',
    ),
  ];

  static final List<Vacancy> vacancies = [
    Vacancy(
      id: 'vac1',
      employerId: 'emp1',
      companyName: 'Кофейня «Дрова»',
      companyPhotoUrl: MockData.employers[0].photoUrl,
      role: StaffRole.barista,
      date: DateTime.now().add(const Duration(days: 1)),
      startTime: 8 * 60,
      endTime: 16 * 60,
      rate: 350,
      rateType: RateType.perHour,
      description:
          'Нужен бариста на утреннюю смену. Дресс-код: чёрный верх, фартук выдаём. Бесплатные напитки и обеды.',
      requireMedBook: true,
      requireExperience: false,
      location: const GeoPoint(55.7340, 37.5870),
      address: 'ул. Льва Толстого, 16',
      interiorPhotoUrl: _photo('photo-1559925393-8be0ec4767c8'),
      employerVerified: true,
    ),
    Vacancy(
      id: 'vac2',
      employerId: 'emp2',
      companyName: 'Бар «Полночь»',
      companyPhotoUrl: MockData.employers[1].photoUrl,
      role: StaffRole.bartender,
      date: DateTime.now().add(const Duration(days: 2)),
      startTime: 20 * 60,
      endTime: 4 * 60,
      rate: 4500,
      rateType: RateType.perShift,
      description:
          'Срочно бармен на пятницу. Опыт классической барной карты обязателен. Чаевые делятся поровну.',
      requireMedBook: true,
      requireExperience: true,
      location: const GeoPoint(55.7600, 37.6440),
      address: 'Покровка, 8',
      interiorPhotoUrl: _photo('photo-1572116469696-31de0f17cc34'),
      employerVerified: true,
    ),
    Vacancy(
      id: 'vac3',
      employerId: 'emp3',
      companyName: 'Ресторан «Грядка»',
      companyPhotoUrl: MockData.employers[2].photoUrl,
      role: StaffRole.waiter,
      date: DateTime.now().add(const Duration(days: 1)),
      startTime: 11 * 60,
      endTime: 23 * 60,
      rate: 300,
      rateType: RateType.perHour,
      description:
          'Официант на банкет. Работа с кассой, знание винной карты приветствуется. Униформу предоставляем.',
      requireMedBook: true,
      requireExperience: false,
      location: const GeoPoint(55.7570, 37.6230),
      address: 'Никольская, 10',
      interiorPhotoUrl: _photo('photo-1424847651672-bf20a4b0982b'),
      employerVerified: false,
    ),
    Vacancy(
      id: 'vac4',
      employerId: 'emp1',
      companyName: 'Кофейня «Дрова»',
      companyPhotoUrl: MockData.employers[0].photoUrl,
      role: StaffRole.dishwasher,
      date: DateTime.now().add(const Duration(days: 3)),
      startTime: 10 * 60,
      endTime: 18 * 60,
      rate: 2800,
      rateType: RateType.perShift,
      description:
          'Посудомойщик на выходные. Без опыта, всему научим. Питание включено.',
      requireMedBook: false,
      requireExperience: false,
      location: const GeoPoint(55.7340, 37.5870),
      address: 'ул. Льва Толстого, 16',
      interiorPhotoUrl: _photo('photo-1581349485608-9469926a8e5e'),
      employerVerified: true,
    ),
  ];

  /// Кандидаты, которых листает работодатель.
  static final List<Seeker> seekers = [
    me,
    Seeker(
      id: 's2',
      name: 'Мария',
      birthDate: DateTime(1998, 9, 3),
      city: 'Москва',
      district: 'Басманный',
      location: const GeoPoint(55.7650, 37.6700),
      roles: [StaffRole.waiter, StaffRole.hostess],
      medBook: MedBookStatus.yes,
      selfEmployed: true,
      inn: '771298765432',
      experienceTags: [
        ExperienceTag.medBook,
        ExperienceTag.english,
        ExperienceTag.experienced,
        ExperienceTag.selfEmployed,
      ],
      availableSlots: const [
        AvailabilitySlot(weekday: 1, start: 10 * 60, end: 18 * 60),
        AvailabilitySlot(weekday: 3, start: 10 * 60, end: 18 * 60),
      ],
      rating: 4.9,
      about: 'Опыт работы в fine dining, английский B2.',
      photoUrls: [_photo('photo-1494790108377-be9c29b29330')],
    ),
    Seeker(
      id: 's3',
      name: 'Иван',
      birthDate: DateTime(2002, 1, 20),
      city: 'Москва',
      district: 'Тверской',
      location: const GeoPoint(55.7680, 37.6010),
      roles: [StaffRole.cook, StaffRole.dishwasher],
      medBook: MedBookStatus.expired,
      selfEmployed: false,
      experienceTags: [ExperienceTag.experienced],
      availableSlots: const [
        AvailabilitySlot(weekday: 6, start: 9 * 60, end: 21 * 60),
        AvailabilitySlot(weekday: 7, start: 9 * 60, end: 21 * 60),
      ],
      rating: 4.4,
      about: 'Холодный и горячий цех, опыт 2 года.',
      photoUrls: [_photo('photo-1500648767791-00dcc994a43e')],
    ),
    Seeker(
      id: 's4',
      name: 'Дарья',
      birthDate: DateTime(2001, 6, 15),
      city: 'Москва',
      district: 'Хамовники',
      location: const GeoPoint(55.7300, 37.5900),
      roles: [StaffRole.barista],
      medBook: MedBookStatus.yes,
      selfEmployed: true,
      inn: '770155544433',
      experienceTags: [
        ExperienceTag.medBook,
        ExperienceTag.cashRegister,
        ExperienceTag.selfEmployed,
      ],
      availableSlots: const [
        AvailabilitySlot(weekday: 2, start: 7 * 60, end: 15 * 60),
        AvailabilitySlot(weekday: 4, start: 7 * 60, end: 15 * 60),
      ],
      rating: 4.6,
      about: 'Латте-арт, альтернатива, спешелти.',
      photoUrls: [_photo('photo-1438761681033-6461ffad8d80')],
    ),
  ];
}
