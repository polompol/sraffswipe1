import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/vacancy.dart';
import '../../state/employer_provider.dart';
import '../../widgets/app_widgets.dart';

/// Список вакансий текущего работодателя.
class MyVacanciesScreen extends ConsumerWidget {
  const MyVacanciesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vacancies = ref.watch(employerVacanciesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Мои вакансии'),
        actions: [
          IconButton(
            tooltip: 'Новая вакансия',
            onPressed: () => context.push('/vacancy/new'),
            icon: const Icon(Icons.add_rounded),
          ),
        ],
      ),
      body: vacancies.isEmpty
          ? _empty(context)
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: vacancies.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, i) => _VacancyTile(vacancy: vacancies[i]),
            ),
    );
  }

  Widget _empty(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.post_add_rounded, size: 72, color: AppColors.primary),
          const SizedBox(height: 16),
          Text('Пока нет вакансий',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text('Создайте первую за 2 минуты',
              style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _VacancyTile extends StatelessWidget {
  const _VacancyTile({required this.vacancy});

  final Vacancy vacancy;

  @override
  Widget build(BuildContext context) {
    final active = vacancy.status == 'active';
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(vacancy.role.icon, color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(vacancy.role.label,
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              AppTag(
                label: active ? 'Активна' : 'Закрыта',
                color: active ? AppColors.success : AppColors.lightMuted,
              ),
            ],
          ),
          const SizedBox(height: 10),
          _row(context, Icons.event_outlined,
              '${vacancy.dateLabel} · ${vacancy.timeLabel}'),
          _row(context, Icons.payments_outlined, vacancy.rateLabel),
          _row(context, Icons.place_outlined, vacancy.address),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.people_alt_outlined,
                  size: 18, color: AppColors.lightMuted),
              const SizedBox(width: 8),
              Text('Откликов: ${vacancy.id.hashCode.abs() % 9 + 1}',
                  style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.lightMuted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: Theme.of(context).textTheme.bodyLarge),
          ),
        ],
      ),
    );
  }
}
