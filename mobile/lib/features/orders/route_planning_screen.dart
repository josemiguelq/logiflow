import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api/api_client.dart';
import '../../core/models/order.dart';
import '../../core/models/route.dart';
import '../../core/providers/store_settings_provider.dart';
import '../../core/theme/app_theme.dart';

class RoutePlanningScreen extends ConsumerStatefulWidget {
  final DelivererRoute route;
  const RoutePlanningScreen({super.key, required this.route});

  @override
  ConsumerState<RoutePlanningScreen> createState() => _RoutePlanningScreenState();
}

class _RoutePlanningScreenState extends ConsumerState<RoutePlanningScreen> {
  late List<Order> _orders;
  bool _cancelling = false;
  bool _mapView = false;

  @override
  void initState() {
    super.initState();
    _orders = List.from(widget.route.orders);
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

  @override
  Widget build(BuildContext context) {
    final brandName = ref.watch(storeSettingsProvider).value?.brandName ?? 'LogiFlow';
    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(brandName,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const Text('Planejar rota',
                style: TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        actions: [
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
                      right: -2, bottom: -2,
                      child: Container(
                        width: 10, height: 10,
                        decoration: const BoxDecoration(
                          color: Color(0xFFF59E0B),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.lock, size: 7, color: Colors.white),
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
      body: Column(
        children: [
          // Instruction banner
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
                        onReorder: (oldIndex, newIndex) {
                          setState(() {
                            if (newIndex > oldIndex) newIndex--;
                            final item = _orders.removeAt(oldIndex);
                            _orders.insert(newIndex, item);
                          });
                        },
                        itemBuilder: (_, i) {
                          final o = _orders[i];
                          return _RouteOrderTile(key: ValueKey(o.id), position: i + 1, order: o);
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

          // Bottom action area
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
                              width: 20, height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Cancelar', style: TextStyle(fontSize: 16)),
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
      ),
    );
  }

  Widget _buildMap() {
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

    final centerLat = withCoords
        .map((o) => o.customerLat!)
        .reduce((a, b) => a + b) / withCoords.length;
    final centerLng = withCoords
        .map((o) => o.customerLng!)
        .reduce((a, b) => a + b) / withCoords.length;

    return FlutterMap(
      options: MapOptions(
        initialCenter: LatLng(centerLat, centerLng),
        initialZoom: 13.0,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.logiflow.mobile',
        ),
        MarkerLayer(
          markers: _orders
              .where((o) => o.customerLat != null && o.customerLng != null)
              .toList()
              .asMap()
              .entries
              .map((entry) {
            final position = entry.key + 1;
            final o = entry.value;
            return Marker(
              point: LatLng(o.customerLat!, o.customerLng!),
              width: 160,
              height: 80,
              alignment: Alignment.topCenter,
              child: _RouteMapPin(
                position: position,
                name: o.customerName,
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
          id:         widget.route.id,
          pickupCode: widget.route.pickupCode,
          status:     widget.route.status,
          orders:     List<Order>.from(_orders),
        ),
      );
}

class _RouteOrderTile extends StatelessWidget {
  final int position;
  final Order order;
  const _RouteOrderTile({super.key, required this.position, required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6, offset: const Offset(0, 2)),
        ],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: AppTheme.primary,
          radius: 18,
          child: Text('$position',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ),
        title: Text(order.customerName,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(
            children: [
              Icon(Icons.location_on_outlined, size: 13, color: Colors.grey.shade500),
              const SizedBox(width: 4),
              Expanded(
                child: Text(order.customerAddress,
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                    overflow: TextOverflow.ellipsis),
              ),
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
  const _RouteMapPin({required this.position, required this.name});

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
          child: Text(
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
