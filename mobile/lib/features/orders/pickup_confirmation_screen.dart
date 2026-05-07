import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/models/order.dart';
import '../../core/models/route.dart';
import '../../core/providers/store_settings_provider.dart';
import '../../core/theme/app_theme.dart';

class PickupConfirmationScreen extends ConsumerStatefulWidget {
  final DelivererRoute route;
  const PickupConfirmationScreen({super.key, required this.route});

  @override
  ConsumerState<PickupConfirmationScreen> createState() => _PickupConfirmationScreenState();
}

class _PickupConfirmationScreenState extends ConsumerState<PickupConfirmationScreen> {
  final _ctrl = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _saveRouteOrder();
  }

  Future<void> _saveRouteOrder() async {
    try {
      await ApiClient().dio.patch('/deliverer/orders/route', data: {
        'orderIds': widget.route.orders.map((o) => o.id).toList(),
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _confirm({bool skipCode = false}) async {
    final settings = await ref.read(storeSettingsProvider.future);
    final requireCode = settings.requirePickupCode && !skipCode;

    final code = _ctrl.text.trim().toUpperCase();
    if (requireCode && code.length != 5) {
      setState(() => _error = 'Código deve ter 5 caracteres');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient().dio.post(
        '/deliverer/routes/${widget.route.id}/pickup',
        data: {'code': requireCode ? code : ''},
      );
      if (mounted) context.go('/delivery');
    } catch (e) {
      final msg = (e as dynamic).response?.data?['error'] as String? ?? 'Código incorreto';
      setState(() => _error = msg);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final orders   = widget.route.orders;
    final settings = ref.watch(storeSettingsProvider);
    final requirePickupCode = settings.value?.requirePickupCode ?? true;

    return Scaffold(
      appBar: AppBar(title: const Text('Confirmar retirada')),
      body: Column(
        children: [
          // Info banner
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: const Color(0xFFF0FDF4),
            child: Row(children: [
              const Icon(Icons.info_outline, color: Color(0xFF16A34A), size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  requirePickupCode
                      ? 'Peça o código de retirada da rota para a loja e confirme abaixo'
                      : 'Confirme que você retirou os pedidos da loja',
                  style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
                ),
              ),
            ]),
          ),

          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Order count badge
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: _error != null ? const Color(0xFFDC2626) : const Color(0xFFE5E7EB),
                      ),
                    ),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppTheme.primary.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              '${orders.length} pedido${orders.length != 1 ? 's' : ''}',
                              style: TextStyle(
                                color: AppTheme.primary,
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'nesta rota',
                            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                          ),
                        ]),
                        if (requirePickupCode) ...[
                          const SizedBox(height: 16),
                          TextField(
                            controller: _ctrl,
                            maxLength: 5,
                            textCapitalization: TextCapitalization.characters,
                            autofocus: true,
                            decoration: InputDecoration(
                              labelText: 'Código de retirada da rota',
                              hintText: 'XXXXX',
                              counterText: '',
                              errorText: _error,
                              prefixIcon: const Icon(Icons.key_outlined, size: 20),
                              isDense: true,
                            ),
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              letterSpacing: 4,
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                            ),
                            onSubmitted: (_) => _confirm(),
                          ),
                        ] else if (_error != null) ...[
                          const SizedBox(height: 8),
                          Text(_error!,
                              style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
                        ],
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  Text(
                    'Pedidos incluídos',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      color: Colors.grey.shade700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...orders.asMap().entries.map((e) => _OrderSummaryTile(
                    position: e.key + 1,
                    order: e.value,
                  )),
                ],
              ),
            ),
          ),

          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _loading ? null : () => _confirm(skipCode: !requirePickupCode),
                  child: _loading
                      ? const SizedBox(
                          width: 22, height: 22,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Confirmar retirada', style: TextStyle(fontSize: 16)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderSummaryTile extends StatelessWidget {
  final int position;
  final Order order;

  const _OrderSummaryTile({required this.position, required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: AppTheme.primary,
            radius: 12,
            child: Text('$position',
                style: const TextStyle(color: Colors.white, fontSize: 11,
                    fontWeight: FontWeight.bold)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(order.customerName,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                const SizedBox(height: 2),
                Row(children: [
                  Icon(Icons.location_on_outlined, size: 12, color: Colors.grey.shade500),
                  const SizedBox(width: 3),
                  Expanded(
                    child: Text(order.customerAddress,
                        style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                        overflow: TextOverflow.ellipsis),
                  ),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
