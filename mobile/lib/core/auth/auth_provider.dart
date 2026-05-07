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
  AuthNotifier() : super(null);

  final _api = ApiClient();

  Future<void> restoreSession() async {
    final token = await _api.getToken();
    if (token == null) return;
    try {
      final res = await _api.dio.get('/deliverer/me');
      state = DelivererSession.fromJson(res.data as Map<String, dynamic>);
    } catch (_) {
      await _api.clearToken();
    }
  }

  Future<void> login(String username, String password) async {
    final res = await _api.dio.post('/auth/deliverer/login', data: {
      'username': username,
      'password': password,
    });
    final token = res.data['token'] as String;
    await _api.setToken(token);
    state = DelivererSession.fromJson(
      res.data['deliverer'] as Map<String, dynamic>,
    );
  }

  void completeOnboarding(String? profileImageUrl) {
    state = state?.copyWith(needsOnboarding: false, profileImageUrl: profileImageUrl);
  }

  Future<String?> updateStatus(String newStatus, {double? lat, double? lng}) async {
    try {
      await _api.dio.patch('/deliverer/status', data: {
        'status': newStatus,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      });
      state = state?.copyWith(status: newStatus);
      return null;
    } catch (e) {
      final msg = (e as dynamic).response?.data?['error'] as String?;
      return msg ?? 'Erro ao atualizar status';
    }
  }

  Future<void> logout() async {
    await _api.clearToken();
    state = null;
  }

  bool get isLoggedIn => state != null;
}

final authProvider =
    StateNotifierProvider<AuthNotifier, DelivererSession?>((ref) => AuthNotifier());
