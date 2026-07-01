<?php
$id = $_GET['id'];
$sql = "SELECT * FROM users WHERE id = " . $id;
$db->query($sql);
$db->query("DELETE FROM sessions WHERE token = " . $token);
$query = "SELECT * FROM accounts WHERE name = $name";
