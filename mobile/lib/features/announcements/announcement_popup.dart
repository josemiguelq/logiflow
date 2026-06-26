import 'package:flutter/material.dart';
import '../../core/models/announcement.dart';
import '../../widgets/markdown_text.dart';

Color _parseColor(String? hex, Color fallback) {
  if (hex == null) return fallback;
  var h = hex.replaceFirst('#', '');
  if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
  if (h.length == 6) h = 'FF$h';
  final v = int.tryParse(h, radix: 16);
  return v == null ? fallback : Color(v);
}

/// Mostra o carrossel de comunicados não lidos. Para cada um, ao tocar em
/// "Entendi" chama [onRead] e avança; ao terminar todos, fecha.
Future<void> showAnnouncementsCarousel(
  BuildContext context,
  List<Announcement> announcements, {
  required Future<void> Function(String id) onRead,
}) {
  if (announcements.isEmpty) return Future.value();
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _AnnouncementsCarousel(announcements: announcements, onRead: onRead),
  );
}

class _AnnouncementsCarousel extends StatefulWidget {
  final List<Announcement> announcements;
  final Future<void> Function(String id) onRead;
  const _AnnouncementsCarousel({required this.announcements, required this.onRead});

  @override
  State<_AnnouncementsCarousel> createState() => _AnnouncementsCarouselState();
}

class _AnnouncementsCarouselState extends State<_AnnouncementsCarousel> {
  final _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _acknowledge() async {
    final announcement = widget.announcements[_index];
    await widget.onRead(announcement.id);
    if (!mounted) return;
    if (_index >= widget.announcements.length - 1) {
      Navigator.of(context).pop();
    } else {
      _controller.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 380, maxHeight: 560),
        child: PageView.builder(
          controller: _controller,
          onPageChanged: (i) => setState(() => _index = i),
          itemCount: widget.announcements.length,
          itemBuilder: (_, i) => _AnnouncementCard(
            announcement: widget.announcements[i],
            total: widget.announcements.length,
            index: i,
            onAck: _acknowledge,
          ),
        ),
      ),
    );
  }
}

class _AnnouncementCard extends StatelessWidget {
  final Announcement announcement;
  final int total;
  final int index;
  final VoidCallback onAck;
  const _AnnouncementCard({required this.announcement, required this.total, required this.index, required this.onAck});

  @override
  Widget build(BuildContext context) {
    final accent = _parseColor(announcement.accentColor, const Color(0xFF2563EB));
    final bg     = _parseColor(announcement.backgroundColor, Colors.white);
    final text   = _parseColor(announcement.textColor, const Color(0xFF111827));

    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(height: 6, color: accent),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (announcement.emoji != null && announcement.emoji!.isNotEmpty)
                    Text(announcement.emoji!, style: const TextStyle(fontSize: 32)),
                  if (announcement.title != null && announcement.title!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 6, bottom: 8),
                      child: Text(announcement.title!,
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: text)),
                    ),
                  MarkdownText(announcement.body, textColor: text),
                ],
              ),
            ),
          ),
          if (total > 1)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(total, (i) => Container(
                  width: 7, height: 7,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: i == index ? accent : accent.withValues(alpha: 0.25),
                  ),
                )),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: onAck,
                style: ElevatedButton.styleFrom(
                  backgroundColor: accent,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text(
                  index >= total - 1 ? 'Entendi' : 'Entendi, próximo',
                  style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
