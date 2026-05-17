import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/auth/auth_provider.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await SentryFlutter.init(
    (options) {
      options.dsn = 'https://5a74af34355c0a9f999e6c83bbf2f13a@o148559.ingest.us.sentry.io/4511394261172224';
      options.tracesSampleRate  = 1.0;
      options.profilesSampleRate = 1.0;
    },
    appRunner: () async {
      // Capture Flutter widget-tree errors (build, layout, paint)
      final originalOnError = FlutterError.onError;
      FlutterError.onError = (FlutterErrorDetails details) {
        Sentry.captureException(
          details.exception,
          stackTrace: details.stack,
          hint: Hint.withMap({'flutter_error_details': details.toString()}),
        );
        originalOnError?.call(details);
      };

      // Capture Dart VM uncaught async errors (errors not caught by any zone)
      PlatformDispatcher.instance.onError = (error, stack) {
        Sentry.captureException(error, stackTrace: stack);
        return true;
      };

      // Show a minimal error widget in release mode instead of blank screen
      ErrorWidget.builder = (FlutterErrorDetails details) {
        Sentry.captureException(
          details.exception,
          stackTrace: details.stack,
          hint: Hint.withMap({'context': 'ErrorWidget.builder'}),
        );
        return const Material(
          child: Center(
            child: Text(
              'Algo deu errado.\nFeche e abra o app novamente.',
              textAlign: TextAlign.center,
            ),
          ),
        );
      };

      final container = ProviderContainer();
      try {
        await container.read(authProvider.notifier).restoreSession();
      } catch (e, st) {
        await Sentry.captureException(e, stackTrace: st,
            hint: Hint.withMap({'context': 'restoreSession'}));
      }

      runApp(SentryWidget(
        child: UncontrolledProviderScope(
          container: container,
          child: const LogiFlowApp(),
        ),
      ));
    },
  );
}
