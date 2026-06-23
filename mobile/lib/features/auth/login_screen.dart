import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/auth/known_stores_store.dart';
import '../../core/theme/app_theme.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _api = ApiClient();
  final _knownStores = KnownStoresStore();

  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _codeCtrl     = TextEditingController();

  List<KnownStore> _stores = [];
  KnownStore? _selected;
  bool _addingStore = false; // true = tela de inserir código da loja
  bool _loading = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadStores();
  }

  Future<void> _loadStores() async {
    final stores = await _knownStores.list();
    if (!mounted) return;
    setState(() {
      _stores = stores;
      _selected = stores.isNotEmpty ? stores.first : null;
      _addingStore = stores.isEmpty; // sem lojas salvas → já abre no "adicionar"
    });
  }

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  // Consulta a loja pelo código de convite e salva localmente.
  Future<void> _addStoreByCode() async {
    final code = _codeCtrl.text.trim().toUpperCase();
    if (code.isEmpty) return;
    setState(() { _loading = true; _error = null; });
    try {
      final res = await _api.dio.get('/auth/store/by-code/$code');
      final store = KnownStore(
        code:      res.data['code'] as String,
        storeId:   res.data['storeId'] as String,
        storeName: res.data['storeName'] as String,
      );
      final stores = await _knownStores.add(store);
      if (!mounted) return;
      setState(() {
        _stores = stores;
        _selected = store;
        _addingStore = false;
        _codeCtrl.clear();
      });
    } catch (_) {
      setState(() => _error = 'Código de loja inválido');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _removeStore(KnownStore store) async {
    final stores = await _knownStores.remove(store.code);
    if (!mounted) return;
    setState(() {
      _stores = stores;
      if (_selected?.code == store.code) _selected = stores.isNotEmpty ? stores.first : null;
      if (stores.isEmpty) _addingStore = true;
    });
  }

  Future<void> _login() async {
    if (_selected == null) return;
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authProvider.notifier).loginV2(
        _selected!.code,
        _usernameCtrl.text.trim(),
        _passwordCtrl.text,
      );
      if (!mounted) return;
      final session = ref.read(authProvider);
      context.go(session?.needsOnboarding == true ? '/setup' : '/orders');
    } catch (_) {
      setState(() => _error = 'Usuário ou senha inválidos');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: AppTheme.primary,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(LucideIcons.truck, color: Colors.white, size: 36),
                ),
                const SizedBox(height: 16),
                const Text('LogiFlow',
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text('App do Entregador',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
                const SizedBox(height: 40),

                if (_addingStore) ..._buildAddStore() else ..._buildLogin(),

                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(_error!,
                        style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Inserir código da loja ──────────────────────────────────────────────────
  List<Widget> _buildAddStore() {
    return [
      TextField(
        controller: _codeCtrl,
        decoration: const InputDecoration(
          labelText: 'Código da loja',
          prefixIcon: Icon(Icons.store_outlined),
        ),
        textInputAction: TextInputAction.done,
        keyboardType: TextInputType.text,
        autocorrect: false,
        textCapitalization: TextCapitalization.characters,
        onSubmitted: (_) => _addStoreByCode(),
      ),
      const SizedBox(height: 8),
      Text(
        'Peça o código de convite à sua loja.',
        style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
      ),
      const SizedBox(height: 20),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: _loading ? null : _addStoreByCode,
          child: _loading
              ? const SizedBox(
                  width: 20, height: 20,
                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
              : const Text('Continuar', style: TextStyle(fontSize: 16)),
        ),
      ),
      if (_stores.isNotEmpty) ...[
        const SizedBox(height: 12),
        TextButton(
          onPressed: _loading
              ? null
              : () => setState(() { _addingStore = false; _error = null; }),
          child: const Text('Voltar para minhas lojas'),
        ),
      ],
    ];
  }

  // ── Login na loja selecionada ───────────────────────────────────────────────
  List<Widget> _buildLogin() {
    return [
      // Seletor de lojas salvas
      Align(
        alignment: Alignment.centerLeft,
        child: Text('Loja',
            style: TextStyle(color: Colors.grey.shade700, fontSize: 13, fontWeight: FontWeight.w500)),
      ),
      const SizedBox(height: 6),
      ..._stores.map((s) {
        final selected = _selected?.code == s.code;
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => setState(() => _selected = s),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: selected ? AppTheme.primary.withOpacity(0.08) : Colors.white,
                border: Border.all(
                  color: selected ? AppTheme.primary : Colors.grey.shade300,
                  width: selected ? 1.5 : 1,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(Icons.store_outlined,
                      size: 20, color: selected ? AppTheme.primary : Colors.grey.shade500),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(s.storeName,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        Text(s.code,
                            style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                      ],
                    ),
                  ),
                  if (selected) const Icon(Icons.check_circle, color: AppTheme.primary, size: 20),
                  IconButton(
                    icon: Icon(Icons.close, size: 18, color: Colors.grey.shade400),
                    tooltip: 'Remover loja',
                    onPressed: _loading ? null : () => _removeStore(s),
                  ),
                ],
              ),
            ),
          ),
        );
      }),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: _loading
              ? null
              : () => setState(() { _addingStore = true; _error = null; }),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Adicionar loja por código'),
        ),
      ),
      const SizedBox(height: 12),

      TextField(
        controller: _usernameCtrl,
        decoration: const InputDecoration(
          labelText: 'Username',
          prefixIcon: Icon(Icons.person_outline),
        ),
        textInputAction: TextInputAction.next,
        keyboardType: TextInputType.text,
        autocorrect: false,
        textCapitalization: TextCapitalization.none,
      ),
      const SizedBox(height: 16),
      TextField(
        controller: _passwordCtrl,
        decoration: InputDecoration(
          labelText: 'Senha',
          prefixIcon: const Icon(Icons.lock_outline),
          suffixIcon: IconButton(
            icon: Icon(_obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
            tooltip: _obscurePassword ? 'Mostrar senha' : 'Ocultar senha',
            onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
          ),
        ),
        obscureText: _obscurePassword,
        onSubmitted: (_) => _login(),
      ),
      const SizedBox(height: 24),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: (_loading || _selected == null) ? null : _login,
          child: _loading
              ? const SizedBox(
                  width: 20, height: 20,
                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
              : const Text('Entrar', style: TextStyle(fontSize: 16)),
        ),
      ),
    ];
  }
}
