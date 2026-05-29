import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import '../../core/api/api_client.dart';

typedef WsMessage = Map<String, dynamic>;

enum LocationPermissionIssue { serviceDisabled, denied, deniedForever }

class _PendingPoint {
  final double   lat;
  final double   lng;
  final DateTime recordedAt;
  const _PendingPoint(this.lat, this.lng, this.recordedAt);
  Map<String, dynamic> toJson() => {
    'lat':        lat,
    'lng':        lng,
    'recordedAt': recordedAt.toUtc().toIso8601String(),
  };
}

class LocationService {
  WebSocket?                    _socket;
  bool                          _connecting  = false;
  bool                          _started     = false;
  bool                          _flushing    = false;
  String?                       _delivererId;
  StreamSubscription<Position>? _positionSub;
  final _api   = ApiClient();
  final _queue = <_PendingPoint>[];

  final _messageController = StreamController<WsMessage>.broadcast();
  Stream<WsMessage> get messageStream => _messageController.stream;

  Future<LocationPermissionIssue?> _requestPermission() async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      debugPrint('[Location] GPS desativado no aparelho');
      return LocationPermissionIssue.serviceDisabled;
    }

    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }

    if (perm == LocationPermission.deniedForever) {
      debugPrint('[Location] Permissão negada permanentemente');
      return LocationPermissionIssue.deniedForever;
    }
    if (perm == LocationPermission.denied) {
      debugPrint('[Location] Permissão negada pelo usuário');
      return LocationPermissionIssue.denied;
    }

    // whileInUse é suficiente com foreground service no Android
    return null;
  }

  Future<LocationPermissionIssue?> startTracking({String? delivererId}) async {
    _delivererId = delivererId;
    if (_started) return null;

    final issue = await _requestPermission();
    if (issue != null) {
      debugPrint('[Location] Rastreamento não iniciado: $issue');
      return issue;
    }

    _started = true;
    debugPrint('[Location] Iniciando rastreamento — delivererId=$_delivererId');

    await _connect();

    // Foreground service mantém o processo vivo com tela bloqueada / app em background
    final locationSettings = AndroidSettings(
      accuracy: LocationAccuracy.medium,
      intervalDuration: Duration(seconds: 15),
      foregroundNotificationConfig: ForegroundNotificationConfig(
        notificationTitle: 'LogiFlow — Rastreamento ativo',
        notificationText: 'Sua localização está sendo enviada durante as entregas',
        enableWakeLock: true,
        notificationIcon: AndroidResource(name: 'ic_launcher', defType: 'mipmap'),
      ),
    );

    _positionSub = Geolocator.getPositionStream(locationSettings: locationSettings).listen(
      (pos) {
        debugPrint('[Location] GPS: lat=${pos.latitude.toStringAsFixed(6)}, '
            'lng=${pos.longitude.toStringAsFixed(6)}, '
            'acc=${pos.accuracy.toStringAsFixed(1)}m');
        _sendLocation(pos.latitude, pos.longitude);
      },
      onError: (Object e, StackTrace st) {
        debugPrint('[Location] Erro no stream de localização: $e');
        Sentry.captureException(
          e,
          stackTrace: st,
          withScope: (scope) {
            scope.setTag('delivererId', _delivererId ?? 'unknown');
            scope.setContexts('location', {'source': 'position_stream'});
          },
        );
      },
    );

    return null;
  }

  Future<void> _connect() async {
    if (_connecting) {
      debugPrint('[Location] Conexão WebSocket já em andamento, aguardando...');
      return;
    }
    if (_socket?.readyState == WebSocket.open) {
      debugPrint('[Location] WebSocket já conectado');
      return;
    }

    _connecting = true;
    debugPrint('[Location] Conectando WebSocket...');

    try {
      final token = await _api.getToken();
      if (token == null) {
        debugPrint('[Location] Token não encontrado — sem WebSocket, usando HTTP');
        _connecting = false;
        return;
      }

      final url = '$wsBaseUrl/ws?token=$token';
      _socket = await WebSocket.connect(url).timeout(const Duration(seconds: 10));

      debugPrint('[Location] WebSocket conectado (state=${_socket!.readyState})');

      _socket!.listen(
        (msg) {
          debugPrint('[Location] WS mensagem recebida: $msg');
          try {
            final decoded = jsonDecode(msg as String) as Map<String, dynamic>;
            _messageController.add(decoded);
          } catch (_) {}
        },
        onDone: () {
          debugPrint('[Location] WebSocket fechado pelo servidor');
          _socket = null;
        },
        onError: (e) {
          debugPrint('[Location] Erro no WebSocket: $e');
          _socket = null;
        },
        cancelOnError: true,
      );
    } on TimeoutException {
      debugPrint('[Location] Timeout ao conectar WebSocket');
      _socket = null;
    } catch (e) {
      debugPrint('[Location] Falha ao conectar WebSocket: $e');
      _socket = null;
    } finally {
      _connecting = false;
    }
  }

  void _sendLocation(double lat, double lng) {
    final recordedAt = DateTime.now();

    if (_socket?.readyState == WebSocket.open) {
      debugPrint('[Location] Enviando via WebSocket: lat=$lat, lng=$lng');
      try {
        _socket!.add(jsonEncode({
          'event': 'location',
          'data':  {'lat': lat, 'lng': lng},
        }));
        _flushQueue();   // aproveita conexão boa para esvaziar fila
        return;
      } catch (e, st) {
        debugPrint('[Location] Erro ao enviar via WebSocket: $e');
        Sentry.captureException(e, stackTrace: st,
            withScope: (s) => s.setTag('delivererId', _delivererId ?? 'unknown'));
        // cai para o fallback HTTP abaixo
      }
    }

    debugPrint('[Location] WS indisponível — tentando HTTP '
        '(fila=${_queue.length})');
    _connect();   // tenta reconectar para o próximo ciclo

    _api.dio
        .post('/tracking/location', data: {'lat': lat, 'lng': lng,
            'recordedAt': recordedAt.toUtc().toIso8601String()})
        .then((_) {
          debugPrint('[Location] HTTP ok: lat=$lat, lng=$lng');
          _flushQueue();
        })
        .catchError((Object e) {
          debugPrint('[Location] HTTP falhou — guardando na fila '
              '(fila=${_queue.length + 1})');
          _queue.add(_PendingPoint(lat, lng, recordedAt));
          Sentry.captureException(e,
              withScope: (s) {
                s.setTag('delivererId', _delivererId ?? 'unknown');
                s.setContexts('location', {
                  'transport': 'http', 'queueSize': _queue.length,
                });
              });
        });
  }

  Future<void> _flushQueue() async {
    if (_queue.isEmpty || _flushing) return;
    _flushing = true;
    final snapshot = List<_PendingPoint>.from(_queue);
    debugPrint('[Location] Enviando fila em batch: ${snapshot.length} pontos');
    try {
      await _api.dio.post('/tracking/location/batch', data: {
        'points': snapshot.map((p) => p.toJson()).toList(),
      });
      _queue.removeRange(0, snapshot.length);
      debugPrint('[Location] Fila enviada e limpa');
    } catch (e) {
      debugPrint('[Location] Batch falhou — fila mantida: $e');
    } finally {
      _flushing = false;
    }
  }

  void stopTracking() {
    debugPrint('[Location] Parando rastreamento (fila=${_queue.length})');
    _flushQueue();   // tentativa de último envio antes de parar
    _started = false;
    _positionSub?.cancel();
    _positionSub = null;
    _socket?.close();
    _socket = null;
  }
}

final locationServiceProvider = Provider((_) => LocationService());
