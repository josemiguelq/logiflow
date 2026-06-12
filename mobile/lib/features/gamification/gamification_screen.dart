import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/providers/store_settings_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/app_drawer.dart';

// ── Metadados das conquistas (emoji / nome / cor) ────────────────────────────
class _AchvMeta {
  final String emoji;
  final String name;
  final Color color;
  const _AchvMeta(this.emoji, this.name, this.color);
}

const _achvOrder = ['ROUTE_MASTER', 'CARAVAN_CAPTAIN', 'ORDER_HUNTER'];
const _achvMeta = <String, _AchvMeta>{
  'ROUTE_MASTER':    _AchvMeta('🚚', 'Mestre das Rotas',     Color(0xFF2563EB)),
  'CARAVAN_CAPTAIN': _AchvMeta('📦', 'Capitão da Caravana',  Color(0xFF16A34A)),
  'ORDER_HUNTER':    _AchvMeta('⚡', 'Caçador de Pedidos',   Color(0xFFEA580C)),
};

String _metricLabel(String key, num target, Map<String, dynamic> m) {
  switch (key) {
    case 'ROUTE_MASTER':
      return '${m['routes']} rotas realizadas · meta $target';
    case 'CARAVAN_CAPTAIN':
      return 'Rota com ${m['maxOrders']} pedidos · meta $target';
    case 'ORDER_HUNTER':
      return '${m['fastCount']} pedido(s) aceito(s) em < ${m['minutes']} min · meta $target';
    default:
      return '';
  }
}

// ── Models ───────────────────────────────────────────────────────────────────
class _Stat {
  final int totalDays, bestStreak, currentStreak;
  const _Stat(this.totalDays, this.bestStreak, this.currentStreak);
  factory _Stat.fromJson(Map<String, dynamic> j) => _Stat(
        (j['totalDays'] as num?)?.toInt() ?? 0,
        (j['bestStreak'] as num?)?.toInt() ?? 0,
        (j['currentStreak'] as num?)?.toInt() ?? 0,
      );
}

class AchievementsData {
  final String month;
  final String today;
  final Map<String, int> streaks;
  final Map<String, _Stat> stats;
  final Map<String, List<String>> byDay; // 'YYYY-MM-DD' -> [keys]

  const AchievementsData({
    required this.month,
    required this.today,
    required this.streaks,
    required this.stats,
    required this.byDay,
  });

  factory AchievementsData.fromJson(Map<String, dynamic> j) {
    final streaks = <String, int>{};
    (j['streaks'] as Map<String, dynamic>? ?? {}).forEach((k, v) {
      streaks[k] = (v as num?)?.toInt() ?? 0;
    });
    final stats = <String, _Stat>{};
    (j['stats'] as Map<String, dynamic>? ?? {}).forEach((k, v) {
      stats[k] = _Stat.fromJson(v as Map<String, dynamic>);
    });
    final byDay = <String, List<String>>{};
    for (final e in (j['calendar'] as List? ?? [])) {
      final m = e as Map<String, dynamic>;
      byDay[m['day'] as String] =
          (m['achievements'] as List? ?? []).map((a) => a as String).toList();
    }
    return AchievementsData(
      month:   j['month'] as String? ?? '',
      today:   j['today'] as String? ?? '',
      streaks: streaks,
      stats:   stats,
      byDay:   byDay,
    );
  }
}

class _EarnedAchv {
  final String achievement;
  final num target;
  final Map<String, dynamic> metric;
  const _EarnedAchv(this.achievement, this.target, this.metric);
}

class _DayDetail {
  final String date;
  final List<_EarnedAchv> achievements;
  const _DayDetail(this.date, this.achievements);
  factory _DayDetail.fromJson(Map<String, dynamic> j) => _DayDetail(
        j['date'] as String? ?? '',
        (j['achievements'] as List? ?? [])
            .map((a) => _EarnedAchv(
                  (a as Map<String, dynamic>)['achievement'] as String,
                  (a['target'] as num?) ?? 0,
                  (a['metric'] as Map<String, dynamic>?) ?? const {},
                ))
            .toList(),
      );
}

