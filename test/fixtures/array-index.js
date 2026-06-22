// Fixture: off-by-one + array[arr.length].
function bad(arr) {
  for (let i = 0; i <= arr.length; i++) {   // <-- off-by-one
    console.log(arr[i]);
  }
  return arr[arr.length];                   // <-- always undefined
}
bad([1, 2, 3]);
