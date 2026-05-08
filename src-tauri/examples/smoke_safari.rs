fn main() {
    println!("calling extension_state...");
    match redd_block_lib::safari_services::extension_state("com.reddblock.SafariExtension") {
        Ok(s) => println!("ok: {:?}", s),
        Err(e) => println!("err (expected outside .app): {}", e),
    }
}
