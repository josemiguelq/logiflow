import 'dart:io';
import 'package:dio/dio.dart';
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
    // Canal/plugin de notificação local — necessário para exibir a notificação
    // quando a mensagem chega com o app em foreground (o Android não mostra
    // notification-messages automaticamente nesse caso).
    await initLocalNotifications();
    FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);

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

    // Android foreground notifications
    await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    // Foreground message listener — em foreground o sistema não exibe a
    // notificação sozinho, então mostramos uma notificação local.
    FirebaseMessaging.onMessage.listen((message) {
      _log('foreground message: ${message.messageId} | ${message.notification?.title} | ${message.notification?.body}');
      final n = message.notification;
      final title = n?.title ?? message.data['title'];
      final body = n?.body ?? message.data['body'];
      if (title != null || body != null) {
        showLocalNotification(title: title ?? '', body: body ?? '');
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

  /// Desregistra o token de push. [authToken] permite autenticar o DELETE mesmo
  /// quando a sessão já foi limpa localmente (logout instantâneo) — sem ele, o
  /// interceptor não teria JWT para enviar e o servidor responderia 401.
  static Future<void> unregister({String? authToken}) async {
    // Blindado: getToken()/deleteToken() do FCM podem lançar (sem Google Play,
    // offline, etc.). Nada aqui pode escapar e quebrar o logout.
    try {
      final token = await _messaging.getToken();
      if (token == null) return;
      _log('unregistering token');
      try {
        await _api.dio.delete(
          '/deliverer/push-token',
          data: {'token': token},
          options: authToken != null
              ? Options(headers: {'Authorization': 'Bearer $authToken'})
              : null,
        );
      } catch (_) {}
      await _messaging.deleteToken();
      _log('token deleted');
    } catch (e) {
      _log('unregister failed (ignored): $e');
    }
  }
}
