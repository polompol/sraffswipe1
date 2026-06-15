import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/models/vacancy.dart';

/// Модальное окно подтверждения смены: фиксирует ставку и время.
class ConfirmShiftSheet extends StatelessWidget {
  const ConfirmShiftSheet({super.key, required this.vacancy});

  final Vacancy vacancy;

  static Future<bool?> show(BuildContext context,
      {required Vacancy vacancy}) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => ConfirmShiftSheet(vacancy: vacancy),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Подтверждение смены',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(
            'Обе стороны должны подтвердить. После этого смена попадёт '
            'в календарь, а для самозанятого сформируется акт.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 20),
          _row(context, Icons.storefront_outlined, 'Заведение',
              vacancy.companyName),
          _row(context, vacancy.role.icon, 'Должность', vacancy.role.label),
          _row(context, Icons.event_outlined, 'Дата', vacancy.dateLabel),
          _row(context, Icons.schedule_outlined, 'Время', vacancy.timeLabel),
          _row(context, Icons.payments_outlined, 'Ставка', vacancy.rateLabel),
          _row(context, Icons.account_balance_wallet_outlined,
              'Итого за смену', '≈ ${vacancy.estimatedPay} ₽'),
          _row(context, Icons.place_outlined, 'Адрес', vacancy.address),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Отмена'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => Navigator.pop(context, true),
                  style: FilledButton.styleFrom(
                      backgroundColor: AppColors.like),
                  icon: const Icon(Icons.check_rounded),
                  label: const Text('Подтверждаю'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _row(
      BuildContext context, IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.primary),
          const SizedBox(width: 12),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontSize: 15),
            ),
          ),
        ],
      ),
    );
  }
}
