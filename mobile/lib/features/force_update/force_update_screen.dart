import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_theme.dart';

/// Deeplink que o backend envia (409 + X-App-Deep-Link) para forçar atualização.
const kForceUpdateDeepLink = '/atualizar';

/// Trava dura: quando true, o router fixa o app na tela de atualização.
final forceUpdateProvider = StateProvider<bool>((_) => false);

/// URL da loja (App Store / Play Store) enviada pelo backend em X-App-Store-Url.
final forceUpdateStoreUrlProvider = StateProvider<String?>((_) => null);

class ForceUpdateScreen extends ConsumerWidget {
  const ForceUpdateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storeUrl = ref.watch(forceUpdateStoreUrlProvider);

    return PopScope(
      canPop: false, // não dá para sair/voltar — é uma atualização obrigatória
      child: Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: AppTheme.primary,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(LucideIcons.downloadCloud,
                        color: Colors.white, size: 36),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'Atualize o app',
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Uma nova versão do LogiFlow está disponível. '
                    'Atualize para continuar usando o aplicativo.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 14, height: 1.4),
                  ),
                  const SizedBox(height: 32),
                  if (storeUrl != null && storeUrl.isNotEmpty)
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () => _openStore(context, storeUrl),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primary,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        child: const Text('Atualizar agora',
                            style: TextStyle(fontSize: 16, color: Colors.white)),
                      ),
                    )
                  else
                    Text(
                      'Abra a loja de aplicativos do seu celular para atualizar.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey.shade500, fontSize: 13),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openStore(BuildContext context, String storeUrl) async {
    final uri = Uri.tryParse(storeUrl);
    final ok = uri != null &&
        await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não foi possível abrir a loja')),
      );
    }
  }
}
