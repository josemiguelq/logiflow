import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/map_tiles.dart';
import '../../core/models/order.dart';
import '../../core/models/route.dart';
import '../../core/providers/store_settings_provider.dart';
import '../../core/theme/app_theme.dart';

const _newColor =
    Color(0xFF059669); // emerald — marks orders added this session

class RoutePlanningScreen extends ConsumerStatefulWidget {
  final DelivererRoute route;
  const RoutePlanningScreen({super.key, required this.route});

  @override
  ConsumerState<RoutePlanningScreen> createState() =>
      _RoutePlanningScreenState();
}

class _RoutePlanningScreenState extends ConsumerState<RoutePlanningScreen> {
  late List<Order> _orders;
  bool _cancelling = false;
  bool _mapView = false;

  // ── add-orders mode ──
  bool _adding = false;
  bool _loadingAvailable = false;
  bool _addBusy = false;
  List<Order> _available = [];
  final List<String> _selectedNew = []; // available ids chosen (reserved)
  final Set<String> _reservedIds = {}; // released on cancel/dispose
  final Set<String> _newIds = {}; // ids added this session → colored

  @override
  void initState() {
    super.initState();
    _orders = List.from(widget.route.orders);
  }

  @override
  void dispose() {
    for (final id in _reservedIds) {
      ApiClient().dio.delete('/deliverer/orders/$id/reserve').ignore();
    }
    super.dispose();
  }

  Future<void> _cancel() async {
    setState(() => _cancelling = true);
    try {
      await ApiClient().dio.delete('/deliverer/routes/${widget.route.id}');
    } catch (_) {
      // Best-effort — navigate back regardless
    }
    if (mounted) context.go('/orders');
  }

  // ── add-orders actions ─────────────────────────────────────────────────────
  Future<void> _openAdd() async {
    setState(() {
      _adding = true;
      _loadingAvailable = true;
    });
    try {
      final res = await ApiClient().dio.get('/deliverer/orders/preparing');
      final list = (res.data as List)
          .map((e) => Order.fromJson(e as Map<String, dynamic>))
          .toList();
      final existing = _orders.map((o) => o.id).toSet();
      if (!mounted) return;
      setState(() {
        _available = list.where((o) => !existing.contains(o.id)).toList();
        _loadingAvailable = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingAvailable = false);
    }
  }

  Future<void> _toggleAvailable(Order o) async {
    if (_selectedNew.contains(o.id)) {
      ApiClient().dio.delete('/deliverer/orders/${o.id}/reserve').ignore();
      setState(() {
        _selectedNew.remove(o.id);
        _reservedIds.remove(o.id);
      });
      return;
    }
    try {
      await ApiClient().dio.post('/deliverer/orders/${o.id}/reserve');
      setState(() {
        _selectedNew.add(o.id);
        _reservedIds.add(o.id);
      });
    } on DioException catch (e) {
      final msg = (e.response?.data is Map ? e.response?.data['error'] : null)
              as String? ??
          'Não foi possível reservar este pedido';
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
      }
    }
  }

  void _cancelAdd() {
    for (final id in _reservedIds) {
      ApiClient().dio.delete('/deliverer/orders/$id/reserve').ignore();
    }
    setState(() {
      _reservedIds.clear();
      _selectedNew.clear();
      _adding = false;
    });
  }

