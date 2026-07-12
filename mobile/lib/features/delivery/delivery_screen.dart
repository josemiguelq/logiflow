import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'dart:convert';
import '../../core/api/api_client.dart';
import '../../core/map_tiles.dart';
import '../../core/models/order.dart';
import '../../core/providers/store_settings_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/app_drawer.dart';
import '../../widgets/priority_badge.dart';
import '../chat/order_chat_screen.dart';

final _activeDeliveryProvider =
    FutureProvider.autoDispose<List<Order>>((ref) async {
  final res = await ApiClient().dio.get('/deliverer/orders');
  final all = (res.data as List)
      .map((e) => Order.fromJson(e as Map<String, dynamic>))
      .toList();
  return all
      .where((o) =>
          o.status == 'ON_ROUTE' ||
          o.status == 'OUT_FOR_DELIVERY' ||
          o.status == 'DELIVERED')
      .toList()
    ..sort((a, b) => (a.routePosition ?? 99).compareTo(b.routePosition ?? 99));
});

// Verde de acento da tela de entregas (mesmo tom já usado nos status/entregue).
const _green = Color(0xFF16A34A);

class DeliveryScreen extends ConsumerStatefulWidget {
  const DeliveryScreen({super.key});

  @override
  ConsumerState<DeliveryScreen> createState() => _DeliveryScreenState();
}

class _DeliveryScreenState extends ConsumerState<DeliveryScreen> {
  int _tabIndex = 0;

  // Índice 2 é uma AÇÃO (abre "Reportar problema"), não uma aba — por isso o
  // índice selecionado nunca é 2.
  static const _reportIndex = 2;

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(storeSettingsProvider);
    const subtitles = ['Entregas em rota', 'Mapa da rota', '', 'Perfil'];

    return Scaffold(
      // Sidebar mantido: o hambúrguer da AppBar abre o drawer.
      drawer: const AppDrawer(),
      appBar: AppBar(
        centerTitle: true,
        title: _BrandTitle(
          brand: settings.value?.brandName ?? 'LogiFlow',
          subtitle: subtitles[_tabIndex],
        ),
        actions: [
          if (_tabIndex <= 1)
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.invalidate(_activeDeliveryProvider),
            ),
        ],
      ),
      body: switch (_tabIndex) {
        0 => const _RouteTab(),
        1 => const _MapTab(),
        _ => const _ComingSoon(
            icon: Icons.person_outline,
            title: 'Perfil',
            message: 'Seu perfil de entregador chega em breve.'),
      },
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _tabIndex,
        onTap: (i) {
          if (i == _reportIndex) {
            showReportProblemSheet(context);
            return;
          }
          setState(() => _tabIndex = i);
        },
        type: BottomNavigationBarType.fixed,
        selectedItemColor: _green,
        unselectedItemColor: Colors.grey.shade500,
        selectedFontSize: 12,
        unselectedFontSize: 12,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.alt_route), label: 'Rota'),
          BottomNavigationBarItem(icon: Icon(Icons.map_outlined), label: 'Mapa'),
          BottomNavigationBarItem(
              icon: Icon(Icons.report_problem_outlined), label: 'Reportar'),
          BottomNavigationBarItem(
              icon: Icon(Icons.person_outline), label: 'Perfil'),
        ],
      ),
    );
  }
}

Future<void> showReportProblemSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const _ReportProblemSheet(),
  );
}

// ── Tab "Rota" ───────────────────────────────────────────────────────────────

class _RouteTab extends ConsumerWidget {
  const _RouteTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(_activeDeliveryProvider);
    final settings = ref.watch(storeSettingsProvider);

    return orders.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => _DeliveryErrorState(
        offline: isNoInternetError(e),
        onRetry: () => ref.invalidate(_activeDeliveryProvider),
      ),
      data: (list) {
        if (list.isEmpty) {
          return _EmptyDeliveryState(onGoOrders: () => context.go('/orders'));
        }
        final enforceOrder = settings.value?.enforceDeliveryOrder ?? false;
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_activeDeliveryProvider),
          child: _RouteListView(
            list: list,
            enforceOrder: enforceOrder,
            onChanged: () => ref.invalidate(_activeDeliveryProvider),
          ),
        );
      },
    );
  }
}

// Mantém qual card está expandido. Só a "próxima entrega" (primeiro card
// acionável) vem expandida por padrão; tocar em outro card expande-o e recolhe
// o anterior — preservando as ações de qualquer pedido quando a loja não força
// a ordem da rota.
class _RouteListView extends StatefulWidget {
  final List<Order> list;
  final bool enforceOrder;
  final VoidCallback onChanged;
  const _RouteListView({
    required this.list,
    required this.enforceOrder,
    required this.onChanged,
  });

  @override
  State<_RouteListView> createState() => _RouteListViewState();
}

class _RouteListViewState extends State<_RouteListView> {
  String? _expandedId;
  // Modo de edição: reordenar as paradas arrastando. Pedidos entregues ficam
  // travados no início e não podem ser movidos.
  bool _editing = false;
  bool _saving = false;
  late List<Order> _cards;

  @override
  void initState() {
    super.initState();
    _cards = List.of(widget.list);
  }

  @override
  void didUpdateWidget(covariant _RouteListView old) {
    super.didUpdateWidget(old);
    // Enquanto edita, mantém a ordem local; fora da edição, segue o provider.
    if (!_editing) _cards = List.of(widget.list);
  }

  String? get _firstActionableId {
    for (final o in widget.list) {
      if (o.status != 'DELIVERED') return o.id;
    }
    return null;
  }

  int get _movableCount =>
      widget.list.where((o) => o.status != 'DELIVERED').length;

  // Quantos pedidos entregues estão no início (travados na reordenação).
  int get _leadingDelivered {
    var n = 0;
    for (final o in _cards) {
      if (o.status == 'DELIVERED') {
        n++;
      } else {
        break;
      }
    }
    return n;
  }

  // Bloqueia se a loja exige ordem e há outra parada anterior da mesma rota
  // AINDA PENDENTE (paradas já entregues não bloqueiam).
  bool _blocked(Order order) {
    if (!widget.enforceOrder || order.routeId == null) return false;
    return widget.list.any((o) =>
        o.routeId == order.routeId &&
        o.status != 'DELIVERED' &&
        (o.routePosition ?? 9999) < (order.routePosition ?? 9999));
  }

  void _onReorder(int oldIndex, int newIndex) {
    final locked = _leadingDelivered;
    if (oldIndex < locked) return; // entregues não movem
    if (newIndex > oldIndex) newIndex -= 1;
    if (newIndex < locked) newIndex = locked; // não pode ir antes dos entregues
    if (newIndex == oldIndex) return;
    setState(() {
      final moved = _cards.removeAt(oldIndex);
      _cards.insert(newIndex, moved);
    });
  }

