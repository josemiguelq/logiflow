import 'package:flutter_test/flutter_test.dart';
import 'package:logiflow_mobile/features/orders/order_selection_controller.dart';

void main() {
  group('OrderSelectionController', () {

    // ── optimistic reserve ──────────────────────────────────────────────────

    group('optimisticReserve', () {
      test('adds orderId to selected before API returns', () {
        final ctrl = const OrderSelectionController().optimisticReserve('order-1');
        expect(ctrl.isSelected('order-1'), isTrue);
      });

      test('is idempotent — does not duplicate', () {
        final ctrl = const OrderSelectionController()
            .optimisticReserve('order-1')
            .optimisticReserve('order-1');
        expect(ctrl.selected.where((id) => id == 'order-1').length, equals(1));
      });
    });

    group('rollbackReserve', () {
      test('removes orderId when API call fails', () {
        final ctrl = const OrderSelectionController()
            .optimisticReserve('order-1')
            .rollbackReserve('order-1');
        expect(ctrl.isSelected('order-1'), isFalse);
      });
    });

    // ── WS race condition — the core regression ─────────────────────────────

    group('onWsOrderReserved — race condition', () {
      test('does NOT hide an order that is already in selected', () {
        // Simulates: optimistic add happens, THEN WS event arrives
        final ctrl = const OrderSelectionController()
            .optimisticReserve('order-1')       // optimistic add
            .onWsOrderReserved('order-1');      // WS fires while awaiting API

        expect(ctrl.isHidden('order-1'), isFalse,
            reason: 'Own reservation must never be hidden');
        expect(ctrl.isSelected('order-1'), isTrue);
      });

      test('hides orders reserved by other deliverers', () {
        // order-2 is not in selected → belongs to another deliverer
        final ctrl = const OrderSelectionController()
            .onWsOrderReserved('order-2');

        expect(ctrl.isHidden('order-2'), isTrue);
      });

      test('does not hide unrelated selected orders', () {
        final ctrl = const OrderSelectionController()
            .optimisticReserve('order-A')
            .onWsOrderReserved('order-B');   // another deliverer reserves order-B

        expect(ctrl.isHidden('order-A'), isFalse);
        expect(ctrl.isHidden('order-B'), isTrue);
      });
    });

    group('onWsOrderUnreserved', () {
      test('removes from hiddenByOthers', () {
        final ctrl = const OrderSelectionController()
            .onWsOrderReserved('order-1')
            .onWsOrderUnreserved('order-1');

        expect(ctrl.isHidden('order-1'), isFalse);
      });
    });

    // ── clear (limpar button) ────────────────────────────────────────────────

    group('clear', () {
      test('clears selected', () {
        final ctrl = const OrderSelectionController()
            .optimisticReserve('order-1')
            .clear();
        expect(ctrl.hasSelection, isFalse);
      });

      test('also clears hiddenByOthers so cards reappear', () {
        final ctrl = const OrderSelectionController()
            .onWsOrderReserved('order-x')
            .clear();
        expect(ctrl.isHidden('order-x'), isFalse);
      });
    });

    // ── deselect ─────────────────────────────────────────────────────────────

    group('deselect', () {
      test('removes from selected', () {
        final ctrl = const OrderSelectionController()
            .optimisticReserve('order-1')
            .deselect('order-1');
        expect(ctrl.isSelected('order-1'), isFalse);
      });

      test('also removes from hiddenByOthers', () {
        // edge case: order ends up in both sets somehow
        final ctrl = OrderSelectionController(
          selected:       ['order-1'],
          hiddenByOthers: {'order-1'},
        ).deselect('order-1');

        expect(ctrl.isHidden('order-1'), isFalse);
      });
    });

    // ── immutability ─────────────────────────────────────────────────────────

    test('operations return new instances', () {
      const original = OrderSelectionController();
      final modified = original.optimisticReserve('order-1');
      expect(original.hasSelection, isFalse);
      expect(modified.hasSelection, isTrue);
    });
  });
}
