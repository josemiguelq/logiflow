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
    final orders   = ref.watch(_activeDeliveryProvider);
    final settings = ref.watch(storeSettingsProvider);

    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: _BrandTitle(
          brand:    settings.value?.brandName ?? 'LogiFlow',
          subtitle: 'Entregas em rota',
        ),
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
            return _EmptyDeliveryState(onGoOrders: () => context.go('/orders'));
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
  bool _navigating  = false;
  bool _returning   = false;
  bool _cancelling  = false;

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
                              fontWeight: FontWeight.w600, fontSize: 15),
                          overflow: TextOverflow.ellipsis),
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

          // Notes row
          if (order.notes != null && order.notes!.isNotEmpty)
            GestureDetector(
              onTap: () => showDialog<void>(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Observações'),
                  content: Text(order.notes!),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(_),
                      child: const Text('Fechar'),
                    ),
                  ],
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, size: 15, color: Color(0xFFD97706)),
                    const SizedBox(width: 6),
                    const Text(
                      'Observações',
                      style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFFD97706),
                          fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
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
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: Row(
              children: [
                Expanded(
                  child: TextButton.icon(
                    onPressed: (_navigating || _returning || _cancelling) ? null : () => _returnToQueue(context),
                    icon: _returning
                        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                        : Icon(Icons.undo_rounded, size: 16, color: Colors.grey.shade500),
                    label: Text('Devolver à fila', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                  ),
                ),
                Expanded(
                  child: TextButton.icon(
                    onPressed: (_navigating || _returning || _cancelling) ? null : () => _showCancelSheet(context),
                    icon: _cancelling
                        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFDC2626)))
                        : const Icon(Icons.close, size: 16, color: Color(0xFFDC2626)),
                    label: const Text('Cancelar entrega', style: TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _returnToQueue(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Devolver pedido?'),
        content: Text(
          'O pedido de ${widget.order.customerName} voltará para a fila e poderá ser pego por outro entregador.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Devolver'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() => _returning = true);
    try {
      await ApiClient().dio.patch('/deliverer/orders/${widget.order.id}/return-to-queue', data: {});
      widget.onDelivered();
    } catch (e) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Não foi possível devolver o pedido. Tente novamente.')),
      );
    } finally {
      if (mounted) setState(() => _returning = false);
    }
  }

  Future<void> _showCancelSheet(BuildContext context) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _CancelDeliverySheet(
        order:       widget.order,
        onCancelled: widget.onDelivered,
      ),
    );
  }

  Future<void> _showDeliveryDialog(BuildContext context) async {
    ref.invalidate(storeSettingsProvider);
    final settings = await ref.read(storeSettingsProvider.future);
    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _DeliveryConfirmSheet(
        order:                widget.order,
        requireDeliveryCode:  settings.requireDeliveryCode,
        requireDeliveryPhoto: settings.requireDeliveryPhoto,
        onDelivered:          widget.onDelivered,
      ),
    );
  }
}

class _DeliveryConfirmSheet extends StatefulWidget {
  final Order order;
  final bool requireDeliveryCode;
  final bool requireDeliveryPhoto;
  final VoidCallback onDelivered;
  const _DeliveryConfirmSheet({
    required this.order,
    required this.requireDeliveryCode,
    required this.requireDeliveryPhoto,
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
      source: ImageSource.camera, maxWidth: 1280, imageQuality: 60);
    if (f != null) setState(() => _photo = f);
  }

