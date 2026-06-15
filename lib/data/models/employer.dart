import 'geo.dart';

/// Профиль работодателя (коллекция `employers`).
class Employer {
  Employer({
    required this.id,
    required this.companyName,
    required this.inn,
    required this.ogrn,
    required this.address,
    required this.location,
    required this.verified,
    required this.contactPhone,
    required this.photoUrl,
    this.rating = 0,
    this.about = '',
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final String id;
  final String companyName;
  final String inn;
  final String ogrn;
  final String address;
  final GeoPoint location;
  final bool verified; // проверено через DaData
  final String contactPhone;
  final String photoUrl;
  final double rating;
  final String about;
  final DateTime createdAt;

  Employer copyWith({
    String? companyName,
    String? inn,
    String? ogrn,
    String? address,
    GeoPoint? location,
    bool? verified,
    String? contactPhone,
    String? photoUrl,
    double? rating,
    String? about,
  }) {
    return Employer(
      id: id,
      companyName: companyName ?? this.companyName,
      inn: inn ?? this.inn,
      ogrn: ogrn ?? this.ogrn,
      address: address ?? this.address,
      location: location ?? this.location,
      verified: verified ?? this.verified,
      contactPhone: contactPhone ?? this.contactPhone,
      photoUrl: photoUrl ?? this.photoUrl,
      rating: rating ?? this.rating,
      about: about ?? this.about,
      createdAt: createdAt,
    );
  }
}
