import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Detecta se um erro é falta de conexão com a internet (timeout/socket),
/// para diferenciar de erros do servidor e mostrar um aviso adequado.
bool isNoInternetError(Object? error) {
  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return true;
      default:
        break;
    }
    if (error.error is SocketException) return true;
  }
  return error is SocketException;
}

const String kNoInternetMessage =
    'Sem conexão com a internet. Verifique sua conexão e tente novamente.';

const String _baseUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://api-logiflow.quisbert.com.br',
);

/// Prefixo do Correlation-Id que identifica a plataforma e o build do app.
/// Ex.: android 1.1.1+5 => "and-1.1.1-5". Definido uma vez no startup; cada
/// request acrescenta um sufixo aleatório (".say5d") para ficar único.
String _correlationPrefix = 'app';

Future<void> initCorrelationId() async {
  try {
    final info = await PackageInfo.fromPlatform();
    final platform = Platform.isAndroid
        ? 'and'
        : Platform.isIOS
            ? 'ios'
            : 'oth';
    _correlationPrefix = '$platform-${info.version}-${info.buildNumber}';
  } catch (_) {
    // Best-effort: se falhar, mantém o fallback e segue sem quebrar o app.
  }
}

const _correlationChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
final _rand = Random();

String _newCorrelationId() {
  final suffix = String.fromCharCodes(
    Iterable.generate(
      5,
      (_) => _correlationChars
          .codeUnitAt(_rand.nextInt(_correlationChars.length)),
    ),
  );
  return '$_correlationPrefix.$suffix';
}

String get wsBaseUrl =>
    _baseUrl.replaceFirst('https://', 'wss://').replaceFirst('http://', 'ws://');

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  /// Set by AuthNotifier. Called when the backend returns 401 so the API layer
  /// can trigger logout without creating a circular dependency.
  static void Function()? onUnauthorized;

  /// Set by the app (app.dart). Called when the backend responds 409 with the
  /// `X-App-Deep-Link` header, so the app can navigate to the given screen
  /// (ex.: forçar atualização). `storeUrl` vem do header `X-App-Store-Url`.
  static void Function(String deepLink, String? storeUrl)? onDeepLink;

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
          options.headers['Correlation-Id'] = _newCorrelationId();
          handler.next(options);
        },
        onError: (err, handler) {
          if (err.response?.statusCode == 401) {
            onUnauthorized?.call();
          }
          // Deeplink dirigido pelo backend: 409 + X-App-Deep-Link → abre a tela
          // indicada (ex.: forçar atualização). 409 de negócio não tem o header.
          if (err.response?.statusCode == 409) {
            final deepLink = err.response?.headers.value('x-app-deep-link');
            if (deepLink != null && deepLink.isNotEmpty) {
              final storeUrl = err.response?.headers.value('x-app-store-url');
              onDeepLink?.call(deepLink, storeUrl);
            }
          }
          // Erros de conexão (ex.: "Failed host lookup: '<host>'") vazam a URL da
          // API. Substituímos por um erro genérico/limpo — o tipo é preservado
          // para que isNoInternetError() continue funcionando rio abaixo.
          if (isNoInternetError(err)) {
            handler.next(DioException(
              requestOptions: err.requestOptions,
              type: DioExceptionType.connectionError,
              error: null,
              message: kNoInternetMessage,
            ));
            return;
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
