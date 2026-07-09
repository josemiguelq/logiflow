import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// Splash animada: um veículo "pula" e, a cada aterrissagem, alterna entre
/// moto e van. Mostrada enquanto o app inicializa (Firebase, sessão, etc.).
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  bool _showMoto = true;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 550),
    )..addStatusListener((status) {
        // Voltou ao chão (fim do reverse) → troca o veículo antes do próximo pulo.
        if (status == AnimationStatus.dismissed) {
          setState(() => _showMoto = !_showMoto);
        }
      });
    _controller.repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [AppTheme.primary, AppTheme.primaryDark],
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              height: 140,
              child: AnimatedBuilder(
                animation: _controller,
                builder: (context, _) {
                  // Pulo parabólico: sobe (easeOut) e desce no reverse.
                  final t = Curves.easeOut.transform(_controller.value);
                  const amplitude = 46.0;
                  return Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Transform.translate(
                        offset: Offset(0, -amplitude * t),
                        child: Icon(
                          _showMoto ? Icons.two_wheeler : Icons.airport_shuttle,
                          size: 84,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 10),
                      // "Sombra" no chão que encolhe conforme o veículo sobe.
                      Opacity(
                        opacity: 0.25 - 0.15 * t,
                        child: Container(
                          width: 60 - 24 * t,
                          height: 10,
                          decoration: BoxDecoration(
                            color: Colors.black,
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
            const SizedBox(height: 28),
            const Text(
              'LogiFlow',
              style: TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
