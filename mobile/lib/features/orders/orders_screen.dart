import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../features/tracking/location_service.dart';

class Order {
  final String id;
  final String status;
  final String pickupCode;
  final String deliveryCode;
  final int? routePosition;
  final Map<String, dynamic> customer;

  const Order({
    required this.id,
    required this.status,
    required this.pickupCode,
    required this.deliveryCode,
    this.routePosition,
    required this.customer,
  });

  factory Order.fromJson(Map<String, dynamic> j) => Order(
        id:            j['id'] as String,
        status:        j['status'] as String,
        pickupCode:    j['pickupCode'] as String,
        deliveryCode:  j['deliveryCode'] as String,
        routePosition: j['routePosition'] as int?,
        customer:      j['customer'] as Map<String, dynamic>,
      );
}

final ordersProvider = FutureProvider.autoDispose<List<Order>>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/orders');
  return (res.data as List).map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
});

const _statusLabels = {
  'PREPARING':        'Preparando',
  'ASSIGNED':         'Atribuído',
  'ON_ROUTE':         'Em rota',
  'OUT_FOR_DELIVERY': 'Saiu p/ entrega',
  'DELIVERED':        'Entregue',
  'CANCELLED':        'Cancelado',
};

const _statusColors = {
  'PREPARING':        Color(0xFFFEF3C7),
  'ASSIGNED':         Color(0xFFDBEAFE),
  'ON_ROUTE':         Color(0xFFE0E7FF),
  'OUT_FOR_DELIVERY': Color(0xFFFFEDD5),
  'DELIVERED':        Color(0xFFDCFCE7),
  'CANCELLED':        Color(0xFFF3F4F6),
};

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders    = ref.watch(ordersProvider);
    final session   = ref.watch(authProvider);
    final locService = ref.watch(locationServiceProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Meus Pedidos'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(ordersProvider),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              locService.stopTracking();
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            },
          ),
        ],
      ),
      body: orders.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error:   (e, _) => Center(child: Text('Erro: $e')),
        data: (list) {
          if (list.isEmpty) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.inbox_outlined, size: 48, color: Colors.grey),
                  SizedBox(height: 12),
                  Text('Nenhum pedido ativo', style: TextStyle(color: Colors.grey)),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(ordersProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, i) {
                final order = list[i];
                return _OrderTile(
                  order: order,
                  onTap: () => context.push('/orders/${order.id}'),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _OrderTile extends StatelessWidget {
  final Order order;
  final VoidCallback onTap;

  const _OrderTile({required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColors[order.status] ?? const Color(0xFFF3F4F6);
    final statusLabel = _statusLabels[order.status] ?? order.status;

    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '#${order.id.substring(order.id.length - 8).toUpperCase()}',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor,
                      borderRadius: BorderRadius.circular(100),
                    ),
                    child: Text(statusLabel, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.person_outline, size: 16, color: Colors.grey),
                  const SizedBox(width: 6),
                  Text(order.customer['name'] as String? ?? '',
                      style: const TextStyle(color: Color(0xFF374151))),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  const Icon(Icons.location_on_outlined, size: 16, color: Colors.grey),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      order.customer['address'] as String? ?? '',
                      style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
