class Order {
  final String id;
  final String status;
  final String pickupCode;
  final String deliveryCode;
  final String? routeId;
  final int? routePosition;
  final String customerName;
  final String customerAddress;
  final double? customerLat;
  final double? customerLng;
  final String? notes;           // nota cadastrada pelo usuário web
  final String paymentMethod;   // 'prepaid' | 'cash' | 'card'
  final double? cashAmount;
  final bool cashCollected;
  final double? collectedAmount;
  final String? collectedMethod; // 'cash' | 'pix'
  final DateTime? createdAt;    // criação do pedido (base do tempo em "Preparando")
  final DateTime? pickedUpAt;   // retirada (base do tempo "em rota")

  const Order({
    required this.id,
    required this.status,
    required this.pickupCode,
    required this.deliveryCode,
    this.routeId,
    this.routePosition,
    required this.customerName,
    required this.customerAddress,
    this.customerLat,
    this.customerLng,
    this.notes,
    this.paymentMethod = 'prepaid',
    this.cashAmount,
    this.cashCollected = false,
    this.collectedAmount,
    this.collectedMethod,
    this.createdAt,
    this.pickedUpAt,
  });

  bool get isCash => paymentMethod == 'cash' && cashAmount != null && cashAmount! > 0;

  String get shortId => id.substring(id.length - 8).toUpperCase();

  factory Order.fromJson(Map<String, dynamic> j) {
    final c = j['customer'] as Map<String, dynamic>;
    return Order(
      id:              j['id'] as String,
      status:          j['status'] as String,
      pickupCode:      j['pickupCode'] as String,
      deliveryCode:    j['deliveryCode'] as String,
      routeId:         j['routeId'] as String?,
      routePosition:   j['routePosition'] as int?,
      customerName:    c['name'] as String? ?? '',
      customerAddress: c['address'] as String? ?? '',
      customerLat:     (c['lat'] as num?)?.toDouble(),
      customerLng:     (c['lng'] as num?)?.toDouble(),
      notes:           j['notes'] as String?,
      paymentMethod:    j['paymentMethod'] as String? ?? 'prepaid',
      cashAmount:       (j['cashAmount'] as num?)?.toDouble(),
      cashCollected:    j['cashCollected'] as bool? ?? false,
      collectedAmount:  (j['collectedAmount'] as num?)?.toDouble(),
      collectedMethod:  j['collectedMethod'] as String?,
      createdAt:        DateTime.tryParse(j['createdAt'] as String? ?? '')?.toLocal(),
      pickedUpAt:      DateTime.tryParse(j['pickedUpAt'] as String? ?? '')?.toLocal(),
    );
  }

  Order copyWith({int? routePosition}) => Order(
        id:              id,
        status:          status,
        pickupCode:      pickupCode,
        deliveryCode:    deliveryCode,
        routeId:         routeId,
        routePosition:   routePosition ?? this.routePosition,
        customerName:    customerName,
        customerAddress: customerAddress,
        customerLat:     customerLat,
        customerLng:     customerLng,
        notes:           notes,
        paymentMethod:   paymentMethod,
        cashAmount:      cashAmount,
        cashCollected:   cashCollected,
        collectedAmount: collectedAmount,
        collectedMethod: collectedMethod,
        createdAt:       createdAt,
        pickedUpAt:      pickedUpAt,
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
