import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/enums.dart';
import '../../data/models/vacancy.dart';
import '../../data/mock/mock_data.dart';
import '../../state/employer_provider.dart';
import '../../widgets/app_widgets.dart';

/// Создание вакансии работодателем «за 2 минуты».
class CreateVacancyScreen extends ConsumerStatefulWidget {
  const CreateVacancyScreen({super.key});

  @override
  ConsumerState<CreateVacancyScreen> createState() =>
      _CreateVacancyScreenState();
}

class _CreateVacancyScreenState extends ConsumerState<CreateVacancyScreen> {
  StaffRole _role = StaffRole.waiter;
  DateTime _date = DateTime.now().add(const Duration(days: 1));
  TimeOfDay _start = const TimeOfDay(hour: 10, minute: 0);
  TimeOfDay _end = const TimeOfDay(hour: 22, minute: 0);
  RateType _rateType = RateType.perHour;
  final _rateCtrl = TextEditingController(text: '350');
  final _descCtrl = TextEditingController();
  final _addressCtrl =
      TextEditingController(text: 'Москва, ул. Льва Толстого, 16');
  bool _requireMedBook = true;
  bool _requireExperience = false;

  @override
  void dispose() {
    _rateCtrl.dispose();
    _descCtrl.dispose();
    _addressCtrl.dispose();
    super.dispose();
  }

  int _toMinutes(TimeOfDay t) => t.hour * 60 + t.minute;

  void _publish() {
    final employer = MockData.employers.first;
    final vacancy = Vacancy(
      id: const Uuid().v4(),
      employerId: employer.id,
      companyName: employer.companyName,
      companyPhotoUrl: employer.photoUrl,
      role: _role,
      date: _date,
      startTime: _toMinutes(_start),
      endTime: _toMinutes(_end),
      rate: int.tryParse(_rateCtrl.text) ?? 0,
      rateType: _rateType,
      description: _descCtrl.text.isEmpty
          ? 'Срочно нужен сотрудник на смену.'
          : _descCtrl.text,
      requireMedBook: _requireMedBook,
      requireExperience: _requireExperience,
      location: employer.location,
      address: _addressCtrl.text,
      interiorPhotoUrl: employer.photoUrl,
      employerVerified: employer.verified,
    );
    ref.read(employerVacanciesProvider.notifier).add(vacancy);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Вакансия опубликована')),
    );
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Новая вакансия')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            title: 'Должность',
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final r in StaffRole.values)
                  ChoiceChip(
                    label: Text(r.label),
                    avatar: Icon(r.icon, size: 16),
                    selected: _role == r,
                    onSelected: (_) => setState(() => _role = r),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Дата и время смены',
            child: Column(
              children: [
                _pickerRow(
                  icon: Icons.event_outlined,
                  label: 'Дата',
                  value: '${_date.day}.${_date.month}.${_date.year}',
                  onTap: _pickDate,
                ),
                const Divider(),
                _pickerRow(
                  icon: Icons.schedule_outlined,
                  label: 'Начало',
                  value: _start.format(context),
                  onTap: () => _pickTime(true),
                ),
                const Divider(),
                _pickerRow(
                  icon: Icons.schedule_outlined,
                  label: 'Окончание',
                  value: _end.format(context),
                  onTap: () => _pickTime(false),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Ставка',
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _rateCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.payments_outlined),
                          suffixText: '₽',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    SegmentedButton<RateType>(
                      segments: const [
                        ButtonSegment(
                            value: RateType.perHour, label: Text('/час')),
                        ButtonSegment(
                            value: RateType.perShift, label: Text('/смена')),
                      ],
                      selected: {_rateType},
                      onSelectionChanged: (s) =>
                          setState(() => _rateType = s.first),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Адрес',
            child: TextField(
              controller: _addressCtrl,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.map_outlined),
                hintText: 'Выберите точку на Яндекс.Картах',
                helperText: 'В проде — выбор адреса через yandex_mapkit',
              ),
            ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Требования',
            child: Column(
              children: [
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _requireMedBook,
                  activeColor: AppColors.primary,
                  title: const Text('Нужна медкнижка'),
                  onChanged: (v) => setState(() => _requireMedBook = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _requireExperience,
                  activeColor: AppColors.primary,
                  title: const Text('Нужен опыт'),
                  onChanged: (v) => setState(() => _requireExperience = v),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Описание',
            child: TextField(
              controller: _descCtrl,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                hintText: 'Дресс-код, бонусы, питание, чаевые…',
              ),
            ),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: _publish,
            icon: const Icon(Icons.send_rounded),
            label: const Text('Опубликовать вакансию'),
          ),
        ],
      ),
    );
  }

  Widget _pickerRow({
    required IconData icon,
    required String label,
    required String value,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(icon, size: 20, color: AppColors.primary),
            const SizedBox(width: 12),
            Text(label, style: Theme.of(context).textTheme.bodyLarge),
            const Spacer(),
            Text(value, style: Theme.of(context).textTheme.titleMedium),
            const Icon(Icons.chevron_right_rounded),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 60)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickTime(bool isStart) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: isStart ? _start : _end,
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _start = picked;
        } else {
          _end = picked;
        }
      });
    }
  }
}
