mod base64_decoder;
mod config_manager;
mod downloader;
mod file_reader;
mod node_parser;
mod nodes;
mod yaml_utils;

use file_reader::read_file_to_string;
use std::{collections::HashMap, env};
use crate::{
    config_manager::ConfigManager,
    downloader::download_save_files, yaml_utils::{Config, create_groups_by_country, merge_proxies},
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config_manager = ConfigManager::new().unwrap();

    let args: Vec<String> = env::args().collect();

    // Check if a file path argument is provided
    if args.len() <= 1 {
        let contents = config_manager.load_cache()?;
        let configs: Vec<Config> = contents
            .into_iter()
            .map(|c| Config::from_yaml(&c).unwrap())
            .collect();
        let proxies = merge_proxies(configs);
        let proxy_groups = create_groups_by_country(&proxies);

        let config = Config {
            proxies: proxies,
            proxy_groups:  proxy_groups,
            properties: HashMap::new(),
        };
        
        config_manager.save_result(&config.to_yaml().unwrap()).unwrap();

        return Ok(())
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
