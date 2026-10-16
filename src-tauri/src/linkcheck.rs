//! Checks whether catalog links still answer. The app contacts only the hosts
//! listed in resource_hosts.txt (generated from the curated catalog and kept in
//! sync by a test), only over HTTPS, and sends nothing but a plain request.

use serde::Serialize;
use std::time::Duration;

const HOSTS: &str = include_str!("../resource_hosts.txt");

pub struct Checker(pub reqwest::Client);

fn allowed(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url
            .host_str()
            .map(|h| HOSTS.lines().map(str::trim).any(|a| !a.is_empty() && a == h))
            .unwrap_or(false)
}

pub fn client() -> Result<reqwest::Client, String> {
    let policy = reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 5 {
            attempt.error("too many redirects")
        } else if allowed(attempt.url()) {
            attempt.follow()
        } else {
            attempt.stop()
        }
    });
    reqwest::Client::builder()
        .user_agent(concat!("BYTEQUEST/", env!("CARGO_PKG_VERSION"), " link-check (+https://github.com/TommyPhelps/bytequest)"))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .redirect(policy)
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkResult {
    ok: bool,
    status: Option<u16>,
    final_url: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub async fn check_link(state: tauri::State<'_, Checker>, url: String) -> Result<LinkResult, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "not a valid web address".to_string())?;
    if !allowed(&parsed) {
        return Err(format!("blocked: {} is not a catalog host", parsed.host_str().unwrap_or("?")));
    }
    // Some sites reject HEAD; fall back to GET (body is not read beyond headers).
    let mut resp = state.0.head(parsed.clone()).send().await;
    if matches!(&resp, Ok(r) if r.status().as_u16() == 405 || r.status().as_u16() == 403 || r.status().as_u16() == 404) {
        resp = state.0.get(parsed.clone()).send().await;
    }
    match resp {
        Ok(r) => {
            let code = r.status().as_u16();
            let moved = r.status().is_redirection();
            let location = r
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .map(str::to_string);
            Ok(LinkResult {
                ok: r.status().is_success() || moved,
                status: Some(code),
                final_url: if moved { location } else { Some(r.url().to_string()) },
                error: None,
            })
        }
        Err(e) => {
            let kind = if e.is_timeout() { "timeout" } else if e.is_connect() { "offline" } else { "network" };
            Ok(LinkResult { ok: false, status: None, final_url: None, error: Some(format!("{kind}: {}", e.without_url())) })
        }
    }
}
