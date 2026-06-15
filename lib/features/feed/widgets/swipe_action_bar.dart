import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

/// Круглые кнопки управления свайпом под колодой — в стилистике Tinder.
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
          color: AppColors.secondary,
          size: 50,
          tooltip: 'Вернуть',
          onTap: onUndo,
        ),
        const SizedBox(width: 18),
        _ActionButton(
          icon: Icons.close_rounded,
          color: AppColors.dislike,
          size: 64,
          tooltip: 'Пропустить',
          onTap: onDislike,
        ),
        const SizedBox(width: 18),
        _ActionButton(
          icon: Icons.bolt_rounded,
          color: AppColors.superlike,
          size: 54,
          tooltip: 'Срочно',
          onTap: onSuperlike,
        ),
        const SizedBox(width: 18),
        _ActionButton(
          icon: Icons.favorite_rounded,
          color: AppColors.primary,
          size: 64,
          filled: true,
          tooltip: 'Хочу здесь работать',
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
    required this.tooltip,
    this.filled = false,
  });

  final IconData icon;
  final Color color;
  final double size;
  final VoidCallback onTap;
  final String tooltip;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: tooltip,
      child: Tooltip(
        message: tooltip,
        child: Material(
          color: filled ? color : Theme.of(context).colorScheme.surface,
          shape: CircleBorder(
            side: filled
                ? BorderSide.none
                : BorderSide(color: color.withValues(alpha: 0.45), width: 1.6),
          ),
          elevation: filled ? 6 : 3,
          shadowColor: color.withValues(alpha: 0.4),
          child: InkWell(
            onTap: onTap,
            customBorder: const CircleBorder(),
            child: SizedBox(
              width: size,
              height: size,
              child: Icon(
                icon,
                color: filled ? Colors.white : color,
                size: size * 0.5,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
