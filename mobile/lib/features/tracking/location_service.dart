import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_client.dart';

class LocationService {
  Timer? _timer;
  final _api = ApiClient();

  Future<bool> requestPermission() async {
    final permission = await Geolocator.requestPermission();
    return permission == LocationPermission.always ||
        permission == LocationPermission.whileInUse;
  }

  void startTracking({String? orderId}) {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) async {
      try {
        final pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
        );
        await _api.dio.post('/tracking/location', data: {
          'lat':     pos.latitude,
          'lng':     pos.longitude,
          if (orderId != null) 'orderId': orderId,
        });
      } catch (_) {}
    });
  }

  void stopTracking() {
    _timer?.cancel();
    _timer = null;
  }
}

final locationServiceProvider = Provider((_) => LocationService());
