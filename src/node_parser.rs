
use crate::nodes::{VmessConfig, parse_vmess_config};

/// Represents a parsed node with its protocol information
#[derive(Debug, Clone)]
pub struct Node {
    pub protocol: Protocol,
    pub vmess_config: Option<VmessConfig>,
}

/// Protocol types that a node can have
#[derive(Debug, Clone, PartialEq)]
pub enum Protocol {
    Vmess,
    Unidentified,
}

/// Splits input string by line feed and returns a vector of strings
///
/// # Arguments
/// * `input` - The input string to split
///
/// # Returns
/// * `Vec<String>` - Vector of strings, each representing a line
pub fn split_by_lines(input: &str) -> Vec<String> {
    input
        .lines()
        .filter(|line| !line.trim().is_empty()) // Remove empty lines
        .map(|line| line.to_string())
        .collect()
}

/// Converts a vector of strings to a vector of Node structs
/// Each string is parsed to determine its protocol type
///
/// # Arguments
/// * `lines` - Vector of strings to parse
///
/// # Returns
/// * `Vec<Node>` - Vector of Node structs
pub fn parse_lines_to_nodes(lines: Vec<String>) -> Vec<Node> {
    lines.into_iter()
        .map(|line| parse_line_to_node(&line))
        .collect()
}

/// Parses a single line into a Node struct
/// Determines protocol based on string content and extracts config if Vmess
///
/// # Arguments
/// * `line` - A single line string to parse
///
/// # Returns
/// * `Node` - Node struct with detected protocol and optional config
pub fn parse_line_to_node(line: &str) -> Node {
    let protocol = detect_protocol(line);

    let vmess_config = if protocol == Protocol::Vmess {
        parse_vmess_config(line)
    } else {
        None
    };

    Node { protocol, vmess_config }
}

/// Detects protocol type from a line string
/// Currently checks for Vmess protocol patterns
///
/// # Arguments
/// * `line` - The line to analyze
///
/// # Returns
/// * `Protocol` - The detected protocol type
fn detect_protocol(line: &str) -> Protocol {
    let trimmed = line.trim();

    // Check for Vmess patterns
    if trimmed.starts_with("vmess://") ||
       trimmed.to_lowercase().contains("vmess") {
        Protocol::Vmess
    } else {
        Protocol::Unidentified
    }
}

/// Parse input string directly to nodes (combines split and parse)
///
/// # Arguments
/// * `input` - Raw input string
///
/// # Returns
/// * `Vec<Node>` - Vector of parsed nodes
pub fn parse_to_nodes(input: &str) -> Vec<Node> {
    let lines = split_by_lines(input);
    parse_lines_to_nodes(lines)
}

/// Get protocol name as string
///
/// # Arguments
/// * `protocol` - Protocol enum
///
/// # Returns
/// * `&'static str` - String representation of protocol
pub fn protocol_to_string(protocol: &Protocol) -> &'static str {
    match protocol {
        Protocol::Vmess => "Vmess",
        Protocol::Unidentified => "Unidentified",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_by_lines() {
        let input = "line1\nline2\n\nline3\n";
        let result = split_by_lines(input);
        assert_eq!(result, vec!["line1", "line2", "line3"]);
    }

    #[test]
    fn test_detect_protocol_vmess() {
        let vmess_line = "vmess://eyJ2Ijo...";
        let result = detect_protocol(vmess_line);
        assert_eq!(result, Protocol::Vmess);
    }

    #[test]
    fn test_detect_protocol_unidentified() {
        let unknown_line = "some random text";
        let result = detect_protocol(unknown_line);
        assert_eq!(result, Protocol::Unidentified);
    }

    #[test]
    fn test_parse_line_to_node() {
        let line = "vmess://eyJ2IjoiMiIsIn...}";
        let node = parse_line_to_node(line);
        assert_eq!(node.protocol, Protocol::Vmess);
    }

    #[test]
    fn test_parse_to_nodes() {
        let input = "vmess://line1\nrandom line\nvmess://line3";
        let nodes = parse_to_nodes(input);
        assert_eq!(nodes.len(), 3);
        assert_eq!(nodes[0].protocol, Protocol::Vmess);
        assert_eq!(nodes[1].protocol, Protocol::Unidentified);
        assert_eq!(nodes[2].protocol, Protocol::Vmess);
    }

    #[test]
    fn test_protocol_to_string() {
        assert_eq!(protocol_to_string(&Protocol::Vmess), "Vmess");
        assert_eq!(protocol_to_string(&Protocol::Unidentified), "Unidentified");
    }
}