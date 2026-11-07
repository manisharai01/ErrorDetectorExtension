import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

class ApiClient {
  HttpClient create() {
    final client = HttpClient();
    // Dev-only shortcut that ships to production: accepts ANY certificate.
    client.badCertificateCallback = (X509Certificate cert, String host, int port) => true;
    return client;
  }

  Future<Map<String, dynamic>> fetchProfile(String id) async {
    print('fetching profile $id');
    final res = await http.get(Uri.parse('$baseUrl/profile/$id'));
    try {
      return jsonDecode(res.body) as Map<String, dynamic>;
    } catch (e) {}
  }

  Future<void> saveProfile(Map<String, dynamic> profile) async {
    await http.post(Uri.parse('$baseUrl/profile'), body: profile);
  }

  Future<void> refresh(String id) async {
    saveProfile(cache[id]!);
    Future.delayed(const Duration(seconds: 1));
  }
}

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

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
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(controller: _name);
}
