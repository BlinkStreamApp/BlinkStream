use std::net::IpAddr;
use std::time::Duration;

pub fn media_url(raw: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(raw).map_err(|_| "URL de medios inválida")?;
    let host = url.host_str().ok_or("URL sin dominio")?;
    let allowed = [
        "ttvnw.net",
        "twitch.tv",
        "cloudfront.net",
        "akamaized.net",
        "jtvnw.net",
    ]
    .iter()
    .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")));
    if url.scheme() != "https"
        || !allowed
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port_or_known_default() != Some(443)
        || url.fragment().is_some()
    {
        return Err("Origen de medios no permitido".into());
    }
    Ok(url)
}

fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let a = ip.octets();
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_multicast()
                && !ip.is_broadcast()
                && !ip.is_documentation()
                && a[0] != 0
                && a[0] < 224
                && !(a[0] == 100 && (64..128).contains(&a[1]))
                && !(a[0] == 198 && (a[1] == 18 || a[1] == 19))
        }
        IpAddr::V6(ip) => {
            if let Some(v4) = ip.to_ipv4_mapped() {
                return public_ip(IpAddr::V4(v4));
            }
            let s = ip.segments();
            !(ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || s[0] & 0xfe00 == 0xfc00
                || s[0] & 0xffc0 == 0xfe80
                || (s[0] == 0x2001 && s[1] == 0xdb8))
        }
    }
}

pub async fn client(url: &tauri::Url, timeout: u64) -> Result<reqwest::Client, String> {
    let host = url.host_str().ok_or("URL sin dominio")?;
    let addresses: Vec<_> =
        tokio::time::timeout(Duration::from_secs(5), tokio::net::lookup_host((host, 443)))
            .await
            .map_err(|_| "Tiempo de resolución DNS agotado")?
            .map_err(|_| "No se pudo resolver el servidor de medios")?
            .take(16)
            .collect();
    if addresses.is_empty() || addresses.iter().any(|address| !public_ip(address.ip())) {
        return Err("DNS de medios bloqueado o no público".into());
    }
    reqwest::Client::builder()
        .no_proxy()
        .user_agent("Mozilla/5.0")
        .use_rustls_tls()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(timeout))
        .resolve_to_addrs(host, &addresses)
        .build()
        .map_err(|_| "No se pudo crear el cliente de medios".into())
}

pub async fn read_limited(
    mut response: reqwest::Response,
    limit: usize,
) -> Result<Vec<u8>, String> {
    if !response.status().is_success() {
        return Err(format!("Servidor de medios HTTP {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err("Medio demasiado grande".into());
    }
    let mut data = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "No se pudo leer el medio")?
    {
        if chunk.len() > limit.saturating_sub(data.len()) {
            return Err("Medio demasiado grande".into());
        }
        data.extend_from_slice(&chunk);
    }
    Ok(data)
}

pub fn clip_range(start: f64, end: f64) -> Result<(), String> {
    if !start.is_finite() || !end.is_finite() || start < 0.0 || end <= start || end - start > 600.0
    {
        return Err("Rango inválido: el recorte debe durar entre 0 y 600 segundos".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_host_spoofing_credentials_ports_and_local_sources() {
        for url in [
            "https://evil.example/ttvnw.net",
            "https://127.0.0.1/?twitch.tv",
            "https://ttvnw.net.evil.test/a",
            "https://user@a.ttvnw.net/a",
            "https://a.ttvnw.net:8443/a",
            "file:///tmp/a.mp4",
            "http://a.ttvnw.net/a",
        ] {
            assert!(media_url(url).is_err());
        }
        assert!(media_url("https://video-edge.example.ttvnw.net/a?token=redacted").is_ok());
    }
    #[test]
    fn rejects_non_public_dns_and_nonfinite_ranges() {
        for address in [
            "127.0.0.1",
            "10.0.0.1",
            "0.0.0.0",
            "100.64.0.1",
            "169.254.169.254",
            "::1",
            "::ffff:127.0.0.1",
            "fc00::1",
            "fe80::1",
        ] {
            assert!(!public_ip(address.parse().unwrap()));
        }
        assert!(public_ip("1.1.1.1".parse().unwrap()));
        for (start, end) in [
            (f64::NAN, 10.0),
            (0.0, f64::INFINITY),
            (-1.0, 10.0),
            (0.0, 601.0),
        ] {
            assert!(clip_range(start, end).is_err());
        }
        assert!(clip_range(0.0, 60.0).is_ok());
    }
}
