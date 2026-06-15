import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/enums.dart';
import '../data/models/seeker.dart';
import '../data/mock/mock_data.dart';

/// Состояние сессии: авторизован ли пользователь и в какой роли.
class SessionState {
  const SessionState({
    this.isAuthenticated = false,
    this.phone,
    this.role,
    this.seeker,
  });

  final bool isAuthenticated;
  final String? phone;
  final AppRole? role;
  final Seeker? seeker; // профиль текущего соискателя (для роли jobSeeker)

  bool get hasRole => role != null;

  SessionState copyWith({
    bool? isAuthenticated,
    String? phone,
    AppRole? role,
    Seeker? seeker,
  }) {
    return SessionState(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      phone: phone ?? this.phone,
      role: role ?? this.role,
      seeker: seeker ?? this.seeker,
    );
  }
}

class SessionNotifier extends StateNotifier<SessionState> {
  SessionNotifier() : super(const SessionState());

  /// Имитация отправки SMS-кода (в проде — МТС Exolve / SMSC.ru).
  Future<void> requestSmsCode(String phone) async {
    await Future<void>.delayed(const Duration(milliseconds: 600));
    state = state.copyWith(phone: phone);
  }

  /// Имитация верификации кода и выдачи JWT.
  Future<bool> verifyCode(String code) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    // Любой 4-значный код принимается в демо-режиме.
    final ok = code.length == 4;
    if (ok) {
      state = state.copyWith(isAuthenticated: true);
    }
    return ok;
  }

  void chooseRole(AppRole role) {
    state = state.copyWith(
      role: role,
      seeker: role == AppRole.jobSeeker ? MockData.me : null,
    );
  }

  void updateSeeker(Seeker seeker) {
    state = state.copyWith(seeker: seeker);
  }

  void logout() {
    state = const SessionState();
  }
}

final sessionProvider =
    StateNotifierProvider<SessionNotifier, SessionState>((ref) {
  return SessionNotifier();
});
