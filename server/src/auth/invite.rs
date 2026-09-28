use rand::Rng;

const CODE_LEN: usize = 5;
const ALPHABET: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

pub fn generate_invite_code() -> String {
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = ALPHABET.chars().collect();
    (0..CODE_LEN)
        .map(|_| chars[rng.gen_range(0..chars.len())])
        .collect()
}

/// Empty input is "not provided". Any other input must be 5 letters or digits,
/// ignoring hyphens and whitespace.
pub fn normalize_invite_code(raw: &str) -> Result<Option<String>, ()> {
    if raw.trim().is_empty() {
        return Ok(None);
    }
    let cleaned: String = raw
        .chars()
        .filter(|ch| *ch != '-' && !ch.is_whitespace())
        .collect();
    let upper = cleaned.to_uppercase();
    if upper.len() == CODE_LEN && upper.chars().all(|ch| ALPHABET.contains(ch)) {
        Ok(Some(upper))
    } else {
        Err(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_case_space_and_hyphen() {
        assert_eq!(
            normalize_invite_code(" a3k-9p ").unwrap().as_deref(),
            Some("A3K9P")
        );
        assert_eq!(
            normalize_invite_code("o0i1l").unwrap().as_deref(),
            Some("O0I1L")
        );
        assert_eq!(normalize_invite_code("").unwrap(), None);
        assert_eq!(normalize_invite_code("   ").unwrap(), None);
    }

    #[test]
    fn rejects_wrong_length_or_symbols() {
        assert!(normalize_invite_code("abc").is_err());
        assert!(normalize_invite_code("ABCDEFGH").is_err());
        assert!(normalize_invite_code("A3K9!").is_err());
    }

    #[test]
    fn generated_codes_are_five_alphanumeric_characters() {
        for _ in 0..32 {
            let code = generate_invite_code();
            assert_eq!(code.len(), CODE_LEN);
            assert!(code.chars().all(|ch| ALPHABET.contains(ch)));
        }
    }
}
