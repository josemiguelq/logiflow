import 'order.dart';

class DelivererRoute {
  final String id;
  final String pickupCode;
  final String status;
  final int orderCount;
  final List<Order> orders;

  const DelivererRoute({
    required this.id,
    required this.pickupCode,
    required this.status,
    this.orderCount = 0,
    required this.orders,
  });

  factory DelivererRoute.fromJson(Map<String, dynamic> j) {
    final rawOrders = j['orders'] as List? ?? [];
    return DelivererRoute(
      id:         j['id'] as String,
      pickupCode: j['pickupCode'] as String,
      status:     j['status'] as String,
      orderCount: (j['orderCount'] as num?)?.toInt() ?? rawOrders.length,
      orders:     rawOrders
          .map((e) => Order.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
