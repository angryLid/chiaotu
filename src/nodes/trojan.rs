use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Configuration for Trojan protocol nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrojanConfig {
    pub server: String,
    pub server_port: u16,
    pub password: String,  // UUID-based password
    pub remarks: Option<String>,
    pub allow_insecure: bool,
    pub sni: Option<String>,
    pub peer: Option<String>,
    pub network: Option<String>,  // ws or grpc
}

/// Parsed query parameters from URL
#[derive(Debug, Clone)]
pub struct QueryParams {
    pub allow_insecure: bool,
    pub peer: Option<String>,
    pub sni: Option<String>,
}

/// Parses Trojan configuration from a trojan:// URL
/// Format: trojan://uuid@server:port?allowInsecure=1&peer=host&sni=domain#remarks
///
/// # Arguments
/// * `trojan_url` - The trojan:// URL to parse
///
/// # Returns
/// * `Option<TrojanConfig>` - Parsed configuration or None if parsing fails
pub fn parse_trojan_config(trojan_url: &str) -> Option<TrojanConfig> {
    if !trojan_url.starts_with("trojan://") {
        return None;
    }

    // Remove trojan:// prefix
    let url_part = &trojan_url[8..];

    // Find the @ separator between password and server
    let at_pos = url_part.find('@')?;
    let password_part = &url_part[..at_pos];
    let server_part = &url_part[at_pos + 1..];

    // Extract UUID password
    let password = extract_uuid(password_part)?;

    // Parse server:port and query parameters
    let (server_port_query, remarks) = parse_server_query_remarks(server_part)?;
    let (server_port, query) = parse_server_port_query(server_port_query)?;

    // Parse query parameters
    let params = parse_query_params(query);

    Some(TrojanConfig {
        server: server_port.server,
        server_port: server_port.port,
        password,
        remarks,
        allow_insecure: params.allow_insecure,
        sni: params.sni,
        peer: params.peer,
        network: params.network,
    })
}

/// Extracts UUID from password part
/// Validates UUID format with optional hyphens
fn extract_uuid(password_part: &str) -> Option<String> {
    // Remove any leading/trailing whitespace
    let cleaned = password_part.trim();

    // Basic UUID format validation (simplified)
    if cleaned.len() != 32 && cleaned.len() != 36 {
        return None;
    }

    // Check if it looks like a UUID (hex characters with optional hyphens)
    if cleaned.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        Some(cleaned.to_string())
    } else {
        None
    }
}

/// Helper struct to hold server, port, and query
#[derive(Debug, Clone)]
struct ServerPortQuery {
    server: String,
    port: u16,
    query: String,
}

/// Parses server:port?query#remarks format
fn parse_server_query_remarks(server_query_remarks: &str) -> Option<(ServerPortQuery, Option<String>)> {
    // Split on ? to separate query
    let mut parts: Vec<&str> = server_query_remarks.split('?').collect();
    if parts.is_empty() {
        return None;
    }

    let server_port_part = parts[0];
    let query = if parts.len() > 1 { parts[1].to_string() } else { String::new() };

    // Check if there are #remarks
    let (server_port_with_query, remarks) = if let Some(hash_pos) = server_port_part.find('#') {
        let remarks_part = &server_port_part[hash_pos + 1..];
        let server_port_part = &server_port_part[..hash_pos];
        let decoded_remarks = urlencoding::decode(remarks_part).ok_or_else(|_| remarks_part.to_string())?;
        (server_port_part.to_string(), Some(decoded_remarks))
    } else {
        (server_port_part.to_string(), None)
    };

    parse_server_port_query_with_query(&server_port_with_query, &query, remarks)
}

/// Parses server:port with query part
fn parse_server_port_query_with_query(server_port_query: &str, additional_query: &str, remarks: Option<String>) -> Option<(ServerPortQuery, Option<String>)> {
    // Combine queries
    let full_query = if additional_query.is_empty() {
        server_port_query.to_string()
    } else {
        format!("{}&{}", server_port_query, additional_query)
    };

    // Split on ? to get server:port part
    let parts: Vec<&str> = full_query.split('?').collect();
    if parts.is_empty() {
        return None;
    }

    let server_port_part = parts[0];
    let query = if parts.len() > 1 { parts[1].to_string() } else { String::new() };

    // Parse server:port (handle IPv6 addresses)
    if let Some(last_colon) = server_port_part.rfind(':') {
        let server = server_port_part[..last_colon].to_string();
        let port_str = &server_port_part[last_colon + 1..];

        let port = port_str.parse().ok()?;

        Some((ServerPortQuery { server, port }, remarks))
    } else {
        None
    }
}

