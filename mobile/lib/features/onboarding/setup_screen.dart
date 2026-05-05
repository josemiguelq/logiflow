import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';

class SetupScreen extends ConsumerStatefulWidget {
  const SetupScreen({super.key});

  @override
  ConsumerState<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends ConsumerState<SetupScreen> {
  int _step = 0; // 0 = photo, 1 = password, 2 = location

  // Step 0 — photo
  Uint8List? _imageBytes;
  String? _imageBase64;

  // Step 1 — password
  final _passCtrl    = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscurePass    = true;
  bool _obscureConfirm = true;

  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _passCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final picker = ImagePicker();
    final source = await _showSourceDialog();
    if (source == null) return;

    final XFile? file = await picker.pickImage(
      source: source,
      maxWidth: 512,
      maxHeight: 512,
      imageQuality: 80,
    );
    if (file == null) return;

    final bytes = await file.readAsBytes();
    setState(() {
      _imageBytes  = bytes;
      _imageBase64 = 'data:image/jpeg;base64,${base64Encode(bytes)}';
      _error = null;
    });
  }

  Future<ImageSource?> _showSourceDialog() async {
    return showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(width: 40, height: 4,
                decoration: BoxDecoration(color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 16),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Tirar foto'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Escolher da galeria'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _nextStep() {
    setState(() { _error = null; });

    if (_step == 0) {
      if (_imageBytes == null) {
        setState(() => _error = 'Adicione uma foto de perfil para continuar');
        return;
      }
      setState(() => _step = 1);
    } else if (_step == 1) {
      if (_passCtrl.text.length < 6) {
        setState(() => _error = 'A senha deve ter pelo menos 6 caracteres');
        return;
      }
      if (_passCtrl.text != _confirmCtrl.text) {
        setState(() => _error = 'As senhas não coincidem');
        return;
      }
      _requestLocationAndFinish();
    }
  }

  Future<void> _requestLocationAndFinish() async {
    setState(() { _step = 2; _loading = true; _error = null; });

    // Request location permission
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    try {
      await ApiClient().dio.patch('/deliverer/profile', data: {
        'profileImageUrl': _imageBase64,
        'newPassword':     _passCtrl.text,
      });

      ref.read(authProvider.notifier).completeOnboarding(_imageBase64);
      if (mounted) context.go('/orders');
    } catch (_) {
      setState(() {
        _step = 1;
        _error = 'Erro ao salvar perfil. Tente novamente.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Progress bar
            LinearProgressIndicator(
              value: (_step + 1) / 3,
              backgroundColor: Colors.grey.shade200,
              color: AppTheme.primary,
              minHeight: 3,
            ),

            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 16),
                    _StepIndicator(current: _step),
                    const SizedBox(height: 32),

                    if (_step == 0) _PhotoStep(
                      imageBytes: _imageBytes,
                      onPick: _pickPhoto,
                    ),

                    if (_step == 1) _PasswordStep(
                      passCtrl:    _passCtrl,
                      confirmCtrl: _confirmCtrl,
                      obscurePass:    _obscurePass,
                      obscureConfirm: _obscureConfirm,
                      onTogglePass:    () => setState(() => _obscurePass    = !_obscurePass),
                      onToggleConfirm: () => setState(() => _obscureConfirm = !_obscureConfirm),
                    ),

                    if (_step == 2) _LocationStep(loading: _loading),

                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF2F2),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(children: [
                          const Icon(Icons.error_outline, color: Color(0xFFDC2626), size: 16),
                          const SizedBox(width: 8),
                          Expanded(child: Text(_error!,
                              style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13))),
                        ]),
                      ),
                    ],

                    if (_step < 2) ...[
                      const SizedBox(height: 32),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _nextStep,
                          child: Text(_step == 1 ? 'Finalizar configuração' : 'Continuar',
                              style: const TextStyle(fontSize: 16)),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepIndicator extends StatelessWidget {
  final int current;
  const _StepIndicator({required this.current});

  static const _titles = ['Foto de perfil', 'Nova senha', 'Localização'];
  static const _subtitles = [
    'Adicione uma foto para que a loja te identifique',
    'Crie uma senha segura para sua conta',
    'Permitindo acesso à localização...',
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Passo ${current + 1} de 3',
            style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w600, fontSize: 13)),
        const SizedBox(height: 4),
        Text(_titles[current],
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 6),
        Text(_subtitles[current],
            style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
      ],
    );
  }
}

class _PhotoStep extends StatelessWidget {
  final Uint8List? imageBytes;
  final VoidCallback onPick;
  const _PhotoStep({required this.imageBytes, required this.onPick});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        children: [
          GestureDetector(
            onTap: onPick,
            child: Container(
              width: 160,
              height: 160,
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.grey.shade200, width: 2),
              ),
              child: imageBytes != null
                  ? ClipOval(child: Image.memory(imageBytes!, fit: BoxFit.cover))
                  : Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.camera_alt_outlined,
                            size: 40, color: Colors.grey.shade400),
                        const SizedBox(height: 8),
                        Text('Adicionar foto',
                            style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 20),
          TextButton.icon(
            onPressed: onPick,
            icon: const Icon(Icons.upload_outlined),
            label: Text(imageBytes != null ? 'Trocar foto' : 'Selecionar foto'),
          ),
        ],
      ),
    );
  }
}

class _PasswordStep extends StatelessWidget {
  final TextEditingController passCtrl;
  final TextEditingController confirmCtrl;
  final bool obscurePass;
  final bool obscureConfirm;
  final VoidCallback onTogglePass;
  final VoidCallback onToggleConfirm;

  const _PasswordStep({
    required this.passCtrl,
    required this.confirmCtrl,
    required this.obscurePass,
    required this.obscureConfirm,
    required this.onTogglePass,
    required this.onToggleConfirm,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TextField(
          controller: passCtrl,
          obscureText: obscurePass,
          decoration: InputDecoration(
            labelText: 'Nova senha',
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(
              icon: Icon(obscurePass ? Icons.visibility_off : Icons.visibility),
              onPressed: onTogglePass,
            ),
            helperText: 'Mínimo 6 caracteres',
          ),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: 16),
        TextField(
          controller: confirmCtrl,
          obscureText: obscureConfirm,
          decoration: InputDecoration(
            labelText: 'Confirmar nova senha',
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(
              icon: Icon(obscureConfirm ? Icons.visibility_off : Icons.visibility),
              onPressed: onToggleConfirm,
            ),
          ),
          textInputAction: TextInputAction.done,
        ),
      ],
    );
  }
}

class _LocationStep extends StatelessWidget {
  final bool loading;
  const _LocationStep({required this.loading});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        children: [
          const SizedBox(height: 32),
          Container(
            width: 80, height: 80,
            decoration: BoxDecoration(
              color: AppTheme.primary.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.location_on, size: 40, color: AppTheme.primary),
          ),
          const SizedBox(height: 24),
          const Text('Precisamos da sua localização',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text(
            'O app usa sua localização para rastrear entregas em tempo real e calcular distâncias.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey.shade600, fontSize: 14, height: 1.5),
          ),
          const SizedBox(height: 32),
          if (loading) const CircularProgressIndicator(),
        ],
      ),
    );
  }
}
