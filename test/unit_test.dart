import 'package:flutter_test/flutter_test.dart';
import 'package:staffswipe/data/models/enums.dart';
import 'package:staffswipe/data/models/geo.dart';
import 'package:staffswipe/data/models/seeker.dart';
import 'package:staffswipe/data/mock/mock_data.dart';

void main() {
  group('GeoPoint.distanceKm', () {
    test('расстояние до самой себя равно нулю', () {
      const p = GeoPoint(55.7558, 37.6173);
      expect(p.distanceKm(p), closeTo(0, 0.001));
    });

    test('Москва → Санкт-Петербург ≈ 630 км', () {
      const moscow = GeoPoint(55.7558, 37.6173);
      const spb = GeoPoint(59.9343, 30.3351);
      expect(moscow.distanceKm(spb), closeTo(630, 40));
    });
  });

  group('Доменные модели', () {
    test('StaffRole имеет человекочитаемые ярлыки', () {
      expect(StaffRole.barista.label, 'Бариста');
      expect(StaffRole.waiter.label, 'Официант');
    });

    test('Возраст вычисляется и 18+ проверяется', () {
      final adult = Seeker(
        id: 't',
        name: 'Тест',
        birthDate: DateTime(2000, 1, 1),
        city: 'Москва',
        district: 'Центр',
        location: const GeoPoint(0, 0),
        roles: const [StaffRole.waiter],
        medBook: MedBookStatus.yes,
        selfEmployed: false,
        experienceTags: const [],
        availableSlots: const [],
        rating: 5,
        photoUrls: const [],
      );
      expect(adult.age, greaterThanOrEqualTo(18));
      expect(adult.isAdult, isTrue);
    });
  });

  group('Mock-данные', () {
    test('вакансии и кандидаты не пусты', () {
      expect(MockData.vacancies, isNotEmpty);
      expect(MockData.seekers, isNotEmpty);
    });
  });
}
