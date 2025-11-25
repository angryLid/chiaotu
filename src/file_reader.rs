use std::fs;
use std::io;

/// Reads the entire contents of a file and returns it as a String.
///
/// # Arguments
///
/// * `file_path` - A string slice that holds the path to the file
///
/// # Returns
///
/// * `Ok(String)` - The contents of the file as a String
/// * `Err(io::Error)` - An error if the file cannot be read
///
/// # Examples
///
/// ```
/// use file_reader::read_file_to_string;
///
/// let content = read_file_to_string("example.txt");
/// match content {
///     Ok(text) => println!("File contents: {}", text),
///     Err(e) => println!("Error reading file: {}", e),
/// }
/// ```
pub fn read_file_to_string(file_path: &str) -> Result<String, io::Error> {
    fs::read_to_string(file_path)
}

/// Reads the entire contents of a file and returns it as a vector of bytes.
///
/// # Arguments
///
/// * `file_path` - A string slice that holds the path to the file
///
/// # Returns
///
/// * `Ok(Vec<u8>)` - The contents of the file as a vector of bytes
/// * `Err(io::Error)` - An error if the file cannot be read
pub fn read_file_to_bytes(file_path: &str) -> Result<Vec<u8>, io::Error> {
    fs::read(file_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn test_read_file_to_string() {
        // Create a temporary file for testing
        let test_file_path = "test_file.txt";
        let test_content = "Hello, world!\nThis is a test file.";

        // Write test content to the file
        let mut file = File::create(test_file_path).unwrap();
        file.write_all(test_content.as_bytes()).unwrap();

        // Read the file content
        let result = read_file_to_string(test_file_path);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), test_content);

        // Clean up the test file
        std::fs::remove_file(test_file_path).unwrap();
    }

    #[test]
    fn test_read_nonexistent_file() {
        let result = read_file_to_string("nonexistent_file.txt");
        assert!(result.is_err());
    }
}