import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../api/api_client.dart';

// ignore: avoid_print
void _log(String msg) => print('[FCM] $msg');

// Canal Android usado para exibir notificações locais (foreground).
// O id precisa casar com o default channel do FCM para background ficar consistente.
const _channel = AndroidNotificationChannel(
  'logiflow_default',
  'Notificações',
  description: 'Mensagens e atualizações de pedidos',
  importance: Importance.high,
);

// Background message handler — must be top-level, not a class method.
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  _log('background message: ${message.messageId} | ${message.notification?.title}');
}

class PushNotificationService {
  PushNotificationService._();

  static final _messaging = FirebaseMessaging.instance;
  static final _api       = ApiClient();
  static final _local     = FlutterLocalNotificationsPlugin();

  static Future<void> init() async {
    _log('init() called');
    FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);

    // Plugin de notificação local + canal Android (necessário p/ foreground no Android).
    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        // iOS não usa notificação local (o FCM já exibe em foreground). Não pedir
        // permissão aqui evita um segundo prompt além do FirebaseMessaging.
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
    );
    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

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

    // Foreground message listener.
    // Android: o FCM não exibe o notification sozinho em foreground → disparamos
    //   uma notificação local manualmente.
    // iOS: o setForegroundNotificationPresentationOptions acima já exibe;
    //   disparar local aqui geraria notificação DUPLICADA.
    FirebaseMessaging.onMessage.listen((message) {
      _log('foreground message: ${message.messageId} | ${message.notification?.title} | ${message.notification?.body}');
      if (Platform.isAndroid) _showLocal(message);
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

  // Exibe uma notificação local a partir de um push recebido em foreground.
  static Future<void> _showLocal(RemoteMessage message) async {
    final n = message.notification;
    // Só notifica se o push traz título/corpo (data-only não vira notificação).
    final title = n?.title;
    final body  = n?.body;
    if (title == null && body == null) return;

    await _local.show(
      // id estável por mensagem para não empilhar duplicatas do mesmo push.
      message.messageId.hashCode,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(),
      ),
    );
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
