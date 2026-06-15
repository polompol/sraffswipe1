import 'availability.dart';
import 'enums.dart';
import 'geo.dart';

/// Профиль соискателя (коллекция `users`).
class Seeker {
  Seeker({
    required this.id,
    required this.name,
    required this.birthDate,
    required this.city,
    required this.district,
    required this.location,
    required this.roles,
    required this.medBook,
    required this.selfEmployed,
    this.inn,
    required this.experienceTags,
    required this.availableSlots,
    required this.rating,
    required this.photoUrls,
    this.about = '',
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final String id;
  final String name;
  final DateTime birthDate;
  final String city;
  final String district;
  final GeoPoint location;
  final List<StaffRole> roles;
  final MedBookStatus medBook;
  final bool selfEmployed;
  final String? inn;
  final List<ExperienceTag> experienceTags;
  final List<AvailabilitySlot> availableSlots;
  final double rating;
  final List<String> photoUrls;
  final String about;
  final DateTime createdAt;

  int get age {
    final now = DateTime.now();
    var a = now.year - birthDate.year;
    if (now.month < birthDate.month ||
        (now.month == birthDate.month && now.day < birthDate.day)) {
      a--;
    }
    return a;
  }

  bool get isAdult => age >= 18;

  String get primaryPhoto =>
      photoUrls.isNotEmpty ? photoUrls.first : '';

  Seeker copyWith({
    String? name,
    DateTime? birthDate,
    String? city,
    String? district,
    GeoPoint? location,
    List<StaffRole>? roles,
    MedBookStatus? medBook,
    bool? selfEmployed,
    String? inn,
    List<ExperienceTag>? experienceTags,
    List<AvailabilitySlot>? availableSlots,
    double? rating,
    List<String>? photoUrls,
    String? about,
  }) {
    return Seeker(
      id: id,
      name: name ?? this.name,
      birthDate: birthDate ?? this.birthDate,
      city: city ?? this.city,
      district: district ?? this.district,
      location: location ?? this.location,
      roles: roles ?? this.roles,
      medBook: medBook ?? this.medBook,
      selfEmployed: selfEmployed ?? this.selfEmployed,
      inn: inn ?? this.inn,
      experienceTags: experienceTags ?? this.experienceTags,
      availableSlots: availableSlots ?? this.availableSlots,
      rating: rating ?? this.rating,
      photoUrls: photoUrls ?? this.photoUrls,
      about: about ?? this.about,
      createdAt: createdAt,
    );
  }
}
