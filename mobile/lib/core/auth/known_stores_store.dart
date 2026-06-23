import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Uma loja que o entregador já adicionou pelo código de convite. Guardada
/// localmente para que ele não precise redigitar o código a cada login.
class KnownStore {
  final String code;
  final String storeId;
  final String storeName;

  const KnownStore({required this.code, required this.storeId, required this.storeName});

  factory KnownStore.fromJson(Map<String, dynamic> json) => KnownStore(
        code:      json['code'] as String,
        storeId:   json['storeId'] as String,
        storeName: json['storeName'] as String,
      );

  Map<String, dynamic> toJson() => {
        'code':      code,
        'storeId':   storeId,
        'storeName': storeName,
      };
}

/// Persiste a lista de lojas conhecidas em SharedPreferences (dado não sensível;
/// token/sessão continuam no secure storage). Chave: `known_stores`.
class KnownStoresStore {
  static const _key = 'known_stores';

  Future<List<KnownStore>> list() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    try {
      final arr = jsonDecode(raw) as List<dynamic>;
      return arr
          .map((e) => KnownStore.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _save(List<KnownStore> stores) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(stores.map((s) => s.toJson()).toList()));
  }

  /// Adiciona (ou atualiza) uma loja, deduplicando por código.
  Future<List<KnownStore>> add(KnownStore store) async {
    final stores = await list();
    stores.removeWhere((s) => s.code == store.code);
    stores.insert(0, store);
    await _save(stores);
    return stores;
  }

  Future<List<KnownStore>> remove(String code) async {
    final stores = await list();
    stores.removeWhere((s) => s.code == code);
    await _save(stores);
    return stores;
  }
}
