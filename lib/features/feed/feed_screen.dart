import 'package:flutter/material.dart';
import 'package:flutter_card_swiper/flutter_card_swiper.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/enums.dart';
import '../../data/models/seeker.dart';
import '../../data/models/vacancy.dart';
import '../../state/feed_provider.dart';
import '../../state/matches_provider.dart';
import '../../state/session_provider.dart';
import 'widgets/match_overlay.dart';
import 'widgets/seeker_card.dart';
import 'widgets/swipe_action_bar.dart';
import 'widgets/vacancy_card.dart';

/// Главный экран со свайпом. Показывает вакансии (соискатель) или
/// кандидатов (работодатель) в зависимости от роли сессии.
class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  final CardSwiperController _controller = CardSwiperController();
  bool _finished = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(sessionProvider).role ?? AppRole.jobSeeker;
    final isSeeker = role == AppRole.jobSeeker;

    final vacancies = ref.watch(vacanciesFeedProvider);
    final candidates = ref.watch(candidatesFeedProvider);
    final count = isSeeker ? vacancies.length : candidates.length;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Row(
          children: [
            const Text('Staff'),
            ShaderMask(
              shaderCallback: (r) => AppColors.brandGradient.createShader(r),
              child: const Text(
                'Swipe',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 20,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Фильтры',
            onPressed: () => _showFilters(context),
            icon: const Icon(Icons.tune_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            children: [
              Text(
                isSeeker
                    ? 'Смены рядом с вами · ${vacancies.length}'
                    : 'Кандидаты рядом · ${candidates.length}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              Expanded(
                child: (_finished || count == 0)
                    ? _EmptyState(isSeeker: isSeeker)
                    : CardSwiper(
                        controller: _controller,
                        cardsCount: count,
                        numberOfCardsDisplayed: count >= 3 ? 3 : count,
                        isLoop: false,
                        backCardOffset: const Offset(0, 40),
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        allowedSwipeDirection:
                            const AllowedSwipeDirection.symmetric(
                          horizontal: true,
                          vertical: true,
                        ),
                        onSwipe: (prev, current, direction) {
                          _handleSwipe(
                            isSeeker: isSeeker,
                            index: prev,
                            direction: direction,
                            vacancies: vacancies,
                            candidates: candidates,
                          );
                          return true;
                        },
                        onEnd: () => setState(() => _finished = true),
                        cardBuilder:
                            (context, index, percentX, percentY) {
                          if (isSeeker) {
                            return VacancyCard(
                              vacancy: vacancies[index],
                              percentX: percentX,
                              percentY: percentY,
                            );
                          }
                          return SeekerCard(
                            seeker: candidates[index],
                            percentX: percentX,
                            percentY: percentY,
                          );
                        },
                      ),
              ),
              const SizedBox(height: 16),
              if (!_finished && count > 0)
                SwipeActionBar(
                  onUndo: () {
                    setState(() => _finished = false);
                    _controller.undo();
                  },
                  onDislike: () =>
                      _controller.swipe(CardSwiperDirection.left),
                  onSuperlike: () =>
                      _controller.swipe(CardSwiperDirection.top),
                  onLike: () =>
                      _controller.swipe(CardSwiperDirection.right),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleSwipe({
    required bool isSeeker,
    required int index,
    required CardSwiperDirection direction,
    required List<Vacancy> vacancies,
    required List<Seeker> candidates,
  }) {
    final swipe = switch (direction) {
      CardSwiperDirection.right => SwipeDirection.like,
      CardSwiperDirection.top => SwipeDirection.superlike,
      _ => SwipeDirection.dislike,
    };

    if (isSeeker) {
      final vacancy = vacancies[index];
      ref.read(swipeLogProvider.notifier).record(vacancy.id, swipe);
      if (swipe != SwipeDirection.dislike) {
        // Демо: работодатель «уже лайкнул» — сразу мэтч.
        final match =
            ref.read(matchesProvider.notifier).createMatchForVacancy(vacancy);
        if (swipe == SwipeDirection.superlike) {
          ref.read(matchesProvider.notifier).postSystem(
              match.id, 'Соискатель отметил смену как срочную ⚡️');
        }
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          MatchOverlay.show(
            context,
            vacancy: vacancy,
            onChat: () => context.push('/chat/${match.id}'),
          );
        });
      }
    } else {
      final seeker = candidates[index];
      ref.read(swipeLogProvider.notifier).record(seeker.id, swipe);
      if (swipe != SwipeDirection.dislike) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Отклик отправлен ${seeker.name}')),
        );
      }
    }
  }

  void _showFilters(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Фильтры', style: Theme.of(ctx).textTheme.titleLarge),
            const SizedBox(height: 16),
            const _FilterRow(icon: Icons.place_outlined, label: 'Радиус: 5 км'),
            const _FilterRow(
                icon: Icons.payments_outlined, label: 'Ставка: от 300 ₽/час'),
            const _FilterRow(
                icon: Icons.event_outlined, label: 'Дата: на этой неделе'),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Применить'),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.primary),
          const SizedBox(width: 12),
          Text(label, style: Theme.of(context).textTheme.bodyLarge),
          const Spacer(),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.isSeeker});

  final bool isSeeker;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.check_circle_outline,
              size: 72, color: AppColors.like),
          const SizedBox(height: 16),
          Text(
            isSeeker ? 'Вы посмотрели все смены' : 'Кандидаты закончились',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          Text(
            'Загляните позже — появляются новые',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
