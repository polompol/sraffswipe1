import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/vacancy.dart';
import '../data/mock/mock_data.dart';

/// Вакансии, созданные текущим работодателем.
class EmployerVacancies extends StateNotifier<List<Vacancy>> {
  EmployerVacancies()
      : super(MockData.vacancies
            .where((v) => v.employerId == 'emp1')
            .toList());

  void add(Vacancy vacancy) {
    state = [vacancy, ...state];
  }
}

final employerVacanciesProvider =
    StateNotifierProvider<EmployerVacancies, List<Vacancy>>(
        (ref) => EmployerVacancies());
