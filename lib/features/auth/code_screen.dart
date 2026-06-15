import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../state/session_provider.dart';

/// Ввод 4-значного SMS-кода. Любой код из 4 цифр принимается в демо.
class CodeScreen extends ConsumerStatefulWidget {
  const CodeScreen({super.key});

  @override
  ConsumerState<CodeScreen> createState() => _CodeScreenState();
}

class _CodeScreenState extends ConsumerState<CodeScreen> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _verify(String code) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final ok = await ref.read(sessionProvider.notifier).verifyCode(code);
    if (!mounted) return;
    setState(() => _loading = false);
    if (ok) {
      context.go('/role');
    } else {
      setState(() => _error = 'Неверный код. Введите 4 цифры.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final phone = ref.watch(sessionProvider).phone ?? '';
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Введите код',
                  style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 8),
              Text('Отправили SMS на $phone',
                  style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 32),
              _CodeField(
                controller: _controller,
                onCompleted: _verify,
                error: _error,
              ),
              const SizedBox(height: 24),
              if (_loading)
                const Center(child: CircularProgressIndicator())
              else
                Center(
                  child: TextButton.icon(
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Код отправлен повторно')),
                      );
                    },
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Отправить код повторно'),
                  ),
                ),
              const Spacer(),
              Text(
                'Подсказка демо: введите любые 4 цифры.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CodeField extends StatelessWidget {
  const _CodeField({
    required this.controller,
    required this.onCompleted,
    this.error,
  });

  final TextEditingController controller;
  final ValueChanged<String> onCompleted;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.number,
          maxLength: 4,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 34,
            fontWeight: FontWeight.w800,
            letterSpacing: 18,
          ),
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(4),
          ],
          decoration: InputDecoration(
            counterText: '',
            hintText: '••••',
            errorText: error,
          ),
          onChanged: (value) {
            if (value.length == 4) onCompleted(value);
          },
        ),
      ],
    );
  }
}
