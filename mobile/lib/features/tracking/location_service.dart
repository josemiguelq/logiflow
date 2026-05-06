import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_client.dart';

class LocationService {
  Timer?     _timer;
  WebSocket? _socket;
  final _api = ApiClient();

  Future<bool> requestPermission() async {
    final permission = await Geolocator.requestPermission();
    return permission == LocationPermission.always ||
        permission == LocationPermission.whileInUse;
  }

  Future<void> startTracking({String? orderId}) async {
    _timer?.cancel();
    await _connect();

    _timer = Timer.periodic(const Duration(seconds: 15), (_) async {
      try {
        final pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
        );
        _sendLocation(pos.latitude, pos.longitude, orderId);
      } catch (_) {}
    });
  }

  Future<void> _connect() async {
    if (_socket?.readyState == WebSocket.open) return;
    try {
      final token = await _api.getToken();
      if (token == null) return;
      _socket = await WebSocket.connect('$wsBaseUrl/ws?token=$token');
      _socket!.listen(
        (_) {},
        onDone:  () => _socket = null,
        onError: (_) => _socket = null,
        cancelOnError: true,
      );
    } catch (_) {
      _socket = null;
    }
  }

  void _sendLocation(double lat, double lng, String? orderId) {
    if (_socket?.readyState == WebSocket.open) {
      _socket!.add(jsonEncode({
        'event': 'location',
        'data': {
          'lat': lat,
          'lng': lng,
          if (orderId != null) 'orderId': orderId,
        },
      }));
    } else {
      // Fallback to HTTP if WebSocket is unavailable
      _api.dio.post('/tracking/location', data: {
        'lat': lat,
        'lng': lng,
        if (orderId != null) 'orderId': orderId,
      }).catchError((_) {});
      // Try to reconnect for next tick
      _connect();
    }
  }

  void stopTracking() {
    _timer?.cancel();
    _timer = null;
    _socket?.close();
    _socket = null;
  }
}

final locationServiceProvider = Provider((_) => LocationService());
