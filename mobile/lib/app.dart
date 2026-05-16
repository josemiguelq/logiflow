import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:geolocator/geolocator.dart';
import 'core/auth/auth_provider.dart';
import 'core/models/route.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/login_screen.dart';
import 'features/onboarding/setup_screen.dart';
import 'features/orders/order_selection_screen.dart';
import 'features/orders/route_planning_screen.dart';
import 'features/orders/pickup_confirmation_screen.dart';
import 'features/delivery/delivery_screen.dart';
import 'features/tracking/location_service.dart';

final _navigatorKey = GlobalKey<NavigatorState>();

final _router = GoRouter(
  navigatorKey: _navigatorKey,
  initialLocation: '/orders',
  redirect: (context, state) {
    final container = ProviderScope.containerOf(context);
    final session   = container.read(authProvider);
    final loc       = state.matchedLocation;

    if (session == null) {
      return loc == '/login' ? null : '/login';
    }
    if (loc == '/login') {
      return session.needsOnboarding ? '/setup' : '/orders';
    }
    if (session.needsOnboarding && loc != '/setup') {
      return '/setup';
    }
    return null;
  },
  routes: [
    GoRoute(path: '/login',   builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/setup',   builder: (_, __) => const SetupScreen()),
    GoRoute(path: '/orders',  builder: (_, __) => const OrderSelectionScreen()),
    GoRoute(
      path: '/plan-route',
      builder: (_, state) => RoutePlanningScreen(
        route: state.extra as DelivererRoute,
      ),
    ),
    GoRoute(
      path: '/pickup-confirm',
      builder: (_, state) => PickupConfirmationScreen(
        route: state.extra as DelivererRoute,
      ),
    ),
    GoRoute(path: '/delivery', builder: (_, __) => const DeliveryScreen()),
  ],
);

class LogiFlowApp extends ConsumerStatefulWidget {
  const LogiFlowApp({super.key});

  @override
  ConsumerState<LogiFlowApp> createState() => _LogiFlowAppState();
}

class _LogiFlowAppState extends ConsumerState<LogiFlowApp> {
  @override
  void initState() {
    super.initState();

    // Inicia rastreamento caso já haja sessão ao abrir o app
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final session = ref.read(authProvider);
      if (session != null) {
        final issue = await ref
            .read(locationServiceProvider)
            .startTracking(delivererId: session.id);
        if (issue != null) _showLocationDialog(issue);
      }
    });

    // Responde a login / logout
    ref.listenManual<DelivererSession?>(authProvider, (previous, next) async {
      final tracking = ref.read(locationServiceProvider);
      if (next != null) {
        final issue = await tracking.startTracking(delivererId: next.id);
        if (issue != null) _showLocationDialog(issue);
      } else {
        tracking.stopTracking();
      }
    });
  }

  void _showLocationDialog(LocationPermissionIssue issue) {
    final ctx = _navigatorKey.currentContext;
    if (ctx == null) return;
    showLocationPermissionDialog(ctx, issue);
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'LogiFlow',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.theme,
        routerConfig: _router,
      );
}

void showLocationPermissionDialog(BuildContext context, LocationPermissionIssue issue) {
  final (title, message, openSettings) = switch (issue) {
    LocationPermissionIssue.serviceDisabled => (
      'GPS desativado',
      'Ligue o GPS do celular para que sua localização seja enviada durante as entregas.',
      () => Geolocator.openLocationSettings(),
    ),
    LocationPermissionIssue.denied => (
      'Localização não permitida',
      'Permita que o LogiFlow acesse sua localização para que o rastreamento de entregas funcione corretamente.',
      () => Geolocator.openAppSettings(),
    ),
    LocationPermissionIssue.deniedForever => (
      'Permissão de localização bloqueada',
      'O acesso à localização foi bloqueado permanentemente. Vá em Configurações > Aplicativos > LogiFlow > Permissões e ative a localização.',
      () => Geolocator.openAppSettings(),
    ),
  };

  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (dialogCtx) => AlertDialog(
      icon: const Icon(Icons.location_off_rounded, size: 40, color: Color(0xFFEA580C)),
      title: Text(title, textAlign: TextAlign.center),
      content: Text(message, textAlign: TextAlign.center),
      actionsAlignment: MainAxisAlignment.center,
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogCtx).pop(),
          child: const Text('Fechar'),
        ),
        ElevatedButton.icon(
          onPressed: () {
            Navigator.of(dialogCtx).pop();
            openSettings();
          },
          icon: const Icon(Icons.settings_outlined, size: 16),
          label: const Text('Abrir configurações'),
          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
        ),
      ],
    ),
  );
}
