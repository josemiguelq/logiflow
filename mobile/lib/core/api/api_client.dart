import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const String _baseUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://logiflow-cgqc.onrender.com',
);

String get wsBaseUrl =>
    _baseUrl.replaceFirst('https://', 'wss://').replaceFirst('http://', 'ws://');

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  /// Set by AuthNotifier. Called when the backend returns 401 so the API layer
  /// can trigger logout without creating a circular dependency.
  static void Function()? onUnauthorized;

  final _storage = const FlutterSecureStorage();

  late final Dio dio = Dio(BaseOptions(
    baseUrl: _baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 15),
    headers: {'Content-Type': 'application/json'},
  ))..interceptors.addAll([
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: 'token');
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (err, handler) {
          if (err.response?.statusCode == 401) {
            onUnauthorized?.call();
          }
          handler.next(err);
        },
      ),
      LogInterceptor(
        requestBody:  true,
        responseBody: true,
        logPrint: (o) => debugPrint('[API] $o'),
      ),
    ]);

  Future<void> setToken(String token) =>
      _storage.write(key: 'token', value: token);

  Future<void> clearToken() => _storage.delete(key: 'token');

  Future<String?> getToken() => _storage.read(key: 'token');

  Future<void> saveSession(Map<String, dynamic> json) =>
      _storage.write(key: 'session', value: jsonEncode(json));

  Future<Map<String, dynamic>?> loadSession() async {
    final raw = await _storage.read(key: 'session');
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> clearSession() => _storage.delete(key: 'session');
}
