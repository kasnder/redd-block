fn main() {
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::dotenv();
    let r = redd_block_lib::profile_scan::scan();
    println!("compliant: {}", redd_block_lib::profile_scan::compliant(&r));
    println!("{}", serde_json::to_string_pretty(&r).unwrap());
}
