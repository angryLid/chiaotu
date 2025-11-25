use base64::{Engine as _, engine::general_purpose};
use std::error::Error;

/// Decodes a base64 string back to its original content
///
/// # Arguments
/// * `encoded` - The base64 encoded string to decode
///
/// # Returns
/// * `Result<Vec<u8>, Box<dyn Error>>` - The decoded bytes or an error
pub fn decode_base64(encoded: &str) -> Result<Vec<u8>, Box<dyn Error>> {
    let cleaned_input = clean_base64_input(encoded);

    if cleaned_input.is_empty() {
        return Err("Empty base64 input".into());
    }

    match general_purpose::STANDARD.decode(&cleaned_input) {
        Ok(decoded) => Ok(decoded),
        Err(e) => {
            // Try URL-safe encoding if standard fails
            match general_purpose::URL_SAFE.decode(&cleaned_input) {
                Ok(decoded) => Ok(decoded),
                Err(_) => {
                    Err(format!("Failed to decode base64: {}", e).into())
                }
            }
        }
    }
}

/// Decodes base64 string and returns as UTF-8 text
///
/// # Arguments
/// * `encoded` - The base64 encoded string to decode
///
/// # Returns
/// * `Result<String, Box<dyn Error>>` - The decoded text or an error
pub fn decode_to_string(encoded: &str) -> Result<String, Box<dyn Error>> {
    let bytes = decode_base64(encoded)?;

    match String::from_utf8(bytes) {
        Ok(text) => Ok(text),
        Err(e) => {
            Err(format!("Decoded bytes are not valid UTF-8: {}", e).into())
        }
    }
}

/// Decodes base64 string and attempts to guess the content type
pub fn decode_and_analyze(encoded: &str) -> Result<ContentInfo, Box<dyn Error>> {
    let bytes = decode_base64(encoded)?;

    let content_type = detect_content_type(&bytes);
    let preview_length = std::cmp::min(100, bytes.len());
    let preview = format!("{:?}", &bytes[..preview_length]);

    Ok(ContentInfo {
        content_type,
        byte_count: bytes.len(),
        preview,
        bytes,
    })
}

/// Information about the decoded content
#[derive(Debug)]
pub struct ContentInfo {
    pub content_type: ContentType,
    pub byte_count: usize,
    pub preview: String,
    pub bytes: Vec<u8>,
}

/// Detected content type
#[derive(Debug)]
pub enum ContentType {
    Text(String), // UTF-8 text
    Binary,       // Binary data
    Empty,        // Empty content
}

/// Cleans base64 input by removing whitespace and formatting
fn clean_base64_input(input: &str) -> String {
    input
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect()
}

/// Attempts to detect the content type of the decoded bytes
fn detect_content_type(bytes: &[u8]) -> ContentType {
    if bytes.is_empty() {
        return ContentType::Empty;
    }

    // Try to decode as UTF-8 text
    match String::from_utf8(bytes.to_vec()) {
        Ok(text) => ContentType::Text(text),
        Err(_) => ContentType::Binary,
    }
}

/// Interactive function to decode base64 and show results
pub fn decode_interactive(encoded: &str, _show_full_content: bool) -> Result<(), Box<dyn Error>> {
    match decode_and_analyze(encoded) {
        Ok(_) => Ok(()),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_base64_text() {
        let test_text = "Hello, World!";
        let encoded = "SGVsbG8sIFdvcmxkIQ==";

        match decode_to_string(encoded) {
            Ok(decoded) => assert_eq!(decoded, test_text),
            Err(e) => panic!("Failed to decode: {}", e),
        }
    }

    #[test]
    fn test_decode_base64_binary() {
        let test_bytes = vec![0x48, 0x65, 0x6c, 0x6c, 0x6f]; // "Hello" in ASCII
        let encoded = "SGVsbG8=";

        match decode_base64(encoded) {
            Ok(decoded) => assert_eq!(decoded, test_bytes),
            Err(e) => panic!("Failed to decode: {}", e),
        }
    }

    #[test]
    fn test_clean_base64_input() {
        let messy_input = "SG V s b G 8 =";
        let cleaned = clean_base64_input(messy_input);
        assert_eq!(cleaned, "SGVsbG8=");
    }
}