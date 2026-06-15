import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/availability.dart';
import '../../data/models/enums.dart';
import '../../data/mock/mock_data.dart';
import '../../state/session_provider.dart';
import '../../widgets/app_widgets.dart';
import 'widgets/availability_editor.dart';

/// Редактирование профиля соискателя.
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  late TextEditingController _name;
  late TextEditingController _city;
  late TextEditingController _district;
  late TextEditingController _about;
  late TextEditingController _inn;
  late DateTime _birthDate;
  late Set<StaffRole> _roles;
  late MedBookStatus _medBook;
  late bool _selfEmployed;
  late List<AvailabilitySlot> _slots;

  @override
  void initState() {
    super.initState();
    final s = ref.read(sessionProvider).seeker ?? MockData.me;
    _name = TextEditingController(text: s.name);
    _city = TextEditingController(text: s.city);
    _district = TextEditingController(text: s.district);
    _about = TextEditingController(text: s.about);
    _inn = TextEditingController(text: s.inn ?? '');
    _birthDate = s.birthDate;
    _roles = {...s.roles};
    _medBook = s.medBook;
    _selfEmployed = s.selfEmployed;
    _slots = [...s.availableSlots];
  }

  @override
  void dispose() {
    _name.dispose();
    _city.dispose();
    _district.dispose();
    _about.dispose();
    _inn.dispose();
    super.dispose();
  }

  int get _age {
    final now = DateTime.now();
    var a = now.year - _birthDate.year;
    if (now.month < _birthDate.month ||
        (now.month == _birthDate.month && now.day < _birthDate.day)) {
      a--;
    }
    return a;
  }

  String? _validate() {
    if (_name.text.trim().isEmpty) return 'Укажите имя';
    if (_age < 18) return 'Сервис доступен только с 18 лет';
    if (_roles.isEmpty) return 'Выберите хотя бы одну должность';
    if (_selfEmployed && _inn.text.trim().length != 12) {
      return 'ИНН самозанятого — 12 цифр';
    }
    return null;
  }

  void _save() {
    final err = _validate();
    if (err != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(err)));
      return;
    }
    final base = ref.read(sessionProvider).seeker ?? MockData.me;
    final updated = base.copyWith(
      name: _name.text.trim(),
      city: _city.text.trim(),
      district: _district.text.trim(),
      about: _about.text.trim(),
      birthDate: _birthDate,
      roles: _roles.toList(),
      medBook: _medBook,
      selfEmployed: _selfEmployed,
      inn: _inn.text.trim().isEmpty ? null : _inn.text.trim(),
      availableSlots: _slots,
    );
    ref.read(sessionProvider.notifier).updateSeeker(updated);
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Профиль сохранён')));
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Редактировать профиль')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            title: 'Основное',
            child: Column(
              children: [
                TextField(
                  controller: _name,
                  decoration: const InputDecoration(labelText: 'Имя'),
                ),
                const SizedBox(height: 12),
                InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _pickBirthDate,
                  child: InputDecorator(
                    decoration: InputDecoration(
                      labelText: 'Дата рождения',
                      helperText: _age < 18 ? 'Только 18+' : 'Возраст: $_age',
                      helperStyle: TextStyle(
                          color: _age < 18 ? AppColors.danger : null),
                    ),
                    child: Text(
                      '${_birthDate.day}.${_birthDate.month}.${_birthDate.year}',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _city,
                        decoration: const InputDecoration(labelText: 'Город'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _district,
                        decoration: const InputDecoration(labelText: 'Район'),
                      ),
                    ),
                  ],
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
                for (final r in StaffRole.values)
                  FilterChip(
                    label: Text(r.label),
                    avatar: Icon(r.icon, size: 16),
                    selected: _roles.contains(r),
                    onSelected: (v) => setState(() {
                      if (v) {
                        _roles.add(r);
                      } else {
                        _roles.remove(r);
                      }
                    }),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Медкнижка',
            child: Wrap(
              spacing: 8,
              children: [
                for (final m in MedBookStatus.values)
                  ChoiceChip(
                    label: Text(m.label),
                    selected: _medBook == m,
                    onSelected: (_) => setState(() => _medBook = m),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Самозанятость',
            child: Column(
              children: [
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _selfEmployed,
                  title: const Text('Я самозанятый (плательщик НПД)'),
                  onChanged: (v) => setState(() => _selfEmployed = v),
                ),
                if (_selfEmployed)
                  TextField(
                    controller: _inn,
                    keyboardType: TextInputType.number,
                    maxLength: 12,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                    ],
                    decoration: const InputDecoration(
                      labelText: 'ИНН',
                      counterText: '',
                      helperText: 'Проверяется через DaData (при подключении)',
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'График доступности',
            child: AvailabilityEditor(
              slots: _slots,
              onChanged: (next) => setState(() => _slots = next),
            ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            title: 'О себе',
            child: TextField(
              controller: _about,
              minLines: 3,
              maxLines: 6,
              decoration:
                  const InputDecoration(hintText: 'Коротко об опыте и навыках'),
            ),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: _save,
            icon: const Icon(Icons.check_rounded),
            label: const Text('Сохранить'),
          ),
        ],
      ),
    );
  }

  Future<void> _pickBirthDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _birthDate,
      firstDate: DateTime(now.year - 70),
      lastDate: now,
    );
    if (picked != null) setState(() => _birthDate = picked);
  }
}
