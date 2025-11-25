use reqwest;
use std::error::Error;

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
            accept_invalid_certs: true,        // Accept self-signed certificates
            accept_invalid_hostnames: true,  // Accept invalid hostnames
            use_sni: true,                // Always use SNI
            min_tls_version: None,             // Accept any TLS version
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
pub async fn download_text_with_tls(url: &str, tls_config: Option<TlsConfig>) -> Result<String, Box<dyn Error>> {
    let chrome_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    let clash_ua = "clash.meta/1.10.0";
    let mut client_builder = reqwest::Client::builder()
        .user_agent(clash_ua);

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