import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/auth/auth_provider.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/login_screen.dart';
import 'features/orders/orders_screen.dart';
import 'features/orders/order_detail_screen.dart';

final _router = GoRouter(
  initialLocation: '/orders',
  redirect: (context, state) {
    final container = ProviderScope.containerOf(context);
    final session   = container.read(authProvider);
    final isLogin   = state.matchedLocation == '/login';
    if (session == null && !isLogin) return '/login';
    if (session != null && isLogin) return '/orders';
    return null;
  },
  routes: [
    GoRoute(path: '/login',  builder: (_, __) => const LoginScreen()),
    GoRoute(
      path: '/orders',
      builder: (_, __) => const OrdersScreen(),
      routes: [
        GoRoute(
          path: ':id',
          builder: (_, state) => OrderDetailScreen(orderId: state.pathParameters['id']!),
        ),
      ],
    ),
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
