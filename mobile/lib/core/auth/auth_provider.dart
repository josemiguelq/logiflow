import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

class DelivererSession {
  final String id;
  final String name;
  final String username;
  final String storeId;
  final String status;

  const DelivererSession({
    required this.id,
    required this.name,
    required this.username,
    required this.storeId,
    required this.status,
  });

  factory DelivererSession.fromJson(Map<String, dynamic> json) => DelivererSession(
        id:       json['id'] as String,
        name:     json['name'] as String,
        username: json['username'] as String,
        storeId:  json['storeId'] as String,
        status:   json['status'] as String,
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

  Future<void> logout() async {
    await _api.clearToken();
    state = null;
  }

  bool get isLoggedIn => state != null;
}

final authProvider =
    StateNotifierProvider<AuthNotifier, DelivererSession?>((ref) => AuthNotifier());
