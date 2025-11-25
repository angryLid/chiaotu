mod downloader;
mod base64_decoder;
mod node_parser;
mod nodes;
mod yaml_utils;
mod file_reader;

use downloader::download_text;
use base64_decoder::decode_interactive;
use yaml_utils::{create_sample_config, new_config_from_yaml};
use file_reader::read_file_to_string;
use std::{env, iter};
use futures::future::join_all;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();

    // Check if a file path argument is provided
    if args.len() <= 1 {
        eprintln!("Usage: {} <file_path>", args[0]);
        std::process::exit(1);
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

    println!("Found {} URLs in the file", urls.len());

    // Create futures for all URLs
    let download_futures = urls.iter().map(|url| async move {
        println!("Downloading from: {}", url);
        download_text(url).await.unwrap()
    });

    // Execute all downloads in parallel
    let results= join_all(download_futures).await;

    let results = results
    .iter()
    .map(|raw| {
        let config = new_config_from_yaml(&raw).unwrap();
        let proxies = config.proxies;
        proxies
    }).flatten();

    for p in results {
        println!("{}", p.name);
    }


    Ok(())
}

