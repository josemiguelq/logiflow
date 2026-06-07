import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import '../models/order.dart';

class StoreSettings {
  final String? storeName;
  final Color?  primaryColor;
  final bool requirePickupCode;
  final bool requireDeliveryCode;
  final bool requireDeliveryPhoto;
  final int maxProofPhotos;
  // Limiares (min) das bandeiras de atraso definidos pela loja.
  final int delayPrepYellowMin;
  final int delayPrepRedMin;
  final int delayTransitYellowMin;
  final int delayTransitRedMin;
  // Regras de entrega.
  final int delayProximityMeters;        // raio (m) para considerar "perto"
  final bool deliveryRequireProximity;   // bloqueia entrega longe se true
  final bool enforceDeliveryOrder;       // obriga seguir a ordem da rota
  const StoreSettings({
    this.storeName,
    this.primaryColor,
    required this.requirePickupCode,
    required this.requireDeliveryCode,
    required this.requireDeliveryPhoto,
    this.maxProofPhotos = 2,
    this.delayPrepYellowMin = 20,
    this.delayPrepRedMin = 30,
    this.delayTransitYellowMin = 50,
    this.delayTransitRedMin = 60,
    this.delayProximityMeters = 100,
    this.deliveryRequireProximity = false,
    this.enforceDeliveryOrder = false,
  });

  String get brandName => storeName ?? 'LogiFlow';
}

Color? _parseHex(String? hex) {
  if (hex == null) return null;
  final clean = hex.startsWith('#') ? hex.substring(1) : hex;
  if (clean.length != 6) return null;
  final value = int.tryParse(clean, radix: 16);
  if (value == null) return null;
  return Color(0xFF000000 | value);
}

final storeSettingsProvider = FutureProvider<StoreSettings>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/store');
  return StoreSettings(
    storeName:            res.data['storeName']            as String?,
    primaryColor:         _parseHex(res.data['primaryColor'] as String?),
    requirePickupCode:    res.data['requirePickupCode']    as bool? ?? true,
    requireDeliveryCode:  res.data['requireDeliveryCode']  as bool? ?? true,
    requireDeliveryPhoto: res.data['requireDeliveryPhoto'] as bool? ?? false,
    maxProofPhotos:       res.data['maxProofPhotos']       as int?  ?? 2,
    delayPrepYellowMin:    res.data['delayPrepYellowMin']    as int? ?? 20,
    delayPrepRedMin:       res.data['delayPrepRedMin']       as int? ?? 30,
    delayTransitYellowMin: res.data['delayTransitYellowMin'] as int? ?? 50,
    delayTransitRedMin:    res.data['delayTransitRedMin']    as int? ?? 60,
    delayProximityMeters:     res.data['deliveryProximityMeters']  as int?  ?? 100,
    deliveryRequireProximity: res.data['deliveryRequireProximity'] as bool? ?? false,
    enforceDeliveryOrder:     res.data['enforceDeliveryOrder']     as bool? ?? false,
  );
});

/// Formata minutos de espera: "23 min" ou, acima de 59 min, "1h01min".
String formatWaitDuration(int minutes) {
  if (minutes < 60) return '$minutes min';
  final h = minutes ~/ 60;
  final mm = (minutes % 60).toString().padLeft(2, '0');
  return '${h}h${mm}min';
}

/// Nível de atraso de um pedido segundo os limiares da loja.
enum DelayLevel { none, yellow, red }

class OrderDelay {
  final DelayLevel level;
  final int? minutes; // minutos decorridos na fase atual (ou null se não conta)
  const OrderDelay(this.level, this.minutes);
  bool get isDelayed => level != DelayLevel.none;
}

/// Tempo total de espera desde a criação do pedido, classificado pelos limiares
/// de "preparação" da loja. Usado nas telas de rota/planejamento, onde o pedido
/// pode estar em qualquer status (ASSIGNED etc.) e o que importa é há quanto tempo
/// está aguardando ser entregue.
OrderDelay waitingSinceCreated(Order o, StoreSettings s, {DateTime? now}) {
  if (o.createdAt == null) return const OrderDelay(DelayLevel.none, null);
  final m = (now ?? DateTime.now()).difference(o.createdAt!).inMinutes;
  if (m >= s.delayPrepRedMin)    return OrderDelay(DelayLevel.red, m);
  if (m >= s.delayPrepYellowMin) return OrderDelay(DelayLevel.yellow, m);
  return OrderDelay(DelayLevel.none, m);
}

/// Calcula o atraso de um pedido na fase atual:
/// - PREPARING: tempo desde createdAt (limiares prep).
/// - ON_ROUTE / OUT_FOR_DELIVERY (com pickedUpAt): tempo desde pickedUpAt (limiares transit).
OrderDelay computeOrderDelay(Order o, StoreSettings s, {DateTime? now}) {
  final t = now ?? DateTime.now();
  if (o.status == 'PREPARING' && o.createdAt != null) {
    final m = t.difference(o.createdAt!).inMinutes;
    if (m >= s.delayPrepRedMin)    return OrderDelay(DelayLevel.red, m);
    if (m >= s.delayPrepYellowMin) return OrderDelay(DelayLevel.yellow, m);
    return OrderDelay(DelayLevel.none, m);
  }
  if ((o.status == 'ON_ROUTE' || o.status == 'OUT_FOR_DELIVERY') && o.pickedUpAt != null) {
    final m = t.difference(o.pickedUpAt!).inMinutes;
    if (m >= s.delayTransitRedMin)    return OrderDelay(DelayLevel.red, m);
    if (m >= s.delayTransitYellowMin) return OrderDelay(DelayLevel.yellow, m);
    return OrderDelay(DelayLevel.none, m);
  }
  return const OrderDelay(DelayLevel.none, null);
}
