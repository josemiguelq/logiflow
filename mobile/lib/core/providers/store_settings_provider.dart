import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

class StoreSettings {
  final bool requirePickupCode;
  final bool requireDeliveryCode;
  final bool requireDeliveryPhoto;
  const StoreSettings({
    required this.requirePickupCode,
    required this.requireDeliveryCode,
    required this.requireDeliveryPhoto,
  });
}

final storeSettingsProvider = FutureProvider<StoreSettings>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/store');
  return StoreSettings(
    requirePickupCode:    res.data['requirePickupCode']    as bool? ?? true,
    requireDeliveryCode:  res.data['requireDeliveryCode']  as bool? ?? true,
    requireDeliveryPhoto: res.data['requireDeliveryPhoto'] as bool? ?? false,
  );
});
