import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/models/availability.dart';

/// Редактор слотов доступности: день недели + интервал времени.
class AvailabilityEditor extends StatelessWidget {
  const AvailabilityEditor({
    super.key,
    required this.slots,
    required this.onChanged,
  });

  final List<AvailabilitySlot> slots;
  final ValueChanged<List<AvailabilitySlot>> onChanged;

  static const _days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  Future<void> _add(BuildContext context) async {
    final slot = await showModalBottomSheet<AvailabilitySlot>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => const _SlotSheet(),
    );
    if (slot != null) onChanged([...slots, slot]);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (slots.isEmpty)
          Text('Слоты не добавлены',
              style: Theme.of(context).textTheme.bodySmall),
        ...slots.asMap().entries.map((e) {
          final i = e.key;
          final slot = e.value;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                Container(
                  width: 42,
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.14),
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
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.delete_outline_rounded,
                      color: AppColors.danger),
                  onPressed: () {
                    final next = [...slots]..removeAt(i);
                    onChanged(next);
                  },
                ),
              ],
            ),
          );
        }),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => _add(context),
          icon: const Icon(Icons.add_rounded),
          label: const Text('Добавить слот'),
        ),
      ],
    );
  }
}

class _SlotSheet extends StatefulWidget {
  const _SlotSheet();

  @override
  State<_SlotSheet> createState() => _SlotSheetState();
}

class _SlotSheetState extends State<_SlotSheet> {
  int _weekday = 1;
  TimeOfDay _start = const TimeOfDay(hour: 10, minute: 0);
  TimeOfDay _end = const TimeOfDay(hour: 18, minute: 0);

  int _min(TimeOfDay t) => t.hour * 60 + t.minute;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 0, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Новый слот', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          Text('День недели', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: List.generate(7, (i) {
              final wd = i + 1;
              return ChoiceChip(
                label: Text(AvailabilityEditor._days[i]),
                selected: _weekday == wd,
                onSelected: (_) => setState(() => _weekday = wd),
              );
            }),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _TimeField(
                  label: 'Начало',
                  value: _start,
                  onPick: (t) => setState(() => _start = t),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _TimeField(
                  label: 'Конец',
                  value: _end,
                  onPick: (t) => setState(() => _end = t),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () => Navigator.pop(
              context,
              AvailabilitySlot(
                weekday: _weekday,
                start: _min(_start),
                end: _min(_end),
              ),
            ),
            child: const Text('Добавить'),
          ),
        ],
      ),
    );
  }
}

class _TimeField extends StatelessWidget {
  const _TimeField(
      {required this.label, required this.value, required this.onPick});

  final String label;
  final TimeOfDay value;
  final ValueChanged<TimeOfDay> onPick;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () async {
        final t = await showTimePicker(context: context, initialTime: value);
        if (t != null) onPick(t);
      },
      child: InputDecorator(
        decoration: InputDecoration(labelText: label),
        child: Text(value.format(context),
            style: Theme.of(context).textTheme.titleMedium),
      ),
    );
  }
}
