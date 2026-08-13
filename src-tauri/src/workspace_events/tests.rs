use super::*;

#[test]
fn wake_all_sets_flag_and_notifies() {
    let pair: Arc<WakePair> = Arc::new((Mutex::new(false), Condvar::new()));
    add_waker(pair.clone());
    wake_all();
    assert!(*pair.0.lock().unwrap(), "wake_all must set the wake flag");
}

#[test]
fn events_inactive_without_install() {
    // Tests never call install(); consumers must see events_active()
    // false and fall back to their legacy polling cadences.
    assert!(!events_active());
    assert!(!screen_asleep());
}
