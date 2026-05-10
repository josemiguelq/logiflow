import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

class StoreSettings {
  final String? storeName;
  final Color?  primaryColor;
  final bool requirePickupCode;
  final bool requireDeliveryCode;
  final bool requireDeliveryPhoto;
  const StoreSettings({
    this.storeName,
    this.primaryColor,
    required this.requirePickupCode,
    required this.requireDeliveryCode,
    required this.requireDeliveryPhoto,
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
  );
});
