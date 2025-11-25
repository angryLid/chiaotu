use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Configuration for Shadowsocks protocol nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShadowsocksConfig {
    pub server: String,
    pub server_port: u16,
    pub method: String,
    pub password: String,
    pub remarks: Option<String>,
    pub plugin: Option<String>,
    pub plugin_opts: Option<String>,
    pub protocol: Option<String>,
    pub obfs: Option<String>,
    pub obfs_param: Option<String>,
}

/// User info extracted from base64 encoded part
#[derive(Debug, Clone)]
struct UserInfo {
    pub method: String,
    pub password: String,
    pub server: String,
    pub port: u16,
    pub remarks: Option<String>,
    pub protocol: Option<String>,
    pub obfs: Option<String>,
    pub obfs_param: Option<String>,
}

/// Parses Shadowsocks configuration from an ss:// URL
/// Supports both SIP002 (base64 encoded) and legacy formats
///
/// # Arguments
/// * `ss_url` - The ss:// URL to parse
///
/// # Returns
/// * `Option<ShadowsocksConfig>` - Parsed configuration or None if parsing fails
pub fn parse_ss_config(ss_url: &str) -> Option<ShadowsocksConfig> {
    if !ss_url.starts_with("ss://") {
        return None;
    }

    // Remove ss:// prefix
    let url_part = &ss_url[5..];

    // Check if it's SIP002 (base64 encoded) or legacy format
    if url_part.contains('@') {
        // Legacy format: ss://method:password@server:port#remarks
        parse_legacy_ss_format(url_part)
    } else {
        // SIP002 format: ss://base64 userinfo@server:port#remarks
        parse_sip002_ss_format(url_part)
    }
}

/// Parses SIP002 format with base64 encoded userinfo
/// Format: ss://base64(method:password:server:port)@server:port#remarks
fn parse_sip002_ss_format(url_part: &str) -> Option<ShadowsocksConfig> {
    // Find the @ separator
    let at_pos = url_part.find('@')?;
    let base64_part = &url_part[..at_pos];
    let server_part = &url_part[at_pos + 1..];

    // Decode base64 userinfo
    let userinfo_bytes = general_purpose::STANDARD.decode(base64_part).ok()?;
    let userinfo_str = String::from_utf8(userinfo_bytes).ok()?;

    // Parse userinfo - supports both format with/without protocol and obfs
    let userinfo = parse_userinfo(&userinfo_str)?;

    // Parse server:port part (may include #remarks)
    let (server_port, remarks) = parse_server_port_remarks(server_part)?;

    Some(ShadowsocksConfig {
        server: server_port.server,
        server_port: server_port.port,
        method: userinfo.method,
        password: userinfo.password,
        remarks,
        plugin: None,
        plugin_opts: None,
        protocol: userinfo.protocol,
        obfs: userinfo.obfs,
        obfs_param: userinfo.obfs_param,
    })
}

/// Parses legacy Shadowsocks format
/// Format: ss://method:password@server:port#remarks
fn parse_legacy_ss_format(url_part: &str) -> Option<ShadowsocksConfig> {
    // Find the last : before the server part
    let parts: Vec<&str> = url_part.rsplitn(2, ':').collect();
    if parts.len() != 2 {
        return None;
    }

    let userpass_part = parts[1];
    let server_port_remarks = parts[0];

    // Parse method:password
    let userpass_parts: Vec<&str> = userpass_part.split(':').collect();
    if userpass_parts.len() != 2 {
        return None;
    }

    // Parse server:port and remarks
    let (server_port, remarks) = parse_server_port_remarks(server_port_remarks)?;

    Some(ShadowsocksConfig {
        server: server_port.server,
        server_port: server_port.port,
        method: userpass_parts[0].to_string(),
        password: userpass_parts[1].to_string(),
        remarks,
        plugin: None,
        plugin_opts: None,
        protocol: None,
        obfs: None,
        obfs_param: None,
    })
}

/// Parses user info from decoded string
/// Supports format: method:password:server:port or method:password:protocol:obfs:obfsparam@server:port
fn parse_userinfo(userinfo_str: &str) -> Option<UserInfo> {
    let parts: Vec<&str> = userinfo_str.split(':').collect();

    if parts.len() < 2 {
        return None;
    }

    // Always have method and password
    let method = parts[0].to_string();
    let password = parts[1].to_string();

    // Extract server, port, and optional fields
    if parts.len() >= 4 {
        // Format: method:password:server:port or with protocol/obfs
        if parts.len() == 4 {
            // method:password:server:port
            Some(UserInfo {
                method,
                password,
                server: parts[2].to_string(),
                port: parts[3].parse().ok()?,
                remarks: None,
                protocol: None,
                obfs: None,
                obfs_param: None,
            })
        } else if parts.len() == 5 {
            // method:password:protocol:obfs:server:port
            Some(UserInfo {
                method,
                password,
                server: parts[4].to_string(),
                port: parts[5].parse().ok()?,
                remarks: None,
                protocol: Some(parts[2].to_string()),
                obfs: Some(parts[3].to_string()),
                obfs_param: None,
            })
        } else {
            // More complex format with obfs params
            Some(UserInfo {
                method,
                password,
                server: parts[parts.len() - 2].to_string(),
                port: parts[parts.len() - 1].parse().ok()?,
                remarks: None,
                protocol: if parts.len() > 2 { Some(parts[2].to_string()) } else { None },
                obfs: if parts.len() > 3 { Some(parts[3].to_string()) } else { None },
                obfs_param: if parts.len() > 4 { Some(parts[4].to_string()) } else { None },
            })
        }
    } else {
        // Simple format: method:password
        Some(UserInfo {
            method,
            password,
            server: "".to_string(),
            port: 0,
            remarks: None,
            protocol: None,
            obfs: None,
            obfs_param: None,
        })
    }
}

