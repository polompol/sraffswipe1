import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/theme/app_colors.dart';
import '../../data/models/enums.dart';
import '../../data/models/match.dart';
import '../../data/models/vacancy.dart';
import '../../state/matches_provider.dart';
import '../../state/session_provider.dart';
import '../../widgets/app_widgets.dart';
import 'widgets/confirm_shift_sheet.dart';

/// Чат по мэтчу + кнопка «Подтвердить смену».
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.matchId});

  final String matchId;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send() {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    final isSeeker =
        ref.read(sessionProvider).role == AppRole.jobSeeker;
    final me = isSeeker ? 'me' : 'employer-me';
    ref.read(matchesProvider.notifier).sendMessage(widget.matchId, me, text);
    _input.clear();
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent + 120,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final matches = ref.watch(matchesProvider);
    final notifier = ref.read(matchesProvider.notifier);
    final match = matches.where((m) => m.id == widget.matchId).firstOrNull;

    if (match == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Мэтч не найден')),
      );
    }

    final vacancy = notifier.vacancyFor(match);
    final messages = notifier.messages(widget.matchId);
    final isSeeker = ref.watch(sessionProvider).role == AppRole.jobSeeker;
    final myId = isSeeker ? 'me' : 'employer-me';

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(
                width: 38,
                height: 38,
                child: AppImage(url: vacancy.companyPhotoUrl),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(vacancy.companyName,
                      style: Theme.of(context).textTheme.titleMedium),
                  Row(
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(
                          color: AppColors.like,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text('онлайн',
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          _ShiftBanner(vacancy: vacancy, match: match),
          Expanded(
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.all(16),
              itemCount: messages.length,
              itemBuilder: (context, i) {
                final m = messages[i];
                if (m.isSystem) return _SystemBubble(text: m.text);
                final isMine = m.senderId == myId;
                return _MessageBubble(message: m, isMine: isMine);
              },
            ),
          ),
          _Composer(
            controller: _input,
            onSend: _send,
            onConfirm: () => _openConfirm(context, match, vacancy, isSeeker),
            confirmed: isSeeker
                ? match.confirmedBySeeker
                : match.confirmedByEmployer,
          ),
        ],
      ),
    );
  }

  Future<void> _openConfirm(
    BuildContext context,
    MatchModel match,
    Vacancy vacancy,
    bool isSeeker,
  ) async {
    final confirmed = await ConfirmShiftSheet.show(context, vacancy: vacancy);
    if (confirmed != true) return;
    ref
        .read(matchesProvider.notifier)
        .confirmShift(match.id, bySeeker: isSeeker);
    _scrollToBottom();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Вы подтвердили смену')),
      );
    }
  }
}

class _ShiftBanner extends StatelessWidget {
  const _ShiftBanner({required this.vacancy, required this.match});

  final Vacancy vacancy;
  final MatchModel match;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.event_outlined, color: AppColors.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${vacancy.role.label} · ${vacancy.rateLabel}',
                    style: Theme.of(context).textTheme.titleMedium),
                Text('${vacancy.dateLabel} · ${vacancy.timeLabel}',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          AppTag(
            label: match.status.label,
            color: match.status == MatchStatus.confirmed
                ? AppColors.like
                : AppColors.primary,
          ),
        ],
      ),
    );
  }
}

class _SystemBubble extends StatelessWidget {
  const _SystemBubble({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Theme.of(context).colorScheme.outline),
          ),
          child: Text(
            text,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.isMine});

  final Message message;
  final bool isMine;

  @override
  Widget build(BuildContext context) {
    final time = DateFormat('HH:mm').format(message.timestamp);
    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.74,
        ),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isMine
              ? AppColors.primary
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isMine ? 16 : 4),
            bottomRight: Radius.circular(isMine ? 4 : 16),
          ),
          border: isMine
              ? null
              : Border.all(color: Theme.of(context).colorScheme.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              message.text,
              style: TextStyle(
                color: isMine
                    ? Colors.white
                    : Theme.of(context).colorScheme.onSurface,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              time,
              style: TextStyle(
                fontSize: 11,
                color: isMine ? Colors.white70 : AppColors.darkMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.onSend,
    required this.onConfirm,
    required this.confirmed,
  });

  final TextEditingController controller;
  final VoidCallback onSend;
  final VoidCallback onConfirm;
  final bool confirmed;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          border: Border(
            top: BorderSide(color: Theme.of(context).colorScheme.outline),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: confirmed ? null : onConfirm,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(44),
                  foregroundColor: AppColors.like,
                  side: BorderSide(
                    color: confirmed
                        ? Theme.of(context).colorScheme.outline
                        : AppColors.like,
                  ),
                ),
                icon: Icon(confirmed
                    ? Icons.check_circle_rounded
                    : Icons.handshake_outlined),
                label: Text(confirmed
                    ? 'Вы подтвердили смену'
                    : 'Подтвердить смену'),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.send,
                    decoration: const InputDecoration(
                      hintText: 'Сообщение…',
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    ),
                    onSubmitted: (_) => onSend(),
                  ),
                ),
                const SizedBox(width: 8),
                Material(
                  color: AppColors.primary,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: onSend,
                    child: const SizedBox(
                      width: 48,
                      height: 48,
                      child: Icon(Icons.send_rounded, color: Colors.white),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
