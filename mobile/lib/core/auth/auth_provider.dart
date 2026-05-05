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

  DelivererSession copyWith({bool? needsOnboarding, String? profileImageUrl}) =>
      DelivererSession(
        id:              id,
        name:            name,
        username:        username,
        storeId:         storeId,
        status:          status,
        profileImageUrl: profileImageUrl ?? this.profileImageUrl,
        needsOnboarding: needsOnboarding ?? this.needsOnboarding,
      );
}

class AuthNotifier extends StateNotifier<DelivererSession?> {
  AuthNotifier() : super(null);

  final _api = ApiClient();

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

  Future<void> logout() async {
    await _api.clearToken();
    state = null;
  }

  bool get isLoggedIn => state != null;
}

final authProvider =
    StateNotifierProvider<AuthNotifier, DelivererSession?>((ref) => AuthNotifier());
