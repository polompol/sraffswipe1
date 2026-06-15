import 'package:flutter/material.dart';

/// Цветовая палитra StaffSwipe — «молочно-шоколадно-золотая».
///
/// Тёплая, премиальная, «вкусная» айдентика под общепит: молочный фон,
/// шоколадный текст, золотые акценты. Светлая тема — основная («лёгкая»),
/// тёмная — переключателем (для ночных смен).
class AppColors {
  AppColors._();

  // Бренд-акценты
  static const Color primary = Color(0xFFC9A227); // золото
  static const Color primaryDark = Color(0xFFA9851A);
  static const Color secondary = Color(0xFFB07A47); // карамель
  static const Color espresso = Color(0xFF3B2A20); // эспрессо
  static const Color accentGold = Color(0xFFD9A441); // тёплое золото
  static const Color accentAmber = accentGold; // алиас для совместимости

  // Семантика свайпов
  static const Color like = Color(0xFFC9A227); // вправо — золото
  static const Color dislike = Color(0xFFC2604A); // влево — терракота
  static const Color superlike = Color(0xFFD9A441); // вверх — «срочно»

  // Светлая тема (молочная)
  static const Color lightBg = Color(0xFFFBF6EE); // молоко
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightCard = Color(0xFFFFFDF9); // сливочный
  static const Color lightBorder = Color(0xFFECE3D6);
  static const Color lightText = Color(0xFF2E2018); // шоколад
  static const Color lightMuted = Color(0xFF8A7866);

  // Тёмная тема (горький шоколад)
  static const Color darkBg = Color(0xFF171008);
  static const Color darkSurface = Color(0xFF211711);
  static const Color darkCard = Color(0xFF291D14);
  static const Color darkBorder = Color(0xFF3A2A1E);
  static const Color darkText = Color(0xFFF3E9DC);
  static const Color darkMuted = Color(0xFFB3A18C);

  // Статусы
  static const Color success = Color(0xFF7E8B4F); // оливково-золотой
  static const Color warning = Color(0xFFD99A2B);
  static const Color danger = Color(0xFFC2604A);
  static const Color info = Color(0xFF8A6D4B);

  /// Тёплый бренд-градиент: карамель → золото.
  static const LinearGradient brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFD9A441), primary, Color(0xFFA9851A)],
  );

  /// Мягкая тёплая тень для карточек на молочном фоне.
  static List<BoxShadow> warmShadow({double blur = 24, double y = 12}) => [
        BoxShadow(
          color: const Color(0xFF3B2A20).withValues(alpha: 0.12),
          blurRadius: blur,
          offset: Offset(0, y),
        ),
      ];
}
