import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/providers/store_settings_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/app_drawer.dart';

class Analytics {
  final int todayDeliveries;
  final int monthDeliveries;
  final int monthCancelled;
  final int monthRoutes;

  const Analytics({
    required this.todayDeliveries,
    required this.monthDeliveries,
    required this.monthCancelled,
    required this.monthRoutes,
  });

  factory Analytics.fromJson(Map<String, dynamic> j) {
    int n(dynamic v) => (v as num?)?.toInt() ?? 0;
    final today = (j['today'] as Map<String, dynamic>?) ?? const {};
    final month = (j['monthSummary'] as Map<String, dynamic>?) ?? const {};
    return Analytics(
      todayDeliveries: n(today['deliveries']),
      monthDeliveries: n(month['deliveries']),
      monthCancelled: n(month['cancelled']),
      monthRoutes: n(month['routes']),
    );
  }
}

// Resumo analítico do entregador para um mês (YYYY-MM).
final _analyticsProvider =
    FutureProvider.autoDispose.family<Analytics, String>((ref, month) async {
  final res = await ApiClient()
      .dio
      .get('/deliverer/analytics', queryParameters: {'month': month});
  return Analytics.fromJson(res.data as Map<String, dynamic>);
});

const _monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

String _monthKey(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}';

String _monthLabel(String key) {
  final parts = key.split('-');
  final m = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 1;
  return '${_monthNames[(m - 1).clamp(0, 11)]} ${parts.first}';
}

class AnalyticsScreen extends ConsumerStatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  ConsumerState<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends ConsumerState<AnalyticsScreen> {
  late String _month;
  late final List<String> _months;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    // Últimos 12 meses (mês atual primeiro).
    _months = List.generate(12, (i) => _monthKey(DateTime(now.year, now.month - i)));
    _month = _months.first;
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(storeSettingsProvider);
    final analytics = ref.watch(_analyticsProvider(_month));

    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(
        centerTitle: true,
        title: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(settings.value?.brandName ?? 'LogiFlow',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const Text('Analítico',
                style: TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(_analyticsProvider(_month)),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_analyticsProvider(_month)),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ── Entregas de hoje ─────────────────────────────────────
            analytics.when(
              loading: () => const _TodayCard(value: null),
              error: (_, __) => const _TodayCard(value: null),
              data: (a) => _TodayCard(value: a.todayDeliveries),
            ),
            const SizedBox(height: 24),

            // ── Seletor de mês ───────────────────────────────────────
            Text('Resumo do mês',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade600)),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE5E7EB)),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _month,
                  isExpanded: true,
                  icon: const Icon(Icons.keyboard_arrow_down),
                  items: _months
                      .map((m) => DropdownMenuItem(
                            value: m,
                            child: Text(_monthLabel(m)),
                          ))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setState(() => _month = v);
                  },
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ── Cards do mês ─────────────────────────────────────────
            analytics.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, __) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 40),
                child: Center(child: Text('Erro ao carregar: $e')),
              ),
              data: (a) => Row(
                children: [
                  Expanded(
                    child: _StatCard(
                      label: 'Entregas',
                      value: a.monthDeliveries,
                      icon: Icons.check_circle_outline,
                      color: const Color(0xFF16A34A),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _StatCard(
                      label: 'Canceladas',
                      value: a.monthCancelled,
                      icon: Icons.cancel_outlined,
                      color: const Color(0xFFDC2626),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _StatCard(
                      label: 'Viagens',
                      value: a.monthRoutes,
                      icon: Icons.route_outlined,
                      color: const Color(0xFF2563EB),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TodayCard extends StatelessWidget {
  final int? value;
  const _TodayCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.primary,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.today_outlined, color: Colors.white70, size: 18),
              SizedBox(width: 6),
              Text('Entregas hoje',
                  style: TextStyle(color: Colors.white70, fontSize: 13)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value?.toString() ?? '—',
            style: const TextStyle(
                color: Colors.white, fontSize: 40, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final int value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 8),
          Text('$value',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 2),
          Text(label,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
        ],
      ),
    );
  }
}
