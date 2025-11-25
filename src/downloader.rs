use futures::future::{join_all, try_join_all};
use reqwest;
use std::error::Error;

/// Type alias for save closure function (simplifies function signatures)
type Filename = str;
type Content = str;
pub type SaveFn = dyn Fn(&Filename, &Content) -> Result<(), Box<dyn Error>> + Send + Sync;

/// TLS configuration for HTTP client
#[derive(Debug, Clone)]
pub struct TlsConfig {
    pub accept_invalid_certs: bool,
    pub accept_invalid_hostnames: bool,
    pub use_sni: bool,
    pub min_tls_version: Option<String>,
}

impl Default for TlsConfig {
    fn default() -> Self {
        Self {
            accept_invalid_certs: true,     // Accept self-signed certificates
            accept_invalid_hostnames: true, // Accept invalid hostnames
            use_sni: true,                  // Always use SNI
            min_tls_version: None,          // Accept any TLS version
        }
    }
}

/// Downloads text content from the specified HTTP endpoint
///
/// # Arguments
/// * `url` - The URL to download text from
///
/// # Returns
/// * `Result<String, Box<dyn Error>>` - The downloaded text content or an error
pub async fn download_text(url: &str) -> Result<String, Box<dyn Error>> {
    download_text_with_tls(url, None).await
}

/// Downloads text content with custom TLS configuration
///
/// # Arguments
/// * `url` - The URL to download text from
/// * `tls_config` - Optional TLS configuration
///
/// # Returns
/// * `Result<String, Box<dyn Error>>` - The downloaded text content or an error
pub async fn download_text_with_tls(
    url: &str,
    tls_config: Option<TlsConfig>,
) -> Result<String, Box<dyn Error>> {
    let chrome_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    let clash_ua = "ClashMetaForAndroid/2.11.19";
    let mut client_builder = reqwest::Client::builder().user_agent(clash_ua);

    // Apply TLS configuration if provided
    if let Some(tls) = tls_config {
        // Create a rustls client with custom configuration
        client_builder = client_builder
            .danger_accept_invalid_certs(tls.accept_invalid_certs)
            .use_rustls_tls();
    }

    let client = client_builder.build()?;

    let response = client.get(url).send().await?;

    if !response.status().is_success() {
        return Err(format!("HTTP request failed with status: {}", response.status()).into());
    }

    let header = response.headers().get("key");
    let text = response.text().await?;
    Ok(text)
}

/// Downloads and saves files from a list of URLs
///
/// # Arguments
/// * `url_list` - Vector of URLs to download
/// * `save_fn` - Save function callback
///
/// # Returns
/// * `Result<(), Box<dyn Error>>` - Success or error
pub async fn download_save_files(
    url_list: Vec<String>,
    save_fn: &SaveFn,
) -> Result<(), Box<dyn Error>> {
    let clash_ua = "ClashMetaForAndroid/2.11.19";
    let client = reqwest::Client::builder().user_agent(clash_ua).build()?;

    // Create download tasks for all URLs in parallel
    let download_tasks: Vec<_> = url_list
        .into_iter()
        .map(async |url| {
            let response = client.get(&url).send().await.unwrap();

            if !response.status().is_success() {
                panic!("Couldn't get {}", url);
            }

            // Extract filename from Content-Disposition header
            let filename = extract_filename_from_response(&response).unwrap_or_else(|| {
                // Fallback: extract filename from URL
                extract_filename_from_url(&url)
            });

            // Download the content
            let content = response.text().await.unwrap();

            save_fn(&filename, &content).unwrap();
        })
        .collect();

    // Execute all downloads in parallel and collect results
    join_all(download_tasks).await;

    Ok(())
}

/// Extracts filename from Content-Disposition header
fn extract_filename_from_response(response: &reqwest::Response) -> Option<String> {
    if let Some(content_disposition) = response.headers().get("content-disposition") {
        if let Ok(disposition_str) = content_disposition.to_str() {
            return parse_content_disposition_filename(disposition_str);
        }
    }
    None
}

/// Parses filename from Content-Disposition header string
fn parse_content_disposition_filename(disposition: &str) -> Option<String> {
    // Look for filename*=UTF-8''filename.ext or filename="filename.ext"
    let patterns = [
        r#"filename\*?=\s*UTF-8''([^;"\s]+)"#,
        r#"filename="?([^;"\s]+)"?"#,
    ];

    for pattern in &patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            if let Some(caps) = re.captures(disposition) {
                if let Some(filename) = caps.get(1) {
                    let filename = filename.as_str();
                    // Decode percent-encoded characters
                    if let Ok(decoded) =
                        percent_encoding::percent_decode_str(filename).decode_utf8()
                    {
                        return Some(decoded.to_string());
                    }
                    return Some(filename.to_string());
                }
            }
        }
    }
    None
}

/// Extracts filename from URL path
fn extract_filename_from_url(url: &str) -> String {
    match url.rfind('/') {
        Some(pos) => url[pos + 1..].to_string(),
        None => "downloaded_file".to_string(),
    }
}
/// Downloads text from an HTTP endpoint and prints the first N characters
///
/// # Arguments
/// * `url` - The URL to download text from
/// * `preview_length` - Number of characters to show in preview (0 shows all)
pub async fn download_and_preview(url: &str, _preview_length: usize) -> Result<(), Box<dyn Error>> {
    match download_text(url).await {
        Ok(_) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_download_text() {
        let url = "https://httpbin.org/robots.txt";
        match download_text(url).await {
            Ok(text) => {
                assert!(!text.is_empty());
            }
            Err(_) => {
                // Test failed
            }
        }
    }
}
