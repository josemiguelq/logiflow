import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_map_cancellable_tile_provider/flutter_map_cancellable_tile_provider.dart';

/// Camada de tiles padrão dos mapas do app.
///
/// Centralizada aqui para facilitar trocar o provedor (ex.: MapTiler/Stadia com
/// API key) em um único lugar. Usa o [CancellableNetworkTileProvider], que
/// cancela requisições de tiles que saem da tela e usa HTTP/2 — reduz bastante
/// os timeouts contra o servidor público do OpenStreetMap.
TileLayer appTileLayer() => TileLayer(
      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      userAgentPackageName: 'com.lincelabs.logiflow',
      tileProvider: CancellableNetworkTileProvider(),
      maxNativeZoom: 19,
    );
