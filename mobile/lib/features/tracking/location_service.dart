import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_client.dart';

class LocationService {
  Timer?     _timer;
  WebSocket? _socket;
  bool       _connecting = false;
  bool       _started = false;
  final _api = ApiClient();

  Future<bool> requestPermission() async {
    final permission = await Geolocator.requestPermission();
    return permission == LocationPermission.always ||
        permission == LocationPermission.whileInUse;
  }

  Future<void> startTracking() async {
    if (_started) return;
    _started = true;
    _timer?.cancel();
    debugPrint('[Location] Iniciando rastreamento do entregador');

    await _connect();

    // Send immediately without waiting for the first timer tick
    await _tick();

    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _tick());
  }

  Future<void> _tick() async {
    debugPrint('[Location] Coletando posição GPS...');
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
        timeLimit: const Duration(seconds: 10),
      );
      debugPrint('[Location] GPS: lat=${pos.latitude.toStringAsFixed(6)}, '
          'lng=${pos.longitude.toStringAsFixed(6)}, '
          'acc=${pos.accuracy.toStringAsFixed(1)}m');
      _sendLocation(pos.latitude, pos.longitude);
    } on TimeoutException {
      debugPrint('[Location] Timeout ao obter GPS — tentativa ignorada');
    } catch (e) {
      debugPrint('[Location] Erro ao obter GPS: $e');
    }
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
      debugPrint('[Location] URL WebSocket: $url');

      _socket = await WebSocket.connect(url)
          .timeout(const Duration(seconds: 10));

      debugPrint('[Location] WebSocket conectado com sucesso (state=${_socket!.readyState})');

      _socket!.listen(
        (msg) => debugPrint('[Location] WS mensagem recebida: $msg'),
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
    final payload = {
      'event': 'location',
      'data': {
        'lat': lat,
        'lng': lng,
      },
    };

    if (_socket?.readyState == WebSocket.open) {
      debugPrint('[Location] Enviando via WebSocket: lat=$lat, lng=$lng');
      _socket!.add(jsonEncode(payload));
    } else {
      debugPrint('[Location] WebSocket indisponível '
          '(state=${_socket?.readyState ?? "null"}) — usando HTTP');
      _api.dio.post('/tracking/location', data: {
        'lat': lat,
        'lng': lng,
      }).then((_) {
        debugPrint('[Location] HTTP enviado: lat=$lat, lng=$lng');
      }).catchError((e) {
        debugPrint('[Location] Erro no HTTP fallback: $e');
      });

      // Reconnect for next tick
      _connect();
    }
  }

  void stopTracking() {
    debugPrint('[Location] Parando rastreamento');
    _started = false;
    _timer?.cancel();
    _timer = null;
    _socket?.close();
    _socket = null;
  }
}

final locationServiceProvider = Provider((_) => LocationService());
