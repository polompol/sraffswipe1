import 'dart:math' as math;

/// Простая гео-точка (lat/lng). В проде — PostGIS / Яндекс.Карты.
class GeoPoint {
  const GeoPoint(this.lat, this.lng);

  final double lat;
  final double lng;

  /// Расстояние по формуле гаверсинуса, в километрах.
  double distanceKm(GeoPoint other) {
    const earthRadius = 6371.0;
    final dLat = _rad(other.lat - lat);
    final dLng = _rad(other.lng - lng);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_rad(lat)) *
            math.cos(_rad(other.lat)) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadius * c;
  }

  static double _rad(double deg) => deg * (math.pi / 180.0);
}
