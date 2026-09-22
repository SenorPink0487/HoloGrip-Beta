use rand::Rng;

const ALPHABET: &str = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

pub fn generate_invite_code() -> String {
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = ALPHABET.chars().collect();
    (0..8)
        .map(|_| chars[rng.gen_range(0..chars.len())])
        .collect()
}

/// Empty input is "not provided". Any other input must be 8 alphabet characters,
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
    if upper.len() == 8 && upper.chars().all(|ch| ALPHABET.contains(ch)) {
        Ok(Some(upper))
    } else {
        Err(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_hyphen_and_case() {
        assert_eq!(
            normalize_invite_code(" k7mp-q2hx ").unwrap().as_deref(),
            Some("K7MPQ2HX")
        );
        assert_eq!(normalize_invite_code("").unwrap(), None);
        assert_eq!(normalize_invite_code("   ").unwrap(), None);
    }

    #[test]
    fn rejects_ambiguous_or_short_codes() {
        assert!(normalize_invite_code("abc").is_err());
        assert!(normalize_invite_code("O0OOOOOO").is_err());
        assert!(normalize_invite_code("IIIIIIII").is_err());
    }

    #[test]
    fn generated_codes_use_the_alphabet() {
        let code = generate_invite_code();
        assert_eq!(code.len(), 8);
        assert!(code.chars().all(|ch| ALPHABET.contains(ch)));
    }
}
