import 'dart:async';
import 'dart:developer';
import 'dart:io';

import 'package:flutter/material.dart';

class ApiClient {
  HttpClient create() {
    final client = HttpClient();
    // Only the local dev server may use a self-signed certificate.
    client.badCertificateCallback = (X509Certificate cert, String host, int port) => host == 'localhost';
    return client;
  }

  Future<Map<String, dynamic>> fetchProfile(String id) async {
    log('fetching profile $id');
    final res = await http.get(Uri.parse('$baseUrl/profile/$id'));
    try {
      return jsonDecode(res.body) as Map<String, dynamic>;
    } catch (e, st) {
      log('bad profile payload', error: e, stackTrace: st);
      rethrow;
    }
  }

  Future<void> saveProfile(Map<String, dynamic> profile) async {
    await http.post(Uri.parse('$baseUrl/profile'), body: profile);
  }

  Future<void> refresh(String id) async {
    final profile = cache[id];
    if (profile == null) return;
    await saveProfile(profile);
    await Future.delayed(const Duration(seconds: 1));
    unawaited(saveProfile(profile));
  }
}

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, this.controller});

  final TextEditingController? controller;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final TextEditingController _name = TextEditingController();
  StreamSubscription<int>? _ticks;

  @override
  void initState() {
    super.initState();
    _ticks = Stream.periodic(const Duration(seconds: 1), (i) => i).listen((_) {});
  }

  @override
  void dispose() {
    _name.dispose();
    _ticks?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(controller: widget.controller ?? _name);
}
