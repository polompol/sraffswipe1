import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/enums.dart';
import '../../state/matches_provider.dart';
import '../../state/session_provider.dart';
import '../feed/feed_screen.dart';
import '../matches/matches_screen.dart';
import '../profile/profile_screen.dart';
import '../shifts/shifts_screen.dart';

/// Корневой экран с нижней навигацией. Набор вкладок зависит от роли.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final isEmployer = ref.watch(sessionProvider).role == AppRole.employer;
    final matchCount = ref.watch(matchesProvider).length;

    final tabs = <Widget>[
      const FeedScreen(),
      const MatchesScreen(),
      const ShiftsScreen(),
      const ProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: tabs),
      floatingActionButton: isEmployer && _index == 0
          ? FloatingActionButton.extended(
              onPressed: () => context.push('/vacancy/new'),
              backgroundColor: AppColors.primary,
              icon: const Icon(Icons.add, color: Colors.white),
              label: const Text('Вакансия',
                  style: TextStyle(color: Colors.white)),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.style_outlined),
            selectedIcon: Icon(Icons.style),
            label: 'Лента',
          ),
          NavigationDestination(
            icon: _badge(const Icon(Icons.favorite_border), matchCount),
            selectedIcon: _badge(const Icon(Icons.favorite), matchCount),
            label: 'Мэтчи',
          ),
          const NavigationDestination(
            icon: Icon(Icons.calendar_today_outlined),
            selectedIcon: Icon(Icons.calendar_today),
            label: 'Смены',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Профиль',
          ),
        ],
      ),
    );
  }

  Widget _badge(Widget child, int count) {
    if (count == 0) return child;
    return Badge.count(count: count, child: child);
  }
}
