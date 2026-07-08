import 'dart:async';
import 'dart:math';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:tutorial_coach_mark/tutorial_coach_mark.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/map_tiles.dart';
import '../../core/models/order.dart';
import '../../core/models/route.dart';
import '../../core/providers/store_settings_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/app_drawer.dart';
import '../../widgets/priority_badge.dart';
import '../tracking/location_service.dart';
import 'order_selection_controller.dart';

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
  OrderSelectionController _sel = const OrderSelectionController();
  bool _claiming       = false;
  bool _togglingStatus = false;
  bool _openingRoute   = false;
  bool _mapView        = false;
  bool _reserving      = false;

  StreamSubscription<WsMessage>? _wsSub;
  Timer? _delayTicker;
  final GlobalKey _switchKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    // Atualiza periodicamente para o tempo de espera dos pedidos avançar na tela.
    _delayTicker = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
    // Guia (coach-mark) do switch de disponibilidade — uma única vez.
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowSwitchTour());
    try {
      final locationService = ref.read(locationServiceProvider);
      _wsSub = locationService.messageStream.listen(
        (msg) {
          final event = msg['event'] as String?;
          final data  = msg['data']  as Map<String, dynamic>?;
          if (event == null || data == null || !mounted) return;

          if (event == 'order_updated') {
            final orderId = data['id'] as String?;
            final status  = data['status'] as String?;
            // Always unblock the order — it may have been in _hiddenByOthers
            // from a reservation that was later claimed or returned.
            if (orderId != null) setState(() => _sel = _sel.onWsOrderUnreserved(orderId));
            // Invalidate when the order enters or leaves the preparing list
            if (status == 'PREPARING' || status == 'ASSIGNED') {
              ref.invalidate(_preparingOrdersProvider);
            }
            return;
          }

          final orderId     = data['orderId']     as String?;
          final delivererId = data['delivererId'] as String?;
          if (orderId == null) return;
          setState(() {
            if (event == 'order_reserved') {
              _sel = _sel.onWsOrderReserved(orderId);
            } else if (event == 'order_unreserved') {
              _sel = _sel.onWsOrderUnreserved(orderId);
            }
          });
        },
        onError: (Object e, StackTrace st) {
          Sentry.captureException(e, stackTrace: st,
              hint: Hint.withMap({'context': 'order_selection_ws_stream'}));
        },
      );
    } catch (e, st) {
      Sentry.captureException(e, stackTrace: st,
          hint: Hint.withMap({'context': 'OrderSelectionScreen.initState'}));
    }
  }

  // Mostra o spotlight no switch de disponibilidade na 1ª vez (flag do backend).
  void _maybeShowSwitchTour() {
    if (!mounted) return;
    final session = ref.read(authProvider);
    if (session == null || !session.needsSwitchTour) return;
    if (_switchKey.currentContext == null) return;

    void markSeen() => ref.read(authProvider.notifier).markSwitchTourSeen();

    TutorialCoachMark(
      colorShadow: Colors.black,
      textSkip: 'Entendi',
      onFinish: markSeen,
      onSkip: () { markSeen(); return true; },
      targets: [
        TargetFocus(
          identify: 'availability-switch',
          keyTarget: _switchKey,
          shape: ShapeLightFocus.RRect,
          radius: 8,
          contents: [
            TargetContent(
              align: ContentAlign.bottom,
              builder: (context, controller) => const Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Sua disponibilidade',
                      style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  SizedBox(height: 8),
                  Text(
                    'Este é o seu switch de disponibilidade. Ligado: você recebe pedidos e '
                    'compartilha sua localização durante as entregas. Desligado: o app não '
                    'registra nada e você não recebe pedidos.',
                    style: TextStyle(color: Colors.white, fontSize: 15, height: 1.4),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    ).show(context: context);
  }

  @override
  void dispose() {
    _delayTicker?.cancel();
    _wsSub?.cancel();
    // Release all reservations held by this screen session
    for (final id in List<String>.from(_sel.selected)) {
      ApiClient().dio.delete('/deliverer/orders/$id/reserve').ignore();
    }
    super.dispose();
  }

  void _refresh() {
    ref.invalidate(_routesProvider);
    ref.invalidate(_preparingOrdersProvider);
    ref.invalidate(_activeOrdersProvider);
  }

  Future<void> _toggleSelect(String orderId) async {
    if (_reserving) return;

    if (_sel.isSelected(orderId)) {
      setState(() => _sel = _sel.deselect(orderId));
      ApiClient().dio.delete('/deliverer/orders/$orderId/reserve').ignore();
      return;
    }

    setState(() { _reserving = true; _sel = _sel.optimisticReserve(orderId); });
    try {
      await ApiClient().dio.post('/deliverer/orders/$orderId/reserve');
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _sel = _sel.rollbackReserve(orderId));
      final msg = (e.response?.data as Map?)?['error'] as String?
          ?? 'Não foi possível reservar o pedido';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    } finally {
      if (mounted) setState(() => _reserving = false);
    }
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
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(
            isNoInternetError(e) ? kNoInternetMessage : 'Erro ao carregar rota. Tente novamente.',
          )),
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
      final validIds = prepList.map((o) => o.id).toSet();
      final orderedIds = _sel.selected.where((id) => validIds.contains(id)).toList();
      final res  = await ApiClient().dio.post('/deliverer/orders/claim', data: {
        'orderIds': orderedIds,
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
      if (mounted) setState(() { _claiming = false; _sel = _sel.clear(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final routes       = ref.watch(_routesProvider);
    final preparing    = ref.watch(_preparingOrdersProvider);
    final activeOrders = ref.watch(_activeOrdersProvider);
    final storeLoc     = ref.watch(_storeLocationProvider);
    final session      = ref.watch(authProvider);
    final settings     = ref.watch(storeSettingsProvider).value;

    final routeList     = routes.value ?? [];
    final preparingList = preparing.value ?? [];
    final isOffline     = session?.status == 'OFFLINE';
    final isLoading     = routes.isLoading || preparing.isLoading;
    // Sem internet: os providers falharam por conexão e não há dados em cache.
    final noInternet    = (routes.hasError && isNoInternetError(routes.error)) ||
                          (preparing.hasError && isNoInternetError(preparing.error));
    final showOffline   = noInternet && routeList.isEmpty && preparingList.isEmpty;

    final firstName = session?.name.split(' ').first ?? '';

    final showClaim = _sel.hasSelection && routeList.isEmpty;

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
                  key: _switchKey,
                  value: !isOffline,
                  activeColor: const Color(0xFF16A34A),
                  onChanged: (_) => _toggleStatus(session?.status ?? 'AVAILABLE'),
                ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _refresh),
        ],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : showOffline
          ? _OfflineState(onRetry: _refresh)
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
                                      if (_sel.hasSelection)
                                        TextButton(
                                          onPressed: () => setState(() => _sel = _sel.clear()),
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
                                      if (_sel.isHidden(o.id)) return const SizedBox.shrink();
                                      final dist = _distanceKm(store, o);
                                      final sel  = _sel.isSelected(o.id);
                                      final selOrder = sel ? _sel.selected.indexOf(o.id) + 1 : null;
                                      return Padding(
                                        padding: const EdgeInsets.only(bottom: 10),
                                        child: _OrderSelectionTile(
                                          order:          o,
                                          distance:       dist,
                                          selected:       sel,
                                          selectionOrder: selOrder,
                                          delay: settings != null
                                              ? computeOrderDelay(o, settings)
                                              : null,
                                          onTap: () => _toggleSelect(o.id),
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
                              : 'Iniciar rota (${_sel.selected.length})',
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
    final settings = ref.read(storeSettingsProvider).value;
    final withCoords = orders
        .where((o) => o.customerLat != null && o.customerLng != null && !_sel.isHidden(o.id))
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
        appTileLayer(),
        MarkerLayer(
          markers: withCoords.map((o) {
            final sel      = _sel.isSelected(o.id);
            final selOrder = sel ? _sel.selected.indexOf(o.id) + 1 : null;
            final delay    = settings != null ? computeOrderDelay(o, settings) : null;
            return Marker(
              point: LatLng(o.customerLat!, o.customerLng!),
              width: 160,
              height: 96,
              alignment: Alignment.topCenter,
              child: GestureDetector(
                onTap: () => _toggleSelect(o.id),
                child: _OrderPin(
                  name:           o.customerName,
                  selected:       sel,
                  selectionOrder: selOrder,
                  waitingMinutes: delay?.minutes,
                  delayLevel:     delay?.level,
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

// Estado exibido quando não há conexão com a internet. Nunca mostra detalhes
// técnicos (URL/host) — apenas uma mensagem genérica e um botão de tentar de novo.
class _OfflineState extends StatelessWidget {
  final VoidCallback onRetry;
  const _OfflineState({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              'assets/images/no-internet.png',
              width: 160,
              height: 160,
              // Enquanto o PNG não estiver presente, mostra um ícone como fallback.
              errorBuilder: (_, __, ___) =>
                  Icon(Icons.wifi_off_rounded, size: 96, color: Colors.grey.shade400),
            ),
            const SizedBox(height: 20),
            const Text(
              'Sem conexão com a internet',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: Colors.black87),
            ),
            const SizedBox(height: 6),
            Text(
              kNoInternetMessage,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Tentar novamente'),
            ),
          ],
        ),
      ),
    );
  }
}

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
  final int? selectionOrder;
  final int? waitingMinutes;
  final DelayLevel? delayLevel;
  const _OrderPin({
    required this.name,
    required this.selected,
    this.selectionOrder,
    this.waitingMinutes,
    this.delayLevel,
  });

  @override
  Widget build(BuildContext context) {
    // Cor do tempo de espera conforme o nível de atraso (settings da loja).
    final Color waitColor = switch (delayLevel) {
      DelayLevel.red    => const Color(0xFFB91C1C),
      DelayLevel.yellow => const Color(0xFF92400E),
      _                 => const Color(0xFF64748B),
    };
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                name,
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1E293B),
                ),
                textAlign: TextAlign.center,
              ),
              if (waitingMinutes != null)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.schedule, size: 9, color: waitColor),
                    const SizedBox(width: 2),
                    Text(
                      'há ${formatWaitDuration(waitingMinutes!)}',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: waitColor,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
        const SizedBox(height: 2),
        // Círculo do pin — mostra número de seleção quando selecionado
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
            child: selectionOrder != null
                ? Text(
                    '$selectionOrder',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  )
                : Icon(
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
            const Icon(LucideIcons.truck,
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
                      ? LucideIcons.truck
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
  final int? selectionOrder;
  final OrderDelay? delay;
  final VoidCallback onTap;

  const _OrderSelectionTile({
    required this.order,
    required this.distance,
    required this.selected,
    required this.onTap,
    this.selectionOrder,
    this.delay,
  });

  @override
  Widget build(BuildContext context) {
    final level = delay?.level ?? DelayLevel.none;
    final isRed    = level == DelayLevel.red;
    final isYellow = level == DelayLevel.yellow;

    // Seleção tem prioridade visual; senão, colore conforme o atraso.
    final Color bgColor = selected
        ? AppTheme.primary.withOpacity(0.06)
        : isRed
            ? const Color(0xFFFEF2F2)
            : isYellow
                ? const Color(0xFFFEFCE8)
                : Colors.white;
    final Color borderColor = selected
        ? AppTheme.primary
        : isRed
            ? const Color(0xFFFCA5A5)
            : isYellow
                ? const Color(0xFFFDE68A)
                : const Color(0xFFE5E7EB);

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: borderColor,
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
                    ? Center(
                        child: selectionOrder != null
                            ? Text(
                                '$selectionOrder',
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.check, color: Colors.white, size: 14),
                      )
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
                    if (order.isPriority) ...[
                      const SizedBox(height: 6),
                      PriorityBadge(order: order),
                    ],
                    if (delay?.minutes != null) ...[
                      const SizedBox(height: 6),
                      _WaitingBadge(minutes: delay!.minutes!, level: level),
                    ],
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

/// Mostra há quanto tempo o pedido está aguardando retirada (fase "Preparando"),
/// para o entregador priorizar os mais antigos. Fica amarelo/vermelho ao atrasar.
class _WaitingBadge extends StatelessWidget {
  final int minutes;
  final DelayLevel level;
  const _WaitingBadge({required this.minutes, required this.level});

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg) = switch (level) {
      DelayLevel.red    => (const Color(0xFFFEE2E2), const Color(0xFFB91C1C)),
      DelayLevel.yellow => (const Color(0xFFFEF3C7), const Color(0xFF92400E)),
      DelayLevel.none   => (const Color(0xFFF3F4F6), const Color(0xFF4B5563)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.schedule, size: 13, color: fg),
          const SizedBox(width: 4),
          Text(
            'Aguardando há ${formatWaitDuration(minutes)}',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg),
          ),
        ],
      ),
    );
  }
}
