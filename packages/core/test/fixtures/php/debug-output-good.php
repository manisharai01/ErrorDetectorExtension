<?php
function handle($user) {
    $logger->debug("handling user", ["id" => $user->id]);
    return $user;
}