  Future<void> _toggleEdit() async {
    if (!_editing) {
      setState(() {
        _editing = true;
        _expandedId = null;
        _cards = List.of(widget.list);
      });
      return;
    }
    // Concluir: persiste apenas se a ordem mudou.
    final newIds = _cards.map((o) => o.id).toList();
    final oldIds = widget.list.map((o) => o.id).toList();
    var changed = newIds.length != oldIds.length;
    for (var i = 0; !changed && i < newIds.length; i++) {
      if (newIds[i] != oldIds[i]) changed = true;
    }
    if (!changed) {
      setState(() => _editing = false);
      return;
    }
    setState(() => _saving = true);
    try {
      await ApiClient()
          .dio
          .patch('/deliverer/orders/reorder', data: {'orderIds': newIds});
      widget.onChanged();
      if (mounted) setState(() {
        _editing = false;
        _saving = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _cards = List.of(widget.list);
      });
      final msg = isNoInternetError(e)
          ? kNoInternetMessage
          : 'Não foi possível salvar a nova ordem. Tente novamente.';
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_editing) return _buildEditing();
    return _buildNormal();
  }

  Widget _buildNormal() {
    final list = widget.list;
    final firstId = _firstActionableId;
    // Usa a seleção do usuário se ainda válida (existe e não foi entregue);
    // senão, volta para a próxima entrega.
    final selection = _expandedId;
    final validSelection = selection != null &&
        list.any((o) => o.id == selection && o.status != 'DELIVERED');
    final expandedId = validSelection ? selection : firstId;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _RouteHeader(
          editing: false,
          saving: false,
          canEdit: _movableCount >= 2,
          onToggleEdit: _toggleEdit,
        ),
        const SizedBox(height: 14),
        _RouteSummaryCard(list: list),
        const SizedBox(height: 16),
        for (int i = 0; i < list.length; i++) ...[
          _DeliveryCard(
            key: ValueKey(list[i].id),
            order: list[i],
            position: i + 1,
            total: list.length,
            expanded: list[i].id == expandedId,
            isNext: list[i].id == firstId,
            deliverBlocked: _blocked(list[i]),
            onTap: () => setState(() => _expandedId = list[i].id),
            onDelivered: widget.onChanged,
          ),
          if (i != list.length - 1) const SizedBox(height: 12),
        ],
      ],
    );
  }

  Widget _buildEditing() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
          child: _RouteHeader(
            editing: true,
            saving: _saving,
            canEdit: true,
            onToggleEdit: _toggleEdit,
          ),
        ),
        Expanded(
          child: ReorderableListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            itemCount: _cards.length,
            buildDefaultDragHandles: false,
            onReorder: _onReorder,
            itemBuilder: (ctx, i) {
              final order = _cards[i];
              final delivered = order.status == 'DELIVERED';
              final tile = Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _DeliveryCard(
                  order: order,
                  position: i + 1,
                  total: _cards.length,
                  expanded: false,
                  isNext: false,
                  editing: true,
                  onTap: () {},
                  onDelivered: widget.onChanged,
                ),
              );
              // Entregues: não arrastáveis. Demais: arrasta de qualquer ponto.
              if (delivered) {
                return KeyedSubtree(key: ValueKey(order.id), child: tile);
              }
              return ReorderableDelayedDragStartListener(
                key: ValueKey(order.id),
                index: i,
                child: tile,
              );
            },
          ),
        ),
      ],
    );
  }
}

class _RouteHeader extends StatelessWidget {
  final bool editing;
  final bool saving;
  final bool canEdit;
  final VoidCallback onToggleEdit;
  const _RouteHeader({
    required this.editing,
    required this.saving,
    required this.canEdit,
    required this.onToggleEdit,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: const BoxDecoration(color: _green, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(editing ? 'Arraste para reordenar' : 'Rota em andamento',
              overflow: TextOverflow.ellipsis,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        ),
        const SizedBox(width: 8),
        if (editing)
          ElevatedButton.icon(
            onPressed: saving ? null : onToggleEdit,
            icon: saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.check, size: 18),
            label: const Text('Concluir'),
            style: ElevatedButton.styleFrom(
              backgroundColor: _green,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            ),
          )
        else if (canEdit)
          // Caneta: entra no modo de reordenar as paradas.
          IconButton(
            onPressed: onToggleEdit,
            icon: const Icon(Icons.edit_outlined),
            color: AppTheme.primary,
            tooltip: 'Reordenar rota',
          ),
      ],
    );
  }
}

// Card de resumo com barra de progresso e "tempo em rota" ao vivo.
class _RouteSummaryCard extends StatefulWidget {
  final List<Order> list;
  const _RouteSummaryCard({required this.list});

  @override
  State<_RouteSummaryCard> createState() => _RouteSummaryCardState();
}

class _RouteSummaryCardState extends State<_RouteSummaryCard> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // "Em rota há X" avança sozinho.
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  // Início da rota = retirada (pickedUpAt), que o backend grava no mesmo momento
  // em que a rota recebe `started_at`. Usamos a retirada mais antiga entre os
  // pedidos da rota — equivalente ao `startedAt` da rota.
  DateTime? get _routeStart {
    DateTime? earliest;
    for (final o in widget.list) {
      final t = o.pickedUpAt;
      if (t != null && (earliest == null || t.isBefore(earliest))) earliest = t;
    }
    return earliest;
  }

  @override
  Widget build(BuildContext context) {
    final list = widget.list;
    final total = list.length;
    final done = list.where((o) => o.status == 'DELIVERED').length;
    final faltam = total - done;
    final progress = total == 0 ? 0.0 : done / total;

    final start = _routeStart;
    final elapsed = start == null
        ? null
        : formatWaitDuration(DateTime.now().difference(start).inMinutes);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border:
            const Border.fromBorderSide(BorderSide(color: Color(0xFFE5E7EB))),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 8,
              offset: const Offset(0, 2)),
        ],
      ),
      // Progresso à esquerda; estatísticas (Faltam / Em rota há) na mesma linha,
      // à direita — como no mockup.
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Progresso da rota',
                    style:
                        TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(100),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 8,
                    backgroundColor: const Color(0xFFE5E7EB),
                    valueColor: const AlwaysStoppedAnimation(_green),
                  ),
                ),
                const SizedBox(height: 10),
                Text('$done/$total',
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          const SizedBox(width: 16),
          _SummaryStat(
            icon: Icons.local_shipping_outlined,
            label: 'Faltam',
            value: '$faltam ${faltam == 1 ? 'entrega' : 'entregas'}',
          ),
          if (elapsed != null) ...[
            const SizedBox(width: 16),
            _SummaryStat(
              icon: Icons.schedule,
              label: 'Em rota há',
              value: elapsed,
            ),
          ],
        ],
      ),
    );
  }
}

