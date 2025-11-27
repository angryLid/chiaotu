mod base64_decoder;
mod config_manager;
mod downloader;
mod file_reader;
mod node_parser;
mod nodes;
mod yaml_utils;

use crate::{
    config_manager::ConfigManager,
    downloader::download_save_files,
    yaml_utils::{Config, create_groups_by_country, merge_proxies},
};
use file_reader::read_file_to_string;
use itertools::Itertools;
use std::{collections::HashMap, env, vec};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config_manager = ConfigManager::new().unwrap();

    let args: Vec<String> = env::args().collect();

    // Check if a file path argument is provided
    if args.len() <= 1 {
        let contents = config_manager.load_cache()?;
        let mut configs = vec![];
        for (vendor, sub) in contents {
            let  config = Config::from_yaml(&sub)?;

            let mut proxies = vec![];
            use crate::yaml_utils::Proxy;
            for p in config.proxies {
                let name = p.name;
                let first = vendor.chars().next().ok_or_else(||"a".to_string())?;

                let last = vendor.chars().last().ok_or_else(||"a".to_string())?;

                let new_name = format!("{}@{}..{}",name, first, last);
                proxies.push(Proxy {
                    name: new_name,
                    ..p
                });
            }
            let new_config = Config {
                proxies: proxies,
                ..config
            };
            configs.push(new_config);
        }

        let proxies = merge_proxies(configs);
        // remove duplicated items by "name"
        let proxies: Vec<_> = proxies
            .into_iter()
            .unique_by(|proxy| proxy.name.clone())
            .collect();
        let contents = config_manager.load_rules()?;
        let rules: Vec<_> = contents
            .into_iter()
            .flat_map(|e| Config::from_yaml(&e).unwrap().rules)
            .collect();

        let proxy_groups = create_groups_by_country(&proxies);

        let base = config_manager.load_base_template()?;
        let mut config = Config::from_yaml(&base)?;
        config.proxies = proxies;
        config.proxy_groups = proxy_groups;
        config.rules = rules;

        config_manager
            .save_result(&config.to_yaml().unwrap())
            .unwrap();

        return Ok(());
    }

    let file_path = &args[1];

    // Read the file content
    let file_content = read_file_to_string(file_path)?;

    // Split the content into lines and collect URLs
    let urls: Vec<String> = file_content
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    // Create a simple save function using config manager
    let save_fn = move |filename: &str, content: &str| {
        println!("Saving file: {}", filename);
        // Cache the filename
        config_manager.cache(filename, content)?;
        Ok(())
    };

    download_save_files(urls, &save_fn).await?;

    Ok(())
}
