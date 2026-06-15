import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/seeker.dart';
import '../../../data/mock/mock_data.dart';
import '../../../widgets/app_widgets.dart';
import 'swipe_overlay.dart';

/// Карточка кандидата в ленте работодателя.
class SeekerCard extends StatelessWidget {
  const SeekerCard({
    super.key,
    required this.seeker,
    this.percentX = 0,
    this.percentY = 0,
  });

  final Seeker seeker;
  final int percentX;
  final int percentY;

  @override
  Widget build(BuildContext context) {
    final distance =
        MockData.currentLocation.distanceKm(seeker.location).toStringAsFixed(1);

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        border: Border.all(color: Theme.of(context).colorScheme.outline),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          AppImage(url: seeker.primaryPhoto),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, Colors.black54, Colors.black87],
                stops: [0.4, 0.7, 1],
              ),
            ),
          ),
          Positioned(
            top: 16,
            left: 16,
            right: 16,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Colors.white24),
                  ),
                  child: RatingStars(rating: seeker.rating, size: 14),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Colors.white24),
                  ),
                  child: Text(
                    '$distance км · ${seeker.district}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            left: 20,
            right: 20,
            bottom: 24,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      seeker.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        '${seeker.age}',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (seeker.selfEmployed) ...[
                      const SizedBox(width: 10),
                      const Padding(
                        padding: EdgeInsets.only(bottom: 6),
                        child: AppTag(
                          label: 'Самозанятый',
                          icon: Icons.badge_outlined,
                          color: AppColors.info,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final role in seeker.roles)
                      AppTag(label: role.label, icon: role.icon, filled: true),
                  ],
                ),
                const SizedBox(height: 10),
                if (seeker.about.isNotEmpty)
                  Text(
                    seeker.about,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, height: 1.35),
                  ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    AppTag(
                      label: 'Медкнижка: ${seeker.medBook.label}',
                      icon: Icons.health_and_safety_outlined,
                      color: seeker.medBook.label == 'Есть'
                          ? AppColors.like
                          : AppColors.warning,
                    ),
                    for (final tag in seeker.experienceTags.take(3))
                      AppTag(label: tag.label),
                  ],
                ),
              ],
            ),
          ),
          SwipeStamps(percentX: percentX, percentY: percentY),
        ],
      ),
    );
  }
}
