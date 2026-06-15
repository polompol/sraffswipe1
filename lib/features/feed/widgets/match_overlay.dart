import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/models/vacancy.dart';
import '../../../widgets/app_widgets.dart';

/// Полноэкранный оверлей мэтча — сдержанный «золотой» reveal без детских эффектов.
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
      barrierColor: AppColors.espresso.withValues(alpha: 0.92),
      transitionDuration: const Duration(milliseconds: 280),
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
          // Мягкое золотое свечение из центра.
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0, -0.25),
                  radius: 0.9,
                  colors: [
                    AppColors.accentGold.withValues(alpha: 0.28),
                    Colors.transparent,
                  ],
                ),
              ),
            ).animate().fadeIn(duration: 500.ms),
          ),
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Это мэтч',
                    style: GoogleFonts.fraunces(
                      fontSize: 46,
                      fontWeight: FontWeight.w800,
                      color: AppColors.accentGold,
                      letterSpacing: -0.5,
                    ),
                  )
                      .animate()
                      .scale(
                        begin: const Offset(0.85, 0.85),
                        end: const Offset(1, 1),
                        duration: 450.ms,
                        curve: Curves.easeOutBack,
                      )
                      .fadeIn(),
                  const SizedBox(height: 6),
                  Text(
                    'Вы и «${vacancy.companyName}» подходите друг другу',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Color(0xFFE9DFCF),
                      fontSize: 15,
                      height: 1.4,
                    ),
                  ).animate().fadeIn(delay: 150.ms),
                  const SizedBox(height: 32),
                  // Две перекрывающиеся карточки-аватара.
                  SizedBox(
                    height: 132,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        Transform.translate(
                          offset: const Offset(-44, 0),
                          child: _avatar(vacancy.interiorPhotoUrl)
                              .animate()
                              .moveX(begin: -30, end: -0, duration: 400.ms)
                              .fadeIn(delay: 200.ms),
                        ),
                        Transform.translate(
                          offset: const Offset(44, 0),
                          child: _avatar(vacancy.companyPhotoUrl)
                              .animate()
                              .moveX(begin: 30, end: 0, duration: 400.ms)
                              .fadeIn(delay: 200.ms),
                        ),
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            gradient: AppColors.brandGradient,
                            shape: BoxShape.circle,
                            border: Border.all(
                                color: AppColors.espresso, width: 3),
                          ),
                          child: const Icon(Icons.favorite_rounded,
                              color: Colors.white, size: 22),
                        ).animate().scale(
                              delay: 420.ms,
                              duration: 350.ms,
                              curve: Curves.easeOutBack,
                            ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
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
                    child: const Text(
                      'Продолжить листать',
                      style: TextStyle(color: Color(0xFFB3A18C)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _avatar(String url) {
    return Container(
      width: 116,
      height: 116,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppColors.accentGold, width: 2),
        boxShadow: [
          BoxShadow(
            color: AppColors.accentGold.withValues(alpha: 0.3),
            blurRadius: 24,
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: AppImage(url: url),
      ),
    );
  }
}
