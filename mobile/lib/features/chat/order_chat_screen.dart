import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';

// Mensagem do chat do pedido (espelha o payload do backend).
class _ChatMessage {
  final String id;
  final String senderType; // 'store_user' | 'deliverer'
  final String senderName;
  final String body;
  final DateTime? createdAt;

  _ChatMessage({
    required this.id,
    required this.senderType,
    required this.senderName,
    required this.body,
    this.createdAt,
  });

  bool get isMine => senderType == 'deliverer';

  factory _ChatMessage.fromJson(Map<String, dynamic> j) => _ChatMessage(
        id:         j['id'] as String,
        senderType: j['senderType'] as String,
        senderName: j['senderName'] as String? ?? '',
        body:       j['body'] as String? ?? '',
        createdAt:  DateTime.tryParse(j['createdAt'] as String? ?? '')?.toLocal(),
      );
}

class OrderChatScreen extends StatefulWidget {
  final String orderId;
  final String title; // ex.: "#A1B2C3D4" ou nome do cliente
  const OrderChatScreen({super.key, required this.orderId, required this.title});

  @override
  State<OrderChatScreen> createState() => _OrderChatScreenState();
}

class _OrderChatScreenState extends State<OrderChatScreen> {
  final _api      = ApiClient();
  final _textCtrl = TextEditingController();
  final _scroll   = ScrollController();

  List<_ChatMessage> _messages = [];
  bool _loading = true;
  bool _sending = false;
  Timer? _poll;

  String get _base => '/deliverer/orders/${widget.orderId}/chat';

  @override
  void initState() {
    super.initState();
    _load(initial: true);
    // Enquanto o chat está aberto, verifica novas mensagens periodicamente.
    _poll = Timer.periodic(const Duration(seconds: 5), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _textCtrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool initial = false}) async {
    try {
      final res = await _api.dio.get(_base);
      final list = (res.data as List)
          .map((e) => _ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList();
      if (!mounted) return;
      final grew = list.length != _messages.length;
      setState(() {
        _messages = list;
        _loading = false;
      });
      if (grew) _scrollToBottom();
      // Marca as mensagens do operador como lidas (best-effort).
      unawaited(_markRead());
    } catch (_) {
      if (mounted && initial) setState(() => _loading = false);
    }
  }

  Future<void> _markRead() async {
    try {
      await _api.dio.post('$_base/read');
    } catch (_) {
      /* non-fatal */
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _send() async {
    final body = _textCtrl.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await _api.dio.post(_base, data: {'body': body});
      _textCtrl.clear();
      await _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Não foi possível enviar a mensagem')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  String _time(DateTime? d) {
    if (d == null) return '';
    return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(title: Text('Chat ${widget.title}')),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? Center(
                        child: Text('Nenhuma mensagem ainda.',
                            style: TextStyle(color: Colors.grey.shade500)),
                      )
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(12),
                        itemCount: _messages.length,
                        itemBuilder: (_, i) => _bubble(_messages[i]),
                      ),
          ),
          _composer(),
        ],
      ),
    );
  }

  Widget _bubble(_ChatMessage m) {
    final mine = m.isMine;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: mine ? AppTheme.primary : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(mine ? 14 : 4),
            bottomRight: Radius.circular(mine ? 4 : 14),
          ),
          border: mine
              ? null
              : Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(mine ? 'Você' : m.senderName,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: mine ? Colors.white70 : Colors.grey.shade500)),
            const SizedBox(height: 2),
            Text(m.body,
                style: TextStyle(
                    fontSize: 14,
                    color: mine ? Colors.white : const Color(0xFF1F2937))),
            const SizedBox(height: 2),
            Text(_time(m.createdAt),
                style: TextStyle(
                    fontSize: 10,
                    color: mine ? Colors.white60 : Colors.grey.shade400)),
          ],
        ),
      ),
    );
  }

  Widget _composer() {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Color(0xFFE5E7EB))),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: _textCtrl,
                minLines: 1,
                maxLines: 4,
                maxLength: 2000,
                textInputAction: TextInputAction.newline,
                decoration: const InputDecoration(
                  hintText: 'Escreva uma mensagem…',
                  counterText: '',
                  border: OutlineInputBorder(),
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
              ),
            ),
            const SizedBox(width: 8),
            _sending
                ? const Padding(
                    padding: EdgeInsets.all(10),
                    child: SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                : IconButton(
                    onPressed: _send,
                    icon: const Icon(Icons.send),
                    color: AppTheme.primary,
                  ),
          ],
        ),
      ),
    );
  }
}
