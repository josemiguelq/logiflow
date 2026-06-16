import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../core/api/api_client.dart';
import '../core/auth/auth_provider.dart';
import '../core/providers/store_settings_provider.dart';
import '../core/theme/app_theme.dart';
import '../features/profile/edit_profile_sheet.dart';
import '../features/profile/work_schedule_sheet.dart';

final _packageInfoProvider = FutureProvider<PackageInfo>(
  (_) => PackageInfo.fromPlatform(),
);

// Ofensivas atuais (conquista -> dias) para exibir os emojis no cabeçalho.
final _achievementStreaksProvider = FutureProvider.autoDispose<Map<String, int>>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/achievements');
  final streaks = <String, int>{};
  ((res.data as Map<String, dynamic>)['streaks'] as Map<String, dynamic>? ?? {})
      .forEach((k, v) => streaks[k] = (v as num?)?.toInt() ?? 0);
  return streaks;
});

const _achvOrder = ['ROUTE_MASTER', 'CARAVAN_CAPTAIN', 'ORDER_HUNTER'];
const _achvEmoji = <String, String>{
  'ROUTE_MASTER': '🚚',
  'CARAVAN_CAPTAIN': '📦',
  'ORDER_HUNTER': '⚡',
};

class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session       = ref.watch(authProvider);
    final storeSettings = ref.watch(storeSettingsProvider);
    final packageInfo   = ref.watch(_packageInfoProvider);
    final achvStreaks   = ref.watch(_achievementStreaksProvider);
    final storeName     = storeSettings.value?.storeName; // non-null only when custom theme feature is on
    final headerColor   = storeSettings.value?.primaryColor ?? AppTheme.primary;
    final versionLabel  = packageInfo.whenOrNull(
      data: (info) => 'v${info.version} (${info.buildNumber})',
    );

    final photoUrl = session?.profileImageUrl;

    return Drawer(
      backgroundColor: Colors.white,
      child: Column(
        children: [
          // ── Profile header ─────────────────────────────────────────
          Container(
            width: double.infinity,
            color: headerColor,
            padding: EdgeInsets.only(
              top: MediaQuery.of(context).padding.top + 24,
              left: 20,
              right: 20,
              bottom: 24,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Avatar
                Container(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withOpacity(0.8), width: 2.5),
                  ),
                  child: CircleAvatar(
                    radius: 36,
                    backgroundColor: Colors.white.withOpacity(0.2),
                    backgroundImage: photoUrl != null ? _imageProvider(photoUrl) : null,
                    child: photoUrl == null
                        ? Text(
                            session?.name.isNotEmpty == true
                                ? session!.name[0].toUpperCase()
                                : '?',
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          )
                        : null,
                  ),
                ),
                const SizedBox(width: 16),

                // Name + edit button
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        session?.name ?? '',
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      GestureDetector(
                        onTap: () {
                          Navigator.of(context).pop(); // fecha o drawer primeiro
                          showEditProfileSheet(context);
                        },
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.edit_outlined,
                                size: 14, color: Colors.white.withOpacity(0.85)),
                            const SizedBox(width: 5),
                            Text(
                              'Editar perfil',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.white.withOpacity(0.85),
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Emojis das conquistas com ofensiva ativa (com o nº de dias).
                      achvStreaks.maybeWhen(
                        data: (streaks) {
                          final active = _achvOrder.where((k) => (streaks[k] ?? 0) > 0).toList();
                          if (active.isEmpty) return const SizedBox.shrink();
                          return Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                for (final k in active)
                                  Padding(
                                    padding: const EdgeInsets.only(right: 10),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(_achvEmoji[k]!, style: const TextStyle(fontSize: 16)),
                                        const SizedBox(width: 3),
                                        Text(
                                          '${streaks[k]}',
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w700,
                                            color: Colors.white.withOpacity(0.95),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                          );
                        },
                        orElse: () => const SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // ── Menu items ─────────────────────────────────────────────
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                const SizedBox(height: 8),
                _DrawerTile(
                  icon: LucideIcons.truck,
                  label: 'Pedidos',
                  onTap: () {
                    Navigator.of(context).pop();
                    context.go('/orders');
                  },
                ),
                _DrawerTile(
                  icon: LucideIcons.barChart3,
                  label: 'Analítico',
                  onTap: () {
                    Navigator.of(context).pop();
                    context.go('/analitico');
                  },
                ),
                _DrawerTile(
                  icon: LucideIcons.award,
                  label: 'Conquistas',
                  onTap: () {
                    Navigator.of(context).pop();
                    context.go('/conquistas');
                  },
                ),
                _DrawerTile(
                  icon: LucideIcons.calendarClock,
                  label: 'Horário de trabalho',
                  onTap: () {
                    Navigator.of(context).pop();
                    showWorkScheduleSheet(context);
                  },
                ),
                _DrawerTile(
                  icon: Icons.logout,
                  label: 'Sair',
                  color: const Color(0xFFDC2626),
                  onTap: () async {
                    Navigator.of(context).pop();
                    await ref.read(authProvider.notifier).logout();
                    if (context.mounted) context.go('/login');
                  },
                ),
              ],
            ),
          ),

          // ── Footer: store name + app version ──────────────────────
          const Divider(height: 1),
          Padding(
            padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 12,
              bottom: 12 + MediaQuery.of(context).padding.bottom,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (storeName != null) ...[
                  Row(
                    children: [
                      Icon(Icons.store_outlined, size: 15, color: Colors.grey.shade500),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          storeName,
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.grey.shade600,
                            fontWeight: FontWeight.w500,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                ],
                if (versionLabel != null)
                  Text(
                    versionLabel,
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DrawerTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  const _DrawerTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final c = color ?? Colors.grey.shade800;
    return ListTile(
      leading: Icon(icon, color: c, size: 22),
      title: Text(label,
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: c)),
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
    );
  }
}

ImageProvider _imageProvider(String url) {
  if (url.startsWith('data:')) {
    return MemoryImage(base64Decode(url.split(',').last));
  }
  return NetworkImage(url);
}
