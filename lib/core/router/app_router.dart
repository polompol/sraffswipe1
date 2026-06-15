import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/code_screen.dart';
import '../../features/auth/phone_screen.dart';
import '../../features/auth/role_screen.dart';
import '../../features/chat/chat_screen.dart';
import '../../features/shell/home_shell.dart';
import '../../features/vacancy/create_vacancy_screen.dart';
import '../../state/session_provider.dart';

/// Маршрутизация приложения. Доступ к /home требует авторизации и выбранной роли.
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/auth/phone',
    refreshListenable: _SessionListenable(ref),
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      final loc = state.matchedLocation;
      final authArea = loc.startsWith('/auth') || loc == '/role';

      if (!session.isAuthenticated) {
        return loc.startsWith('/auth') ? null : '/auth/phone';
      }
      // Авторизован, но роль не выбрана.
      if (!session.hasRole && loc != '/role') {
        return '/role';
      }
      // Авторизован и с ролью — не пускаем обратно в авторизацию.
      if (session.hasRole && authArea) {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/auth/phone',
        builder: (_, __) => const PhoneScreen(),
      ),
      GoRoute(
        path: '/auth/code',
        builder: (_, __) => const CodeScreen(),
      ),
      GoRoute(
        path: '/role',
        builder: (_, __) => const RoleScreen(),
      ),
      GoRoute(
        path: '/home',
        builder: (_, __) => const HomeShell(),
      ),
      GoRoute(
        path: '/vacancy/new',
        builder: (_, __) => const CreateVacancyScreen(),
      ),
      GoRoute(
        path: '/chat/:matchId',
        builder: (_, state) =>
            ChatScreen(matchId: state.pathParameters['matchId']!),
      ),
    ],
  );
});

/// Адаптер StateNotifier → Listenable для go_router.refreshListenable.
class _SessionListenable extends ChangeNotifier {
  _SessionListenable(Ref ref) {
    ref.listen(sessionProvider, (_, __) => notifyListeners());
  }
}
