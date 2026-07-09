import 'package:flutter/material.dart';

/// Renderizador de markdown enxuto, compartilhado entre a tela de termos e o
/// popup de avisos. Suporta: # / ## títulos, "- " listas, _itálico de linha_,
/// **negrito** inline e parágrafos. Mantém o mesmo subconjunto do painel web.
class MarkdownText extends StatelessWidget {
  final String data;
  final Color textColor;

  const MarkdownText(this.data, {super.key, this.textColor = Colors.black87});

  @override
  Widget build(BuildContext context) {
    final widgets = <Widget>[];
    for (final raw in data.split('\n')) {
      final line = raw.trimRight();
      if (line.isEmpty) {
        widgets.add(const SizedBox(height: 10));
      } else if (line.startsWith('## ')) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 4),
          child: Text(line.substring(3),
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: textColor)),
        ));
      } else if (line.startsWith('# ')) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Text(line.substring(2),
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: textColor)),
        ));
      } else if (line.startsWith('- ')) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(left: 8, top: 2, bottom: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('•  ', style: TextStyle(color: textColor)),
              Expanded(child: _inline(line.substring(2))),
            ],
          ),
        ));
      } else if (line.startsWith('_') && line.endsWith('_') && line.length > 1) {
        widgets.add(Text(line.substring(1, line.length - 1),
            style: TextStyle(color: textColor.withValues(alpha: 0.6), fontStyle: FontStyle.italic)));
      } else {
        widgets.add(Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: _inline(line)));
      }
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: widgets);
  }

  // Negrito **inline** (e itálico *inline*).
  Widget _inline(String text) {
    final spans = <TextSpan>[];
    // Primeiro quebra por **negrito**; cada pedaço pode ter *itálico*.
    for (var i = 0; i < text.split('**').length; i++) {
      final bold = i.isOdd;
      final chunk = text.split('**')[i];
      for (var j = 0; j < chunk.split('*').length; j++) {
        final italic = j.isOdd;
        final piece = chunk.split('*')[j];
        if (piece.isEmpty) continue;
        spans.add(TextSpan(
          text: piece,
          style: TextStyle(
            fontWeight: bold ? FontWeight.bold : FontWeight.normal,
            fontStyle: italic ? FontStyle.italic : FontStyle.normal,
          ),
        ));
      }
    }
    return RichText(
      text: TextSpan(
        style: TextStyle(color: textColor, fontSize: 15, height: 1.4),
        children: spans,
      ),
    );
  }
}
