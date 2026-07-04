import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:geolocator/geolocator.dart';
import 'core/auth/auth_provider.dart';
import 'core/models/route.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/login_screen.dart';
import 'features/onboarding/setup_screen.dart';
import 'features/legal/terms_screen.dart';
import 'features/orders/order_selection_screen.dart';
import 'features/orders/route_planning_screen.dart';
import 'features/orders/pickup_confirmation_screen.dart';
import 'features/delivery/delivery_screen.dart';
import 'features/splash/splash_screen.dart';
import 'features/analytics/analytics_screen.dart';
import 'features/gamification/gamification_screen.dart';
import 'features/tracking/location_service.dart';
import 'core/models/announcement.dart';
import 'features/announcements/announcement_service.dart';
import 'features/announcements/announcement_popup.dart';

final _navigatorKey = GlobalKey<NavigatorState>();

// Vira true quando a inicialização (Firebase, restore da sessão) termina.
// Enquanto false, o app fica na splash animada.
final bootstrapDoneProvider = StateProvider<bool>((_) => false);

final _router = GoRouter(
  navigatorKey: _navigatorKey,
  initialLocation: '/splash',
  redirect: (context, state) {
    final container = ProviderScope.containerOf(context);
    final loc = state.matchedLocation;

    // Ainda inicializando → mantém na splash.
    if (!container.read(bootstrapDoneProvider)) {
      return loc == '/splash' ? null : '/splash';
    }

    final session = container.read(authProvider);

    if (session == null) {
      return loc == '/login' ? null : '/login';
    }
    // Aceite de termos é obrigatório antes de qualquer uso.
    if (!session.termsAccepted) {
      return loc == '/termos' ? null : '/termos';
    }
    if (loc == '/termos' || loc == '/login' || loc == '/splash') {
      return session.needsOnboarding ? '/setup' : '/orders';
    }
    if (session.needsOnboarding && loc != '/setup') {
      return '/setup';
    }
    return null;
  },
  routes: [
    GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/termos', builder: (_, __) => const TermsScreen()),
    GoRoute(path: '/setup', builder: (_, __) => const SetupScreen()),
    GoRoute(path: '/orders', builder: (_, __) => const OrderSelectionScreen()),
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
    GoRoute(path: '/analitico', builder: (_, __) => const AnalyticsScreen()),
    GoRoute(path: '/conquistas', builder: (_, __) => const GamificationScreen()),
  ],
);

class LogiFlowApp extends ConsumerStatefulWidget {
  const LogiFlowApp({super.key});

  @override
  ConsumerState<LogiFlowApp> createState() => _LogiFlowAppState();
}

class _LogiFlowAppState extends ConsumerState<LogiFlowApp> with WidgetsBindingObserver {
  StreamSubscription<bool>? _gpsSub;
  bool _locationDialogOpen = false;
  bool _announcementOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    // Avisa em popup quando o GPS é desligado durante o uso e fecha quando volta.
    _gpsSub = ref.read(locationServiceProvider).gpsEnabledStream.listen((enabled) {
      if (!enabled) {
        _showLocationDialog(LocationPermissionIssue.serviceDisabled);
      } else if (_locationDialogOpen) {
        // GPS voltou — fecha o popup de aviso.
        _navigatorKey.currentState?.pop();
      }
    });

    // Sincroniza o rastreamento com a sessão ao abrir o app.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncTracking(ref.read(authProvider));
      _checkAnnouncements();
    });

    // Fim da inicialização → re-avalia o router para sair da splash.
    ref.listenManual<bool>(bootstrapDoneProvider, (_, done) {
      if (done) _router.refresh();
    });

    // Responde a login / logout e a mudanças de status (switch de disponibilidade).
    ref.listenManual<DelivererSession?>(authProvider, (previous, next) async {
      if (next == null) {
        ref.read(locationServiceProvider).stopTracking();
        _router.go('/login');
        return;
      }
      // Só reage quando login OU status mudaram, evitando trabalho redundante.
      if (previous?.id != next.id || previous?.status != next.status) {
        await _syncTracking(next);
      }
    });
  }

  // Rastreio só acontece quando o entregador está disponível (online).
  // OFFLINE → para de enviar; AVAILABLE → (re)inicia (idempotente via _started).
  Future<void> _syncTracking(DelivererSession? session) async {
    final tracking = ref.read(locationServiceProvider);
    if (session != null && session.status != 'OFFLINE') {
      final issue = await tracking.startTracking(delivererId: session.id);
      if (issue != null) _showLocationDialog(issue);
    } else {
      tracking.stopTracking();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Ao voltar do segundo plano, checa se há comunicados novos.
    if (state == AppLifecycleState.resumed) _checkAnnouncements();
  }

  // Mostra os comunicados não lidos num popup carrossel. Usa cache para abrir
  // rápido e depois reconcilia com a rede. Só roda para entregador já dentro do
  // app (logado, termos aceitos, onboarding concluído) e evita empilhar popups.
  // Toda a checagem é blindada: um request lento/erro nunca atrapalha a navegação.
  Future<void> _checkAnnouncements() async {
    if (_announcementOpen) return;
    final session = ref.read(authProvider);
    if (session == null || !session.termsAccepted || session.needsOnboarding) return;

    final service = ref.read(announcementServiceProvider);

    Future<void> present(List<Announcement> items) async {
      final ctx = _navigatorKey.currentContext;
      if (ctx == null || items.isEmpty || _announcementOpen) return;
      _announcementOpen = true;
      try {
        await showAnnouncementsCarousel(ctx, items, onRead: service.markRead);
      } finally {
        _announcementOpen = false;
      }
    }

    try {
      // 1) cache (instantâneo)
      await present(await service.cachedAnnouncements());
      // 2) rede (com timeout); só abre se o popup do cache não estiver aberto
      final fresh = await service.fetchAnnouncements();
      await present(fresh);
    } catch (_) {
      // Offline, timeout ou qualquer erro: silencioso, não bloqueia a navegação.
    }
  }

  void _showLocationDialog(LocationPermissionIssue issue) {
    if (_locationDialogOpen) return;   // evita empilhar popups
    final ctx = _navigatorKey.currentContext;
    if (ctx == null) return;
    _locationDialogOpen = true;
    showLocationPermissionDialog(ctx, issue)
        .whenComplete(() => _locationDialogOpen = false);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _gpsSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'LogiFlow',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.theme,
        routerConfig: _router,
      );
}

Future<void> showLocationPermissionDialog(
    BuildContext context, LocationPermissionIssue issue) {
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

  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (dialogCtx) => AlertDialog(
      icon: const Icon(Icons.location_off_rounded,
          size: 40, color: Color(0xFFEA580C)),
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
