import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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

  @override
  void initState() {
    super.initState();
    _orders = List.from(widget.route.orders);
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
            child: ReorderableListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
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
          ),

          // Bottom action area
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _confirm,
                  icon: const Icon(Icons.check_circle_outline),
                  label: const Text('Confirmar ordem da rota',
                      style: TextStyle(fontSize: 16)),
                ),
              ),
            ),
          ),
        ],
      ),
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
