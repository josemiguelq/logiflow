class Order {
  final String id;
  final String status;
  final String pickupCode;
  final String deliveryCode;
  final int? routePosition;
  final String customerName;
  final String customerPhone;
  final String customerAddress;
  final double? customerLat;
  final double? customerLng;

  const Order({
    required this.id,
    required this.status,
    required this.pickupCode,
    required this.deliveryCode,
    this.routePosition,
    required this.customerName,
    required this.customerPhone,
    required this.customerAddress,
    this.customerLat,
    this.customerLng,
  });

  String get shortId => id.substring(id.length - 8).toUpperCase();

  factory Order.fromJson(Map<String, dynamic> j) {
    final c = j['customer'] as Map<String, dynamic>;
    return Order(
      id:              j['id'] as String,
      status:          j['status'] as String,
      pickupCode:      j['pickupCode'] as String,
      deliveryCode:    j['deliveryCode'] as String,
      routePosition:   j['routePosition'] as int?,
      customerName:    c['name'] as String? ?? '',
      customerPhone:   c['phone'] as String? ?? '',
      customerAddress: c['address'] as String? ?? '',
      customerLat:     (c['lat'] as num?)?.toDouble(),
      customerLng:     (c['lng'] as num?)?.toDouble(),
    );
  }

  Order copyWith({int? routePosition}) => Order(
        id:              id,
        status:          status,
        pickupCode:      pickupCode,
        deliveryCode:    deliveryCode,
        routePosition:   routePosition ?? this.routePosition,
        customerName:    customerName,
        customerPhone:   customerPhone,
        customerAddress: customerAddress,
        customerLat:     customerLat,
        customerLng:     customerLng,
      );
}

const statusLabels = {
  'PREPARING':        'Preparando',
  'ASSIGNED':         'Atribuído',
  'ON_ROUTE':         'Em rota',
  'OUT_FOR_DELIVERY': 'Saiu p/ entrega',
  'DELIVERED':        'Entregue',
  'CANCELLED':        'Cancelado',
};
