import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/match.dart';
import '../../data/mock/mock_data.dart';
import '../../state/matches_provider.dart';
import '../../widgets/app_widgets.dart';
import 'shift_act_pdf.dart';

/// Раздел «Мои смены»: подтверждённые смены + генерация PDF-акта.
class ShiftsScreen extends ConsumerWidget {
  const ShiftsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shifts = ref.watch(confirmedShiftsProvider);
    final notifier = ref.read(matchesProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('Мои смены')),
      body: shifts.isEmpty
          ? _empty(context)
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: shifts.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, i) {
                final match = shifts[i];
                final vacancy = notifier.vacancyFor(match);
                return _ShiftCard(
                  match: match,
                  companyName: vacancy.companyName,
                  roleLabel: vacancy.role.label,
                  dateLabel: vacancy.dateLabel,
                  timeLabel: vacancy.timeLabel,
                  pay: vacancy.estimatedPay,
                  onAct: () => _generateAct(context, match),
                );
              },
            ),
    );
  }

  Future<void> _generateAct(BuildContext context, MatchModel match) async {
    final vacancy =
        MockData.vacancies.firstWhere((v) => v.id == match.vacancyId);
    final employer =
        MockData.employers.firstWhere((e) => e.id == match.employerId);
    try {
      await ShiftActPdf.generateAndShare(
        seeker: MockData.me,
        employer: employer,
        vacancy: vacancy,
      );
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Не удалось сформировать акт: $e')),
        );
      }
    }
  }

  Widget _empty(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.calendar_month_outlined,
              size: 72, color: AppColors.primary),
          const SizedBox(height: 16),
          Text('Нет подтверждённых смен',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text('Подтвердите смену в чате после мэтча',
              style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _ShiftCard extends StatelessWidget {
  const _ShiftCard({
    required this.match,
    required this.companyName,
    required this.roleLabel,
    required this.dateLabel,
    required this.timeLabel,
    required this.pay,
    required this.onAct,
  });

  final MatchModel match;
  final String companyName;
  final String roleLabel;
  final String dateLabel;
  final String timeLabel;
  final int pay;
  final VoidCallback onAct;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(companyName,
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              AppTag(
                label: match.status.label,
                color: AppColors.like,
              ),
            ],
          ),
          const SizedBox(height: 10),
          _row(context, Icons.work_outline, roleLabel),
          _row(context, Icons.event_outlined, dateLabel),
          _row(context, Icons.schedule_outlined, timeLabel),
          _row(context, Icons.account_balance_wallet_outlined, '≈ $pay ₽'),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onAct,
              icon: const Icon(Icons.picture_as_pdf_outlined),
              label: const Text('Сформировать акт (PDF)'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.darkMuted),
          const SizedBox(width: 10),
          Text(text, style: Theme.of(context).textTheme.bodyLarge),
        ],
      ),
    );
  }
}
