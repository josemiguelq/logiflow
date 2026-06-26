import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
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

final _activeDeliveryProvider =
    FutureProvider.autoDispose<List<Order>>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/orders');
  final all = (res.data as List)
      .map((e) => Order.fromJson(e as Map<String, dynamic>))
      .toList();
  return all
      .where((o) =>
          o.status == 'ON_ROUTE' ||
          o.status == 'OUT_FOR_DELIVERY' ||
          o.status == 'DELIVERED')
      .toList()
    ..sort((a, b) => (a.routePosition ?? 99).compareTo(b.routePosition ?? 99));
});

class DeliveryScreen extends ConsumerWidget {
  const DeliveryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(_activeDeliveryProvider);
    final settings = ref.watch(storeSettingsProvider);

    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: _BrandTitle(
          brand: settings.value?.brandName ?? 'LogiFlow',
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
        error: (e, _) => _DeliveryErrorState(
          offline: isNoInternetError(e),
          onRetry: () => ref.invalidate(_activeDeliveryProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return _EmptyDeliveryState(onGoOrders: () => context.go('/orders'));
          }
          final enforceOrder = settings.value?.enforceDeliveryOrder ?? false;
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(_activeDeliveryProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, i) {
                final order = list[i];
                // Bloqueia se a loja exige ordem e há outra parada anterior da
                // mesma rota AINDA PENDENTE (paradas já entregues não bloqueiam).
                final blocked = enforceOrder &&
                    order.routeId != null &&
                    list.any((o) =>
                        o.routeId == order.routeId &&
                        o.status != 'DELIVERED' &&
                        (o.routePosition ?? 9999) <
                            (order.routePosition ?? 9999));
                return _DeliveryCard(
                  order: order,
                  position: i + 1,
                  total: list.length,
                  deliverBlocked: blocked,
                  onDelivered: () => ref.invalidate(_activeDeliveryProvider),
                );
              },
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
  final bool deliverBlocked;
  final VoidCallback onDelivered;

  const _DeliveryCard({
    required this.order,
    required this.position,
    required this.total,
    required this.onDelivered,
    this.deliverBlocked = false,
  });

  @override
  ConsumerState<_DeliveryCard> createState() => _DeliveryCardState();
}

class _DeliveryCardState extends ConsumerState<_DeliveryCard> {
  bool _navigating = false;
  bool _returning = false;
  bool _cancelling = false;

  Future<void> _navigateTo() async {
    setState(() => _navigating = true);
    try {
      // Mark as OUT_FOR_DELIVERY before opening maps
      await ApiClient()
          .dio
          .patch('/deliverer/orders/${widget.order.id}/start-route', data: {});
      widget.onDelivered(); // refresh the list
    } catch (_) {}

    Uri uri;
    if (widget.order.customerLat != null && widget.order.customerLng != null) {
      uri = Uri.parse('https://www.google.com/maps/dir/?api=1'
          '&destination=${widget.order.customerLat},${widget.order.customerLng}'
          '&travelmode=driving');
    } else {
      final encoded = Uri.encodeComponent(widget.order.customerAddress);
      uri =
          Uri.parse('https://www.google.com/maps/search/?api=1&query=$encoded');
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
    final isDelivered = order.status == 'DELIVERED';
    final isOutForDelivery = order.status == 'OUT_FOR_DELIVERY';
    final statusColor = isDelivered
        ? const Color(0xFFDCFCE7)
        : isOutForDelivery
            ? const Color(0xFFFFEDD5)
            : const Color(0xFFE0E7FF);
    final statusText = isDelivered
        ? 'Entregue'
        : isOutForDelivery
            ? 'Saiu p/ entrega'
            : 'Em rota';
    final statusTextColor = isDelivered
        ? const Color(0xFF16A34A)
        : isOutForDelivery
            ? const Color(0xFFEA580C)
            : const Color(0xFF4F46E5);

    // Pedidos entregues permanecem na lista, porém opacos e sem ações.
    return Opacity(
      opacity: isDelivered ? 0.55 : 1.0,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border:
              const Border.fromBorderSide(BorderSide(color: Color(0xFFE5E7EB))),
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
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 13)),
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
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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
                        style: TextStyle(
                            color: Colors.grey.shade600, fontSize: 13)),
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
                      const Icon(Icons.info_outline,
                          size: 15, color: Color(0xFFD97706)),
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

            // Entregue: sem divisória e sem ações — apenas um respiro no rodapé.
            if (isDelivered) const SizedBox(height: 14),

            if (!isDelivered) ...[
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
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2))
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
                        onPressed: widget.deliverBlocked
                            ? null
                            : () => _showDeliveryDialog(context),
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
              if (widget.deliverBlocked)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: Row(
                    children: [
                      const Icon(Icons.lock_outline,
                          size: 14, color: Color(0xFF92400E)),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Conclua a entrega anterior da rota primeiro.',
                          style: TextStyle(
                              fontSize: 12, color: Colors.grey.shade700),
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
                        onPressed: (_navigating || _returning || _cancelling)
                            ? null
                            : () => _returnToQueue(context),
                        icon: _returning
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2))
                            : Icon(Icons.undo_rounded,
                                size: 16, color: Colors.grey.shade500),
                        label: Text('Devolver à fila',
                            style: TextStyle(
                                color: Colors.grey.shade600, fontSize: 13)),
                      ),
                    ),
                    Expanded(
                      child: TextButton.icon(
                        onPressed: (_navigating || _returning || _cancelling)
                            ? null
                            : () => _showCancelSheet(context),
                        icon: _cancelling
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Color(0xFFDC2626)))
                            : const Icon(Icons.close,
                                size: 16, color: Color(0xFFDC2626)),
                        label: const Text('Cancelar entrega',
                            style: TextStyle(
                                color: Color(0xFFDC2626), fontSize: 13)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
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
            style:
                TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Devolver'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() => _returning = true);
    try {
      await ApiClient().dio.patch(
          '/deliverer/orders/${widget.order.id}/return-to-queue',
          data: {});
      widget.onDelivered();
    } catch (e) {
      messenger.showSnackBar(
        const SnackBar(
            content:
                Text('Não foi possível devolver o pedido. Tente novamente.')),
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
        order: widget.order,
        onCancelled: widget.onDelivered,
      ),
    );
  }

  Future<void> _showDeliveryDialog(BuildContext context) async {
    // Se o pedido tiver observação, mostra um aviso antes de abrir a confirmação.
    final notes = widget.order.notes?.trim();
    if (notes != null && notes.isNotEmpty) {
      await showDialog<void>(
        context: context,
        barrierDismissible: false, // força ler — só sai pelo botão após o tempo
        builder: (_) => _ObservationDialog(notes: notes),
      );
      if (!mounted) return;
    }

    ref.invalidate(storeSettingsProvider);
    try {
      final settings = await ref.read(storeSettingsProvider.future);
      if (!mounted) return;
      await showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (_) => _DeliveryConfirmSheet(
          order: widget.order,
          requireDeliveryCode: settings.requireDeliveryCode,
          requireDeliveryPhoto: settings.requireDeliveryPhoto,
          maxProofPhotos: settings.maxProofPhotos,
          requireProximity: settings.deliveryRequireProximity,
          proximityMeters: settings.delayProximityMeters,
          onDelivered: widget.onDelivered,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      final noInternet = isNoInternetError(e);
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: Icon(
            noInternet ? Icons.wifi_off_rounded : Icons.error_outline,
            size: 48,
            color: noInternet ? const Color(0xFFEA580C) : Colors.red.shade400,
          ),
          title: Text(noInternet ? 'Sem conexão' : 'Erro'),
          content: Text(
            noInternet ? kNoInternetMessage : 'Não foi possível carregar as configurações. Tente novamente.',
            textAlign: TextAlign.center,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    }
  }
}

// Forces the deliverer to actually read the order's note: the "Entendi" button
// stays disabled with a 3s loading countdown in the footer before it can be tapped.
class _ObservationDialog extends StatefulWidget {
  final String notes;
  const _ObservationDialog({required this.notes});

  @override
  State<_ObservationDialog> createState() => _ObservationDialogState();
}

class _ObservationDialogState extends State<_ObservationDialog> {
  static const _seconds = 3;
  int _remaining = _seconds;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_remaining <= 1) {
        t.cancel();
        setState(() => _remaining = 0);
      } else {
        setState(() => _remaining--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ready = _remaining == 0;
    return AlertDialog(
      title: Row(
        children: const [
          Icon(Icons.info_outline, color: Color(0xFFD97706)),
          SizedBox(width: 8),
          Text('Observação'),
        ],
      ),
      content: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFBEB),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFFCD34D)),
        ),
        child: Text(
          widget.notes,
          style: const TextStyle(
            fontSize: 18,
            height: 1.4,
            fontWeight: FontWeight.w600,
            color: Color(0xFF92400E),
          ),
        ),
      ),
      actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      actions: [
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: ready ? () => Navigator.pop(context) : null,
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            child: ready
                ? const Text('Entendi', style: TextStyle(fontSize: 16))
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.grey.shade500),
                      ),
                      const SizedBox(width: 10),
                      Text('Leia a observação… ${_remaining}s',
                          style: const TextStyle(fontSize: 15)),
                    ],
                  ),
          ),
        ),
      ],
    );
  }
}

