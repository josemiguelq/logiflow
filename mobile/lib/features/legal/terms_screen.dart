import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/markdown_text.dart';

/// Termo de uso bloqueante: aparece ao entrar no app (ou quando a versão muda)
/// e não permite usar o app até o entregador aceitar.
class TermsScreen extends ConsumerStatefulWidget {
  const TermsScreen({super.key});

  @override
  ConsumerState<TermsScreen> createState() => _TermsScreenState();
}

class _TermsScreenState extends ConsumerState<TermsScreen> {
  String? _content;
  bool _loading = true;
  bool _accepting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient().dio.get('/deliverer/terms');
      setState(() {
        _content = res.data['content'] as String? ?? '';
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Não foi possível carregar os termos. Verifique sua conexão.';
        _loading = false;
      });
    }
  }

  Future<void> _accept() async {
    setState(() { _accepting = true; _error = null; });
    try {
      await ref.read(authProvider.notifier).acceptTerms();
      if (!mounted) return;
      final session = ref.read(authProvider);
      context.go(session?.needsOnboarding == true ? '/setup' : '/orders');
    } catch (_) {
      setState(() {
        _error = 'Não foi possível registrar o aceite. Tente novamente.';
        _accepting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // Bloqueia o gesto/botão de voltar — o aceite é obrigatório.
    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(20),
                        child: MarkdownText(_content ?? ''),
                      ),
                    ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Text(_error!, style: const TextStyle(color: Colors.red)),
                      ),
                    Padding(
                      padding: const EdgeInsets.all(20),
                      child: SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _accepting ? null : _accept,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.primary,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                          ),
                          child: _accepting
                              ? const SizedBox(
                                  height: 20, width: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Text('Li e aceito', style: TextStyle(fontSize: 16, color: Colors.white)),
                        ),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
