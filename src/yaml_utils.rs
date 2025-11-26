use serde::{Deserialize, Serialize};
use std::{collections::HashMap, vec};

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct Config {
    #[serde(flatten)]
    pub properties: HashMap<String, serde_yaml::Value>,
    pub proxies: Vec<Proxy>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct Proxy {
    pub name: String,
    #[serde(flatten)]
    pub properties: HashMap<String, serde_yaml::Value>,
}
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]

pub struct ProxyGroup {
    name: String,
    r#type: String,
    proxies: Vec<String>,
}

impl ProxyGroup {
    pub fn from_country(country: &str) -> Self {
        ProxyGroup {
            name: country.to_string(),
            r#type: "url-test".to_string(),
            proxies: vec![],
        }
    }
}
pub fn new_config_from_yaml(yaml_content: &str) -> Result<Config, serde_yaml::Error> {
    serde_yaml::from_str(yaml_content)
}

impl Config {
    pub fn from_yaml(yaml_content: &str) -> Result<Config, serde_yaml::Error> {
        serde_yaml::from_str(yaml_content)
    }
    pub fn to_yaml(&self) -> Result<String, serde_yaml::Error> {
        serde_yaml::to_string(self)
    }
}

pub fn create_sample_config() -> Config {
    let mut properties = HashMap::new();
    properties.insert(
        "name".to_string(),
        serde_yaml::Value::String("My App".to_string()),
    );
    properties.insert(
        "version".to_string(),
        serde_yaml::Value::String("1.0.0".to_string()),
    );

    let mut settings_map = serde_yaml::Mapping::new();
    settings_map.insert(
        serde_yaml::Value::String("timeout".to_string()),
        serde_yaml::Value::Number(serde_yaml::Number::from(30)),
    );
    settings_map.insert(
        serde_yaml::Value::String("retry_count".to_string()),
        serde_yaml::Value::Number(serde_yaml::Number::from(3)),
    );
    settings_map.insert(
        serde_yaml::Value::String("debug".to_string()),
        serde_yaml::Value::Bool(true),
    );
    properties.insert(
        "settings".to_string(),
        serde_yaml::Value::Mapping(settings_map),
    );

    let server1_map = {
        let mut map = serde_yaml::Mapping::new();
        map.insert(
            serde_yaml::Value::String("host".to_string()),
            serde_yaml::Value::String("localhost".to_string()),
        );
        map.insert(
            serde_yaml::Value::String("port".to_string()),
            serde_yaml::Value::Number(serde_yaml::Number::from(8080)),
        );
        map.insert(
            serde_yaml::Value::String("protocol".to_string()),
            serde_yaml::Value::String("http".to_string()),
        );
        map
    };

    let server2_map = {
        let mut map = serde_yaml::Mapping::new();
        map.insert(
            serde_yaml::Value::String("host".to_string()),
            serde_yaml::Value::String("api.example.com".to_string()),
        );
        map.insert(
            serde_yaml::Value::String("port".to_string()),
            serde_yaml::Value::Number(serde_yaml::Number::from(443)),
        );
        map.insert(
            serde_yaml::Value::String("protocol".to_string()),
            serde_yaml::Value::String("https".to_string()),
        );
        map
    };

    let servers_vec = vec![
        serde_yaml::Value::Mapping(server1_map),
        serde_yaml::Value::Mapping(server2_map),
    ];
    properties.insert(
        "servers".to_string(),
        serde_yaml::Value::Sequence(servers_vec),
    );

    Config {
        properties,
        proxies: vec![],
    }
}


pub fn create_groups_by_country(proxies: Vec<Proxy>) -> Vec<ProxyGroup> {
    let hk = ProxyGroup::from_country("Hong Kong");
    let mut eu = ProxyGroup::from_country("Europe");
    for Proxy { name,.. } in proxies {
        if name.contains("俄罗斯") {
            eu.proxies.push(name.clone());
        } else if name.contains("英国") {
            eu.proxies.push(name.clone());
        } else if name.contains("瑞士") {
            eu.proxies.push(name.clone());
        }
    }
    vec![]
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_yaml_serialization() {
        let config = create_sample_config();
        let yaml_result = config.to_yaml();
        assert!(yaml_result.is_ok());

        let yaml_str = yaml_result.unwrap();
        println!("Generated YAML:\n{}", yaml_str);
    }

    #[test]
    fn test_yaml_deserialization() {
        let yaml_content = r#"
name: "My App"
version: "1.0.0"
settings:
  timeout: 30
  retry_count: 3
  debug: true
servers:
  - host: "localhost"
    port: 8080
    protocol: "http"
  - host: "api.example.com"
    port: 443
    protocol: "https"
proxies:
  - "http://proxy1.example.com:8080"
  - name: "proxy2"
    url: "socks5://proxy2.example.com:1080"
    auth:
      username: "user"
      password: "pass"
"#;

        let config_result = new_config_from_yaml(yaml_content);
        assert!(config_result.is_ok());

        let config = config_result.unwrap();
        assert_eq!(config.proxies.len(), 2);

        // Check that other properties are captured in the HashMap
        assert!(config.properties.contains_key("name"));
        assert!(config.properties.contains_key("version"));
        assert!(config.properties.contains_key("settings"));
        assert!(config.properties.contains_key("servers"));
    }

    #[test]
    fn test_round_trip() {
        let original_config = create_sample_config();
        let yaml_str = original_config.to_yaml().unwrap();
        let parsed_config = new_config_from_yaml(&yaml_str).unwrap();

        let original_config = create_sample_config();
        assert_eq!(original_config, parsed_config);
    }
}
