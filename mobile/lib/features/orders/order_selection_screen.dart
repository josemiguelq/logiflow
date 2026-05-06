import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/order.dart';
import '../../core/theme/app_theme.dart';
import '../../features/tracking/location_service.dart';

// ── providers ────────────────────────────────────────────────────────────────

final _assignedOrdersProvider = FutureProvider.autoDispose<List<Order>>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/orders');
  final all = (res.data as List).map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
  return all.where((o) => o.status == 'ASSIGNED').toList();
});

final _preparingOrdersProvider = FutureProvider.autoDispose<List<Order>>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/orders/preparing');
  return (res.data as List).map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
});

final _activeOrdersProvider = FutureProvider.autoDispose<List<Order>>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/orders');
  final all = (res.data as List).map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
  return all.where((o) => o.status == 'ON_ROUTE' || o.status == 'OUT_FOR_DELIVERY').toList();
});

class _StoreLocation {
  final double? lat;
  final double? lng;
  const _StoreLocation(this.lat, this.lng);
}

final _storeLocationProvider = FutureProvider.autoDispose<_StoreLocation>((ref) async {
  try {
    final res = await ApiClient().dio.get('/deliverer/store');
    return _StoreLocation(
      (res.data['lat'] as num?)?.toDouble(),
      (res.data['lng'] as num?)?.toDouble(),
    );
  } catch (_) {
    return const _StoreLocation(null, null);
  }
});

// ── helpers ──────────────────────────────────────────────────────────────────

double? _distanceKm(_StoreLocation store, Order order) {
  if (store.lat == null || store.lng == null) return null;
  if (order.customerLat == null || order.customerLng == null) return null;
  const R = 6371.0;
  final dLat = _toRad(order.customerLat! - store.lat!);
  final dLon = _toRad(order.customerLng! - store.lng!);
  final a = sin(dLat / 2) * sin(dLat / 2) +
      cos(_toRad(store.lat!)) * cos(_toRad(order.customerLat!)) *
          sin(dLon / 2) * sin(dLon / 2);
  return R * 2 * atan2(sqrt(a), sqrt(1 - a));
}

double _toRad(double deg) => deg * pi / 180;

// ── screen ───────────────────────────────────────────────────────────────────

class OrderSelectionScreen extends ConsumerStatefulWidget {
  const OrderSelectionScreen({super.key});

  @override
  ConsumerState<OrderSelectionScreen> createState() => _OrderSelectionScreenState();
}

class _OrderSelectionScreenState extends ConsumerState<OrderSelectionScreen> {
  final Set<String> _selected = {};
  bool _claiming = false;

  void _refresh() {
    ref.invalidate(_assignedOrdersProvider);
    ref.invalidate(_preparingOrdersProvider);
    ref.invalidate(_activeOrdersProvider);
  }

  @override
  Widget build(BuildContext context) {
    final assigned    = ref.watch(_assignedOrdersProvider);
    final preparing   = ref.watch(_preparingOrdersProvider);
    final activeOrders = ref.watch(_activeOrdersProvider);
    final storeLoc    = ref.watch(_storeLocationProvider);
    final session     = ref.watch(authProvider);

    // Determine which list to show
    final assignedList  = assigned.value ?? [];
    final preparingList = preparing.value ?? [];
    final isPreparing   = assignedList.isEmpty;
    final displayList   = isPreparing ? preparingList : assignedList;
    final isLoading     = isPreparing
        ? (assigned.isLoading || preparing.isLoading)
        : assigned.isLoading;

    return Scaffold(
      appBar: AppBar(
        title: Text('Olá, ${session?.name.split(' ').first ?? ''}'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _refresh),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              ref.read(locationServiceProvider).stopTracking();
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            },
          ),
        ],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Active route banner
                activeOrders.when(
                  data: (active) => active.isEmpty
                      ? const SizedBox.shrink()
                      : _ActiveRouteBanner(
                          count: active.length,
                          onTap: () => context.push('/delivery')),
                  loading: () => const SizedBox.shrink(),
                  error:   (_, __) => const SizedBox.shrink(),
                ),

