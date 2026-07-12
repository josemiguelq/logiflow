import 'package:flutter_local_notifications/flutter_local_notifications.dart';

final _plugin = FlutterLocalNotificationsPlugin();

// IMPORTANTE: precisa ser igual ao `default_notification_channel_id` do
// AndroidManifest — é o canal que o FCM usa para exibir a notificação quando o
// app está em background/fechado. Importance.high habilita o heads-up (o card
// que desce do topo). Se ambos não baterem, o background cai num canal default
// de importância baixa (só aparece na gaveta, sem heads-up).
const _channelId   = 'logiflow_default';
const _channelName = 'Pedidos';

Future<void> initLocalNotifications() async {
  const android = AndroidInitializationSettings('@mipmap/ic_launcher');
  await _plugin.initialize(const InitializationSettings(android: android));

  await _plugin
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(
        const AndroidNotificationChannel(
          _channelId,
          _channelName,
          importance: Importance.high,
          enableVibration: true,
          playSound: true,
        ),
      );
}

Future<void> showLocalNotification({
  required String title,
  required String body,
}) async {
  await _plugin.show(
    DateTime.now().millisecondsSinceEpoch ~/ 1000,
    title,
    body,
    const NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        _channelName,
        importance: Importance.high,
        priority: Priority.high,
        playSound: true,
      ),
    ),
  );
}
