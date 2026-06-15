import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

/// Круглые кнопки управления свайпом под колодой карточек.
class SwipeActionBar extends StatelessWidget {
  const SwipeActionBar({
    super.key,
    required this.onDislike,
    required this.onSuperlike,
    required this.onLike,
    required this.onUndo,
  });

  final VoidCallback onDislike;
  final VoidCallback onSuperlike;
  final VoidCallback onLike;
  final VoidCallback onUndo;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _ActionButton(
          icon: Icons.replay_rounded,
          color: AppColors.accentAmber,
          size: 48,
          onTap: onUndo,
        ),
        const SizedBox(width: 16),
        _ActionButton(
          icon: Icons.close_rounded,
          color: AppColors.dislike,
          size: 64,
          onTap: onDislike,
        ),
        const SizedBox(width: 16),
        _ActionButton(
          icon: Icons.bolt_rounded,
          color: AppColors.superlike,
          size: 52,
          onTap: onSuperlike,
        ),
        const SizedBox(width: 16),
        _ActionButton(
          icon: Icons.favorite_rounded,
          color: AppColors.like,
          size: 64,
          onTap: onLike,
        ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.color,
    required this.size,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final double size;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      shape: CircleBorder(
        side: BorderSide(color: color.withValues(alpha: 0.5), width: 1.5),
      ),
      elevation: 2,
      shadowColor: color.withValues(alpha: 0.3),
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: size,
          height: size,
          child: Icon(icon, color: color, size: size * 0.5),
        ),
      ),
    );
  }
}
