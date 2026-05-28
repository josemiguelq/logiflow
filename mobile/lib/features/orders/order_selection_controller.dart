/// Pure state logic for order selection, extracted for testability.
///
/// Covers the race-condition bug where a WS `order_reserved` event could arrive
/// before the optimistic add to [selected], causing the card to disappear into
/// [hiddenByOthers] even though the current deliverer had just reserved it.
class OrderSelectionController {
  final List<String> selected;
  final Set<String>  hiddenByOthers;

  const OrderSelectionController({
    List<String>? selected,
    Set<String>?  hiddenByOthers,
  })  : selected       = selected       ?? const [],
        hiddenByOthers = hiddenByOthers ?? const {};

  OrderSelectionController _copy({List<String>? selected, Set<String>? hiddenByOthers}) =>
      OrderSelectionController(
        selected:       selected       ?? List.from(this.selected),
        hiddenByOthers: hiddenByOthers ?? Set.from(this.hiddenByOthers),
      );

  // ── selection ──────────────────────────────────────────────────────────────

  /// Optimistically adds [orderId] to [selected] before the API call.
  /// Call [rollbackReserve] if the API responds with an error.
  OrderSelectionController optimisticReserve(String orderId) {
    final next = List<String>.from(selected);
    if (!next.contains(orderId)) next.add(orderId);
    return _copy(selected: next);
  }

  /// Removes [orderId] from [selected] when the reserve API call fails.
  OrderSelectionController rollbackReserve(String orderId) {
    return _copy(selected: List<String>.from(selected)..remove(orderId));
  }

  /// Removes [orderId] from [selected] and [hiddenByOthers] when unreserving.
  OrderSelectionController deselect(String orderId) {
    return _copy(
      selected:       List<String>.from(selected)..remove(orderId),
      hiddenByOthers: Set<String>.from(hiddenByOthers)..remove(orderId),
    );
  }

  /// Clears all selections (limpar button). Also clears [hiddenByOthers]
  /// so cards always reappear after a clear.
  OrderSelectionController clear() =>
      const OrderSelectionController();

  // ── WS events ──────────────────────────────────────────────────────────────

  /// Called when the WS broadcasts `order_reserved`.
  /// Does NOT hide orders that the current deliverer already has in [selected],
  /// preventing the race-condition where the WS event arrives before the
  /// optimistic add is reflected in the widget tree.
  OrderSelectionController onWsOrderReserved(String orderId) {
    if (selected.contains(orderId)) return this;
    return _copy(hiddenByOthers: Set<String>.from(hiddenByOthers)..add(orderId));
  }

  /// Called when the WS broadcasts `order_unreserved` or `order_updated`.
  OrderSelectionController onWsOrderUnreserved(String orderId) {
    return _copy(hiddenByOthers: Set<String>.from(hiddenByOthers)..remove(orderId));
  }

  // ── queries ────────────────────────────────────────────────────────────────

  bool isSelected(String orderId)      => selected.contains(orderId);
  bool isHidden(String orderId)        => hiddenByOthers.contains(orderId);
  bool get hasSelection                => selected.isNotEmpty;
}