                // Section header when showing preparing orders
                if (isPreparing && preparingList.isNotEmpty)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FDF4),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFBBF7D0)),
                    ),
                    child: Row(children: [
                      const Icon(Icons.store_outlined, size: 16, color: Color(0xFF16A34A)),
                      const SizedBox(width: 8),
                      Text(
                        '${preparingList.length} pedido(s) prontos na loja para retirada',
                        style: const TextStyle(
                          color: Color(0xFF15803D),
                          fontWeight: FontWeight.w500,
                          fontSize: 13,
                        ),
                      ),
                    ]),
                  ),

                if (displayList.isEmpty)
                  Expanded(
                    child: Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.inbox_outlined, size: 56, color: Colors.grey.shade400),
                          const SizedBox(height: 12),
                          const Text('Nenhum pedido disponível',
                              style: TextStyle(
                                  color: Colors.grey, fontWeight: FontWeight.w500)),
                          const SizedBox(height: 4),
                          const Text('Aguarde a loja preparar pedidos',
                              style: TextStyle(color: Colors.grey, fontSize: 13)),
                        ],
                      ),
                    ),
                  )
                else ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          isPreparing
                              ? 'Selecione os pedidos que vai buscar'
                              : '${displayList.length} pedido(s) atribuído(s)',
                          style: const TextStyle(
                              fontWeight: FontWeight.w600, fontSize: 14),
                        ),
                        if (_selected.isNotEmpty)
                          TextButton(
                            onPressed: () => setState(() => _selected.clear()),
                            child: const Text('Limpar'),
                          ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: RefreshIndicator(
                      onRefresh: () async => _refresh(),
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
                        itemCount: displayList.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, i) {
                          final store = storeLoc.value ?? const _StoreLocation(null, null);
                          final o   = displayList[i];
                          final dist = _distanceKm(store, o);
                          final sel  = _selected.contains(o.id);
                          return _OrderSelectionTile(
                            order:    o,
                            distance: dist,
                            selected: sel,
                            onTap: () => setState(() {
                              if (sel) _selected.remove(o.id); else _selected.add(o.id);
                            }),
                          );
                        },
                      ),
                    ),
                  ),
                ],
              ],
            ),
      floatingActionButton: _selected.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: _claiming ? null : () => _proceedToRoute(isPreparing),
              icon: _claiming
                  ? const SizedBox(width: 20, height: 20,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Icon(Icons.route),
              label: Text('Iniciar rota (${_selected.length})'),
              backgroundColor: AppTheme.primary,
              foregroundColor: Colors.white,
            ),
    );
  }

  Future<void> _proceedToRoute(bool isPreparing) async {
    if (isPreparing) {
      setState(() => _claiming = true);
      try {
        final prepList = ref.read(_preparingOrdersProvider).value ?? [];
        final selected = prepList.where((o) => _selected.contains(o.id)).toList();
        await ApiClient().dio.post('/deliverer/orders/claim', data: {
          'orderIds': selected.map((o) => o.id).toList(),
        });
        ref.invalidate(_assignedOrdersProvider);
        ref.invalidate(_preparingOrdersProvider);
        if (mounted) context.push('/plan-route', extra: selected);
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Erro ao reservar pedidos. Tente novamente.')),
          );
        }
      } finally {
        if (mounted) setState(() => _claiming = false);
      }
    } else {
      final list     = ref.read(_assignedOrdersProvider).value ?? [];
      final selected = list.where((o) => _selected.contains(o.id)).toList();
      context.push('/plan-route', extra: selected);
    }
  }
}

class _ActiveRouteBanner extends StatelessWidget {
  final int count;
  final VoidCallback onTap;
  const _ActiveRouteBanner({required this.count, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFEDD5),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFFED7AA)),
        ),
        child: Row(
          children: [
            const Icon(Icons.local_shipping, color: Color(0xFFEA580C), size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Você tem $count entrega(s) em andamento',
                style: const TextStyle(
                    color: Color(0xFF9A3412), fontWeight: FontWeight.w500),
              ),
            ),
            const Text('Ver rota →',
                style: TextStyle(
                    color: Color(0xFFEA580C), fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _OrderSelectionTile extends StatelessWidget {
  final Order order;
  final double? distance;
  final bool selected;
  final VoidCallback onTap;

  const _OrderSelectionTile({
    required this.order,
    required this.distance,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        decoration: BoxDecoration(
          color: selected ? AppTheme.primary.withOpacity(0.06) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? AppTheme.primary : const Color(0xFFE5E7EB),
            width: selected ? 2 : 1,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: selected ? AppTheme.primary : Colors.transparent,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: selected ? AppTheme.primary : Colors.grey.shade300,
                    width: 2,
                  ),
                ),
                child: selected
                    ? const Icon(Icons.check, color: Colors.white, size: 14)
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(order.customerName,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 15)),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.location_on_outlined,
                            size: 14, color: Colors.grey.shade500),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            order.customerAddress,
                            style: TextStyle(
                                color: Colors.grey.shade600, fontSize: 13),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (distance != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${distance!.toStringAsFixed(1)} km',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey.shade700,
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
