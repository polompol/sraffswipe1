import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/enums.dart';
import '../../data/mock/mock_data.dart';
import '../../state/session_provider.dart';
import '../../widgets/app_widgets.dart';

/// Профиль соискателя: фото, роли, доступность, теги, ИНН/самозанятость.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final isEmployer = session.role == AppRole.employer;
    final seeker = session.seeker ?? MockData.me;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Профиль'),
        actions: [
          IconButton(
            tooltip: 'Выйти',
            onPressed: () {
              ref.read(sessionProvider.notifier).logout();
              context.go('/auth/phone');
            },
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: isEmployer
          ? _EmployerProfile()
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _Header(
                  name: seeker.name,
                  subtitle: '${seeker.age} лет · ${seeker.city}, ${seeker.district}',
                  photoUrl: seeker.primaryPhoto,
                  rating: seeker.rating,
                ),
                const SizedBox(height: 16),
                if (seeker.selfEmployed)
                  SectionCard(
                    child: Row(
                      children: [
                        const Icon(Icons.verified_user_outlined,
                            color: AppColors.info),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Самозанятый',
                                  style: Theme.of(context).textTheme.titleMedium),
                              Text('ИНН ${seeker.inn ?? "—"} · подтверждён',
                                  style:
                                      Theme.of(context).textTheme.bodySmall),
                            ],
                          ),
                        ),
                        const AppTag(
                          label: 'Мой налог',
                          icon: Icons.link,
                          color: AppColors.info,
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 16),
                SectionCard(
                  title: 'Должности',
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final r in seeker.roles)
                        AppTag(label: r.label, icon: r.icon, filled: true),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SectionCard(
                  title: 'Медкнижка',
                  child: Row(
                    children: [
                      Icon(
                        seeker.medBook == MedBookStatus.yes
                            ? Icons.check_circle
                            : Icons.warning_amber_rounded,
                        color: seeker.medBook == MedBookStatus.yes
                            ? AppColors.like
                            : AppColors.warning,
                      ),
                      const SizedBox(width: 10),
                      Text(seeker.medBook.label,
                          style: Theme.of(context).textTheme.bodyLarge),
                      const Spacer(),
                      TextButton.icon(
                        onPressed: () => _stub(context, 'Загрузка скана медкнижки'),
                        icon: const Icon(Icons.upload_file_outlined, size: 18),
                        label: const Text('Скан'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SectionCard(
                  title: 'График доступности',
                  child: Column(
                    children: [
                      for (final slot in seeker.availableSlots)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            children: [
                              Container(
                                width: 40,
                                alignment: Alignment.center,
                                padding: const EdgeInsets.symmetric(vertical: 4),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(slot.dayLabel,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.primary)),
                              ),
                              const SizedBox(width: 12),
                              Text(slot.timeLabel,
                                  style: Theme.of(context).textTheme.bodyLarge),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SectionCard(
                  title: 'Навыки и теги',
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final t in seeker.experienceTags) AppTag(label: t.label),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: () => _stub(context, 'Редактирование профиля'),
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Редактировать профиль'),
                ),
              ],
            ),
    );
  }

  void _stub(BuildContext context, String what) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$what — экран в разработке')),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.name,
    required this.subtitle,
    required this.photoUrl,
    required this.rating,
  });

  final String name;
  final String subtitle;
  final String photoUrl;
  final double rating;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: SizedBox(
            width: 84,
            height: 84,
            child: AppImage(url: photoUrl),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 4),
              Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 8),
              RatingStars(rating: rating, size: 16),
            ],
          ),
        ),
      ],
    );
  }
}

class _EmployerProfile extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employer = MockData.employers.first;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _Header(
          name: employer.companyName,
          subtitle: employer.address,
          photoUrl: employer.photoUrl,
          rating: employer.rating,
        ),
        const SizedBox(height: 16),
        SectionCard(
          title: 'Реквизиты',
          child: Column(
            children: [
              _kv(context, 'ИНН', employer.inn),
              _kv(context, 'ОГРН', employer.ogrn),
              _kv(context, 'Телефон', employer.contactPhone),
              Row(
                children: [
                  Icon(
                    employer.verified
                        ? Icons.verified
                        : Icons.error_outline,
                    color: employer.verified
                        ? AppColors.info
                        : AppColors.warning,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    employer.verified
                        ? 'Проверен через DaData'
                        : 'Ожидает проверки',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _kv(BuildContext context, String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Text(k, style: Theme.of(context).textTheme.bodySmall),
          const Spacer(),
          Text(v, style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}
