import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/vacancy.dart';
import '../../../data/mock/mock_data.dart';
import '../../../widgets/app_widgets.dart';
import 'swipe_overlay.dart';

/// Карточка вакансии в ленте соискателя.
class VacancyCard extends StatelessWidget {
  const VacancyCard({
    super.key,
    required this.vacancy,
    this.percentX = 0,
    this.percentY = 0,
  });

  final Vacancy vacancy;
  final int percentX;
  final int percentY;

  @override
  Widget build(BuildContext context) {
    final distance =
        MockData.currentLocation.distanceKm(vacancy.location).toStringAsFixed(1);

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
          AppImage(url: vacancy.interiorPhotoUrl),
          // Затемнение снизу для читаемости текста.
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.transparent,
                  Colors.black54,
                  Colors.black87,
                ],
                stops: [0.4, 0.7, 1],
              ),
            ),
          ),
          // Верхняя плашка — ставка и расстояние.
          Positioned(
            top: 16,
            left: 16,
            right: 16,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _GlassPill(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.payments_outlined,
                          size: 16, color: Colors.white),
                      const SizedBox(width: 6),
                      Text(
                        vacancy.rateLabel,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                        ),
                      ),
                    ],
                  ),
                ),
                _GlassPill(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.location_on_outlined,
                          size: 16, color: Colors.white),
                      const SizedBox(width: 4),
                      Text(
                        '$distance км',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // Нижний блок информации.
          Positioned(
            left: 20,
            right: 20,
            bottom: 24,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    AppTag(
                      label: vacancy.role.label,
                      icon: vacancy.role.icon,
                      filled: true,
                    ),
                    const SizedBox(width: 8),
                    if (vacancy.employerVerified)
                      const AppTag(
                        label: 'Проверен',
                        icon: Icons.verified,
                        color: AppColors.info,
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  vacancy.companyName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.event_outlined,
                        size: 15, color: Colors.white70),
                    const SizedBox(width: 6),
                    Text(
                      '${vacancy.dateLabel} · ${vacancy.timeLabel}',
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.place_outlined,
                        size: 15, color: Colors.white70),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        vacancy.address,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white70),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  vacancy.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, height: 1.35),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (vacancy.requireMedBook)
                      const AppTag(
                        label: 'Нужна медкнижка',
                        icon: Icons.health_and_safety_outlined,
                        color: AppColors.warning,
                      ),
                    if (vacancy.requireExperience)
                      const AppTag(
                        label: 'Нужен опыт',
                        icon: Icons.workspace_premium_outlined,
                        color: AppColors.accentAmber,
                      ),
                    AppTag(
                      label: '≈ ${vacancy.estimatedPay} ₽ за смену',
                      icon: Icons.account_balance_wallet_outlined,
                      color: AppColors.like,
                    ),
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

class _GlassPill extends StatelessWidget {
  const _GlassPill({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white24),
      ),
      child: child,
    );
  }
}