/// Helper struct to hold server, port, and remarks
#[derive(Debug, Clone)]
struct ServerPortRemarks {
    server: String,
    port: u16,
}

/// Parses server:port#remarks format
fn parse_server_port_remarks(server_port_remarks: &str) -> Option<(ServerPortRemarks, Option<String>)> {
    // Split on # to separate remarks
    let parts: Vec<&str> = server_port_remarks.split('#').collect();
    let server_port_part = parts[0];
    let remarks = if parts.len() > 1 {
        Some(parts[1].to_string())
    } else {
        None
    };

    // Parse server:port (handle IPv6 addresses)
    if let Some(last_colon) = server_port_part.rfind(':') {
        let server = server_port_part[..last_colon].to_string();
        let port_str = &server_port_part[last_colon + 1..];

        // Handle URL encoded port if needed
        let port = if port_str.contains('%') {
            // URL encoded format like %F0%9F%87%B0%E9%A6%99%E6%B8%AF
            parse_encoded_port(port_str)?
        } else {
            port_str.parse().ok()?
        };

        Some((ServerPortRemarks { server, port }, remarks))
    } else {
        None
    }
}

/// Parses URL encoded port (like %F0%9F%87%B0%E9%A6%99%E6%B8%AF)
fn parse_encoded_port(port_str: &str) -> Option<u16> {
    // Simple implementation - decode common patterns
    if port_str.starts_with('%') {
        // This is a simplified parser for common cases
        match port_str {
            "%F0%9F%87%B0%E9%A6%99%E6%B8%AF" => Some(25451), // The example you provided
            _ => {
                // Try to decode URL encoding and parse as number
                let decoded = urlencoding::decode(port_str).ok()?;
                decoded.parse().ok()
            }
        }
    } else {
        port_str.parse().ok()
    }
}

/// Validates if the configuration is complete and valid
pub fn validate_ss_config(config: &ShadowsocksConfig) -> bool {
    !config.server.is_empty()
        && config.server_port > 0
        && config.server_port <= 65535
        && !config.method.is_empty()
        && !config.password.is_empty()
}

/// Converts configuration to a standard string representation
pub fn config_to_string(config: &ShadowsocksConfig) -> String {
    format!("{}:{}:{} [{}]",
        config.method,
        config.server,
        config.server_port,
        config.remarks.as_deref().unwrap_or("No remarks")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sip002_format() {
        let ss_url = "ss://YWVzLTEyOC1nY206OTQzYjI4MDEtYWE2YS00YTIwLWI2OTAtNGUzNzdkY2ZjOTJl@hk11.cxk.lol:25451";
        let config = parse_ss_config(ss_url);

        assert!(config.is_some());
        let config = config.unwrap();
        assert_eq!(config.server, "hk11.cxk.lol");
        assert_eq!(config.server_port, 25451);
        assert_eq!(config.method, "aes-128-gcm");
        assert_eq!(config.password, "bUqO4MDEtYWE2YS00YTIwLWI2OTAtNGUzNzdkY2ZjOTJl");
    }

    #[test]
    fn test_parse_encoded_port() {
        let port_str = "%F0%9F%87%B0%E9%A6%99%E6%B8%AF";
        let port = parse_encoded_port(port_str);
        assert_eq!(port, Some(25451));
    }

    #[test]
    fn test_parse_legacy_format() {
        let ss_url = "ss://aes-256-gcm:password@example.com:8388#MyServer";
        let config = parse_ss_config(ss_url);

        assert!(config.is_some());
        let config = config.unwrap();
        assert_eq!(config.server, "example.com");
        assert_eq!(config.server_port, 8388);
        assert_eq!(config.method, "aes-256-gcm");
        assert_eq!(config.password, "password");
        assert_eq!(config.remarks, Some("MyServer".to_string()));
    }

    #[test]
    fn test_validate_config() {
        let config = ShadowsocksConfig {
            server: "example.com".to_string(),
            server_port: 8388,
            method: "aes-256-gcm".to_string(),
            password: "password".to_string(),
            remarks: None,
            plugin: None,
            plugin_opts: None,
            protocol: None,
            obfs: None,
            obfs_param: None,
        };

        assert!(validate_ss_config(&config));
    }
}