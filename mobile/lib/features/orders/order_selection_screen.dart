import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/order.dart';
import '../../core/models/route.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/app_drawer.dart';

// ── providers ────────────────────────────────────────────────────────────────

final _routesProvider = FutureProvider.autoDispose<List<DelivererRoute>>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/routes');
  return (res.data as List)
      .map((e) => DelivererRoute.fromJson(e as Map<String, dynamic>))
      .toList();
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
  bool _claiming       = false;
  bool _togglingStatus = false;
  bool _openingRoute   = false;
  bool _mapView        = false;

  void _refresh() {
    ref.invalidate(_routesProvider);
    ref.invalidate(_preparingOrdersProvider);
    ref.invalidate(_activeOrdersProvider);
  }

  Future<void> _toggleStatus(String currentStatus) async {
    final isOffline    = currentStatus == 'OFFLINE';
    final targetStatus = isOffline ? 'AVAILABLE' : 'OFFLINE';
    setState(() => _togglingStatus = true);
    try {
      double? lat, lng;
      try {
        final pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.medium,
          timeLimit: const Duration(seconds: 8),
        );
        lat = pos.latitude;
        lng = pos.longitude;
      } catch (_) {}
      final err = await ref.read(authProvider.notifier).updateStatus(targetStatus, lat: lat, lng: lng);
      if (err != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
      }
    } finally {
      if (mounted) setState(() => _togglingStatus = false);
    }
  }

  Future<void> _openRoute(DelivererRoute summary) async {
    if (summary.status == 'STARTED') {
      context.push('/delivery');
      return;
    }
    setState(() => _openingRoute = true);
    try {
      final res   = await ApiClient().dio.get('/deliverer/routes/${summary.id}');
      final route = DelivererRoute.fromJson(res.data as Map<String, dynamic>);
      if (mounted) context.push('/plan-route', extra: route);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Erro ao carregar rota. Tente novamente.')),
        );
      }
    } finally {
      if (mounted) setState(() => _openingRoute = false);
    }
  }

  Future<void> _claimPreparing() async {
    setState(() => _claiming = true);
    try {
      final prepList = ref.read(_preparingOrdersProvider).value ?? [];
      final selected = prepList.where((o) => _selected.contains(o.id)).toList();
      final res  = await ApiClient().dio.post('/deliverer/orders/claim', data: {
        'orderIds': selected.map((o) => o.id).toList(),
      });
      final data     = res.data as Map<String, dynamic>;
      final routeMap = Map<String, dynamic>.from(data['route'] as Map<String, dynamic>);
      routeMap['orders'] = data['orders'];
      final route = DelivererRoute.fromJson(routeMap);
      ref.invalidate(_routesProvider);
      ref.invalidate(_preparingOrdersProvider);
      if (mounted) context.push('/plan-route', extra: route);
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = (e.response?.data as Map?)?['error'] as String?
          ?? 'Erro ao iniciar rota. Tente novamente.';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      // Refresh the list so stale orders (already taken) disappear
      if (e.response?.statusCode == 409) _refresh();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Erro ao iniciar rota. Tente novamente.')),
        );
      }
    } finally {
      if (mounted) setState(() { _claiming = false; _selected.clear(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final routes       = ref.watch(_routesProvider);
    final preparing    = ref.watch(_preparingOrdersProvider);
    final activeOrders = ref.watch(_activeOrdersProvider);
    final storeLoc     = ref.watch(_storeLocationProvider);
    final session      = ref.watch(authProvider);

    final routeList     = routes.value ?? [];
    final preparingList = preparing.value ?? [];
    final isOffline     = session?.status == 'OFFLINE';
    final isLoading     = routes.isLoading || preparing.isLoading;

    final firstName = session?.name.split(' ').first ?? '';

    final showClaim = _selected.isNotEmpty && routeList.isEmpty;

    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(
        title: Text('Olá, $firstName',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        actions: [
          Text(
            isOffline ? 'OFFLINE' : 'ONLINE',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: isOffline ? Colors.grey.shade400 : const Color(0xFF16A34A),
            ),
          ),
          _togglingStatus
              ? const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12),
                  child: SizedBox(
                      width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                )
              : Switch(
                  value: !isOffline,
                  activeColor: const Color(0xFF16A34A),
                  onChanged: (_) => _toggleStatus(session?.status ?? 'AVAILABLE'),
                ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _refresh),
        ],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : Stack(
              children: [
                // ── Main content ─────────────────────────────────────
                _mapView
                    ? _buildMapView(preparingList)
                    : RefreshIndicator(
                        onRefresh: () async => _refresh(),
                        child: CustomScrollView(
                          slivers: [
                            // ── Offline banner ──────────────────────
                            if (isOffline)
                              SliverToBoxAdapter(
                                child: Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 16, vertical: 10),
                                  color: Colors.grey.shade200,
                                  child: Row(children: [
                                    Icon(Icons.do_not_disturb_on_outlined,
                                        size: 16, color: Colors.grey.shade600),
                                    const SizedBox(width: 8),
                                    Text(
                                      'Você está OFFLINE — não receberá novos pedidos',
                                      style: TextStyle(
                                          color: Colors.grey.shade700,
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500),
                                    ),
                                  ]),
                                ),
                              ),

                            // ── Active delivery banner ───────────────
                            SliverToBoxAdapter(
                              child: activeOrders.when(
                                data: (active) => active.isEmpty
                                    ? const SizedBox.shrink()
                                    : _ActiveRouteBanner(
                                        count: active.length,
                                        onTap: () => context.push('/delivery')),
                                loading: () => const SizedBox.shrink(),
                                error:   (_, __) => const SizedBox.shrink(),
                              ),
                            ),

                            // ── Routes assigned by the store ─────────
                            if (routeList.isNotEmpty) ...[
                              SliverToBoxAdapter(
                                child: Padding(
                                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                                  child: Text(
                                    'Rotas atribuídas (${routeList.length})',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600, fontSize: 14),
                                  ),
                                ),
                              ),
                              SliverList(
                                delegate: SliverChildBuilderDelegate(
                                  (_, i) => Padding(
                                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                                    child: _RouteSummaryCard(
                                      route:   routeList[i],
                                      loading: _openingRoute,
                                      onTap:   () => _openRoute(routeList[i]),
                                    ),
                                  ),
                                  childCount: routeList.length,
                                ),
                              ),
                            ],

                            // ── Preparing orders ─────────────────────
                            if (routeList.isEmpty && preparingList.isNotEmpty) ...[
                              SliverToBoxAdapter(
                                child: Padding(
                                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      const Text(
                                        'Selecione os pedidos que vai buscar',
                                        style: TextStyle(
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
                              ),
                              SliverPadding(
                                padding: const EdgeInsets.fromLTRB(16, 4, 16, 160),
                                sliver: SliverList(
                                  delegate: SliverChildBuilderDelegate(
                                    (_, i) {
                                      final store = storeLoc.value ?? const _StoreLocation(null, null);
                                      final o   = preparingList[i];
                                      final dist = _distanceKm(store, o);
                                      final sel  = _selected.contains(o.id);
                                      return Padding(
                                        padding: const EdgeInsets.only(bottom: 10),
                                        child: _OrderSelectionTile(
                                          order:    o,
                                          distance: dist,
                                          selected: sel,
                                          onTap: () => setState(() {
                                            if (sel) _selected.remove(o.id);
                                            else     _selected.add(o.id);
                                          }),
                                        ),
                                      );
                                    },
                                    childCount: preparingList.length,
                                  ),
                                ),
                              ),
                            ],

                            // ── Empty state ──────────────────────────
                            if (routeList.isEmpty && preparingList.isEmpty)
                              SliverFillRemaining(
                                child: Center(
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(Icons.inbox_outlined,
                                          size: 56, color: Colors.grey.shade400),
                                      const SizedBox(height: 12),
                                      const Text('Nenhum pedido disponível',
                                          style: TextStyle(
                                              color: Colors.grey,
                                              fontWeight: FontWeight.w500)),
                                      const SizedBox(height: 4),
                                      const Text('Aguarde a loja preparar pedidos',
                                          style: TextStyle(
                                              color: Colors.grey, fontSize: 13)),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),

                // ── Botão "Iniciar rota" ──────────────────────────────
                if (showClaim)
                  Positioned(
                    bottom: 88 + MediaQuery.of(context).padding.bottom,
                    left: 16,
                    right: 16,
                    child: SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _claiming ? null : _claimPreparing,
                        icon: _claiming
                            ? const SizedBox(
                                width: 18, height: 18,
                                child: CircularProgressIndicator(
                                    color: Colors.white, strokeWidth: 2))
                            : const Icon(Icons.route, size: 20),
                        label: Text(
                          _claiming
                              ? 'Iniciando...'
                              : 'Iniciar rota (${_selected.length})',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16)),
                          elevation: 4,
                        ),
                      ),
                    ),
                  ),

                // ── Toggle mapa / lista ───────────────────────────────
                Positioned(
                  bottom: 24 + MediaQuery.of(context).padding.bottom,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: _MapToggle(
                      value: _mapView,
                      onChanged: (v) => setState(() => _mapView = v),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildMapView(List<Order> orders) {
    final withCoords = orders
        .where((o) => o.customerLat != null && o.customerLng != null)
        .toList();

    if (withCoords.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.map_outlined, size: 56, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text('Nenhum pedido com localização disponível',
                style: TextStyle(color: Colors.grey.shade600)),
          ],
        ),
      );
    }

    final centerLat = withCoords.map((o) => o.customerLat!).reduce((a, b) => a + b) / withCoords.length;
    final centerLng = withCoords.map((o) => o.customerLng!).reduce((a, b) => a + b) / withCoords.length;

    return FlutterMap(
      options: MapOptions(
        initialCenter: LatLng(centerLat, centerLng),
        initialZoom: 13.5,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.logiflow.mobile',
        ),
        MarkerLayer(
          markers: withCoords.map((o) {
            final sel = _selected.contains(o.id);
            return Marker(
              point: LatLng(o.customerLat!, o.customerLng!),
              width: 80,
              height: 72,
              alignment: Alignment.topCenter,
              child: GestureDetector(
                onTap: () => setState(() {
                  if (sel) _selected.remove(o.id);
                  else     _selected.add(o.id);
                }),
                child: _OrderPin(
                  name:     o.customerName,
                  selected: sel,
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}

// ── widgets ──────────────────────────────────────────────────────────────────

// ── widgets ──────────────────────────────────────────────────────────────────

class _MapToggle extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  const _MapToggle({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(100),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.15),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(14, 6, 8, 6),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.map_outlined,
            size: 20,
            color: value ? AppTheme.primary : Colors.grey.shade500,
          ),
          const SizedBox(width: 4),
          Text(
            'Mapa',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: value ? AppTheme.primary : Colors.grey.shade600,
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeThumbColor: AppTheme.primary,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ],
      ),
    );
  }
}

class _OrderPin extends StatelessWidget {
  final String name;
  final bool selected;
  const _OrderPin({required this.name, required this.selected});

  @override
  Widget build(BuildContext context) {
    final firstName = name.split(' ').first;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Label com o primeiro nome
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 4,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          child: Text(
            firstName,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
          ),
        ),
        const SizedBox(height: 2),
        // Círculo do pin
        AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: selected ? AppTheme.primary : Colors.white,
            shape: BoxShape.circle,
            border: Border.all(
              color: selected ? AppTheme.primary : Colors.grey.shade400,
              width: 2.5,
            ),
            boxShadow: [
              BoxShadow(
                color: (selected ? AppTheme.primary : Colors.black)
                    .withValues(alpha: 0.25),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Center(
            child: Icon(
              Icons.location_on,
              size: 16,
              color: selected ? Colors.white : AppTheme.primary,
            ),
          ),
        ),
        // Ponteiro
        AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          width: 3,
          height: 8,
          decoration: BoxDecoration(
            color: selected ? AppTheme.primary : Colors.grey.shade400,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ],
    );
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
            const Icon(Icons.local_shipping,
                color: Color(0xFFEA580C), size: 20),
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

class _RouteSummaryCard extends StatelessWidget {
  final DelivererRoute route;
  final bool loading;
  final VoidCallback onTap;

  const _RouteSummaryCard({
    required this.route,
    required this.loading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isStarted = route.status == 'STARTED';
    return GestureDetector(
      onTap: loading ? null : onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isStarted
                ? const Color(0xFFFED7AA)
                : const Color(0xFFBBF7D0),
            width: 1.5,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: isStarted
                      ? const Color(0xFFFFEDD5)
                      : const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  isStarted
                      ? Icons.local_shipping_outlined
                      : Icons.inventory_2_outlined,
                  color: isStarted
                      ? const Color(0xFFEA580C)
                      : const Color(0xFF16A34A),
                  size: 22,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          'Código: ',
                          style: TextStyle(
                              fontSize: 12, color: Colors.grey.shade500),
                        ),
                        Text(
                          route.pickupCode,
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 2,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${route.orderCount} pedido(s) · ${isStarted ? 'Em andamento' : 'Pronto para coleta'}',
                      style: TextStyle(
                          fontSize: 13, color: Colors.grey.shade600),
                    ),
                  ],
                ),
              ),
              loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : Icon(Icons.chevron_right,
                      color: Colors.grey.shade400, size: 24),
            ],
          ),
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
