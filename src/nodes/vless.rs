use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Configuration for VLESS protocol nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlessConfig {
    pub server: String,
    pub server_port: u16,
    pub uuid: String,      // UUID-based user ID
    pub encryption: Option<String>,
    pub transport: Option<TransportConfig>,
    pub network: Option<String>,  // ws or grpc
    pub tls: Option<TlsConfig>,
    pub flow: Option<String>,   // Flow control
    pub packet_encoding: Option<String>,
    pub remarks: Option<String>,
    pub fingerprint: Option<String>,
    pub sid: Option<String>,
    pub pbk: Option<String>,
    pub service_name: Option<String>,
    pub security: Option<String>,
    pub insecure: bool,
    pub sni: Option<String>,
}

/// Transport layer configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportConfig {
    pub r#type: String,
    pub path: Option<String>,
    pub host: Option<String>,
    pub header: Option<HeaderConfig>,
}

/// TLS configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TlsConfig {
    pub enabled: bool,
    pub server_name: Option<String>,
    pub fingerprint: Option<String>,
    pub alpn: Option<String>,
}

/// Header configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeaderConfig {
    pub r#type: String,
}

/// Parsed query parameters from URL
#[derive(Debug, Clone)]
struct QueryParams {
    pub r#type: Option<String>,
    pub encryption: Option<String>,
    pub host: Option<String>,
    pub path: Option<String>,
    pub header_type: Option<String>,
    pub quic_security: Option<String>,
    pub service_name: Option<String>,
    pub security: Option<String>,
    pub flow: Option<String>,
    pub packet_encoding: Option<String>,
    pub fp: Option<String>,
    pub sid: Option<String>,
    pub pbk: Option<String>,
    pub insecure: Option<String>,
    pub sni: Option<String>,
}

/// Parses VLESS configuration from a vless:// URL
/// Format: vless://uuid@server:port?type=tcp&encryption=none&host=&path=&headerType=none&quicSecurity=none&serviceName=&security=reality&flow=xtls-rprx-vision&fp=firefox&insecure=0&sni=domain#remarks
///
/// # Arguments
/// * `vless_url` - The vless:// URL to parse
///
/// # Returns
/// * `Option<VlessConfig>` - Parsed configuration or None if parsing fails
pub fn parse_vless_config(vless_url: &str) -> Option<VlessConfig> {
    if !vless_url.starts_with("vless://") {
        return None;
    }

    // Remove vless:// prefix
    let url_part = &vless_url[7..];

    // Find the @ separator between uuid and server
    let at_pos = url_part.find('@')?;
    let uuid_part = &url_part[..at_pos];
    let server_part = &url_part[at_pos + 1..];

    // Extract UUID
    let uuid = extract_uuid(uuid_part)?;

    // Parse server:port and query parameters
    let (server_port_query, remarks) = parse_server_query_remarks(server_part)?;
    let (server_port, query) = parse_server_port_query(server_port_query)?;

    // Parse query parameters
    let params = parse_query_params(query);

    Some(VlessConfig {
        server: server_port.server,
        server_port: server_port.port,
        uuid,
        encryption: params.encryption,
        transport: build_transport_config(&params),
        network: params.network,
        tls: build_tls_config(&params),
        flow: params.flow,
        packet_encoding: params.packet_encoding,
        remarks,
        fingerprint: params.fp,
        sid: params.sid,
        pbk: params.pbk,
        service_name: params.service_name,
        security: params.security,
        insecure: params.insecure.unwrap_or("0") == "1",
        sni: params.sni,
    })
}

/// Extracts UUID from user ID part
/// Validates UUID format with optional hyphens
fn extract_uuid(uuid_part: &str) -> Option<String> {
    // Remove any leading/trailing whitespace
    let cleaned = uuid_part.trim();

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
        r#type: None,
        encryption: None,
        host: None,
        path: None,
        header_type: None,
        quic_security: None,
        service_name: None,
        security: None,
        flow: None,
        packet_encoding: None,
        fp: None,
        sid: None,
        pbk: None,
        insecure: None,
        sni: None,
    };

    if query.is_empty() {
        return params;
    }

    // Parse individual parameters
    for param in query.split('&') {
        let mut key_value = param.splitn(2, '=');
        if let (Some(key), value) = (key_value.next(), key_value.next()) {
            match key {
                "type" => params.r#type = Some(value.to_string()),
                "encryption" => params.encryption = Some(value.to_string()),
                "host" => params.host = Some(value.to_string()),
                "path" => params.path = Some(value.to_string()),
                "headerType" => params.header_type = Some(value.to_string()),
                "quicSecurity" => params.quic_security = Some(value.to_string()),
                "serviceName" => params.service_name = Some(value.to_string()),
                "security" => params.security = Some(value.to_string()),
                "flow" => params.flow = Some(value.to_string()),
                "packetEncoding" => params.packet_encoding = Some(value.to_string()),
                "fp" => params.fp = Some(value.to_string()),
                "sid" => params.sid = Some(value.to_string()),
                "pbk" => params.pbk = Some(value.to_string()),
                "insecure" => params.insecure = Some(value.to_string()),
                "sni" => params.sni = Some(value.to_string()),
                _ => {} // Ignore unknown parameters
            }
        }
    }

    params
}

