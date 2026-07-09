import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../core/models/order.dart';

/// Coroa de prioridade para o entregador. Âmbar normalmente; vermelha quando o
/// horário máximo de entrega já passou. Mostra o prazo (hora) quando definido.
class PriorityBadge extends StatelessWidget {
  final Order order;
  const PriorityBadge({super.key, required this.order});

  static String _twoDigits(int n) => n.toString().padLeft(2, '0');

  @override
  Widget build(BuildContext context) {
    final overdue = order.isOverdue;
    final (Color bg, Color fg) = overdue
        ? (const Color(0xFFFEE2E2), const Color(0xFFB91C1C))
        : (const Color(0xFFFEF3C7), const Color(0xFF92400E));

    final max = order.maxDeliveryTime;
    final label = max != null
        ? 'Prioridade · até ${_twoDigits(max.hour)}:${_twoDigits(max.minute)}'
        : 'Prioridade';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(LucideIcons.crown, size: 13, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg),
          ),
        ],
      ),
    );
  }
}
