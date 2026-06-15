import 'package:flutter/material.dart';

/// Цветовая палитра StaffSwipe.
///
/// Стиль: минимализм + яркие «доставочные» акценты (оранжевый/красный).
/// Поддерживаются светлая и тёмная темы (тёмная — основная для ночных смен).
class AppColors {
  AppColors._();

  // Бренд-акценты
  static const Color primary = Color(0xFFFF5A1F); // сочный оранжевый
  static const Color primaryDark = Color(0xFFE0480F);
  static const Color secondary = Color(0xFFFF2D55); // красный (super-like)
  static const Color accentAmber = Color(0xFFFFB020);

  // Семантика свайпов
  static const Color like = Color(0xFF22C55E); // вправо — лайк
  static const Color dislike = Color(0xFFF43F5E); // влево — пропуск
  static const Color superlike = Color(0xFF3B82F6); // вверх — срочно

  // Светлая тема
  static const Color lightBg = Color(0xFFF7F7F8);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightCard = Color(0xFFFFFFFF);
  static const Color lightBorder = Color(0xFFE5E7EB);
  static const Color lightText = Color(0xFF0B0B0F);
  static const Color lightMuted = Color(0xFF6B7280);

  // Тёмная тема
  static const Color darkBg = Color(0xFF0B0B0F);
  static const Color darkSurface = Color(0xFF141418);
  static const Color darkCard = Color(0xFF18181D);
  static const Color darkBorder = Color(0xFF26262C);
  static const Color darkText = Color(0xFFF4F4F5);
  static const Color darkMuted = Color(0xFF9CA3AF);

  // Статусы
  static const Color success = Color(0xFF22C55E);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);
  static const Color info = Color(0xFF3B82F6);

  static const LinearGradient brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFF7A3D), primary, secondary],
  );
}
