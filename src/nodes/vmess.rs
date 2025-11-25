use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};

/// Configuration for Vmess protocol nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VmessConfig {
    #[serde(rename = "v")]
    pub version: String,
    #[serde(rename = "ps")]
    pub remarks: String,
    #[serde(rename = "add")]
    pub address: String,
    #[serde(rename = "port")]
    pub port: String,
    #[serde(rename = "id")]
    pub user_id: String,
    #[serde(rename = "aid")]
    pub alter_id: String,
    #[serde(rename = "net")]
    pub network: String,
    #[serde(rename = "type")]
    pub header_type: String,
    #[serde(rename = "host")]
    pub host: String,
    #[serde(rename = "path")]
    pub path: String,
    #[serde(rename = "tls")]
    pub tls: String,
}

/// Parses Vmess configuration from a vmess:// URL
///
/// # Arguments
/// * `vmess_url` - The vmess:// URL to parse
///
/// # Returns
/// * `Option<VmessConfig>` - Parsed configuration or None if parsing fails
pub fn parse_vmess_config(vmess_url: &str) -> Option<VmessConfig> {
    if !vmess_url.starts_with("vmess://") {
        return None;
    }

    // Remove vmess:// prefix
    let encoded_data = &vmess_url[8..];

    // Try to decode base64 part
    match general_purpose::STANDARD.decode(encoded_data) {
        Ok(decoded_bytes) => {
            match String::from_utf8(decoded_bytes) {
                Ok(json_str) => {
                    match serde_json::from_str::<VmessConfig>(&json_str) {
                        Ok(config) => Some(config),
                        Err(_) => None,
                    }
                }
                Err(_) => None,
            }
        }
        Err(_) => {
            // Try URL-safe encoding
            match general_purpose::URL_SAFE.decode(encoded_data) {
                Ok(decoded_bytes) => {
                    match String::from_utf8(decoded_bytes) {
                        Ok(json_str) => {
                            match serde_json::from_str::<VmessConfig>(&json_str) {
                                Ok(config) => Some(config),
                                Err(_) => None,
                            }
                        }
                        Err(_) => None,
                    }
                }
                Err(_) => None,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose;

    #[test]
    fn test_parse_vmess_config() {
        // Test with a simple vmess config (base64 encoded)
        let config_json = r#"{"v":"2","ps":"test-node","add":"example.com","port":"443","id":"12345678-1234-1234-1234-123456789abc","aid":"0","net":"ws","type":"none","host":"","path":"/","tls":""}"#;
        let encoded_config = general_purpose::STANDARD.encode(config_json);
        let vmess_url = format!("vmess://{}", encoded_config);

        match parse_vmess_config(&vmess_url) {
            Some(config) => {
                assert_eq!(config.version, "2");
                assert_eq!(config.remarks, "test-node");
                assert_eq!(config.address, "example.com");
                assert_eq!(config.port, "443");
            }
            None => panic!("Failed to parse vmess config"),
        }
    }
}