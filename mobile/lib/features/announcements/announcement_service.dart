import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api/api_client.dart';
import '../../core/models/announcement.dart';

/// Carrega comunicados não lidos com cache local para abrir rápido, e registra a
/// leitura no backend. Mantém um conjunto local de IDs já lidos para resiliência
/// offline (não reexibir um comunicado já "Entendido" mesmo sem rede).
class AnnouncementService {
  static const _cacheKey = 'cached_announcements';
  static const _readKey  = 'read_announcement_ids';
  // Timeout curto: um request lento nunca deve segurar a checagem de comunicados.
  static const _timeout  = Duration(seconds: 8);

  final _api = ApiClient();

  Future<Set<String>> _readIds() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_readKey) ?? const <String>[]).toSet();
  }

  Future<void> _addReadId(String id) async {
    final prefs = await SharedPreferences.getInstance();
    final ids = (prefs.getStringList(_readKey) ?? const <String>[]).toSet()..add(id);
    await prefs.setStringList(_readKey, ids.toList());
  }

  /// Comunicados do cache (exibição instantânea), já filtrando os lidos localmente.
  Future<List<Announcement>> cachedAnnouncements() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey);
      if (raw == null) return [];
      final read = await _readIds();
      return (jsonDecode(raw) as List)
          .map((e) => Announcement.fromJson(e as Map<String, dynamic>))
          .where((a) => !read.contains(a.id))
          .toList();
    } catch (e) {
      debugPrint('[Announcements] falha ao ler cache: $e');
      return [];
    }
  }

  /// Busca do backend (com timeout), atualiza o cache e devolve os não lidos.
  Future<List<Announcement>> fetchAnnouncements() async {
    final res = await _api.dio.get('/deliverer/announcements').timeout(_timeout);
    final list = (res.data as List)
        .map((e) => Announcement.fromJson(e as Map<String, dynamic>))
        .toList();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_cacheKey, jsonEncode(list.map((a) => a.toJson()).toList()));
    final read = await _readIds();
    return list.where((a) => !read.contains(a.id)).toList();
  }

  /// Marca como lido: registra localmente (instantâneo) + remove do cache +
  /// envia ao backend (best-effort).
  Future<void> markRead(String id) async {
    await _addReadId(id);
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey);
      if (raw != null) {
        final remaining = (jsonDecode(raw) as List)
            .where((e) => (e as Map<String, dynamic>)['id'] != id)
            .toList();
        await prefs.setString(_cacheKey, jsonEncode(remaining));
      }
    } catch (_) {/* não-fatal */}
    try {
      await _api.dio.post('/deliverer/announcements/$id/read').timeout(_timeout);
    } catch (_) {/* não-fatal: já marcado localmente; servidor reconcilia depois */}
  }
}

final announcementServiceProvider = Provider((_) => AnnouncementService());
