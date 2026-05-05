import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_client.dart';
import '../../features/tracking/location_service.dart';
import 'orders_screen.dart';

final orderDetailProvider = FutureProvider.autoDispose.family<Order, String>((ref, id) async {
  // Get storeId from auth
  final session = ref.watch(authProvider.select((s) => s));
  final res = await ApiClient().dio.get('/deliverer/orders');
  final list = (res.data as List).map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
  return list.firstWhere((o) => o.id == id);
});

class OrderDetailScreen extends ConsumerStatefulWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  final _codeCtrl = TextEditingController();
  bool _loading   = false;
  String? _error;

  Future<void> _confirmPickup() async {
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient().dio.post('/deliverer/orders/${widget.orderId}/pickup', data: {
        'code': _codeCtrl.text.trim().toUpperCase(),
      });
      ref.invalidate(orderDetailProvider(widget.orderId));
      ref.read(locationServiceProvider).startTracking(orderId: widget.orderId);
    } catch (_) {
      setState(() => _error = 'Código inválido ou erro na confirmação');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _startRoute() async {
    setState(() => _loading = true);
    try {
      await ApiClient().dio.patch('/deliverer/orders/${widget.orderId}/start-route');
      ref.invalidate(orderDetailProvider(widget.orderId));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _confirmDelivery() async {
    final picker = ImagePicker();
    Position? pos;

    try {
      pos = await Geolocator.getCurrentPosition();
    } catch (_) {}

    final photo = await picker.pickImage(source: ImageSource.camera, imageQuality: 70);

    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient().dio.post('/deliverer/orders/${widget.orderId}/deliver', data: {
        'code': _codeCtrl.text.trim().toUpperCase(),
        if (pos != null) 'lat': pos.latitude,
        if (pos != null) 'lng': pos.longitude,
      });
      ref.invalidate(orderDetailProvider(widget.orderId));
      ref.read(locationServiceProvider).stopTracking();
    } catch (_) {
      setState(() => _error = 'Código inválido ou erro na confirmação');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final orderAsync = ref.watch(orderDetailProvider(widget.orderId));

    return Scaffold(
      appBar: AppBar(title: Text('Pedido #${widget.orderId.substring(widget.orderId.length - 8).toUpperCase()}')),
      body: orderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erro: $e')),
        data: (order) => SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _InfoCard(label: 'Cliente', value: order.customer['name'] as String? ?? ''),
              const SizedBox(height: 12),
              _InfoCard(label: 'Endereço', value: order.customer['address'] as String? ?? ''),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: _CodeCard(label: 'Coleta', code: order.pickupCode)),
                const SizedBox(width: 12),
                Expanded(child: _CodeCard(label: 'Entrega', code: order.deliveryCode)),
              ]),
              const SizedBox(height: 24),
              if (order.status == 'ASSIGNED' || order.status == 'ON_ROUTE' || order.status == 'OUT_FOR_DELIVERY') ...[
                TextField(
                  controller: _codeCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Insira o código',
                    hintText: 'XXXXX',
                  ),
                  textCapitalization: TextCapitalization.characters,
                  maxLength: 5,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!, style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
                ],
                const SizedBox(height: 16),
              ],
              if (order.status == 'ASSIGNED')
                _ActionButton(
                  label: 'Confirmar Coleta',
                  icon: Icons.check_circle_outline,
                  color: const Color(0xFF0284C7),
                  loading: _loading,
                  onPressed: _confirmPickup,
                ),
              if (order.status == 'ON_ROUTE')
                _ActionButton(
                  label: 'Iniciar Entrega',
                  icon: Icons.delivery_dining,
                  color: const Color(0xFFD97706),
                  loading: _loading,
                  onPressed: _startRoute,
                ),
              if (order.status == 'OUT_FOR_DELIVERY')
                _ActionButton(
                  label: 'Confirmar Entrega + Foto',
                  icon: Icons.camera_alt,
                  color: const Color(0xFF16A34A),
                  loading: _loading,
                  onPressed: _confirmDelivery,
                ),
              if (order.status == 'DELIVERED') ...[
                const Icon(Icons.check_circle, color: Color(0xFF16A34A), size: 48),
                const SizedBox(height: 8),
                const Text('Pedido entregue!', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final String label, value;
  const _InfoCard({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: Colors.grey, letterSpacing: 0.5)),
            const SizedBox(height: 4),
            Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
          ],
        ),
      );
}

class _CodeCard extends StatelessWidget {
  final String label, code;
  const _CodeCard({required this.label, required this.code});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          children: [
            Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey, fontWeight: FontWeight.w500)),
            const SizedBox(height: 6),
            Text(code, style: const TextStyle(fontFamily: 'monospace', fontSize: 22, fontWeight: FontWeight.bold, letterSpacing: 4)),
          ],
        ),
      );
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool loading;
  final VoidCallback onPressed;

  const _ActionButton({
    required this.label, required this.icon, required this.color,
    required this.loading, required this.onPressed,
  });

  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          style: ElevatedButton.styleFrom(backgroundColor: color),
          onPressed: loading ? null : onPressed,
          icon: loading
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
              : Icon(icon),
          label: Text(label, style: const TextStyle(fontSize: 15)),
        ),
      );
}
