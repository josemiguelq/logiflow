import 'order.dart';

class DelivererRoute {
  final String id;
  final String pickupCode;
  final String status;
  final List<Order> orders;

  const DelivererRoute({
    required this.id,
    required this.pickupCode,
    required this.status,
    required this.orders,
  });

  factory DelivererRoute.fromJson(Map<String, dynamic> j) {
    final rawOrders = j['orders'] as List? ?? [];
    return DelivererRoute(
      id:         j['id'] as String,
      pickupCode: j['pickupCode'] as String,
      status:     j['status'] as String,
      orders:     rawOrders
          .map((e) => Order.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
