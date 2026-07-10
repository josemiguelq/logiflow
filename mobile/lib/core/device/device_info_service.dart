import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../api/api_client.dart';

/// Coleta os metadados do aparelho (modelo/fabricante, versão do SO e versão do
/// app instalada) e envia ao backend para a tabela de entregadores. Best-effort:
/// nunca lança — qualquer falha é silenciosa para não atrapalhar login/startup.
class DeviceInfoService {
  static Future<void> report() async {
    try {
      final data = await _collect();
      if (data == null) return;
      await ApiClient().dio.post('/deliverer/device-info', data: data);
    } catch (_) {
      // Silencioso de propósito.
    }
  }

  static Future<Map<String, String>?> _collect() async {
    final deviceInfo = DeviceInfoPlugin();
    final pkg = await PackageInfo.fromPlatform();
    final appVersion = '${pkg.version}+${pkg.buildNumber}';

    String model;
    String os;

    if (Platform.isAndroid) {
      final info = await deviceInfo.androidInfo;
      model = '${info.manufacturer} ${info.model}'.trim();
      os = 'Android ${info.version.release}';
    } else if (Platform.isIOS) {
      final info = await deviceInfo.iosInfo;
      model = info.utsname.machine;
      os = '${info.systemName} ${info.systemVersion}';
    } else {
      return null;
    }

    return {
      'model':      model,
      'os':         os,
      'appVersion': appVersion,
    };
  }
}
