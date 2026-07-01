<?php
$stmt = $db->prepare("SELECT * FROM users WHERE id = ?");
$stmt->execute([$id]);
$sql = "SELECT * FROM users WHERE active = 1";
$label = "Welcome " . $name;
