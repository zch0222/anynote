use tauri::{WebviewUrl, WebviewWindowBuilder};

/// 桌面壳加载的是**远端 Next.js 应用**（SSR + BFF 路由都在服务端），
/// 不是静态产物，所以这里走 `WebviewUrl::External`。
const DEFAULT_APP_URL: &str = "http://localhost:3000";

/// 注入到页面里的桌面标记。前端据此判断「我在桌面壳里」，
/// 然后带 key 调 `/api/auth/exchange` 换取可自己保管的 Token。
/// 见 apps/web/src/lib/desktop/bridge.ts。
fn bootstrap_script(exchange_key: &str) -> String {
    format!(
        "window.__ANYNOTE_DESKTOP__ = {};",
        serde_json::json!({ "exchangeKey": exchange_key })
    )
}

fn app_url() -> String {
    std::env::var("ANYNOTE_APP_URL").unwrap_or_else(|_| DEFAULT_APP_URL.to_string())
}

/// 交换密钥在编译期打进二进制，必须与部署侧的 `DESKTOP_EXCHANGE_KEY` 一致。
/// 未设置时留空——此时 BFF 会拒绝交换，桌面壳退化成普通 Cookie 会话。
fn exchange_key() -> &'static str {
    option_env!("ANYNOTE_DESKTOP_EXCHANGE_KEY").unwrap_or("")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let url = app_url()
                .parse()
                .expect("ANYNOTE_APP_URL 不是合法 URL");

            // 窗口在代码里创建而不是写在 tauri.conf.json：
            // 只有 builder 才能挂 initialization_script。
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Anynote")
                .inner_size(1280.0, 840.0)
                .min_inner_size(960.0, 640.0)
                .initialization_script(&bootstrap_script(exchange_key()))
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Anynote 桌面壳启动失败");
}