class _DeliveryConfirmSheet extends StatefulWidget {
  final Order order;
  final bool requireDeliveryCode;
  final bool requireDeliveryPhoto;
  final int maxProofPhotos;
  final bool requireProximity;
  final int proximityMeters;
  final VoidCallback onDelivered;
  const _DeliveryConfirmSheet({
    required this.order,
    required this.requireDeliveryCode,
    required this.requireDeliveryPhoto,
    this.maxProofPhotos = 2,
    this.requireProximity = false,
    this.proximityMeters = 100,
    required this.onDelivered,
  });

  @override
  State<_DeliveryConfirmSheet> createState() => _DeliveryConfirmSheetState();
}

class _PaymentLine {
  final TextEditingController amountCtrl = TextEditingController();
  String method = 'cash';
}

class _DeliveryConfirmSheetState extends State<_DeliveryConfirmSheet> {
  final _codeCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  // Lista dinâmica de pagamentos recebidos (ex.: Pix + dinheiro na mesma entrega).
  final List<_PaymentLine> _payments = [];
  final List<XFile> _photos = [];
  bool _loading = false;
  bool _collectPayment = false;
  String? _error;

  @override
  void dispose() {
    _codeCtrl.dispose();
    _noteCtrl.dispose();
    for (final p in _payments) {
      p.amountCtrl.dispose();
    }
    super.dispose();
  }

