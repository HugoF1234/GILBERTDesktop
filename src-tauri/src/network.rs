use std::time::Duration;

use reqwest::Client;

pub async fn is_online(client: &Client) -> bool {
    client
        .get("https://www.google.com/generate_204")
        .timeout(Duration::from_secs(4))
        .send()
        .await
        .map(|resp| resp.status().is_success())
        .unwrap_or(false)
}