  Future<void> _confirm() async {
    final code = _codeCtrl.text.trim().toUpperCase();
    if (widget.requireDeliveryCode && code.length != 4) {
      setState(() => _error = 'Informe os 4 últimos dígitos do telefone');
      return;
    }
    if (widget.requireDeliveryPhoto && _photo == null) {
      setState(() => _error = 'Foto de comprovante é obrigatória');
      return;
    }
    setState(() { _loading = true; _error = null; });

    try {
      Position? pos;
      try {
        pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      } catch (_) {}

      String? photoUrl;
      if (_photo != null) {
        final bytes = await _photo!.readAsBytes();
        const maxBytes = 10 * 1024 * 1024;
        if (bytes.length > maxBytes) {
          setState(() {
            _error = 'Foto muito grande (máx. 10 MB). Tente novamente.';
            _loading = false;
          });
          return;
        }
        photoUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}';
      }

      final note = _noteCtrl.text.trim();
      await ApiClient().dio.post(
        '/deliverer/orders/${widget.order.id}/deliver',
        data: {
          'code':          code,
          if (photoUrl != null) 'photoUrl': photoUrl,
          if (pos != null) 'lat': pos.latitude,
          if (pos != null) 'lng': pos.longitude,
          if (note.isNotEmpty) 'note': note,
          if (widget.order.isCash) 'cashCollected': true,
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
    final mq = MediaQuery.of(context);
    final bottomPad = 20 + mq.viewInsets.bottom + mq.viewPadding.bottom;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottomPad),
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
          const SizedBox(height: 16),

          // Payment info
          if (widget.order.paymentMethod != 'prepaid') ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: widget.order.isCash
                    ? const Color(0xFFFFFBEB)
                    : const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: widget.order.isCash
                      ? const Color(0xFFF59E0B)
                      : const Color(0xFF93C5FD),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    widget.order.isCash
                        ? Icons.payments_outlined
                        : Icons.credit_card_outlined,
                    size: 20,
                    color: widget.order.isCash
                        ? const Color(0xFFD97706)
                        : const Color(0xFF3B82F6),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      widget.order.isCash
                          ? 'Cobrar R\$ ${widget.order.cashAmount!.toStringAsFixed(2).replaceAll('.', ',')} em dinheiro'
                          : 'Pagamento no cartão',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: widget.order.isCash
                            ? const Color(0xFF92400E)
                            : const Color(0xFF1E40AF),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

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

          if (widget.requireDeliveryPhoto) ...[
            GestureDetector(
              onTap: _takePhoto,
              child: Container(
                height: 80,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _photo == null && _error != null
                        ? const Color(0xFFDC2626)
                        : Colors.grey.shade200,
                  ),
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
                          Text('Foto de comprovante (obrigatória)',
                              style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 12),
          ],

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
            Text(_error!, style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
          ],

          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _loading ? null : _confirm,
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF16A34A)),
              child: _loading
                  ? const SizedBox(
                      width: 22, height: 22,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Confirmar entrega', style: TextStyle(fontSize: 16)),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Bottom sheet de cancelamento ─────────────────────────────────────────────

class _CancelDeliverySheet extends StatefulWidget {
  final Order order;
  final VoidCallback onCancelled;
  const _CancelDeliverySheet({required this.order, required this.onCancelled});

  @override
  State<_CancelDeliverySheet> createState() => _CancelDeliverySheetState();
}

class _CancelDeliverySheetState extends State<_CancelDeliverySheet> {
  final _noteCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _cancel() async {
    final note = _noteCtrl.text.trim();
    if (note.isEmpty) {
      setState(() => _error = 'Descreva o motivo do cancelamento');
      return;
    }
    setState(() { _loading = true; _error = null; });

    try {
      Position? pos;
      try {
        pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      } catch (_) {}

      await ApiClient().dio.post(
        '/deliverer/orders/${widget.order.id}/cancel',
        data: {
          'note': note,
          if (pos != null) 'lat': pos.latitude,
          if (pos != null) 'lng': pos.longitude,
        },
      );

      widget.onCancelled();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      final msg = (e as dynamic).response?.data?['error'] as String? ?? 'Erro ao cancelar. Tente novamente.';
      setState(() { _error = msg; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final bottomPad = 20 + mq.viewInsets.bottom + mq.viewPadding.bottom;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottomPad),
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
          Row(children: [
            const Icon(Icons.close, color: Color(0xFFDC2626), size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Cancelar entrega — ${widget.order.customerName}',
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600,
                      color: Color(0xFFDC2626))),
            ),
          ]),
          const SizedBox(height: 4),
          Text('#${widget.order.shortId} · ${widget.order.customerAddress}',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          const SizedBox(height: 20),

          TextField(
            controller: _noteCtrl,
            maxLines: 3,
            maxLength: 500,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Motivo do cancelamento (obrigatório)',
              hintText: 'Ex: cliente recusou, endereço não encontrado...',
              alignLabelWithHint: true,
              counterText: '',
              prefixIcon: const Icon(Icons.notes_outlined, color: Color(0xFFDC2626)),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFFDC2626), width: 2),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFFFFCDD2)),
              ),
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
          ],

          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _loading ? null : _cancel,
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
              child: _loading
                  ? const SizedBox(
                      width: 22, height: 22,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Confirmar cancelamento', style: TextStyle(fontSize: 16)),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyDeliveryState extends StatelessWidget {
  final VoidCallback onGoOrders;
  const _EmptyDeliveryState({required this.onGoOrders});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_circle_outline, size: 64, color: Color(0xFF16A34A)),
            const SizedBox(height: 16),
            const Text('Todas as entregas concluídas!',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text('Volte para receber novos pedidos',
                style: TextStyle(color: Colors.grey.shade600)),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onGoOrders,
              icon: const Icon(Icons.inbox_outlined),
              label: const Text('Ver pedidos disponíveis'),
            ),
          ],
        ),
      ),
    );
  }
}

class _BrandTitle extends StatelessWidget {
  final String brand;
  final String subtitle;
  const _BrandTitle({required this.brand, required this.subtitle});

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(brand,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      Text(subtitle,
          style: const TextStyle(fontSize: 11, color: Colors.white70)),
    ],
  );
}
