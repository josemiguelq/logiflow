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
  final bool isPriority;         // pedido prioritário (coroa)
  final DateTime? maxDeliveryTime; // horário máximo de entrega (prazo), quando prioritário
  final String paymentMethod;   // 'prepaid' | 'cash' | 'card'
  final double? cashAmount;
  final bool cashCollected;
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
    this.isPriority = false,
    this.maxDeliveryTime,
    this.paymentMethod = 'prepaid',
    this.cashAmount,
    this.cashCollected = false,
    this.createdAt,
    this.pickedUpAt,
  });

  bool get isCash => paymentMethod == 'cash' && cashAmount != null && cashAmount! > 0;

  // Prazo de entrega já estourou (só faz sentido quando prioritário e com prazo).
  bool get isOverdue => maxDeliveryTime != null && DateTime.now().isAfter(maxDeliveryTime!);

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
      isPriority:       j['isPriority'] as bool? ?? false,
      maxDeliveryTime:  DateTime.tryParse(j['maxDeliveryTime'] as String? ?? '')?.toLocal(),
      paymentMethod:    j['paymentMethod'] as String? ?? 'prepaid',
      cashAmount:       (j['cashAmount'] as num?)?.toDouble(),
      cashCollected:    j['cashCollected'] as bool? ?? false,
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
        isPriority:      isPriority,
        maxDeliveryTime: maxDeliveryTime,
        paymentMethod:   paymentMethod,
        cashAmount:      cashAmount,
        cashCollected:   cashCollected,
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