// ── Providers ────────────────────────────────────────────────────────────────
final _achievementsProvider =
    FutureProvider.autoDispose.family<AchievementsData, String>((ref, month) async {
  final res = await ApiClient()
      .dio
      .get('/deliverer/achievements', queryParameters: {'month': month});
  return AchievementsData.fromJson(res.data as Map<String, dynamic>);
});

final _dayDetailProvider =
    FutureProvider.autoDispose.family<_DayDetail, String>((ref, date) async {
  final res = await ApiClient()
      .dio
      .get('/deliverer/achievements/day', queryParameters: {'date': date});
  return _DayDetail.fromJson(res.data as Map<String, dynamic>);
});

const _monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
String _monthKey(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}';
String _monthLabel(String key) {
  final p = key.split('-');
  final m = int.tryParse(p.length > 1 ? p[1] : '') ?? 1;
  return '${_monthNames[(m - 1).clamp(0, 11)]} ${p.first}';
}

// ── Screen ───────────────────────────────────────────────────────────────────
class GamificationScreen extends ConsumerStatefulWidget {
  const GamificationScreen({super.key});
  @override
  ConsumerState<GamificationScreen> createState() => _GamificationScreenState();
}

class _GamificationScreenState extends ConsumerState<GamificationScreen> {
  late String _month;
  late final List<String> _months;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _months = List.generate(12, (i) => _monthKey(DateTime(now.year, now.month - i)));
    _month = _months.first;
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(storeSettingsProvider);
    final data = ref.watch(_achievementsProvider(_month));

    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(
        centerTitle: true,
        title: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(settings.value?.brandName ?? 'LogiFlow',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const Text('Conquistas',
                style: TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(_achievementsProvider(_month)),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_achievementsProvider(_month)),
        child: data.when(
          loading: () => const Center(child: Padding(
            padding: EdgeInsets.symmetric(vertical: 80),
            child: CircularProgressIndicator(),
          )),
          error: (e, __) => ListView(children: [
            Padding(
              padding: const EdgeInsets.all(40),
              child: Center(child: Text('Erro ao carregar: $e')),
            ),
          ]),
          data: (d) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _StreaksCard(streaks: d.streaks),
              const SizedBox(height: 24),
              _MonthSelector(
                month: _month, months: _months,
                onChanged: (v) => setState(() => _month = v),
              ),
              const SizedBox(height: 12),
              _CalendarCard(data: d, onTapDay: _openDay),
              const SizedBox(height: 24),
              Text('Estatísticas',
                  style: TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600, color: Colors.grey.shade600)),
              const SizedBox(height: 8),
              for (final key in _achvOrder)
                _StatCard(achievement: key, stat: d.stats[key]),
            ],
          ),
        ),
      ),
    );
  }

  void _openDay(String date) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _DayDetailSheet(date: date),
    );
  }
}

// ── Ofensivas Atuais ─────────────────────────────────────────────────────────
class _StreaksCard extends StatelessWidget {
  final Map<String, int> streaks;
  const _StreaksCard({required this.streaks});

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
          const Text('🔥 Ofensivas atuais',
              style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 14),
          for (final key in _achvOrder) ...[
            _streakRow(key, streaks[key] ?? 0),
            if (key != _achvOrder.last) const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }

