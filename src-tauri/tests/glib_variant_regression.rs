#![cfg(target_os = "linux")]

use glib::variant::ToVariant;

#[test]
fn strings_iterate_forward_backward_and_interleaved() {
    let values = ["alpha", "beta", "gamma", "delta"];
    let variant = values.as_slice().to_variant();
    assert_eq!(
        variant
            .array_iter_str()
            .expect("string array")
            .collect::<Vec<_>>(),
        values
    );
    assert_eq!(
        variant
            .array_iter_str()
            .expect("string array")
            .rev()
            .collect::<Vec<_>>(),
        ["delta", "gamma", "beta", "alpha"]
    );
    let mut iter = variant.array_iter_str().expect("string array");
    assert_eq!(iter.next(), Some("alpha"));
    assert_eq!(iter.next_back(), Some("delta"));
    assert_eq!(iter.next(), Some("beta"));
    assert_eq!(iter.next_back(), Some("gamma"));
    assert_eq!(iter.next(), None);
    assert_eq!(iter.next_back(), None);
}

#[test]
fn strings_iterate_unicode_empty_and_nth_without_invalid_pointer() {
    let values = ["", "niño", "日本語", "🎮"];
    let variant = values.as_slice().to_variant();
    let mut iter = variant.array_iter_str().expect("string array");
    assert_eq!(iter.nth(1), Some("niño"));
    assert_eq!(iter.next_back(), Some("🎮"));
    assert_eq!(iter.next(), Some("日本語"));
    assert_eq!(iter.next(), None);
    let empty = Vec::<String>::new().to_variant();
    assert_eq!(empty.array_iter_str().expect("empty array").next(), None);
}