/// Builds transport configuration from query parameters
fn build_transport_config(params: &QueryParams) -> Option<TransportConfig> {
    if params.r#type.is_none() && params.host.is_none() && params.path.is_none() {
        None
    } else {
        Some(TransportConfig {
            r#type: params.r#type.clone().unwrap_or_else(|| "tcp".to_string()),
            path: params.path.clone(),
            host: params.host.clone(),
            header: params.header_type.clone().map(|ht| HeaderConfig { r#type: ht }),
        })
    }
}

/// Builds TLS configuration from query parameters
fn build_tls_config(params: &QueryParams) -> Option<TlsConfig> {
    if params.quic_security.is_none() && params.service_name.is_none() && params.security.is_none() {
        None
    } else {
        Some(TlsConfig {
            enabled: params.quic_security.is_some() || params.service_name.is_some(),
            server_name: params.sni.clone(),
            fingerprint: params.fp.clone(),
            alpn: None, // Could be extended
        })
    }
}

/// Validates if the configuration is complete and valid
pub fn validate_vless_config(config: &VlessConfig) -> bool {
    !config.server.is_empty()
        && config.server_port > 0
        && config.server_port <= 65535
        && config.uuid.len() >= 32 // UUID should be at least 32 chars
        && is_valid_uuid(&config.uuid)
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
pub fn config_to_string(config: &VlessConfig) -> String {
    format!("vless://{}@{}:{} [{}]",
        config.uuid,
        config.server,
        config.server_port,
        config.remarks.as_deref().unwrap_or("No remarks")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_vless_config() {
        let vless_url = "vless://6a49f6c2-8b2f-4eee-a9ee-9a016e300edb@nl01.ctcxianyu.com:10010?type=tcp&encryption=none&host=&path=&headerType=none&quicSecurity=none&serviceName=&security=reality&flow=xtls-rprx-vision&fp=firefox&insecure=0&sni=d1--ov-gotcha07.bilivideo.com&pbk=43xDvHER1zvWFv3OHjLb6U_t4OcWbpY9moxxZ8UltCM&sid=6ba85179e30d4ff7#NL-A-xTom-0.5%E5%80%8D%E7%8E%87";
        let config = parse_vless_config(vless_url);

        assert!(config.is_some());
        let config = config.unwrap();
        assert_eq!(config.server, "nl01.ctcxianyu.com");
        assert_eq!(config.server_port, 10010);
        assert_eq!(config.uuid, "6a49f6c2-8b2f-4eee-a9ee-9a016e300edb");
        assert_eq!(config.flow, Some("xtls-rprx-vision".to_string()));
        assert_eq!(config.fingerprint, Some("firefox".to_string()));
        assert_eq!(config.security, Some("reality".to_string()));
        assert_eq!(config.insecure, false);
        assert_eq!(config.sni, Some("d1--ov-gotcha07.bilivideo.com".to_string()));
        assert_eq!(config.pbk, Some("43xDvHER1zvWFv3OHjLb6U_t4OcWbpY9moxxZ8UltCM".to_string()));
        assert_eq!(config.sid, Some("6ba85179e30d4ff7".to_string()));
        assert_eq!(config.remarks, Some("NL-A-xTom-0.5%E5%80%8D%E7%8E%87".to_string()));
    }

    #[test]
    fn test_extract_uuid() {
        let uuid = "6a49f6c2-8b2f-4eee-a9ee-9a016e300edb";
        let extracted = extract_uuid(uuid);
        assert_eq!(extracted, Some(uuid.to_string()));

        let invalid_uuid = "not-a-uuid";
        let extracted_invalid = extract_uuid(invalid_uuid);
        assert_eq!(extracted_invalid, None);
    }

    #[test]
    fn test_parse_query_params() {
        let query = "type=tcp&encryption=none&host=&path=&headerType=none&flow=xtls-rprx-vision&fp=firefox&insecure=0";
        let params = parse_query_params(query);

        assert_eq!(params.r#type, Some("tcp".to_string()));
        assert_eq!(params.encryption, Some("none".to_string()));
        assert_eq!(params.flow, Some("xtls-rprx-vision".to_string()));
        assert_eq!(params.fingerprint, Some("firefox".to_string()));
        assert_eq!(params.insecure, Some("0".to_string()));
    }

    #[test]
    fn test_validate_vless_config() {
        let config = VlessConfig {
            server: "example.com".to_string(),
            server_port: 443,
            uuid: "6a49f6c2-8b2f-4eee-a9ee-9a016e300edb".to_string(),
            encryption: Some("none".to_string()),
            transport: None,
            network: None,
            tls: None,
            flow: None,
            packet_encoding: None,
            remarks: None,
            fingerprint: None,
            sid: None,
            pbk: None,
            service_name: None,
            security: None,
            insecure: false,
            sni: None,
        };

        assert!(validate_vless_config(&config));
    }
}