class _SummaryStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _SummaryStat(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Icon(icon, size: 18, color: Colors.grey.shade500),
        const SizedBox(height: 4),
        Text(label,
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
        const SizedBox(height: 2),
        Text(value,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

// ── Tab "Mapa" ───────────────────────────────────────────────────────────────

class _MapTab extends ConsumerWidget {
  const _MapTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(_activeDeliveryProvider);
    return orders.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => _DeliveryErrorState(
        offline: isNoInternetError(e),
        onRetry: () => ref.invalidate(_activeDeliveryProvider),
      ),
      data: (list) {
        final withCoords = list
            .where((o) => o.customerLat != null && o.customerLng != null)
            .toList();
        if (withCoords.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.map_outlined, size: 56, color: Colors.grey.shade400),
                const SizedBox(height: 12),
                Text('Nenhum ponto com localização disponível',
                    style: TextStyle(color: Colors.grey.shade600)),
              ],
            ),
          );
        }
        final center = LatLng(
          withCoords.map((o) => o.customerLat!).reduce((a, b) => a + b) /
              withCoords.length,
          withCoords.map((o) => o.customerLng!).reduce((a, b) => a + b) /
              withCoords.length,
        );
        return FlutterMap(
          options: MapOptions(initialCenter: center, initialZoom: 13),
          children: [
            appTileLayer(),
            MarkerLayer(
              markers: [
                for (int i = 0; i < list.length; i++)
                  if (list[i].customerLat != null &&
                      list[i].customerLng != null)
                    Marker(
                      point:
                          LatLng(list[i].customerLat!, list[i].customerLng!),
                      width: 160,
                      height: 64,
                      alignment: Alignment.topCenter,
                      child: _MapPin(
                        position: i + 1,
                        name: list[i].customerName,
                        delivered: list[i].status == 'DELIVERED',
                      ),
                    ),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _MapPin extends StatelessWidget {
  final int position;
  final String name;
  final bool delivered;
  const _MapPin(
      {required this.position, required this.name, required this.delivered});

  @override
  Widget build(BuildContext context) {
    final color = delivered ? Colors.grey.shade400 : _green;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withOpacity(0.2),
                  blurRadius: 4,
                  offset: const Offset(0, 2)),
            ],
          ),
          child: Center(
            child: Text('$position',
                style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 13)),
          ),
        ),
        const SizedBox(height: 2),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(6),
            boxShadow: [
              BoxShadow(color: Colors.black.withOpacity(0.15), blurRadius: 3),
            ],
          ),
          child: Text(name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style:
                  const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }
}

// ── Placeholder "em breve" (Histórico / Perfil) ──────────────────────────────

class _ComingSoon extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  const _ComingSoon(
      {required this.icon, required this.title, required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(title,
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(message,
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade600)),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                  color: const Color(0xFFE0E7FF),
                  borderRadius: BorderRadius.circular(100)),
              child: const Text('Em breve',
                  style: TextStyle(
                      color: Color(0xFF4F46E5),
                      fontWeight: FontWeight.w600,
                      fontSize: 13)),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Reportar problema (stub) ─────────────────────────────────────────────────
// TODO: wire backend — ainda não há endpoint para reportar problema da rota.

const _reportReasons = <String>[
  'Endereço não encontrado',
  'Cliente não atende',
  'Problema com o veículo',
  'Outro',
];

class _ReportProblemSheet extends StatefulWidget {
  const _ReportProblemSheet();

  @override
  State<_ReportProblemSheet> createState() => _ReportProblemSheetState();
}

class _ReportProblemSheetState extends State<_ReportProblemSheet> {
  final _noteCtrl = TextEditingController();
  String? _reason;

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    // TODO: wire backend — por ora só confirma localmente.
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Problema reportado ao operador.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final bottomPad = 20 + mq.viewInsets.bottom + mq.viewPadding.bottom;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottomPad),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          const Row(children: [
            Icon(Icons.warning_amber_rounded, color: Color(0xFFDC2626)),
            SizedBox(width: 8),
            Text('Reportar problema',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 16),
          for (final r in _reportReasons)
            RadioListTile<String>(
              value: r,
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v),
              title: Text(r, style: const TextStyle(fontSize: 15)),
              activeColor: const Color(0xFFDC2626),
              contentPadding: EdgeInsets.zero,
              dense: true,
              visualDensity: VisualDensity.compact,
            ),
          const SizedBox(height: 8),
          TextField(
            controller: _noteCtrl,
            maxLines: 3,
            maxLength: 500,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Detalhes (opcional)',
              alignLabelWithHint: true,
              counterText: '',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _reason == null ? null : _submit,
              style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFDC2626)),
              child: const Text('Enviar', style: TextStyle(fontSize: 16)),
            ),
          ),
        ],
      ),
    );
  }
}

class _DeliveryCard extends ConsumerStatefulWidget {
  final Order order;
  final int position;
  final int total;
  final bool expanded;
  final bool isNext;
  final bool editing;
  final bool deliverBlocked;
  final VoidCallback onTap;
  final VoidCallback onDelivered;

  const _DeliveryCard({
    super.key,
    required this.order,
    required this.position,
    required this.total,
    required this.expanded,
    required this.isNext,
    required this.onTap,
    required this.onDelivered,
    this.editing = false,
    this.deliverBlocked = false,
  });

  @override
  ConsumerState<_DeliveryCard> createState() => _DeliveryCardState();
}

class _DeliveryCardState extends ConsumerState<_DeliveryCard> {
  bool _navigating = false;
  bool _returning = false;
  bool _cancelling = false;