/// Parses server:port format without query
fn parse_server_port_query(server_port_part: &str) -> Option<(ServerPortQuery, String)> {
    // Parse server:port (handle IPv6 addresses)
    if let Some(last_colon) = server_port_part.rfind(':') {
        let server = server_port_part[..last_colon].to_string();
        let port_str = &server_port_part[last_colon + 1..];

        let port = port_str.parse().ok()?;

        Some((ServerPortQuery { server, port }, String::new()))
    } else {
        None
    }
}

/// Parses query parameters into a structured format
fn parse_query_params(query: &str) -> QueryParams {
    let mut params = QueryParams {
        allow_insecure: false,
        peer: None,
        sni: None,
        network: None,
    };

    if query.is_empty() {
        return params;
    }

    // Parse individual parameters
    for param in query.split('&') {
        let mut key_value = param.splitn(2, '=');
        if let (Some(key), value) = (key_value.next(), key_value.next()) {
            match key {
                "allowInsecure" => {
                    params.allow_insecure = value == "1";
                }
                "peer" => {
                    params.peer = Some(value.to_string());
                }
                "sni" => {
                    params.sni = Some(urlencoding::decode(value).ok_or_else(|_| value.to_string())?);
                }
                "network" => {
                    params.network = Some(value.to_string());
                }
                _ => {} // Ignore unknown parameters
            }
        }
    }

    params
}

/// Validates if the configuration is complete and valid
pub fn validate_trojan_config(config: &TrojanConfig) -> bool {
    !config.server.is_empty()
        && config.server_port > 0
        && config.server_port <= 65535
        && config.password.len() >= 32 // UUID should be at least 32 chars
        && is_valid_uuid(&config.password)
}

/// Basic UUID validation
fn is_valid_uuid(uuid: &str) -> bool {
    // Very basic UUID validation - could be improved
    let chars: Vec<char> = uuid.chars().collect();

    if chars.len() != 32 && chars.len() != 36 {
        return false;
    }

    // Check for valid UUID characters (hex digits and hyphens)
    chars.iter().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// Converts configuration to a standard string representation
pub fn config_to_string(config: &TrojanConfig) -> String {
    format!("trojan://{}@{}:{} [{}]",
        config.password,
        config.server,
        config.server_port,
        config.remarks.as_deref().unwrap_or("No remarks")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_trojan_config() {
        let trojan_url = "trojan://f9ad69aa-bb58-48bb-93d7-47a8e93651d4@1ab9008c.sched.sma-dk.ali-oss.cn:12068?allowInsecure=1&peer=cdn.alibaba.com&sni=cdn.alibaba.com#%F0%9F%87%A6%F0%9F%87%BA%20%E6%BE%B3%E5%A4%A7%E5%88%A9%E4%BA%9A%2001";
        let config = parse_trojan_config(trojan_url);

        assert!(config.is_some());
        let config = config.unwrap();
        assert_eq!(config.server, "1ab9008c.sched.sma-dk.ali-oss.cn");
        assert_eq!(config.server_port, 12068);
        assert_eq!(config.password, "f9ad69aa-bb58-48bb-93d7-47a8e93651d4");
        assert_eq!(config.allow_insecure, true);
        assert_eq!(config.peer, Some("cdn.alibaba.com".to_string()));
        assert_eq!(config.sni, Some("cdn.alibaba.com".to_string()));
        assert_eq!(config.remarks, Some("☀☀☀☀☀☀ 北京-上海 2001".to_string()));
    }

    #[test]
    fn test_extract_uuid() {
        let uuid = "f9ad69aa-bb58-48bb-93d7-47a8e93651d4";
        let extracted = extract_uuid(uuid);
        assert_eq!(extracted, Some(uuid.to_string()));

        let invalid_uuid = "not-a-uuid";
        let extracted_invalid = extract_uuid(invalid_uuid);
        assert_eq!(extracted_invalid, None);
    }

    #[test]
    fn test_parse_query_params() {
        let query = "allowInsecure=1&peer=cdn.alibaba.com&sni=cdn.alibaba.com";
        let params = parse_query_params(query);

        assert_eq!(params.allow_insecure, true);
        assert_eq!(params.peer, Some("cdn.alibaba.com".to_string()));
        assert_eq!(params.sni, Some("cdn.alibaba.com".to_string()));
    }

    #[test]
    fn test_validate_trojan_config() {
        let config = TrojanConfig {
            server: "example.com".to_string(),
            server_port: 443,
            password: "f9ad69aa-bb58-48bb-93d7-47a8e93651d4".to_string(),
            remarks: None,
            allow_insecure: false,
            sni: None,
            peer: None,
            network: None,
        };

        assert!(validate_trojan_config(&config));
    }
}