  Widget _streakRow(String key, int days) {
    final meta = _achvMeta[key]!;
    return Row(
      children: [
        Text(meta.emoji, style: const TextStyle(fontSize: 20)),
        const SizedBox(width: 10),
        Expanded(
          child: Text(meta.name,
              style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w500)),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.18),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text('$days ${days == 1 ? 'dia' : 'dias'}',
              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

class _MonthSelector extends StatelessWidget {
  final String month;
  final List<String> months;
  final ValueChanged<String> onChanged;
  const _MonthSelector({required this.month, required this.months, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: month,
          isExpanded: true,
          icon: const Icon(Icons.keyboard_arrow_down),
          items: months
              .map((m) => DropdownMenuItem(value: m, child: Text(_monthLabel(m))))
              .toList(),
          onChanged: (v) { if (v != null) onChanged(v); },
        ),
      ),
    );
  }
}

// ── Calendário mensal ────────────────────────────────────────────────────────
class _CalendarCard extends StatelessWidget {
  final AchievementsData data;
  final void Function(String date) onTapDay;
  const _CalendarCard({required this.data, required this.onTapDay});

  @override
  Widget build(BuildContext context) {
    final parts = data.month.split('-');
    final year = int.tryParse(parts.first) ?? DateTime.now().year;
    final month = int.tryParse(parts.length > 1 ? parts[1] : '') ?? DateTime.now().month;
    final daysInMonth = DateTime(year, month + 1, 0).day;
    final firstWeekday = DateTime(year, month, 1).weekday % 7; // 0=Dom

    const weekHeaders = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    final cells = <Widget>[];
    for (var i = 0; i < firstWeekday; i++) {
      cells.add(const SizedBox.shrink());
    }
    for (var d = 1; d <= daysInMonth; d++) {
      final dateStr =
          '$year-${month.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';
      final achvs = data.byDay[dateStr] ?? const [];
      final isToday = dateStr == data.today;
      cells.add(_DayCell(
        day: d,
        achievements: achvs,
        isToday: isToday,
        onTap: achvs.isEmpty ? null : () => onTapDay(dateStr),
      ));
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        children: [
          Row(
            children: weekHeaders
                .map((w) => Expanded(
                      child: Center(
                        child: Text(w,
                            style: TextStyle(
                                fontSize: 11, fontWeight: FontWeight.w600,
                                color: Colors.grey.shade400)),
                      ),
                    ))
                .toList(),
          ),
          const SizedBox(height: 6),
          GridView.count(
            crossAxisCount: 7,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 4,
            crossAxisSpacing: 4,
            childAspectRatio: 0.78,
            children: cells,
          ),
        ],
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  final int day;
  final List<String> achievements;
  final bool isToday;
  final VoidCallback? onTap;
  const _DayCell({
    required this.day,
    required this.achievements,
    required this.isToday,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final has = achievements.isNotEmpty;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: has ? AppTheme.primary.withOpacity(0.06) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: isToday
              ? Border.all(color: AppTheme.primary, width: 1.5)
              : Border.all(color: const Color(0xFFF1F5F9)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('$day',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: isToday ? FontWeight.bold : FontWeight.w500,
                    color: has ? Colors.grey.shade800 : Colors.grey.shade400)),
            const SizedBox(height: 2),
            Text(
              achievements.map((a) => _achvMeta[a]?.emoji ?? '').join(),
              style: const TextStyle(fontSize: 9, height: 1.1),
              maxLines: 1,
              overflow: TextOverflow.clip,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Estatísticas ─────────────────────────────────────────────────────────────
class _StatCard extends StatelessWidget {
  final String achievement;
  final _Stat? stat;
  const _StatCard({required this.achievement, required this.stat});

  @override
  Widget build(BuildContext context) {
    final meta = _achvMeta[achievement]!;
    final s = stat ?? const _Stat(0, 0, 0);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(meta.emoji, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: 8),
              Text(meta.name,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: meta.color)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _miniStat('Total de dias', s.totalDays),
              _miniStat('Melhor ofensiva', s.bestStreak),
              _miniStat('Ofensiva atual', s.currentStreak),
            ],
          ),
        ],
      ),
    );
  }

  Widget _miniStat(String label, int value) => Expanded(
        child: Column(
          children: [
            Text('$value',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 2),
            Text(label,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
          ],
        ),
      );
}

// ── Detalhe do dia (bottom sheet) ────────────────────────────────────────────
class _DayDetailSheet extends ConsumerWidget {
  final String date;
  const _DayDetailSheet({required this.date});

  String _prettyDate(String d) {
    final p = d.split('-');
    if (p.length != 3) return d;
    return '${p[2]}/${p[1]}/${p[0]}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(_dayDetailProvider(date));
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                    color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            Text(_prettyDate(date),
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            detail.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, __) => Text('Erro: $e'),
              data: (d) => d.achievements.isEmpty
                  ? Text('Nenhuma conquista neste dia.',
                      style: TextStyle(color: Colors.grey.shade600))
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (final a in d.achievements) ...[
                          _detailRow(a),
                          const SizedBox(height: 12),
                        ],
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(_EarnedAchv a) {
    final meta = _achvMeta[a.achievement]!;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(meta.emoji, style: const TextStyle(fontSize: 22)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(meta.name,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: meta.color)),
              const SizedBox(height: 2),
              Text(_metricLabel(a.achievement, a.target, a.metric),
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            ],
          ),
        ),
      ],
    );
  }
}