  Future<void> _confirmAdd() async {
    if (_selectedNew.isEmpty) {
      setState(() => _adding = false);
      return;
    }
    setState(() => _addBusy = true);
    final ids = [..._orders.map((o) => o.id), ..._selectedNew];
    try {
      final res = await ApiClient().dio.patch(
        '/deliverer/routes/${widget.route.id}/orders',
        data: {'orderIds': ids},
      );
      final orders = (res.data['orders'] as List)
          .map((e) => Order.fromJson(e as Map<String, dynamic>))
          .toList();
      if (!mounted) return;
      setState(() {
        _newIds.addAll(_selectedNew);
        _reservedIds.clear();
        _selectedNew.clear();
        _orders = orders;
        _adding = false;
        _addBusy = false;
      });
    } on DioException catch (e) {
      final msg = (e.response?.data is Map ? e.response?.data['error'] : null)
              as String? ??
          'Erro ao adicionar pedidos';
      if (mounted) {
        setState(() => _addBusy = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(storeSettingsProvider).value;
    final brandName = settings?.brandName ?? 'LogiFlow';
    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(brandName,
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            Text(_adding ? 'Adicionar pedidos' : 'Planejar rota',
                style: const TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        actions: _adding
            ? null
            : [
                // Premium-locked "Otimizar rota" button
                Tooltip(
                  message: 'Disponível no plano profissional',
                  child: Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: TextButton.icon(
                      onPressed: null, // disabled — premium feature
                      icon: Stack(
                        children: [
                          const Icon(Icons.auto_awesome, size: 18),
                          Positioned(
                            right: -2,
                            bottom: -2,
                            child: Container(
                              width: 10,
                              height: 10,
                              decoration: const BoxDecoration(
                                color: Color(0xFFF59E0B),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.lock,
                                  size: 7, color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                      label: const Text('Otimizar'),
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.grey.shade400,
                      ),
                    ),
                  ),
                ),
              ],
      ),
      body: _adding ? _buildAddMode() : _buildPlanMode(),
    );
  }

  // ── Plan mode (reorder + "+" card) ─────────────────────────────────────────
  Widget _buildPlanMode() {
    final settings = ref.watch(storeSettingsProvider).value;
    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          color: const Color(0xFFF0F9FF),
          child: Row(
            children: [
              const Icon(Icons.drag_handle, color: AppTheme.primary, size: 18),
              const SizedBox(width: 8),
              Text(
                'Arraste para reordenar conforme desejar',
                style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
              ),
            ],
          ),
        ),
        Expanded(
          child: Stack(
            children: [
              _mapView
                  ? _buildMap()
                  : ReorderableListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 80),
                      itemCount: _orders.length,
                      footer: _AddCard(onTap: _openAdd),
                      onReorder: (oldIndex, newIndex) {
                        setState(() {
                          if (newIndex > oldIndex) newIndex--;
                          final item = _orders.removeAt(oldIndex);
                          _orders.insert(newIndex, item);
                        });
                      },
                      itemBuilder: (_, i) {
                        final o = _orders[i];
                        return _RouteOrderTile(
                          key: ValueKey(o.id),
                          position: i + 1,
                          order: o,
                          isNew: _newIds.contains(o.id),
                          delay: settings != null
                              ? waitingSinceCreated(o, settings)
                              : null,
                        );
                      },
                    ),
              Positioned(
                bottom: 16,
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
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _cancelling ? null : _cancel,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.grey.shade700,
                      side: BorderSide(color: Colors.grey.shade300),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: _cancelling
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Cancelar',
                            style: TextStyle(fontSize: 16)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: ElevatedButton.icon(
                    onPressed: _confirm,
                    icon: const Icon(Icons.check_circle_outline),
                    label: const Text('Confirmar ordem',
                        style: TextStyle(fontSize: 16)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // ── Add mode (map with current + available) ────────────────────────────────
  Widget _buildAddMode() {
    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          color: const Color(0xFFECFDF5),
          child: Row(
            children: [
              const Icon(Icons.add_location_alt_outlined,
                  color: _newColor, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Toque nos pedidos disponíveis (verde) para adicionar à rota.',
                  style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: _loadingAvailable
              ? const Center(child: CircularProgressIndicator())
              : _buildAddMap(),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _addBusy ? null : _cancelAdd,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.grey.shade700,
                      side: BorderSide(color: Colors.grey.shade300),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child:
                        const Text('Cancelar', style: TextStyle(fontSize: 16)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: ElevatedButton.icon(
                    onPressed:
                        (_addBusy || _selectedNew.isEmpty) ? null : _confirmAdd,
                    icon: _addBusy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.add),
                    label: Text(
                        _addBusy
                            ? 'Adicionando…'
                            : 'Adicionar (${_selectedNew.length})',
                        style: const TextStyle(fontSize: 16)),
                    style: ElevatedButton.styleFrom(backgroundColor: _newColor),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildAddMap() {
    final settings = ref.read(storeSettingsProvider).value;
    final currentWithCoords = _orders
        .where((o) => o.customerLat != null && o.customerLng != null)
        .toList();
    final availWithCoords = _available
        .where((o) => o.customerLat != null && o.customerLng != null)
        .toList();
    final all = [...currentWithCoords, ...availWithCoords];

    if (availWithCoords.isEmpty && _available.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.inbox_outlined, size: 56, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text('Nenhum pedido disponível para adicionar',
                style: TextStyle(color: Colors.grey.shade600)),
          ],
        ),
      );
    }

    final center = all.isEmpty
        ? const LatLng(-20.4697, -54.6201)
        : LatLng(
            all.map((o) => o.customerLat!).reduce((a, b) => a + b) / all.length,
            all.map((o) => o.customerLng!).reduce((a, b) => a + b) / all.length,
          );

    return FlutterMap(
      options: MapOptions(initialCenter: center, initialZoom: 12.5),
      children: [
        appTileLayer(),
        // Current route orders — numbered (primary)
        MarkerLayer(
          markers: currentWithCoords.asMap().entries.map((entry) {
            final o = entry.value;
            final delay = settings != null ? waitingSinceCreated(o, settings) : null;
            return Marker(
              point: LatLng(o.customerLat!, o.customerLng!),
              width: 160,
              height: 96,
              alignment: Alignment.topCenter,
              child: _RouteMapPin(
                  position: _orders.indexWhere((x) => x.id == o.id) + 1,
                  name: o.customerName,
                  waitingMinutes: delay?.minutes,
                  delayLevel: delay?.level),
            );
          }).toList(),
        ),
        // Available orders — green "add" pins, tappable
        MarkerLayer(
          markers: availWithCoords.map((o) {
            final selected = _selectedNew.contains(o.id);
            final delay = settings != null ? waitingSinceCreated(o, settings) : null;
            return Marker(
              point: LatLng(o.customerLat!, o.customerLng!),
              width: 160,
              height: 96,
              alignment: Alignment.topCenter,
              child: GestureDetector(
                onTap: () => _toggleAvailable(o),
                child: _AvailablePin(
                  selected: selected,
                  name: o.customerName,
                  waitingMinutes: delay?.minutes,
                  delayLevel: delay?.level,
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildMap() {
    final settings = ref.read(storeSettingsProvider).value;
    final withCoords = _orders
        .where((o) => o.customerLat != null && o.customerLng != null)
        .toList();

    if (withCoords.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.map_outlined, size: 56, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text(
              'Nenhum ponto com localização disponível',
              style: TextStyle(color: Colors.grey.shade600),
            ),
          ],
        ),
      );
    }

    final centerLat =
        withCoords.map((o) => o.customerLat!).reduce((a, b) => a + b) /
            withCoords.length;
    final centerLng =
        withCoords.map((o) => o.customerLng!).reduce((a, b) => a + b) /
            withCoords.length;

    return FlutterMap(
      options: MapOptions(
        initialCenter: LatLng(centerLat, centerLng),
        initialZoom: 13.0,
      ),
      children: [
        appTileLayer(),
        MarkerLayer(
          markers: withCoords.asMap().entries.map((entry) {
            final position = entry.key + 1;
            final o = entry.value;
            final delay = settings != null ? waitingSinceCreated(o, settings) : null;
            return Marker(
              point: LatLng(o.customerLat!, o.customerLng!),
              width: 160,
              height: 96,
              alignment: Alignment.topCenter,
              child: _RouteMapPin(
                position: position,
                name: o.customerName,
                waitingMinutes: delay?.minutes,
                delayLevel: delay?.level,
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  void _confirm() => context.push(
        '/pickup-confirm',
        extra: DelivererRoute(
          id: widget.route.id,
          pickupCode: widget.route.pickupCode,
          status: widget.route.status,
          orders: List<Order>.from(_orders),
        ),
      );
}

class _AddCard extends StatelessWidget {
  final VoidCallback onTap;
  const _AddCard({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 2, bottom: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: const Color(0xFFF0FDF4),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _newColor.withValues(alpha: 0.5)),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.add, color: _newColor),
              SizedBox(width: 8),
              Text('Adicionar pedido',
                  style:
                      TextStyle(color: _newColor, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}

class _RouteOrderTile extends StatelessWidget {
  final int position;
  final Order order;
  final bool isNew;
  final OrderDelay? delay;
  const _RouteOrderTile({
    super.key,
    required this.position,
    required this.order,
    this.isNew = false,
    this.delay,
  });

  @override
  Widget build(BuildContext context) {
    // A cor do atraso (tempo de espera) tem prioridade; senão, verde se recém-adicionado.
    final level = delay?.level ?? DelayLevel.none;
    final Color bgColor = level == DelayLevel.red
        ? const Color(0xFFFEF2F2)
        : level == DelayLevel.yellow
            ? const Color(0xFFFEFCE8)
            : isNew
                ? const Color(0xFFECFDF5)
                : Colors.white;
    final Color borderColor = level == DelayLevel.red
        ? const Color(0xFFFCA5A5)
        : level == DelayLevel.yellow
            ? const Color(0xFFFDE68A)
            : isNew
                ? _newColor
                : const Color(0xFFE5E7EB);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 6,
              offset: const Offset(0, 2)),
        ],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: isNew ? _newColor : AppTheme.primary,
          radius: 18,
          child: Text('$position',
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.bold)),
        ),
        title: Row(
          children: [
            Flexible(
              child: Text(order.customerName,
                  style: const TextStyle(
                      fontWeight: FontWeight.w600, fontSize: 15),
                  overflow: TextOverflow.ellipsis),
            ),
            if (isNew) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: _newColor,
                  borderRadius: BorderRadius.circular(100),
                ),
                child: const Text('Novo',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Colors.white)),
              ),
            ],
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.location_on_outlined,
                      size: 13, color: Colors.grey.shade500),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(order.customerAddress,
                        style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                        overflow: TextOverflow.ellipsis),
                  ),
                ],
              ),
              if (delay?.minutes != null) ...[
                const SizedBox(height: 4),
                _WaitChip(minutes: delay!.minutes!, level: level),
              ],
            ],
          ),
        ),
        trailing: Icon(Icons.drag_handle, color: Colors.grey.shade400),
      ),
    );
  }
}

class _RouteMapPin extends StatelessWidget {
  final int position;
  final String name;
  final int? waitingMinutes;
  final DelayLevel? delayLevel;
  const _RouteMapPin({
    required this.position,
    required this.name,
    this.waitingMinutes,
    this.delayLevel,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Label com nome do cliente
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.15),
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
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              if (waitingMinutes != null)
                _WaitChip(minutes: waitingMinutes!, level: delayLevel ?? DelayLevel.none),
            ],
          ),
        ),
        const SizedBox(height: 2),
        // Pin numerado
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: AppTheme.primary,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: [
              BoxShadow(
                color: AppTheme.primary.withValues(alpha: 0.4),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Center(
            child: Text(
              '$position',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
          ),
        ),
        // ponteiro
        Container(
          width: 3,
          height: 8,
          decoration: BoxDecoration(
            color: AppTheme.primary,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ],
    );
  }
}

class _AvailablePin extends StatelessWidget {
  final bool selected;
  final String name;
  final int? waitingMinutes;
  final DelayLevel? delayLevel;
  const _AvailablePin({
    required this.selected,
    required this.name,
    this.waitingMinutes,
    this.delayLevel,
  });

  @override
  Widget build(BuildContext context) {
    final color = selected ? _newColor : Colors.grey.shade500;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Nome do cliente para identificar o pedido disponível
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.15),
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
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: selected ? _newColor : const Color(0xFF1E293B),
                ),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              if (waitingMinutes != null)
                _WaitChip(minutes: waitingMinutes!, level: delayLevel ?? DelayLevel.none),
            ],
          ),
        ),
        const SizedBox(height: 2),
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.4),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Icon(selected ? Icons.check : Icons.add,
              color: Colors.white, size: 18),
        ),
      ],
    );
  }
}

// Tempo de espera ("há X min") exibido no balão do pin, colorido pelo nível de atraso.
class _WaitChip extends StatelessWidget {
  final int minutes;
  final DelayLevel level;
  const _WaitChip({required this.minutes, required this.level});

  @override
  Widget build(BuildContext context) {
    final Color fg = switch (level) {
      DelayLevel.red    => const Color(0xFFB91C1C),
      DelayLevel.yellow => const Color(0xFF92400E),
      DelayLevel.none   => const Color(0xFF64748B),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.schedule, size: 9, color: fg),
        const SizedBox(width: 2),
        Text(
          'há ${formatWaitDuration(minutes)}',
          style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: fg),
        ),
      ],
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
