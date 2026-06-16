import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';

void showWorkScheduleSheet(BuildContext context) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => const _WorkScheduleSheet(),
  );
}

const _dayLabels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Estado local de um dia da semana.
class _Day {
  final int dow;
  bool active;
  String start;
  String end;
  String? lunchStart;
  String? lunchEnd;
  _Day(this.dow, {this.active = false, this.start = '08:00', this.end = '18:00', this.lunchStart, this.lunchEnd});
}

class _WorkScheduleSheet extends ConsumerStatefulWidget {
  const _WorkScheduleSheet();

  @override
  ConsumerState<_WorkScheduleSheet> createState() => _WorkScheduleSheetState();
}

class _WorkScheduleSheetState extends ConsumerState<_WorkScheduleSheet> {
  List<_Day> _week = List.generate(7, (i) => _Day(i));
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient().dio.get('/deliverer/schedule');
      final days = (res.data as Map<String, dynamic>)['days'] as List<dynamic>? ?? [];
      final byDow = {for (final d in days) (d['dayOfWeek'] as num).toInt(): d as Map<String, dynamic>};
      setState(() {
        _week = List.generate(7, (i) {
          final d = byDow[i];
          if (d == null) return _Day(i);
          return _Day(
            i,
            active: d['active'] as bool? ?? false,
            start: d['startTime'] as String? ?? '08:00',
            end: d['endTime'] as String? ?? '18:00',
            lunchStart: d['lunchStart'] as String?,
            lunchEnd: d['lunchEnd'] as String?,
          );
        });
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _pickTime(String current, ValueChanged<String> onPicked) async {
    final parts = current.split(':');
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: int.tryParse(parts[0]) ?? 8, minute: int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0),
    );
    if (picked != null) {
      onPicked('${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}');
    }
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = null; });
    try {
      final days = _week.map((d) => {
        'dayOfWeek': d.dow,
        'active': d.active,
        'startTime': d.start,
        'endTime': d.end,
        if (d.lunchStart != null) 'lunchStart': d.lunchStart,
        if (d.lunchEnd != null) 'lunchEnd': d.lunchEnd,
      }).toList();
      await ApiClient().dio.put('/deliverer/schedule', data: {'days': days});
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      final msg = (e as dynamic).response?.data?['error'] as String?;
      setState(() => _error = msg ?? 'Erro ao salvar horário');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 20,
        bottom: 20 + MediaQuery.of(context).padding.bottom,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Horário de trabalho',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('Defina os dias e horários, com a parada de almoço.',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            const SizedBox(height: 16),

            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: CircularProgressIndicator()),
              )
            else
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    children: [for (final d in _week) _dayCard(d)],
                  ),
                ),
              ),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(children: [
                  const Icon(Icons.error_outline, color: Color(0xFFDC2626), size: 16),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_error!, style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13))),
                ]),
              ),
            ],

            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: (_loading || _saving) ? null : _save,
                child: _saving
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Salvar horário'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dayCard(_Day d) {
    final hasLunch = d.lunchStart != null;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: d.active ? Colors.white : const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(_dayLabels[d.dow],
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: d.active ? Colors.black87 : Colors.grey,
                  )),
              Switch(
                value: d.active,
                activeColor: AppTheme.primary,
                onChanged: (v) => setState(() => d.active = v),
              ),
            ],
          ),
          if (d.active) ...[
            const SizedBox(height: 4),
            Row(children: [
              _timeChip(d.start, () => _pickTime(d.start, (v) => setState(() => d.start = v))),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('até')),
              _timeChip(d.end, () => _pickTime(d.end, (v) => setState(() => d.end = v))),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              GestureDetector(
                onTap: () => setState(() {
                  if (hasLunch) { d.lunchStart = null; d.lunchEnd = null; }
                  else { d.lunchStart = '12:00'; d.lunchEnd = '13:00'; }
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: hasLunch ? const Color(0xFFFFFBEB) : Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: hasLunch ? const Color(0xFFFDE68A) : const Color(0xFFE5E7EB)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.lunch_dining, size: 15, color: hasLunch ? const Color(0xFFB45309) : Colors.grey),
                    const SizedBox(width: 5),
                    Text('Almoço', style: TextStyle(fontSize: 12, color: hasLunch ? const Color(0xFFB45309) : Colors.grey)),
                  ]),
                ),
              ),
              if (hasLunch) ...[
                const SizedBox(width: 8),
                _timeChip(d.lunchStart!, () => _pickTime(d.lunchStart!, (v) => setState(() => d.lunchStart = v))),
                const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('até')),
                _timeChip(d.lunchEnd!, () => _pickTime(d.lunchEnd!, (v) => setState(() => d.lunchEnd = v))),
              ],
            ]),
          ],
        ],
      ),
    );
  }

  Widget _timeChip(String value, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
      ),
    );
  }
}
