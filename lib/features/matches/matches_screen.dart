import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/enums.dart';
import '../../state/matches_provider.dart';
import '../../widgets/app_widgets.dart';

/// Список мэтчей → переход в чат.
class MatchesScreen extends ConsumerWidget {
  const MatchesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = ref.watch(matchesProvider);
    final notifier = ref.read(matchesProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('Мэтчи')),
      body: matches.isEmpty
          ? _empty(context)
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: matches.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, i) {
                final match = matches[i];
                final vacancy = notifier.vacancyFor(match);
                final lastMessages = notifier.messages(match.id);
                final last =
                    lastMessages.isNotEmpty ? lastMessages.last.text : '';
                return _MatchTile(
                  photoUrl: vacancy.companyPhotoUrl,
                  title: vacancy.companyName,
                  subtitle: '${vacancy.role.label} · ${vacancy.shortDateLabel}',
                  preview: last,
                  status: match.status,
                  onTap: () => context.push('/chat/${match.id}'),
                );
              },
            ),
    );
  }

  Widget _empty(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.favorite_border_rounded,
              size: 72, color: AppColors.dislike),
          const SizedBox(height: 16),
          Text('Пока нет мэтчей',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text('Свайпайте вправо понравившиеся смены',
              style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _MatchTile extends StatelessWidget {
  const _MatchTile({
    required this.photoUrl,
    required this.title,
    required this.subtitle,
    required this.preview,
    required this.status,
    required this.onTap,
  });

  final String photoUrl;
  final String title;
  final String subtitle;
  final String preview;
  final MatchStatus status;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Theme.of(context).colorScheme.outline),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 56,
                height: 56,
                child: AppImage(url: photoUrl),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium),
                      ),
                      if (status == MatchStatus.confirmed)
                        const Icon(Icons.event_available_rounded,
                            color: AppColors.like, size: 20),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 4),
                  Text(
                    preview,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: AppColors.darkMuted),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded),
          ],
        ),
      ),
    );
  }
}