  void _togglePayment() {
    setState(() {
      _collectPayment = !_collectPayment;
      if (_collectPayment && _payments.isEmpty) {
        _payments.add(_PaymentLine());
      }
    });
  }

  void _addPaymentLine() => setState(() {
        final line = _PaymentLine();
        // Dinheiro só pode haver um; se já existe, o novo começa em Pix.
        if (_payments.any((p) => p.method == 'cash')) line.method = 'pix';
        _payments.add(line);
      });

  void _removePaymentLine(int index) {
    setState(() {
      _payments[index].amountCtrl.dispose();
      _payments.removeAt(index);
      if (_payments.isEmpty) _collectPayment = false;
    });
  }

  double get _paymentsTotal => _payments.fold(
        0,
        (sum, p) =>
            sum +
            (double.tryParse(p.amountCtrl.text.trim().replaceAll(',', '.')) ??
                0),
      );

  Future<void> _takePhoto() async {
    if (_photos.length >= widget.maxProofPhotos) return;
    final f = await ImagePicker().pickImage(
        source: ImageSource.camera, maxWidth: 1280, imageQuality: 60);
    if (f != null) setState(() => _photos.add(f));
  }

  void _removePhoto(int index) {
    setState(() => _photos.removeAt(index));
  }

  // Aviso quando o entregador está longe (regra de proximidade só avisa, não bloqueia).
  Future<bool?> _confirmFarAway(int meters) {
    return showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        icon: const Icon(Icons.location_off_outlined,
            size: 36, color: Color(0xFFEA580C)),
        title: const Text('Você está longe do endereço'),
        content: Text(
          'Você está a aproximadamente $meters m do endereço de entrega '
          '(recomendado até ${widget.proximityMeters} m). Deseja marcar como entregue mesmo assim?',
          textAlign: TextAlign.center,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx, false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogCtx, true),
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFEA580C)),
            child: const Text('Estou ciente'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirm() async {
    final code = _codeCtrl.text.trim().toUpperCase();
    if (widget.requireDeliveryCode && code.length != 4) {
      setState(() => _error = 'Informe os 4 últimos dígitos do telefone');
      return;
    }
    if (widget.requireDeliveryPhoto && _photos.isEmpty) {
      setState(() => _error = 'Foto de comprovante é obrigatória');
      return;
    }
    if (_collectPayment) {
      final hasValid = _payments.any((p) {
        final amount =
            double.tryParse(p.amountCtrl.text.trim().replaceAll(',', '.'));
        return amount != null && amount > 0;
      });
      if (!hasValid) {
        setState(() => _error = 'Informe o valor recebido');
        return;
      }
    }
    // Proximidade: valida a distância até o endereço antes de concluir.
    Position? pos;
    try {
      pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high);
    } catch (_) {}

    final destLat = widget.order.customerLat;
    final destLng = widget.order.customerLng;
    if (destLat != null && destLng != null) {
      if (widget.requireProximity && pos == null) {
        setState(() => _error =
            'Não foi possível confirmar sua localização. Ative o GPS e tente novamente.');
        return;
      }
      if (pos != null) {
        final dist = Geolocator.distanceBetween(
            pos.latitude, pos.longitude, destLat, destLng);
        if (dist > widget.proximityMeters) {
          if (widget.requireProximity) {
            setState(() => _error =
                'Você está a ${dist.round()} m do endereço; é necessário estar a até ${widget.proximityMeters} m para concluir a entrega.');
            return;
          }
          final proceed = await _confirmFarAway(dist.round());
          if (proceed != true || !mounted) return;
        }
      }
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final List<String> photoUrls = [];
      const maxBytes = 10 * 1024 * 1024;
      for (final photo in _photos) {
        final bytes = await photo.readAsBytes();
        if (bytes.length > maxBytes) {
          setState(() {
            _error =
                'Uma das fotos é muito grande (máx. 10 MB). Tente novamente.';
            _loading = false;
          });
          return;
        }
        photoUrls.add('data:image/jpeg;base64,${base64Encode(bytes)}');
      }

      // Monta a lista de pagamentos válidos (valor > 0).
      final payments = _collectPayment
          ? _payments
              .map((p) => {
                    'amount': double.tryParse(
                        p.amountCtrl.text.trim().replaceAll(',', '.')),
                    'method': p.method,
                  })
              .where((p) => (p['amount'] as double?) != null &&
                  (p['amount'] as double) > 0)
              .toList()
          : <Map<String, dynamic>>[];

      final note = _noteCtrl.text.trim();
      await ApiClient().dio.post(
        '/deliverer/orders/${widget.order.id}/deliver',
        data: {
          'code': code,
          if (photoUrls.isNotEmpty) 'photoUrls': photoUrls,
          if (pos != null) 'lat': pos.latitude,
          if (pos != null) 'lng': pos.longitude,
          if (note.isNotEmpty) 'note': note,
          if (widget.order.isCash || widget.order.cashAmount != null)
            'cashCollected': true,
          if (payments.isNotEmpty) 'payments': payments,
        },
        options: Options(
          // Uploads de fotos em base64 podem demorar; evita timeout que levaria
          // o entregador a reenviar e (antes) duplicar registros.
          sendTimeout: const Duration(seconds: 60),
          receiveTimeout: const Duration(seconds: 60),
        ),
      );

      widget.onDelivered();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      final msg = isNoInternetError(e)
          ? kNoInternetMessage
          : ((e as dynamic).response?.data?['error'] as String? ?? 'Código incorreto');
      setState(() {
        _error = msg;
        _loading = false;
      });
    }
  }

  Widget _buildPaymentCollection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: _togglePayment,
          child: Row(
            children: [
              Icon(
                _collectPayment
                    ? Icons.check_box
                    : Icons.check_box_outline_blank,
                size: 22,
                color: _collectPayment
                    ? const Color(0xFF16A34A)
                    : Colors.grey.shade400,
              ),
              const SizedBox(width: 8),
              Text('Recebi pagamento',
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w500)),
            ],
          ),
        ),
        if (_collectPayment) ...[
          const SizedBox(height: 12),
          for (int i = 0; i < _payments.length; i++) ...[
            _buildPaymentLine(i),
            const SizedBox(height: 12),
          ],
          // Botão para registrar mais um pagamento (ex.: parte Pix, parte dinheiro).
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _addPaymentLine,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Adicionar pagamento'),
              style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFF16A34A),
                  padding: EdgeInsets.zero),
            ),
          ),
          if (_payments.length > 1) ...[
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total',
                    style: TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w600)),
                Text(
                  'R\$ ${_paymentsTotal.toStringAsFixed(2).replaceAll('.', ',')}',
                  style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF16A34A)),
                ),
              ],
            ),
          ],
        ],
      ],
    );
  }

  Widget _buildPaymentLine(int index) {
    final line = _payments[index];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: line.amountCtrl,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) => setState(() {}), // atualiza o total
                decoration: InputDecoration(
                  labelText: 'Valor recebido',
                  hintText: '0,00',
                  prefixText: 'R\$ ',
                  prefixStyle: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF111827)),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12)),
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 14),
                ),
                style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 18,
                    fontWeight: FontWeight.bold),
              ),
            ),
            if (_payments.length > 1)
              IconButton(
                onPressed: () => _removePaymentLine(index),
                icon: const Icon(Icons.delete_outline),
                color: Colors.red.shade400,
                tooltip: 'Remover',
              ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            _methodChip(index, 'cash', 'Dinheiro'),
            const SizedBox(width: 10),
            _methodChip(index, 'pix', 'Pix'),
            const SizedBox(width: 10),
            _methodChip(index, 'card', 'Cartão'),
          ],
        ),
      ],
    );
  }

  // Dinheiro só pode ser recebido em um único pagamento (não dá para receber
  // "troco" em dois caixas). Pix e cartão podem se repetir à vontade.
  bool _cashTakenBy(int exceptIndex) => _payments
      .asMap()
      .entries
      .any((e) => e.key != exceptIndex && e.value.method == 'cash');

  Widget _methodChip(int index, String value, String label) {
    final selected = _payments[index].method == value;
    final blocked = value == 'cash' && !selected && _cashTakenBy(index);
    return GestureDetector(
      onTap: blocked
          ? null
          : () => setState(() => _payments[index].method = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.primary
              : blocked
                  ? Colors.grey.shade100
                  : Colors.transparent,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(
            color: selected
                ? AppTheme.primary
                : blocked
                    ? const Color(0xFFE5E7EB)
                    : const Color(0xFFD1D5DB),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: selected
                ? Colors.white
                : blocked
                    ? Colors.grey.shade400
                    : Colors.grey.shade700,
          ),
        ),
      ),
    );
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
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          Text('Confirmar entrega — ${widget.order.customerName}',
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text('#${widget.order.shortId} · ${widget.order.customerAddress}',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          const SizedBox(height: 16),

          // Payment info — cobrança pelo entregador
          if (widget.order.paymentMethod != 'prepaid') ...[
            if (widget.order.cashAmount != null && widget.order.cashAmount! > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFBEB),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFF59E0B)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.payments_outlined,
                        size: 20, color: Color(0xFFD97706)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Cobrar R\$ ${widget.order.cashAmount!.toStringAsFixed(2).replaceAll('.', ',')}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          color: Color(0xFF92400E),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            _buildPaymentCollection(),
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
                  fontFamily: 'monospace',
                  letterSpacing: 6,
                  fontSize: 20,
                  fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
          ],

          if (widget.requireDeliveryPhoto || widget.maxProofPhotos > 1) ...[
            _PhotoSection(
              photos: _photos,
              maxPhotos: widget.maxProofPhotos,
              required: widget.requireDeliveryPhoto,
              hasError: _photos.isEmpty && _error != null,
              onAdd: _takePhoto,
              onRemove: _removePhoto,
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
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2))
                  : const Text('Confirmar entrega',
                      style: TextStyle(fontSize: 16)),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Photo section widget ─────────────────────────────────────────────────────

class _PhotoSection extends StatelessWidget {
  final List<XFile> photos;
  final int maxPhotos;
  final bool required;
  final bool hasError;
  final VoidCallback onAdd;
  final void Function(int) onRemove;

  const _PhotoSection({
    required this.photos,
    required this.maxPhotos,
    required this.required,
    required this.hasError,
    required this.onAdd,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final canAdd = photos.length < maxPhotos;
    final label = required
        ? 'Foto de comprovante (obrigatória)'
        : 'Foto de comprovante (opcional)';
    final countLabel =
        maxPhotos > 1 ? '${photos.length}/$maxPhotos fotos' : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label,
                style: TextStyle(
                    fontSize: 13,
                    color: hasError
                        ? const Color(0xFFDC2626)
                        : Colors.grey.shade600)),
            if (countLabel != null) ...[
              const Spacer(),
              Text(countLabel,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
            ],
          ],
        ),
        const SizedBox(height: 8),
        if (photos.isEmpty && !canAdd)
          const SizedBox.shrink()
        else
          SizedBox(
            height: 80,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                // Existing photos
                for (int i = 0; i < photos.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Image.file(
                            File(photos[i].path),
                            width: 80,
                            height: 80,
                            fit: BoxFit.cover,
                          ),
                        ),
                        Positioned(
                          top: 2,
                          right: 2,
                          child: GestureDetector(
                            onTap: () => onRemove(i),
                            child: Container(
                              decoration: const BoxDecoration(
                                color: Colors.black54,
                                shape: BoxShape.circle,
                              ),
                              padding: const EdgeInsets.all(2),
                              child: const Icon(Icons.close,
                                  size: 14, color: Colors.white),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                // Add button
                if (canAdd)
                  GestureDetector(
                    onTap: onAdd,
                    child: Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: hasError && photos.isEmpty
                              ? const Color(0xFFDC2626)
                              : Colors.grey.shade300,
                          style: BorderStyle.solid,
                        ),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.camera_alt_outlined,
                              color: Colors.grey.shade400, size: 24),
                          const SizedBox(height: 4),
                          Text('Adicionar',
                              style: TextStyle(
                                  color: Colors.grey.shade500, fontSize: 11)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
      ],
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

// Motivos de cancelamento (código → label). Mesmos códigos do backend.
const _cancelReasons = <({String code, String label})>[
  (code: 'MISSING_ITEM', label: 'Pedido faltando'),
  (code: 'WRONG_ORDER', label: 'Cliente/Pedido errado'),
  (code: 'OTHER', label: 'Outro'),
];

class _CancelDeliverySheetState extends State<_CancelDeliverySheet> {
  final _noteCtrl = TextEditingController();
  String? _reasonCode;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _cancel() async {
    final reasonCode = _reasonCode;
    if (reasonCode == null) {
      setState(() => _error = 'Selecione o motivo do cancelamento');
      return;
    }
    final note = _noteCtrl.text.trim();
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      Position? pos;
      try {
        pos = await Geolocator.getCurrentPosition(
            desiredAccuracy: LocationAccuracy.high);
      } catch (_) {}

      await ApiClient().dio.post(
        '/deliverer/orders/${widget.order.id}/cancel-v2',
        data: {
          'reasonCode': reasonCode,
          if (reasonCode == 'OTHER' && note.isNotEmpty) 'note': note,
          if (pos != null) 'lat': pos.latitude,
          if (pos != null) 'lng': pos.longitude,
        },
      );

      widget.onCancelled();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      final msg = (e as dynamic).response?.data?['error'] as String? ??
          'Erro ao cancelar. Tente novamente.';
      setState(() {
        _error = msg;
        _loading = false;
      });
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
              width: 40,
              height: 4,
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
                  style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFFDC2626))),
            ),
          ]),
          const SizedBox(height: 4),
          Text('#${widget.order.shortId} · ${widget.order.customerAddress}',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          const SizedBox(height: 20),
          Text('Motivo do cancelamento',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade700)),
          const SizedBox(height: 8),
          for (final reason in _cancelReasons)
            RadioListTile<String>(
              value: reason.code,
              groupValue: _reasonCode,
              onChanged: _loading
                  ? null
                  : (v) => setState(() {
                        _reasonCode = v;
                        _error = null;
                      }),
              title: Text(reason.label, style: const TextStyle(fontSize: 15)),
              activeColor: const Color(0xFFDC2626),
              contentPadding: EdgeInsets.zero,
              dense: true,
              visualDensity: VisualDensity.compact,
            ),
          if (_reasonCode == 'OTHER') ...[
            const SizedBox(height: 8),
            TextField(
              controller: _noteCtrl,
              maxLines: 3,
              maxLength: 500,
              autofocus: true,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                labelText: 'Descreva o motivo (opcional)',
                hintText: 'Ex: cliente recusou, endereço não encontrado...',
                alignLabelWithHint: true,
                counterText: '',
                prefixIcon:
                    const Icon(Icons.notes_outlined, color: Color(0xFFDC2626)),
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide:
                      const BorderSide(color: Color(0xFFDC2626), width: 2),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFFFCDD2)),
                ),
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!,
                style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _loading ? null : _cancel,
              style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFDC2626)),
              child: _loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2))
                  : const Text('Confirmar cancelamento',
                      style: TextStyle(fontSize: 16)),
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
            const Icon(Icons.check_circle_outline,
                size: 64, color: Color(0xFF16A34A)),
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

class _DeliveryErrorState extends StatelessWidget {
  final bool offline;
  final VoidCallback onRetry;
  const _DeliveryErrorState({required this.offline, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(offline ? Icons.wifi_off_rounded : Icons.error_outline,
                size: 64, color: offline ? const Color(0xFFEA580C) : Colors.red.shade400),
            const SizedBox(height: 16),
            Text(offline ? 'Sem conexão com a internet' : 'Não foi possível carregar',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              offline
                  ? 'Verifique sua conexão e tente novamente.'
                  : 'Ocorreu um erro ao carregar as entregas. Tente novamente.',
              style: TextStyle(color: Colors.grey.shade600),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Tentar novamente'),
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
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          Text(subtitle,
              style: const TextStyle(fontSize: 11, color: Colors.white70)),
        ],
      );
}
