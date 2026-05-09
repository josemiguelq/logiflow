import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

class StoreSettings {
  final String? storeName;
  final bool requirePickupCode;
  final bool requireDeliveryCode;
  final bool requireDeliveryPhoto;
  const StoreSettings({
    this.storeName,
    required this.requirePickupCode,
    required this.requireDeliveryCode,
    required this.requireDeliveryPhoto,
  });

  String get brandName => storeName ?? 'LogiFlow';
}

final storeSettingsProvider = FutureProvider<StoreSettings>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/store');
  return StoreSettings(
    storeName:            res.data['storeName']            as String?,
    requirePickupCode:    res.data['requirePickupCode']    as bool? ?? true,
    requireDeliveryCode:  res.data['requireDeliveryCode']  as bool? ?? true,
    requireDeliveryPhoto: res.data['requireDeliveryPhoto'] as bool? ?? false,
  );
});
