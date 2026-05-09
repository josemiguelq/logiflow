import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

class DelivererSession {
  final String id;
  final String name;
  final String username;
  final String storeId;
  final String status;
  final String? profileImageUrl;
  final bool needsOnboarding;

  const DelivererSession({
    required this.id,
    required this.name,
    required this.username,
    required this.storeId,
    required this.status,
    this.profileImageUrl,
    required this.needsOnboarding,
  });

  factory DelivererSession.fromJson(Map<String, dynamic> json) => DelivererSession(
        id:              json['id'] as String,
        name:            json['name'] as String,
        username:        json['username'] as String,
        storeId:         json['storeId'] as String,
        status:          json['status'] as String,
        profileImageUrl: json['profileImageUrl'] as String?,
        needsOnboarding: json['needsOnboarding'] as bool? ?? true,
      );

  Map<String, dynamic> toJson() => {
        'id':              id,
        'name':            name,
        'username':        username,
        'storeId':         storeId,
        'status':          status,
        'profileImageUrl': profileImageUrl,
        'needsOnboarding': needsOnboarding,
      };

  DelivererSession copyWith({bool? needsOnboarding, String? profileImageUrl, String? status}) =>
      DelivererSession(
        id:              id,
        name:            name,
        username:        username,
        storeId:         storeId,
        status:          status ?? this.status,
        profileImageUrl: profileImageUrl ?? this.profileImageUrl,
        needsOnboarding: needsOnboarding ?? this.needsOnboarding,
      );
}

class AuthNotifier extends StateNotifier<DelivererSession?> {
  AuthNotifier() : super(null) {
    // Wire up the global 401 handler so deactivated accounts are logged out
    // immediately on any API response, not just on startup.
    ApiClient.onUnauthorized = _handleUnauthorized;
  }

  final _api = ApiClient();
  bool _initialising = true;

  void _handleUnauthorized() {
    // Ignore 401s that arrive during the initial restoreSession call — those
    // are handled explicitly there. Only act on 401s during normal operation.
    if (_initialising) return;
    _clearAndLogout();
  }

  Future<void> _clearAndLogout() async {
    await _api.clearToken();
    await _api.clearSession();
    state = null;
  }

  /// Restores the session on app start.
  ///
  /// Strategy:
  /// - Token missing → stay logged out.
  /// - Token present, server reachable → verify with /deliverer/me:
  ///   - 200 → update cached session, continue.
  ///   - 401 (disabled/invalid) → wipe everything, go to login.
  /// - Token present, network unavailable → restore from cached session so
  ///   the deliverer can keep working offline until connectivity returns.
  Future<void> restoreSession() async {
    _initialising = true;
    try {
      final token = await _api.getToken();
      if (token == null) return;

      try {
        final res = await _api.dio.get('/deliverer/me');
        final session = DelivererSession.fromJson(res.data as Map<String, dynamic>);
        await _api.saveSession(session.toJson());
        state = session;
      } on DioException catch (e) {
        final status = e.response?.statusCode;
        if (status == 401 || status == 403) {
          // Account disabled or token invalid — force logout.
          await _clearAndLogout();
        } else {
          // Network error, timeout, server down, etc. — restore from cache so
          // the app doesn't lock the deliverer out just because of connectivity.
          final cached = await _api.loadSession();
          if (cached != null) {
            state = DelivererSession.fromJson(cached);
          } else {
            // No cache available: stay logged out (nothing to restore).
            await _clearAndLogout();
          }
        }
      }
    } finally {
      _initialising = false;
    }
  }

  Future<void> login(String username, String password) async {
    final res = await _api.dio.post('/auth/deliverer/login', data: {
      'username': username,
      'password': password,
    });
    final token   = res.data['token'] as String;
    final session = DelivererSession.fromJson(
      res.data['deliverer'] as Map<String, dynamic>,
    );
    await _api.setToken(token);
    await _api.saveSession(session.toJson());
    state = session;
  }

  void completeOnboarding(String? profileImageUrl) {
    final updated = state?.copyWith(needsOnboarding: false, profileImageUrl: profileImageUrl);
    if (updated != null) {
      state = updated;
      _api.saveSession(updated.toJson());
    }
  }

  Future<String?> updateStatus(String newStatus, {double? lat, double? lng}) async {
    try {
      await _api.dio.patch('/deliverer/status', data: {
        'status': newStatus,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      });
      final updated = state?.copyWith(status: newStatus);
      if (updated != null) {
        state = updated;
        _api.saveSession(updated.toJson());
      }
      return null;
    } catch (e) {
      final msg = (e as dynamic).response?.data?['error'] as String?;
      return msg ?? 'Erro ao atualizar status';
    }
  }

  Future<void> logout() async {
    await _clearAndLogout();
  }

  bool get isLoggedIn => state != null;
}

final authProvider =
    StateNotifierProvider<AuthNotifier, DelivererSession?>((ref) => AuthNotifier());
