import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../api/api_client.dart';

// Background message handler — must be top-level, not a class method.
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  // firebase_messaging handles display automatically for data+notification messages.
  // Add any background processing logic here if needed.
}

class PushNotificationService {
  PushNotificationService._();

  static final _messaging = FirebaseMessaging.instance;
  static final _api       = ApiClient();

  static Future<void> init() async {
    FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);

    final settings = await _messaging.requestPermission(
      alert:        true,
      badge:        true,
      sound:        true,
      provisional:  false,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) return;

    // Android foreground notifications
    await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    final token = await _messaging.getToken();
    if (token != null) await _registerToken(token);

    // Re-register whenever the token rotates
    _messaging.onTokenRefresh.listen(_registerToken);
  }

  static Future<void> _registerToken(String token) async {
    final platform = Platform.isIOS ? 'ios' : 'android';
    try {
      await _api.dio.post('/deliverer/push-token', data: {
        'token':    token,
        'platform': platform,
      });
    } catch (_) {
      // Non-fatal — will retry on next app start
    }
  }

  static Future<void> unregister() async {
    final token = await _messaging.getToken();
    if (token == null) return;
    try {
      await _api.dio.delete('/deliverer/push-token', data: {'token': token});
    } catch (_) {}
    await _messaging.deleteToken();
  }
}