  Future<void> _navigateTo() async {
    setState(() => _navigating = true);
    try {
      // Mark as OUT_FOR_DELIVERY before opening maps
      await ApiClient()
          .dio
          .patch('/deliverer/orders/${widget.order.id}/start-route', data: {});
      widget.onDelivered(); // refresh the list
    } catch (_) {}

    Uri uri;
    if (widget.order.customerLat != null && widget.order.customerLng != null) {
      uri = Uri.parse('https://www.google.com/maps/dir/?api=1'
          '&destination=${widget.order.customerLat},${widget.order.customerLng}'
          '&travelmode=driving');
    } else {
      final encoded = Uri.encodeComponent(widget.order.customerAddress);
      uri =
          Uri.parse('https://www.google.com/maps/search/?api=1&query=$encoded');
    }
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Não foi possível abrir o Maps')));
      }
    }
    if (mounted) setState(() => _navigating = false);
  }

  @override
  Widget build(BuildContext context) {
    final isDelivered = widget.order.status == 'DELIVERED';
    // Modo de edição (reordenar): tudo compacto, sombra reforçada, sem expandir.
    if (widget.editing) {
      final card = _buildCompact(delivered: isDelivered, editing: true);
      return isDelivered ? Opacity(opacity: 0.55, child: card) : card;
    }
    if (isDelivered) {
      // Entregue: card compacto e opaco, sem ações (comportamento preservado).
      return Opacity(opacity: 0.55, child: _buildCompact(delivered: true));
    }
    if (widget.expanded) return _buildExpanded();
    return GestureDetector(
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: _buildCompact(delivered: false),
    );
  }

  Widget _numberBadge() {
    final color = widget.order.status == 'DELIVERED'
        ? Colors.grey.shade400
        : widget.isNext
            ? _green
            : AppTheme.primary;
    return CircleAvatar(
      backgroundColor: color,
      radius: 16,
      child: Text('${widget.position}',
          style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 13)),
    );
  }

  Widget _statusBadge() {
    final order = widget.order;
    final isDelivered = order.status == 'DELIVERED';
    final isOut = order.status == 'OUT_FOR_DELIVERY';
    final bg = isDelivered
        ? const Color(0xFFDCFCE7)
        : isOut
            ? const Color(0xFFFFEDD5)
            : const Color(0xFFE0E7FF);
    final txt = isDelivered
        ? 'Entregue'
        : isOut
            ? 'Saiu p/ entrega'
            : 'Em rota';
    final txtColor = isDelivered
        ? const Color(0xFF16A34A)
        : isOut
            ? const Color(0xFFEA580C)
            : const Color(0xFF4F46E5);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(100)),
      child: Text(txt,
          style: TextStyle(
              color: txtColor, fontSize: 12, fontWeight: FontWeight.w500)),
    );
  }

  // Chat do pedido — abre a conversa com o operador da loja.
  Widget _chatButton() {
    final order = widget.order;
    return InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => OrderChatScreen(
            orderId: order.id,
            title: '#${order.shortId}',
          ),
        ),
      ),
      borderRadius: BorderRadius.circular(100),
      child: const Padding(
        padding: EdgeInsets.all(4),
        child: Icon(Icons.chat_bubble_outline, size: 20, color: AppTheme.primary),
      ),
    );
  }

  // Coluna à direita do card: status em cima, botão de chat embaixo.
  Widget _trailing() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        _statusBadge(),
        const SizedBox(height: 6),
        _chatButton(),
      ],
    );
  }

  // Card recolhido: uma linha clicável com badge, nome, endereço e status.
  // Em `editing`, ganha sombra reforçada e uma alça de arrastar no lugar do
  // status/chat, deixando claro que está no modo de reordenar.
  Widget _buildCompact({required bool delivered, bool editing = false}) {
    final order = widget.order;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.fromBorderSide(BorderSide(
            color: editing && !delivered
                ? AppTheme.primary.withOpacity(0.35)
                : const Color(0xFFE5E7EB))),
        boxShadow: [
          editing
              ? BoxShadow(
                  color: Colors.black.withOpacity(0.18),
                  blurRadius: 16,
                  offset: const Offset(0, 6))
              : BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 8,
                  offset: const Offset(0, 2)),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            _numberBadge(),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(order.customerName,
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 15),
                      overflow: TextOverflow.ellipsis),
                  Text('#${order.shortId}',
                      style: TextStyle(
                          color: Colors.grey.shade500,
                          fontSize: 12,
                          fontFamily: 'monospace')),
                  const SizedBox(height: 2),
                  Text(order.customerAddress,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                  // Pedido entregue não precisa mais destacar prioridade.
                  if (order.isPriority && !delivered) ...[
                    const SizedBox(height: 6),
                    PriorityBadge(order: order),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            // Em edição: alça de arrastar (entregues não arrastam); fora: status + chat.
            if (editing)
              delivered
                  ? Icon(Icons.lock_outline, color: Colors.grey.shade400, size: 20)
                  : Icon(Icons.drag_handle, color: Colors.grey.shade500)
            else
              _trailing(),
          ],
        ),
      ),
    );
  }

  // Card expandido ("próxima entrega"): borda verde e todas as ações.
  Widget _buildExpanded() {
    final order = widget.order;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _green, width: 1.5),
        boxShadow: [
          BoxShadow(
              color: _green.withOpacity(0.10),
              blurRadius: 12,
              offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _numberBadge(),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Coroa de prioridade no topo do card ("Próxima entrega").
                      // Entregue não precisa destacar prioridade.
                      if (order.isPriority && order.status != 'DELIVERED')
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: PriorityBadge(order: order),
                        ),
                      if (widget.isNext)
                        const Padding(
                          padding: EdgeInsets.only(bottom: 2),
                          child: Text('PRÓXIMA ENTREGA',
                              style: TextStyle(
                                  color: _green,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.5)),
                        ),
                      Text(order.customerName,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 16),
                          overflow: TextOverflow.ellipsis),
                      Text('#${order.shortId}',
                          style: TextStyle(
                              color: Colors.grey.shade500,
                              fontSize: 12,
                              fontFamily: 'monospace')),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _trailing(),
              ],
            ),
          ),
          // Address
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: Row(
              children: [
                Icon(Icons.location_on_outlined,
                    size: 16, color: Colors.grey.shade500),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(order.customerAddress,
                      style:
                          TextStyle(color: Colors.grey.shade700, fontSize: 13)),
                ),
              ],
            ),
          ),
          // Notes row
          if (order.notes != null && order.notes!.isNotEmpty) _notesRow(),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Divider(height: 1),
          ),
          // Action buttons
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: Row(
              children: [
                // Navigate → sets OUT_FOR_DELIVERY
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _navigating ? null : _navigateTo,
                    icon: _navigating
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.navigation_outlined, size: 18),
                    label: const Text('Navegar'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primary,
                      side: const BorderSide(color: AppTheme.primary),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                // Confirm delivery — mantém todos os checks do fluxo atual
                // (proximidade, código, foto, cobrança de valores).
                Expanded(
                  flex: 2,
                  child: ElevatedButton.icon(
                    onPressed: widget.deliverBlocked
                        ? null
                        : () => _showDeliveryDialog(context),
                    icon: const Icon(Icons.check_circle_outline, size: 18),
                    label: const Text('Confirmar entrega'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _green,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (widget.deliverBlocked)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Row(
                children: [
                  const Icon(Icons.lock_outline,
                      size: 14, color: Color(0xFF92400E)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Conclua a entrega anterior da rota primeiro.',
                      style:
                          TextStyle(fontSize: 12, color: Colors.grey.shade700),
                    ),
                  ),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: Row(
              children: [
                Expanded(
                  child: TextButton.icon(
                    onPressed: (_navigating || _returning || _cancelling)
                        ? null
                        : () => _returnToQueue(context),
                    icon: _returning
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : Icon(Icons.undo_rounded,
                            size: 16, color: Colors.grey.shade500),
                    label: Text('Devolver à fila',
                        style: TextStyle(
                            color: Colors.grey.shade600, fontSize: 13)),
                  ),
                ),
                Expanded(
                  child: TextButton.icon(
                    onPressed: (_navigating || _returning || _cancelling)
                        ? null
                        : () => _showCancelSheet(context),
                    icon: _cancelling
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Color(0xFFDC2626)))
                        : const Icon(Icons.close,
                            size: 16, color: Color(0xFFDC2626)),
                    label: const Text('Cancelar entrega',
                        style: TextStyle(
                            color: Color(0xFFDC2626), fontSize: 13)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _notesRow() {
    return GestureDetector(
      onTap: () => showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Observações'),
          content: Text(widget.order.notes!),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Fechar'),
            ),
          ],
        ),
      ),
      child: const Padding(
        padding: EdgeInsets.fromLTRB(16, 6, 16, 0),
        child: Row(
          children: [
            Icon(Icons.info_outline, size: 15, color: Color(0xFFD97706)),
            SizedBox(width: 6),
            Text(
              'Observações',
              style: TextStyle(
                  fontSize: 13,
                  color: Color(0xFFD97706),
                  fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _returnToQueue(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Devolver pedido?'),
        content: Text(
          'O pedido de ${widget.order.customerName} voltará para a fila e poderá ser pego por outro entregador.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style:
                TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Devolver'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() => _returning = true);
    try {
      await ApiClient().dio.patch(
          '/deliverer/orders/${widget.order.id}/return-to-queue',
          data: {});
      widget.onDelivered();
    } catch (e) {
      messenger.showSnackBar(
        const SnackBar(
            content:
                Text('Não foi possível devolver o pedido. Tente novamente.')),
      );
    } finally {
      if (mounted) setState(() => _returning = false);
    }
  }

  Future<void> _showCancelSheet(BuildContext context) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _CancelDeliverySheet(
        order: widget.order,
        onCancelled: widget.onDelivered,
      ),
    );
  }

  Future<void> _showDeliveryDialog(BuildContext context) async {
    // Se o pedido tiver observação, mostra um aviso antes de abrir a confirmação.
    final notes = widget.order.notes?.trim();
    if (notes != null && notes.isNotEmpty) {
      await showDialog<void>(
        context: context,
        barrierDismissible: false, // força ler — só sai pelo botão após o tempo
        builder: (_) => _ObservationDialog(notes: notes),
      );
      if (!mounted) return;
    }

    ref.invalidate(storeSettingsProvider);
    try {
      final settings = await ref.read(storeSettingsProvider.future);
      if (!mounted) return;
      await showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (_) => _DeliveryConfirmSheet(
          order: widget.order,
          requireDeliveryCode: settings.requireDeliveryCode,
          requireDeliveryPhoto: settings.requireDeliveryPhoto,
          maxProofPhotos: settings.maxProofPhotos,
          requireProximity: settings.deliveryRequireProximity,
          proximityMeters: settings.delayProximityMeters,
          onDelivered: widget.onDelivered,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      final noInternet = isNoInternetError(e);
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: Icon(
            noInternet ? Icons.wifi_off_rounded : Icons.error_outline,
            size: 48,
            color: noInternet ? const Color(0xFFEA580C) : Colors.red.shade400,
          ),
          title: Text(noInternet ? 'Sem conexão' : 'Erro'),
          content: Text(
            noInternet ? kNoInternetMessage : 'Não foi possível carregar as configurações. Tente novamente.',
            textAlign: TextAlign.center,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    }
  }
}

// Forces the deliverer to actually read the order's note: the "Entendi" button
// stays disabled with a 3s loading countdown in the footer before it can be tapped.
class _ObservationDialog extends StatefulWidget {
  final String notes;
  const _ObservationDialog({required this.notes});

  @override
  State<_ObservationDialog> createState() => _ObservationDialogState();
}

class _ObservationDialogState extends State<_ObservationDialog> {
  static const _seconds = 3;
  int _remaining = _seconds;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_remaining <= 1) {
        t.cancel();
        setState(() => _remaining = 0);
      } else {
        setState(() => _remaining--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ready = _remaining == 0;
    return AlertDialog(
      title: Row(
        children: const [
          Icon(Icons.info_outline, color: Color(0xFFD97706)),
          SizedBox(width: 8),
          Text('Observação'),
        ],
      ),
      content: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFBEB),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFFCD34D)),
        ),
        child: Text(
          widget.notes,
          style: const TextStyle(
            fontSize: 18,
            height: 1.4,
            fontWeight: FontWeight.w600,
            color: Color(0xFF92400E),
          ),
        ),
      ),
      actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      actions: [
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: ready ? () => Navigator.pop(context) : null,
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            child: ready
                ? const Text('Entendi', style: TextStyle(fontSize: 16))
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.grey.shade500),
                      ),
                      const SizedBox(width: 10),
                      Text('Leia a observação… ${_remaining}s',
                          style: const TextStyle(fontSize: 15)),
                    ],
                  ),
          ),
        ),
      ],
    );
  }
}

class _DeliveryConfirmSheet extends StatefulWidget {
  final Order order;
  final bool requireDeliveryCode;
  final bool requireDeliveryPhoto;
  final int maxProofPhotos;
  final bool requireProximity;
  final int proximityMeters;
  final VoidCallback onDelivered;
  const _DeliveryConfirmSheet({
    required this.order,
    required this.requireDeliveryCode,
    required this.requireDeliveryPhoto,
    this.maxProofPhotos = 2,
    this.requireProximity = false,
    this.proximityMeters = 100,
    required this.onDelivered,
  });

  @override
  State<_DeliveryConfirmSheet> createState() => _DeliveryConfirmSheetState();
}

class _PaymentLine {
  final TextEditingController amountCtrl = TextEditingController();
  String method = 'cash';
}

class _DeliveryConfirmSheetState extends State<_DeliveryConfirmSheet> {
  final _codeCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  // Lista dinâmica de pagamentos recebidos (ex.: Pix + dinheiro na mesma entrega).
  final List<_PaymentLine> _payments = [];
  final List<XFile> _photos = [];
  bool _loading = false;
  bool _collectPayment = false;
  String? _error;

  @override
  void dispose() {
    _codeCtrl.dispose();
    _noteCtrl.dispose();
    for (final p in _payments) {
      p.amountCtrl.dispose();
    }
    super.dispose();
  }

  void _togglePayment() {
    setState(() {
      _collectPayment = !_collectPayment;
      if (_collectPayment && _payments.isEmpty) {
        _payments.add(_PaymentLine());
      }
    });
  }

  void _addPaymentLine() => setState(() {
        final line = _PaymentLine();
        // Dinheiro só pode haver um; se já existe, o novo começa em Pix.
        if (_payments.any((p) => p.method == 'cash')) line.method = 'pix';
        _payments.add(line);
      });

  void _removePaymentLine(int index) {
    setState(() {
      _payments[index].amountCtrl.dispose();
      _payments.removeAt(index);
      if (_payments.isEmpty) _collectPayment = false;
    });
  }

  double get _paymentsTotal => _payments.fold(
        0,
        (sum, p) =>
            sum +
            (double.tryParse(p.amountCtrl.text.trim().replaceAll(',', '.')) ??
                0),
      );

  Future<void> _takePhoto() async {
    if (_photos.length >= widget.maxProofPhotos) return;
    final f = await ImagePicker().pickImage(
        source: ImageSource.camera, maxWidth: 1280, imageQuality: 60);
    if (f != null) setState(() => _photos.add(f));
  }

  void _removePhoto(int index) {
    setState(() => _photos.removeAt(index));
  }

  // Aviso quando o entregador está longe (regra de proximidade só avisa, não bloqueia).
  Future<bool?> _confirmFarAway(int meters) {
    return showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        icon: const Icon(Icons.location_off_outlined,
            size: 36, color: Color(0xFFEA580C)),
        title: const Text('Você está longe do endereço'),
        content: Text(
          'Você está a aproximadamente $meters m do endereço de entrega '
          '(recomendado até ${widget.proximityMeters} m). Deseja marcar como entregue mesmo assim?',
          textAlign: TextAlign.center,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx, false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogCtx, true),
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFEA580C)),
            child: const Text('Estou ciente'),
          ),
        ],
      ),
    );
  }

  // Aviso quando o valor recebido é menor que o esperado.
  // Retorna o motivo preenchido se confirmou, ou null se cancelou.
  Future<String?> _confirmShortPayment(double collected, double expected) {
    final noteCtrl = TextEditingController();
    String? noteError;
    return showDialog<String>(
      context: context,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          icon: const Icon(Icons.warning_amber_rounded,
              size: 36, color: Color(0xFFEA580C)),
          title: const Text('Valor recebido menor que o esperado'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Você informou R\$${collected.toStringAsFixed(2)}, mas o '
                'valor esperado era R\$${expected.toStringAsFixed(2)}. '
                'O operador será notificado dessa divergência.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: noteCtrl,
                decoration: InputDecoration(
                  labelText: 'Motivo (obrigatório)',
                  errorText: noteError,
                  border: const OutlineInputBorder(),
                ),
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar'),
            ),
            ElevatedButton(
              onPressed: () {
                if (noteCtrl.text.trim().isEmpty) {
                  setDialogState(() => noteError = 'Informe o motivo');
                  return;
                }
                Navigator.pop(ctx, noteCtrl.text.trim());
              },
              style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFEA580C)),
              child: const Text('Estou ciente'),
            ),
          ],
        ),
      ),
    ).then((r) {
      noteCtrl.dispose();
      return r;
    });
  }

  Future<void> _confirm() async {
    final code = _codeCtrl.text.trim().toUpperCase();
    if (widget.requireDeliveryCode && code.length != 4) {
      setState(() => _error = 'Informe os 4 últimos dígitos do telefone');
      return;
    }
    if (widget.requireDeliveryPhoto && _photos.isEmpty) {
      setState(() => _error = 'Foto de comprovante é obrigatória');
      return;
    }
    if (_collectPayment) {
      final hasValid = _payments.any((p) {
        final amount =
            double.tryParse(p.amountCtrl.text.trim().replaceAll(',', '.'));
        return amount != null && amount > 0;
      });
      if (!hasValid) {
        setState(() => _error = 'Informe o valor recebido');
        return;
      }
    }
    // Proximidade: valida a distância até o endereço antes de concluir.
    Position? pos;
    try {
      pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high);
    } catch (_) {}

    final destLat = widget.order.customerLat;
    final destLng = widget.order.customerLng;
    if (destLat != null && destLng != null) {
      if (widget.requireProximity && pos == null) {
        setState(() => _error =
            'Não foi possível confirmar sua localização. Ative o GPS e tente novamente.');
        return;
      }
      if (pos != null) {
        final dist = Geolocator.distanceBetween(
            pos.latitude, pos.longitude, destLat, destLng);
        if (dist > widget.proximityMeters) {
          if (widget.requireProximity) {
            setState(() => _error =
                'Você está a ${dist.round()} m do endereço; é necessário estar a até ${widget.proximityMeters} m para concluir a entrega.');
            return;
          }
          final proceed = await _confirmFarAway(dist.round());
          if (proceed != true || !mounted) return;
        }
      }
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final List<String> photoUrls = [];
      const maxBytes = 10 * 1024 * 1024;
      for (final photo in _photos) {
        final bytes = await photo.readAsBytes();
        if (bytes.length > maxBytes) {
          setState(() {
            _error =
                'Uma das fotos é muito grande (máx. 10 MB). Tente novamente.';
            _loading = false;
          });
          return;
        }
        photoUrls.add('data:image/jpeg;base64,${base64Encode(bytes)}');
      }

      // Monta a lista de pagamentos válidos (valor > 0).
      final payments = _collectPayment
          ? _payments
              .map((p) => {
                    'amount': double.tryParse(
                        p.amountCtrl.text.trim().replaceAll(',', '.')),
                    'method': p.method,
                  })
              .where((p) => (p['amount'] as double?) != null &&
                  (p['amount'] as double) > 0)
              .toList()
          : <Map<String, dynamic>>[];

      String note = _noteCtrl.text.trim();

      // Alerta quando o valor recebido é menor que o esperado.
      if (payments.isNotEmpty) {
        final totalCollected =
            payments.fold<double>(0, (sum, p) => sum + (p['amount'] as double));
        final expected = widget.order.cashAmount;
        if (expected != null && expected > 0 && totalCollected < expected) {
          final shortNote = await _confirmShortPayment(totalCollected, expected);
          if (shortNote == null || !mounted) return;
          note = shortNote;
        }
      }

      await ApiClient().dio.post(
        '/deliverer/orders/${widget.order.id}/deliver',
        data: {
          'code': code,
          if (photoUrls.isNotEmpty) 'photoUrls': photoUrls,
          if (pos != null) 'lat': pos.latitude,
          if (pos != null) 'lng': pos.longitude,
          if (note.isNotEmpty) 'note': note,
          if (widget.order.isCash || widget.order.cashAmount != null)
            'cashCollected': true,
          if (payments.isNotEmpty) 'payments': payments,
        },
        options: Options(
          // Uploads de fotos em base64 podem demorar; evita timeout que levaria
          // o entregador a reenviar e (antes) duplicar registros.
          sendTimeout: const Duration(seconds: 60),
          receiveTimeout: const Duration(seconds: 60),
        ),
      );

      widget.onDelivered();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      final msg = isNoInternetError(e)
          ? kNoInternetMessage
          : ((e as dynamic).response?.data?['error'] as String? ?? 'Código incorreto');
      setState(() {
        _error = msg;
        _loading = false;
      });
    }
  }

  Widget _buildPaymentCollection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: _togglePayment,
          child: Row(
            children: [
              Icon(
                _collectPayment
                    ? Icons.check_box
                    : Icons.check_box_outline_blank,
                size: 22,
                color: _collectPayment
                    ? const Color(0xFF16A34A)
                    : Colors.grey.shade400,
              ),
              const SizedBox(width: 8),
              Text('Recebi pagamento',
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w500)),
            ],
          ),
        ),
        if (_collectPayment) ...[
          const SizedBox(height: 12),
          for (int i = 0; i < _payments.length; i++) ...[
            _buildPaymentLine(i),
            const SizedBox(height: 12),
          ],
          // Botão para registrar mais um pagamento (ex.: parte Pix, parte dinheiro).
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _addPaymentLine,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Adicionar pagamento'),
              style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFF16A34A),
                  padding: EdgeInsets.zero),
            ),
          ),
          if (_payments.length > 1) ...[
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total',
                    style: TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w600)),
                Text(
                  'R\$ ${_paymentsTotal.toStringAsFixed(2).replaceAll('.', ',')}',
                  style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF16A34A)),
                ),
              ],
            ),
          ],
        ],
      ],
    );
  }

  Widget _buildPaymentLine(int index) {
    final line = _payments[index];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: line.amountCtrl,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) => setState(() {}), // atualiza o total
                decoration: InputDecoration(
                  labelText: 'Valor recebido',
                  hintText: '0,00',
                  prefixText: 'R\$ ',
                  prefixStyle: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF111827)),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12)),
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 14),
                ),
                style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 18,
                    fontWeight: FontWeight.bold),
              ),
            ),
            if (_payments.length > 1)
              IconButton(
                onPressed: () => _removePaymentLine(index),
                icon: const Icon(Icons.delete_outline),
                color: Colors.red.shade400,
                tooltip: 'Remover',
              ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            _methodChip(index, 'cash', 'Dinheiro'),
            const SizedBox(width: 10),
            _methodChip(index, 'pix', 'Pix'),
            const SizedBox(width: 10),
            _methodChip(index, 'card', 'Cartão'),
          ],
        ),
      ],
    );
  }

  // Dinheiro só pode ser recebido em um único pagamento (não dá para receber
  // "troco" em dois caixas). Pix e cartão podem se repetir à vontade.
  bool _cashTakenBy(int exceptIndex) => _payments
      .asMap()
      .entries
      .any((e) => e.key != exceptIndex && e.value.method == 'cash');

  Widget _methodChip(int index, String value, String label) {
    final selected = _payments[index].method == value;
    final blocked = value == 'cash' && !selected && _cashTakenBy(index);
    return GestureDetector(
      onTap: blocked
          ? null
          : () => setState(() => _payments[index].method = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.primary
              : blocked
                  ? Colors.grey.shade100
                  : Colors.transparent,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(
            color: selected
                ? AppTheme.primary
                : blocked
                    ? const Color(0xFFE5E7EB)
                    : const Color(0xFFD1D5DB),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: selected
                ? Colors.white
                : blocked
                    ? Colors.grey.shade400
                    : Colors.grey.shade700,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final bottomPad = 20 + mq.viewInsets.bottom + mq.viewPadding.bottom;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottomPad),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          Text('Confirmar entrega — ${widget.order.customerName}',
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text('#${widget.order.shortId} · ${widget.order.customerAddress}',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          const SizedBox(height: 16),

          // Payment info — cobrança pelo entregador
          if (widget.order.paymentMethod != 'prepaid') ...[
            if (widget.order.cashAmount != null && widget.order.cashAmount! > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFBEB),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFF59E0B)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.payments_outlined,
                        size: 20, color: Color(0xFFD97706)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Cobrar R\$ ${widget.order.cashAmount!.toStringAsFixed(2).replaceAll('.', ',')}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          color: Color(0xFF92400E),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            _buildPaymentCollection(),
            const SizedBox(height: 16),
          ],

          if (widget.requireDeliveryCode) ...[
            TextField(
              controller: _codeCtrl,
              maxLength: 4,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Últimos 4 dígitos do telefone',
                hintText: '0000',
                counterText: '',
                prefixIcon: Icon(Icons.phone_outlined),
              ),
              style: const TextStyle(
                  fontFamily: 'monospace',
                  letterSpacing: 6,
                  fontSize: 20,
                  fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
          ],

          if (widget.requireDeliveryPhoto || widget.maxProofPhotos > 1) ...[
            _PhotoSection(
              photos: _photos,
              maxPhotos: widget.maxProofPhotos,
              required: widget.requireDeliveryPhoto,
              hasError: _photos.isEmpty && _error != null,
              onAdd: _takePhoto,
              onRemove: _removePhoto,
            ),
            const SizedBox(height: 12),
          ],

          TextField(
            controller: _noteCtrl,
            maxLines: 2,
            maxLength: 500,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Observação (opcional)',
              hintText: 'Ex: deixado com porteiro, cliente ausente...',
              alignLabelWithHint: true,
              counterText: '',
              prefixIcon: const Icon(Icons.notes_outlined),
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!,
                style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
          ],

          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _loading ? null : _confirm,
              style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF16A34A)),
              child: _loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2))
                  : const Text('Confirmar entrega',
                      style: TextStyle(fontSize: 16)),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Photo section widget ─────────────────────────────────────────────────────

class _PhotoSection extends StatelessWidget {
  final List<XFile> photos;
  final int maxPhotos;
  final bool required;
  final bool hasError;
  final VoidCallback onAdd;
  final void Function(int) onRemove;

  const _PhotoSection({
    required this.photos,
    required this.maxPhotos,
    required this.required,
    required this.hasError,
    required this.onAdd,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final canAdd = photos.length < maxPhotos;
    final label = required
        ? 'Foto de comprovante (obrigatória)'
        : 'Foto de comprovante (opcional)';
    final countLabel =
        maxPhotos > 1 ? '${photos.length}/$maxPhotos fotos' : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label,
                style: TextStyle(
                    fontSize: 13,
                    color: hasError
                        ? const Color(0xFFDC2626)
                        : Colors.grey.shade600)),
            if (countLabel != null) ...[
              const Spacer(),
              Text(countLabel,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
            ],
          ],
        ),
        const SizedBox(height: 8),
        if (photos.isEmpty && !canAdd)
          const SizedBox.shrink()
        else
          SizedBox(
            height: 80,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                // Existing photos
                for (int i = 0; i < photos.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Image.file(
                            File(photos[i].path),
                            width: 80,
                            height: 80,
                            fit: BoxFit.cover,
                          ),
                        ),
                        Positioned(
                          top: 2,
                          right: 2,
                          child: GestureDetector(
                            onTap: () => onRemove(i),
                            child: Container(
                              decoration: const BoxDecoration(
                                color: Colors.black54,
                                shape: BoxShape.circle,
                              ),
                              padding: const EdgeInsets.all(2),
                              child: const Icon(Icons.close,
                                  size: 14, color: Colors.white),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                // Add button
                if (canAdd)
                  GestureDetector(
                    onTap: onAdd,
                    child: Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: hasError && photos.isEmpty
                              ? const Color(0xFFDC2626)
                              : Colors.grey.shade300,
                          style: BorderStyle.solid,
                        ),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.camera_alt_outlined,
                              color: Colors.grey.shade400, size: 24),
                          const SizedBox(height: 4),
                          Text('Adicionar',
                              style: TextStyle(
                                  color: Colors.grey.shade500, fontSize: 11)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

// ── Bottom sheet de cancelamento ─────────────────────────────────────────────

class _CancelDeliverySheet extends StatefulWidget {
  final Order order;
  final VoidCallback onCancelled;
  const _CancelDeliverySheet({required this.order, required this.onCancelled});

  @override
  State<_CancelDeliverySheet> createState() => _CancelDeliverySheetState();
}

// Motivos de cancelamento (código → label). Mesmos códigos do backend.
const _cancelReasons = <({String code, String label})>[
  (code: 'MISSING_ITEM', label: 'Pedido faltando'),
  (code: 'WRONG_ORDER', label: 'Cliente/Pedido errado'),
  (code: 'OTHER', label: 'Outro'),
];

class _CancelDeliverySheetState extends State<_CancelDeliverySheet> {
  final _noteCtrl = TextEditingController();
  String? _reasonCode;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _cancel() async {
    final reasonCode = _reasonCode;
    if (reasonCode == null) {
      setState(() => _error = 'Selecione o motivo do cancelamento');
      return;
    }
    final note = _noteCtrl.text.trim();
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      Position? pos;
      try {
        pos = await Geolocator.getCurrentPosition(
            desiredAccuracy: LocationAccuracy.high);
      } catch (_) {}

      await ApiClient().dio.post(
        '/deliverer/orders/${widget.order.id}/cancel-v2',
        data: {
          'reasonCode': reasonCode,
          if (reasonCode == 'OTHER' && note.isNotEmpty) 'note': note,
          if (pos != null) 'lat': pos.latitude,
          if (pos != null) 'lng': pos.longitude,
        },
      );

      widget.onCancelled();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      final msg = (e as dynamic).response?.data?['error'] as String? ??
          'Erro ao cancelar. Tente novamente.';
      setState(() {
        _error = msg;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final bottomPad = 20 + mq.viewInsets.bottom + mq.viewPadding.bottom;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottomPad),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          Row(children: [
            const Icon(Icons.close, color: Color(0xFFDC2626), size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Cancelar entrega — ${widget.order.customerName}',
                  style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFFDC2626))),
            ),
          ]),
          const SizedBox(height: 4),
          Text('#${widget.order.shortId} · ${widget.order.customerAddress}',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          const SizedBox(height: 20),
          Text('Motivo do cancelamento',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade700)),
          const SizedBox(height: 8),
          for (final reason in _cancelReasons)
            RadioListTile<String>(
              value: reason.code,
              groupValue: _reasonCode,
              onChanged: _loading
                  ? null
                  : (v) => setState(() {
                        _reasonCode = v;
                        _error = null;
                      }),
              title: Text(reason.label, style: const TextStyle(fontSize: 15)),
              activeColor: const Color(0xFFDC2626),
              contentPadding: EdgeInsets.zero,
              dense: true,
              visualDensity: VisualDensity.compact,
            ),
          if (_reasonCode == 'OTHER') ...[
            const SizedBox(height: 8),
            TextField(
              controller: _noteCtrl,
              maxLines: 3,
              maxLength: 500,
              autofocus: true,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                labelText: 'Descreva o motivo (opcional)',
                hintText: 'Ex: cliente recusou, endereço não encontrado...',
                alignLabelWithHint: true,
                counterText: '',
                prefixIcon:
                    const Icon(Icons.notes_outlined, color: Color(0xFFDC2626)),
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide:
                      const BorderSide(color: Color(0xFFDC2626), width: 2),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFFFCDD2)),
                ),
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!,
                style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _loading ? null : _cancel,
              style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFDC2626)),
              child: _loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2))
                  : const Text('Confirmar cancelamento',
                      style: TextStyle(fontSize: 16)),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyDeliveryState extends StatelessWidget {
  final VoidCallback onGoOrders;
  const _EmptyDeliveryState({required this.onGoOrders});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_circle_outline,
                size: 64, color: Color(0xFF16A34A)),
            const SizedBox(height: 16),
            const Text('Todas as entregas concluídas!',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text('Volte para receber novos pedidos',
                style: TextStyle(color: Colors.grey.shade600)),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onGoOrders,
              icon: const Icon(Icons.inbox_outlined),
              label: const Text('Ver pedidos disponíveis'),
            ),
          ],
        ),
      ),
    );
  }
}

class _DeliveryErrorState extends StatelessWidget {
  final bool offline;
  final VoidCallback onRetry;
  const _DeliveryErrorState({required this.offline, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(offline ? Icons.wifi_off_rounded : Icons.error_outline,
                size: 64, color: offline ? const Color(0xFFEA580C) : Colors.red.shade400),
            const SizedBox(height: 16),
            Text(offline ? 'Sem conexão com a internet' : 'Não foi possível carregar',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              offline
                  ? 'Verifique sua conexão e tente novamente.'
                  : 'Ocorreu um erro ao carregar as entregas. Tente novamente.',
              style: TextStyle(color: Colors.grey.shade600),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Tentar novamente'),
            ),
          ],
        ),
      ),
    );
  }
}

class _BrandTitle extends StatelessWidget {
  final String brand;
  final String subtitle;
  const _BrandTitle({required this.brand, required this.subtitle});

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(brand,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          Text(subtitle,
              style: const TextStyle(fontSize: 11, color: Colors.white70)),
        ],
      );
}
