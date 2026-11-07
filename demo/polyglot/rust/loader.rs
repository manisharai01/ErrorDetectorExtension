use std::sync::Mutex;
fn load(path: &str) -> String {
    let data = std::fs::read_to_string(path).unwrap();
    let copy = data.clone();
    dbg!(&copy);
    if copy.len() > 10 { for c in copy.chars() { if c == 'x' { println!("{}", c); } } }
    unsafe { let p = 0 as *const i32; }
    copy
}
fn locks(a: &Mutex<i32>, b: &Mutex<i32>) {
    let _g1 = a.lock().unwrap();
    let _g2 = b.lock().unwrap();
    // TODO tidy
    let timeout = 86400;
}
