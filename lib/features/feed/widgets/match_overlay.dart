import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/models/vacancy.dart';
import '../../../widgets/app_widgets.dart';

/// Полноэкранный оверлей мэтча: салют + рукопожатие.
///
/// В проде здесь живёт Lottie-анимация (`assets/lottie/match.json`).
/// Реализация на flutter_animate, чтобы не тянуть бинарный ассет.
class MatchOverlay extends StatelessWidget {
  const MatchOverlay({
    super.key,
    required this.vacancy,
    required this.onChat,
    required this.onKeepSwiping,
  });

  final Vacancy vacancy;
  final VoidCallback onChat;
  final VoidCallback onKeepSwiping;

  static Future<void> show(
    BuildContext context, {
    required Vacancy vacancy,
    required VoidCallback onChat,
  }) {
    return showGeneralDialog(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black.withValues(alpha: 0.85),
      transitionDuration: const Duration(milliseconds: 250),
      pageBuilder: (ctx, _, __) => MatchOverlay(
        vacancy: vacancy,
        onChat: () {
          Navigator.of(ctx).pop();
          onChat();
        },
        onKeepSwiping: () => Navigator.of(ctx).pop(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      type: MaterialType.transparency,
      child: Stack(
        children: [
          const _Confetti(),
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ShaderMask(
                    shaderCallback: (r) =>
                        AppColors.brandGradient.createShader(r),
                    child: const Text(
                      'Это мэтч!',
                      style: TextStyle(
                        fontSize: 44,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                      ),
                    ),
                  )
                      .animate()
                      .scale(
                        begin: const Offset(0.6, 0.6),
                        end: const Offset(1, 1),
                        duration: 450.ms,
                        curve: Curves.elasticOut,
                      )
                      .fadeIn(),
                  const SizedBox(height: 8),
                  const Text('🤝', style: TextStyle(fontSize: 64))
                      .animate(onPlay: (c) => c.repeat(reverse: true))
                      .moveY(begin: 0, end: -10, duration: 900.ms),
                  const SizedBox(height: 16),
                  Text(
                    'Вы и «${vacancy.companyName}» понравились друг другу',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70, fontSize: 16),
                  ),
                  const SizedBox(height: 24),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: SizedBox(
                      width: 120,
                      height: 120,
                      child: AppImage(url: vacancy.interiorPhotoUrl),
                    ),
                  ).animate().fadeIn(delay: 200.ms).scale(),
                  const SizedBox(height: 28),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: onChat,
                      icon: const Icon(Icons.chat_bubble_outline),
                      label: const Text('Перейти в чат'),
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextButton(
                    onPressed: onKeepSwiping,
                    child: const Text('Продолжить листать',
                        style: TextStyle(color: Colors.white70)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Простейший «салют» из цветных частиц.
class _Confetti extends StatelessWidget {
  const _Confetti();

  @override
  Widget build(BuildContext context) {
    final rnd = math.Random(7);
    final colors = [
      AppColors.primary,
      AppColors.secondary,
      AppColors.accentAmber,
      AppColors.like,
      AppColors.info,
    ];
    return IgnorePointer(
      child: Stack(
        children: List.generate(40, (i) {
          final left = rnd.nextDouble();
          final size = 6.0 + rnd.nextDouble() * 8;
          final color = colors[i % colors.length];
          final delay = (rnd.nextDouble() * 400).ms;
          return Align(
            alignment: Alignment(left * 2 - 1, -1),
            child: Container(
              margin: const EdgeInsets.only(top: 40),
              width: size,
              height: size,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(2),
              ),
            )
                .animate(onPlay: (c) => c.repeat())
                .moveY(
                  begin: -20,
                  end: MediaQuery.of(context).size.height,
                  duration: (1800 + rnd.nextInt(1200)).ms,
                  delay: delay,
                  curve: Curves.easeIn,
                )
                .rotate(begin: 0, end: rnd.nextDouble() * 2)
                .fadeOut(begin: 1, delay: 1200.ms),
          );
        }),
      ),
    );
  }
}
