import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/models/order.dart';
import '../../core/theme/app_theme.dart';

class PickupConfirmationScreen extends ConsumerStatefulWidget {
  final List<Order> orders;
  const PickupConfirmationScreen({super.key, required this.orders});

  @override
  ConsumerState<PickupConfirmationScreen> createState() => _PickupConfirmationScreenState();
}

class _PickupConfirmationScreenState extends ConsumerState<PickupConfirmationScreen> {
  late final List<TextEditingController> _ctrls;
  bool _loading = false;
  final Map<String, String?> _errors = {};

  @override
  void initState() {
    super.initState();
    _ctrls = List.generate(widget.orders.length, (_) => TextEditingController());
    // Save route order to backend (fire and forget)
    _saveRouteOrder();
  }

  Future<void> _saveRouteOrder() async {
    try {
      await ApiClient().dio.patch('/deliverer/orders/route', data: {
        'orderIds': widget.orders.map((o) => o.id).toList(),
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    for (final c in _ctrls) { c.dispose(); }
    super.dispose();
  }

  Future<void> _confirm() async {
    // Validate all codes are 5 chars
    bool valid = true;
    setState(() {
      for (int i = 0; i < widget.orders.length; i++) {
        final code = _ctrls[i].text.trim().toUpperCase();
        if (code.length != 5) {
          _errors[widget.orders[i].id] = 'Código inválido';
          valid = false;
        } else {
          _errors.remove(widget.orders[i].id);
        }
      }
    });
    if (!valid) return;

    setState(() => _loading = true);

    final failed = <String>[];
    for (int i = 0; i < widget.orders.length; i++) {
      final order = widget.orders[i];
      final code  = _ctrls[i].text.trim().toUpperCase();
      try {
        await ApiClient().dio.post('/deliverer/orders/${order.id}/pickup', data: {'code': code});
      } catch (e) {
        final msg = (e as dynamic).response?.data?['error'] as String? ?? 'Código incorreto';
        setState(() => _errors[order.id] = msg);
        failed.add(order.id);
      }
    }

    setState(() => _loading = false);

    if (failed.isEmpty && mounted) {
      context.go('/delivery');
    }
  }

  @override
  Widget build(BuildContext context) {
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
                  'Peça o código de retirada para a loja e confirme cada pedido',
                  style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
                ),
              ),
            ]),
          ),

          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              itemCount: widget.orders.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, i) {
                final o = widget.orders[i];
                return _PickupOrderCard(
                  position: i + 1,
                  order:    o,
                  ctrl:     _ctrls[i],
                  error:    _errors[o.id],
                );
              },
            ),
          ),

          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _loading ? null : _confirm,
                  child: _loading
                      ? const SizedBox(
                          width: 22, height: 22,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Confirmar retirada de todos', style: TextStyle(fontSize: 16)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PickupOrderCard extends StatelessWidget {
  final int position;
  final Order order;
  final TextEditingController ctrl;
  final String? error;

  const _PickupOrderCard({
    required this.position,
    required this.order,
    required this.ctrl,
    this.error,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: error != null ? const Color(0xFFDC2626) : const Color(0xFFE5E7EB),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: AppTheme.primary,
                  radius: 14,
                  child: Text('$position',
                      style: const TextStyle(color: Colors.white,
                          fontWeight: FontWeight.bold, fontSize: 13)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(order.customerName,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    '#${order.shortId}',
                    style: const TextStyle(fontFamily: 'monospace',
                        fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.location_on_outlined, size: 14, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(order.customerAddress,
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              maxLength: 5,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                labelText: 'Código de retirada',
                hintText: 'XXXXX',
                counterText: '',
                errorText: error,
                prefixIcon: const Icon(Icons.key_outlined, size: 20),
                isDense: true,
              ),
              style: const TextStyle(
                fontFamily: 'monospace',
                letterSpacing: 4,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
              onSubmitted: (_) => FocusScope.of(context).nextFocus(),
            ),
          ],
        ),
      ),
    );
  }
}
