import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/auth/auth_provider.dart';
import 'core/models/order.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/login_screen.dart';
import 'features/onboarding/setup_screen.dart';
import 'features/orders/order_selection_screen.dart';
import 'features/orders/route_planning_screen.dart';
import 'features/orders/pickup_confirmation_screen.dart';
import 'features/delivery/delivery_screen.dart';

final _router = GoRouter(
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
        orders: state.extra as List<Order>,
      ),
    ),
    GoRoute(
      path: '/pickup-confirm',
      builder: (_, state) => PickupConfirmationScreen(
        orders: state.extra as List<Order>,
      ),
    ),
    GoRoute(path: '/delivery', builder: (_, __) => const DeliveryScreen()),
  ],
);

class LogiFlowApp extends StatelessWidget {
  const LogiFlowApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'LogiFlow',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.theme,
        routerConfig: _router,
      );
}
