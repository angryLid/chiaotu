use serde::{Deserialize, Serialize};
use std::{collections::HashMap, vec};

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct Config {
    #[serde(flatten)]
    pub properties: HashMap<String, serde_yaml::Value>,
    pub proxies: Vec<Proxy>,
    #[serde(rename = "proxy-groups")]
    pub proxy_groups: Vec<ProxyGroup>,
    pub rules: Vec<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    timeout: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    interval: Option<u64>,
}

impl ProxyGroup {
    pub fn from_country(country: &str) -> Self {
        ProxyGroup {
            name: country.to_string(),
            r#type: "url-test".to_string(),
            proxies: vec![],
            timeout: None,
            interval: Some(60 * 60),
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
        proxy_groups: vec![],
        rules: vec![]
    }
}

pub fn merge_proxies(configs: Vec<Config>) -> Vec<Proxy> {
    configs
        .into_iter()
        .flat_map(|config| config.proxies)
        .collect()
}

pub fn merge_rules(rules: Vec<Config>) -> Vec<String> {
    rules
        .into_iter()
        .flat_map(|config| config.rules)
        .collect()
}

pub fn create_groups_by_country(proxies: &Vec<Proxy>) -> Vec<ProxyGroup> {
    let mut de = ProxyGroup::from_country("Germany");
    let mut tw = ProxyGroup::from_country("Taiwan");
    let mut hk = ProxyGroup::from_country("Hong Kong");
    let mut jp = ProxyGroup::from_country("Japan");
    let mut sg = ProxyGroup::from_country("Singapore");
    let mut us = ProxyGroup::from_country("US");
    let mut uk = ProxyGroup::from_country("UK");
    let mut others = ProxyGroup::from_country("Other");

    for Proxy { name, .. } in proxies {
        if name.contains("德国") || name.contains("DE") {
            de.proxies.push(name.clone());
            continue;
        } else if name.contains("台湾") || name.contains("TW") {
            tw.proxies.push(name.clone());
            continue;
        } else if name.contains("香港") || name.contains("HK") {
            hk.proxies.push(name.clone());
            continue;
        } else if name.contains("日本") || name.contains("JP") {
            jp.proxies.push(name.clone());
            continue;
        } else if name.contains("新加坡") || name.contains("SG") {
            sg.proxies.push(name.clone());
            continue;
        } else if name.contains("美国") || name.contains("US") {
            us.proxies.push(name.clone());
            continue;
        } else if name.contains("英国") || name.contains("UK") {
            uk.proxies.push(name.clone());
            continue;
        } else if name.contains("剩余") || name.contains("到期") {
            continue;
        } else {
            others.proxies.push(name.clone());
            continue;
        }
    }
    let select = ProxyGroup {
        name: "手动选择".to_string(),
        r#type: "select".to_string(),
        proxies: vec![
            "Germany",
            "Taiwan",
            "Hong Kong",
            "Japan",
            "Singapore",
            "US",
            "UK",
            "Other",
        ].iter().map(|s| s.to_string()).collect(),
        timeout: None,
        interval: None,
    };
    let ms = ProxyGroup {
        name: "Microsoft".to_string(),
        r#type: "select".to_string(),
        proxies: vec![
            "DIRECT",
            "Germany",
            "Taiwan",
            "Hong Kong",
            "Japan",
            "Singapore",
            "US",
            "UK",
            "Other",
        ].iter().map(|s| s.to_string()).collect(),
        timeout: None,
        interval: None,
    };
    let apple = ProxyGroup {
        name: "Apple".to_string(),
        r#type: "select".to_string(),
        proxies: vec![
            "DIRECT",
            "Germany",
            "Taiwan",
            "Hong Kong",
            "Japan",
            "Singapore",
            "US",
            "UK",
            "Other",
        ].iter().map(|s| s.to_string()).collect(),
        timeout: None,
        interval: None,
    };
    let google = ProxyGroup {
        name: "Google".to_string(),
        r#type: "select".to_string(),
        proxies: vec![
            "Germany",
            "Taiwan",
            "Hong Kong",
            "Japan",
            "Singapore",
            "US",
            "UK",
            "Other",
        ].iter().map(|s| s.to_string()).collect(),
        timeout: None,
        interval: None,
    };
    vec![select,google,ms,apple, de, tw, hk, jp, sg, us, uk, others]
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
