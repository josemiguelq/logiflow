import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:convert';
import '../../core/api/api_client.dart';
import '../../core/models/order.dart';
import '../../core/providers/store_settings_provider.dart';
import '../../core/theme/app_theme.dart';

final _activeDeliveryProvider = FutureProvider.autoDispose<List<Order>>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/orders');
  final all = (res.data as List).map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
  return all
      .where((o) => o.status == 'ON_ROUTE' || o.status == 'OUT_FOR_DELIVERY')
      .toList()
    ..sort((a, b) => (a.routePosition ?? 99).compareTo(b.routePosition ?? 99));
});

class DeliveryScreen extends ConsumerWidget {
  const DeliveryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(_activeDeliveryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Entregas em rota'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/orders'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(_activeDeliveryProvider),
          ),
        ],
      ),
      body: orders.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erro: $e')),
        data: (list) {
          if (list.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.check_circle_outline, size: 64, color: Color(0xFF16A34A)),
                  const SizedBox(height: 16),
                  const Text('Todas as entregas concluídas!',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Text('Volte para receber novos pedidos',
                      style: TextStyle(color: Colors.grey.shade600)),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: () {
                      context.go('/orders');
                    },
                    icon: const Icon(Icons.inbox_outlined),
                    label: const Text('Ver pedidos disponíveis'),
                  ),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(_activeDeliveryProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, i) => _DeliveryCard(
                order: list[i],
                position: i + 1,
                total: list.length,
                onDelivered: () => ref.invalidate(_activeDeliveryProvider),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _DeliveryCard extends ConsumerStatefulWidget {
  final Order order;
  final int position;
  final int total;
  final VoidCallback onDelivered;

  const _DeliveryCard({
    required this.order,
    required this.position,
    required this.total,
    required this.onDelivered,
  });

  @override
  ConsumerState<_DeliveryCard> createState() => _DeliveryCardState();
}

class _DeliveryCardState extends ConsumerState<_DeliveryCard> {
  bool _navigating = false;

  Future<void> _navigateTo() async {
    setState(() => _navigating = true);
    try {
      // Mark as OUT_FOR_DELIVERY before opening maps
      await ApiClient().dio.patch('/deliverer/orders/${widget.order.id}/start-route', data: {});
      widget.onDelivered(); // refresh the list
    } catch (_) {}

    Uri uri;
    if (widget.order.customerLat != null && widget.order.customerLng != null) {
      uri = Uri.parse(
          'https://www.google.com/maps/dir/?api=1'
          '&destination=${widget.order.customerLat},${widget.order.customerLng}'
          '&travelmode=driving');
    } else {
      final encoded = Uri.encodeComponent(widget.order.customerAddress);
      uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$encoded');
    }
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Não foi possível abrir o Maps')));
      }
    }
    if (mounted) setState(() => _navigating = false);
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final isOutForDelivery = order.status == 'OUT_FOR_DELIVERY';
    final statusColor = isOutForDelivery
        ? const Color(0xFFFFEDD5)
        : const Color(0xFFE0E7FF);
    final statusText = isOutForDelivery ? 'Saiu p/ entrega' : 'Em rota';
    final statusTextColor = isOutForDelivery
        ? const Color(0xFFEA580C)
        : const Color(0xFF4F46E5);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: const Border.fromBorderSide(BorderSide(color: Color(0xFFE5E7EB))),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 8,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(
              children: [
                CircleAvatar(
                  backgroundColor: AppTheme.primary,
                  radius: 16,
                  child: Text('${widget.position}',
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(order.customerName,
                          style: const TextStyle(
                              fontWeight: FontWeight.w600, fontSize: 15)),
                      Text('#${order.shortId}',
                          style: TextStyle(
                              color: Colors.grey.shade500,
                              fontSize: 12,
                              fontFamily: 'monospace')),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor,
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Text(statusText,
                      style: TextStyle(
                          color: statusTextColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w500)),
                ),
              ],
            ),
          ),

          // Address
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: Row(
              children: [
                Icon(Icons.location_on_outlined,
                    size: 16, color: Colors.grey.shade500),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(order.customerAddress,
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                ),
              ],
            ),
          ),

          // Phone (masked)
          if (order.customerPhone.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
              child: Row(
                children: [
                  Icon(Icons.phone_outlined,
                      size: 16, color: Colors.grey.shade500),
                  const SizedBox(width: 6),
                  Text(order.maskedPhone,
                      style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 13,
                          fontFamily: 'monospace',
                          letterSpacing: 1)),
                ],
              ),
            ),

          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Divider(height: 1),
          ),

          // Action buttons
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: Row(
              children: [
                // Navigate → sets OUT_FOR_DELIVERY
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _navigating ? null : _navigateTo,
                    icon: _navigating
                        ? const SizedBox(width: 16, height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.navigation_outlined, size: 18),
                    label: const Text('Navegar'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primary,
                      side: const BorderSide(color: AppTheme.primary),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                // Confirm delivery
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => _showDeliveryDialog(context),
                    icon: const Icon(Icons.check_circle_outline, size: 18),
                    label: const Text('Entregar'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF16A34A),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showDeliveryDialog(BuildContext context) async {
    final settings = await ref.read(storeSettingsProvider.future);
    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _DeliveryConfirmSheet(
        order:               widget.order,
        requireDeliveryCode: settings.requireDeliveryCode,
        onDelivered:         widget.onDelivered,
      ),
    );
  }
}

class _DeliveryConfirmSheet extends StatefulWidget {
  final Order order;
  final bool requireDeliveryCode;
  final VoidCallback onDelivered;
  const _DeliveryConfirmSheet({
    required this.order,
    required this.requireDeliveryCode,
    required this.onDelivered,
  });

  @override
  State<_DeliveryConfirmSheet> createState() => _DeliveryConfirmSheetState();
}

class _DeliveryConfirmSheetState extends State<_DeliveryConfirmSheet> {
  final _codeCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  XFile? _photo;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _codeCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    final f = await ImagePicker().pickImage(
      source: ImageSource.camera, maxWidth: 1024, imageQuality: 70);
    if (f != null) setState(() => _photo = f);
  }

  Future<void> _confirm() async {
    final code = _codeCtrl.text.trim().toUpperCase();
    if (widget.requireDeliveryCode && code.length != 4) {
      setState(() => _error = 'Informe os 4 últimos dígitos do telefone');
      return;
    }
    setState(() { _loading = true; _error = null; });

    try {
      // Get location
      Position? pos;
      try {
        pos = await Geolocator.getCurrentPosition(
            desiredAccuracy: LocationAccuracy.high);
      } catch (_) {}

      // Encode photo if taken
      String? photoUrl;
      if (_photo != null) {
        final bytes = await _photo!.readAsBytes();
        photoUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}';
      }

      final note = _noteCtrl.text.trim();
      await ApiClient().dio.post(
        '/deliverer/orders/${widget.order.id}/deliver',
        data: {
          'code':     code,
          if (photoUrl != null) 'photoUrl': photoUrl,
          if (pos != null) 'lat': pos.latitude,
          if (pos != null) 'lng': pos.longitude,
          if (note.isNotEmpty) 'note': note,
        },
      );

      widget.onDelivered();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      final msg = (e as dynamic).response?.data?['error'] as String? ?? 'Código incorreto';
      setState(() { _error = msg; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 16, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          Text('Confirmar entrega — ${widget.order.customerName}',
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text('#${widget.order.shortId} · ${widget.order.customerAddress}',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          const SizedBox(height: 20),

          // Code field (last 4 digits of customer phone)
          if (widget.requireDeliveryCode) ...[
            TextField(
              controller: _codeCtrl,
              maxLength: 4,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Últimos 4 dígitos do telefone',
                hintText: '0000',
                counterText: '',
                prefixIcon: Icon(Icons.phone_outlined),
              ),
              style: const TextStyle(
                  fontFamily: 'monospace', letterSpacing: 6,
                  fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
          ],

          // Optional photo
          GestureDetector(
            onTap: _takePhoto,
            child: Container(
              height: 80,
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: _photo != null
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.file(File(_photo!.path), fit: BoxFit.cover))
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.camera_alt_outlined, color: Colors.grey.shade400),
                        const SizedBox(width: 8),
                        Text('Foto de comprovante (opcional)',
                            style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
                      ],
                    ),
            ),
          ),

          const SizedBox(height: 12),
          TextField(
            controller: _noteCtrl,
            maxLines: 2,
            maxLength: 500,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Observação (opcional)',
              hintText: 'Ex: deixado com porteiro, cliente ausente...',
              alignLabelWithHint: true,
              counterText: '',
              prefixIcon: const Icon(Icons.notes_outlined),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!,
                style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
          ],

          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _loading ? null : _confirm,
              style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF16A34A)),
              child: _loading
                  ? const SizedBox(
                      width: 22, height: 22,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2))
                  : const Text('Confirmar entrega', style: TextStyle(fontSize: 16)),
            ),
          ),
        ],
      ),
    );
  }
}
