import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../core/theme/app_theme.dart';
import '../tracking/location_service.dart';

class CashHandoverScreen extends ConsumerStatefulWidget {
  final String routeId;
  final String token;
  final double totalCash;

  const CashHandoverScreen({
    super.key,
    required this.routeId,
    required this.token,
    required this.totalCash,
  });

  @override
  ConsumerState<CashHandoverScreen> createState() => _CashHandoverScreenState();
}

class _CashHandoverScreenState extends ConsumerState<CashHandoverScreen> {
  bool _confirmed = false;
  StreamSubscription<WsMessage>? _wsSub;

  @override
  void initState() {
    super.initState();
    // Listen for confirmation from the web app via WebSocket
    final locationService = ref.read(locationServiceProvider);
    _wsSub = locationService.messageStream.listen((msg) {
      final event   = msg['event'] as String?;
      final data    = msg['data']  as Map<String, dynamic>?;
      final routeId = data?['routeId'] as String?;
      if (event == 'handover_confirmed' && routeId == widget.routeId && mounted) {
        setState(() => _confirmed = true);
      }
    });
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final totalFormatted =
        'R\$ ${widget.totalCash.toStringAsFixed(2).replaceAll('.', ',')}';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Acerto de dinheiro'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/orders'),
        ),
      ),
      body: _confirmed ? _ConfirmedView(onDone: () => context.go('/orders')) : SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // Total
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFF59E0B), width: 1.5),
              ),
              child: Column(
                children: [
                  const Text('Total a entregar',
                      style: TextStyle(
                          color: Color(0xFF92400E),
                          fontWeight: FontWeight.w600,
                          fontSize: 14)),
                  const SizedBox(height: 6),
                  Text(
                    totalFormatted,
                    style: const TextStyle(
                      fontSize: 36,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFF92400E),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 28),
            const Text('QR Code para o painel',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            const SizedBox(height: 4),
            Text('Mostre este QR Code para que o gerente escaneie ou digite o código',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            const SizedBox(height: 16),

            // QR code
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.grey.shade200),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.06),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: QrImageView(
                data: widget.token,
                version: QrVersions.auto,
                size: 220,
                backgroundColor: Colors.white,
              ),
            ),

            const SizedBox(height: 24),
            const Text('Ou informe o código manualmente',
                style: TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
            const SizedBox(height: 12),

            // Code display
            GestureDetector(
              onTap: () {
                Clipboard.setData(ClipboardData(text: widget.token));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Código copiado!')),
                );
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      widget.token,
                      style: const TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 8,
                        fontFamily: 'monospace',
                        color: Color(0xFF1E293B),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Icon(Icons.copy_outlined, size: 20, color: Colors.grey.shade500),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 32),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Aguardando confirmação do gerente...',
                      style: TextStyle(
                          fontSize: 13, color: Colors.grey.shade600),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),
            TextButton(
              onPressed: () => context.go('/orders'),
              child: const Text('Fazer isso depois'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConfirmedView extends StatelessWidget {
  final VoidCallback onDone;
  const _ConfirmedView({required this.onDone});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFFF0FDF4),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFF16A34A), width: 2),
              ),
              child: const Icon(Icons.check_circle,
                  size: 64, color: Color(0xFF16A34A)),
            ),
            const SizedBox(height: 20),
            const Text('Dinheiro confirmado!',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('O gerente confirmou o recebimento do dinheiro.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade600)),
            const SizedBox(height: 32),
            ElevatedButton.icon(
              onPressed: onDone,
              icon: const Icon(Icons.inbox_outlined),
              label: const Text('Ver pedidos disponíveis'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
