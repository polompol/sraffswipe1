import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

/// Штампы LIKE / NOPE / СРОЧНО поверх карточки во время свайпа.
class SwipeStamps extends StatelessWidget {
  const SwipeStamps({
    super.key,
    required this.percentX,
    required this.percentY,
  });

  /// -100..100 — горизонтальное смещение карточки.
  final int percentX;

  /// -100..100 — вертикальное смещение карточки.
  final int percentY;

  @override
  Widget build(BuildContext context) {
    final likeOpacity = (percentX / 60).clamp(0.0, 1.0);
    final nopeOpacity = (-percentX / 60).clamp(0.0, 1.0);
    final superOpacity = (-percentY / 60).clamp(0.0, 1.0);

    return Positioned.fill(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Stack(
          children: [
            Align(
              alignment: Alignment.topLeft,
              child: _Stamp(
                label: 'ХОЧУ',
                color: AppColors.like,
                angle: -0.35,
                opacity: likeOpacity,
              ),
            ),
            Align(
              alignment: Alignment.topRight,
              child: _Stamp(
                label: 'НЕТ',
                color: AppColors.dislike,
                angle: 0.35,
                opacity: nopeOpacity,
              ),
            ),
            Align(
              alignment: Alignment.bottomCenter,
              child: _Stamp(
                label: 'СРОЧНО',
                color: AppColors.espresso,
                angle: 0,
                opacity: superOpacity,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Stamp extends StatelessWidget {
  const _Stamp({
    required this.label,
    required this.color,
    required this.angle,
    required this.opacity,
  });

  final String label;
  final Color color;
  final double angle;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: opacity,
      child: Transform.rotate(
        angle: angle,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            border: Border.all(color: color, width: 4),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 30,
              fontWeight: FontWeight.w900,
              letterSpacing: 2,
            ),
          ),
        ),
      ),
    );
  }
}
