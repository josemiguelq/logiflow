import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../api/api_client.dart';
import 'local_notifications.dart';

// ignore: avoid_print
void _log(String msg) => print('[FCM] $msg');

// Background message handler — must be top-level, not a class method.
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  _log('background message: ${message.messageId} | ${message.notification?.title}');
}

class PushNotificationService {
  PushNotificationService._();

  static final _messaging = FirebaseMessaging.instance;
  static final _api       = ApiClient();

  static Future<void> init() async {
    _log('init() called');
    FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);

    await initLocalNotifications();

    final settings = await _messaging.requestPermission(
      alert:        true,
      badge:        true,
      sound:        true,
      provisional:  false,
    );

    _log('permission status: ${settings.authorizationStatus}');
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      _log('permission denied — aborting init');
      return;
    }

    // Show notification via flutter_local_notifications when app is in foreground
    FirebaseMessaging.onMessage.listen((message) {
      _log('foreground message: ${message.messageId} | ${message.notification?.title} | ${message.notification?.body}');
      final title = message.notification?.title;
      final body  = message.notification?.body;
      if (title != null && body != null) {
        showLocalNotification(title: title, body: body);
      }
    });

    final token = await _messaging.getToken();
    _log('FCM token: $token');
    if (token != null) await _registerToken(token);

    // Re-register whenever the token rotates
    _messaging.onTokenRefresh.listen((t) {
      _log('token refreshed: $t');
      _registerToken(t);
    });
  }

  static Future<void> _registerToken(String token) async {
    final platform = Platform.isIOS ? 'ios' : 'android';
    _log('registering token ($platform)');
    try {
      await _api.dio.post('/deliverer/push-token', data: {
        'token':    token,
        'platform': platform,
      });
      _log('token registered successfully');
    } catch (e) {
      _log('token registration failed: $e');
    }
  }

  static Future<void> unregister() async {
    final token = await _messaging.getToken();
    if (token == null) return;
    _log('unregistering token');
    try {
      await _api.dio.delete('/deliverer/push-token', data: {'token': token});
    } catch (_) {}
    await _messaging.deleteToken();
    _log('token deleted');
  }
}
