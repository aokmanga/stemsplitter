#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Read;
use std::process::{Command, Stdio};
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct StemPaths {
    vocals: String,
    bass: String,
    drums: String,
    other: String,
    output_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SplitProgress {
    status: String,
    message: String,
    #[serde(default)]
    percent: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AppConfig {
    library_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionInfo {
    name: String,
    path: String,
    duration: f64,      // secondi, ricavati dal primo stem
    date: String,       // ISO 8601
    stems: StemPaths,
}

// ── Config ────────────────────────────────────────────────────────

fn home_dir() -> String {
    tauri::api::path::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn which_binary(name: &str) -> Option<String> {
    let tool = if cfg!(windows) { "where" } else { "which" };
    let out = Command::new(tool).arg(name).output().ok()?;
    if !out.status.success() { return None; }
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    let first = text.lines().next()?.trim().to_string();
    if first.is_empty() { None } else { Some(first) }
}

fn config_path() -> PathBuf {
    tauri::api::path::config_dir()
        .unwrap_or_default()
        .join("StemSplitter/config.json")
}

fn default_library_path() -> String {
    tauri::api::path::download_dir()
        .unwrap_or_default()
        .join("StemSplitter")
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn get_config() -> AppConfig {
    let path = config_path();
    if let Ok(data) = std::fs::read_to_string(&path) {
        if let Ok(cfg) = serde_json::from_str::<AppConfig>(&data) {
            return cfg;
        }
    }
    AppConfig { library_path: default_library_path() }
}

#[tauri::command]
fn save_config(library_path: String) -> Result<(), String> {
    let path = config_path();
    std::fs::create_dir_all(path.parent().unwrap())
        .map_err(|e| e.to_string())?;
    let cfg = AppConfig { library_path };
    let data = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

// ── Sessions ──────────────────────────────────────────────────────

/// Cerca un eseguibile (ffmpeg, ffprobe...) nei percorsi comuni di macOS,
/// poi nel PATH. Le app grafiche non ereditano il PATH del terminale,
/// quindi i percorsi fissi vengono controllati per primi.
fn find_binary(name: &str) -> Option<String> {
    let home = home_dir();
    let file = if cfg!(windows) { format!("{}.exe", name) } else { name.to_string() };
    let dirs = [
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        "/opt/local/bin".to_string(),
        "/usr/bin".to_string(),
        "/opt/homebrew/Caskroom/miniconda/base/bin".to_string(),
        format!("{}/miniconda3/bin", home),
        format!("{}/miniforge3/bin", home),
        format!("{}/.local/bin", home),
    ];
    for d in dirs.iter() {
        let p = Path::new(d).join(&file);
        if p.exists() { return Some(p.to_string_lossy().to_string()); }
    }
    which_binary(name)
}

/// Legge la durata in secondi di un file audio tramite ffprobe
fn get_duration(path: &Path) -> f64 {
    let ffprobe = match find_binary("ffprobe") {
        Some(p) => p,
        None => return 0.0,
    };
    let out = Command::new(ffprobe)
        .args(&["-v", "quiet", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path.to_str().unwrap_or("")])
        .output();
    if let Ok(o) = out {
        if let Ok(s) = String::from_utf8(o.stdout) {
            return s.trim().parse::<f64>().unwrap_or(0.0);
        }
    }
    0.0
}

/// Converte secondi Unix in data UTC "YYYY-MM-DDTHH:MM:SSZ" (ISO 8601).
/// Algoritmo "civil from days" (calendario gregoriano corretto, anni bisestili inclusi).
fn iso_from_secs(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let (h, m, sec) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, m, sec)
}

/// Data di modifica di un file in formato ISO 8601 UTC (la UI la mostra in ora locale)
fn get_mtime_iso(path: &Path) -> String {
    if let Ok(meta) = std::fs::metadata(path) {
        if let Ok(mtime) = meta.modified() {
            if let Ok(dur) = mtime.duration_since(std::time::UNIX_EPOCH) {
                return iso_from_secs(dur.as_secs());
            }
        }
    }
    String::new()
}

#[tauri::command]
fn list_sessions(library_path: String) -> Vec<SessionInfo> {
    let lib = PathBuf::from(&library_path);
    let mut sessions = Vec::new();

    let entries = match std::fs::read_dir(&lib) {
        Ok(e) => e,
        Err(_) => return sessions,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() { continue; }

        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if name.starts_with('.') { continue; }

        // Controlla che ci siano almeno vocals.mp3 e drums.mp3
        let vocals = path.join("vocals.mp3");
        let drums  = path.join("drums.mp3");
        let bass   = path.join("bass.mp3");
        let other  = path.join("other.mp3");
        if !vocals.exists() || !drums.exists() { continue; }

        let duration = get_duration(&vocals);
        let date = get_mtime_iso(&vocals);

        sessions.push(SessionInfo {
            name,
            path: path.to_string_lossy().to_string(),
            duration,
            date,
            stems: StemPaths {
                vocals: vocals.to_string_lossy().to_string(),
                bass:   bass.to_string_lossy().to_string(),
                drums:  drums.to_string_lossy().to_string(),
                other:  other.to_string_lossy().to_string(),
                output_dir: path.to_string_lossy().to_string(),
            },
        });
    }

    // Ordina per data decrescente (più recente prima)
    sessions.sort_by(|a, b| b.date.cmp(&a.date));
    sessions
}

// ── Dialogs ───────────────────────────────────────────────────────

#[tauri::command]
async fn pick_audio_file(window: tauri::Window) -> Result<(), String> {
    let win = window.clone();
    tauri::api::dialog::FileDialogBuilder::new()
        .set_title("Seleziona file audio")
        .add_filter("Audio", &["mp3", "wav", "flac", "m4a", "ogg", "aac", "aiff", "opus", "wma"])
        .pick_file(move |path| {
            match path {
                Some(p) => { win.emit("file-selected", p.to_string_lossy().to_string()).ok(); }
                None    => { win.emit("file-selected", serde_json::Value::Null).ok(); }
            }
        });
    Ok(())
}

#[tauri::command]
async fn pick_output_dir(window: tauri::Window) -> Result<(), String> {
    let win = window.clone();
    tauri::api::dialog::FileDialogBuilder::new()
        .set_title("Seleziona cartella libreria")
        .pick_folder(move |path| {
            match path {
                Some(p) => { win.emit("dir-selected", p.to_string_lossy().to_string()).ok(); }
                None    => { win.emit("dir-selected", serde_json::Value::Null).ok(); }
            }
        });
    Ok(())
}

// ── Demucs ────────────────────────────────────────────────────────

fn find_demucs_path() -> Option<String> {
    let home = home_dir();
    let name = if cfg!(target_os = "macos") { "demucs-mlx" } else { "demucs" };
    let file = if cfg!(windows) { format!("{}.exe", name) } else { name.to_string() };
    let dirs = vec![
        "/opt/homebrew/Caskroom/miniconda/base/bin".to_string(),
        format!("{}/miniconda3/bin", home),
        format!("{}/opt/miniconda3/bin", home),
        format!("{}/miniforge3/bin", home),
        format!("{}/anaconda3/bin", home),
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        format!("{}/Library/Python/3.13/bin", home),
        format!("{}/.local/bin", home),
        format!("{}/miniconda3/Scripts", home),
        format!("{}/anaconda3/Scripts", home),
    ];
    for d in &dirs {
        let p = Path::new(d).join(&file);
        if p.exists() { return Some(p.to_string_lossy().to_string()); }
    }
    which_binary(name)
}

#[tauri::command]
fn check_demucs() -> Result<String, String> {
    match find_demucs_path() {
        Some(path) => {
            let version = Command::new(&path).arg("--version").output()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .unwrap_or_default();
            Ok(format!("found:{}|{}", path, version))
        }
        None => Err("Demucs non trovato".to_string()),
    }
}

/// Cerca una percentuale tipo "45%" (barra tqdm) in un pezzo di testo
fn parse_percent(text: &str) -> Option<f32> {
    let idx = text.rfind('%')?;
    let before = &text[..idx];
    let digits: String = before
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    let v: f32 = digits.parse().ok()?;
    if (0.0..=100.0).contains(&v) { Some(v) } else { None }
}

fn emit_progress(window: &tauri::Window, status: &str, message: &str, percent: Option<f32>) {
    window.emit("demucs-progress", SplitProgress {
        status: status.to_string(),
        message: message.to_string(),
        percent,
    }).ok();
}

#[tauri::command]
async fn run_demucs(
    input_path: String,
    output_dir: String,
    window: tauri::Window,
) -> Result<StemPaths, String> {
    // Il lavoro pesante gira su un thread dedicato: non blocca l'app
    tauri::async_runtime::spawn_blocking(move || run_demucs_blocking(input_path, output_dir, window))
        .await
        .map_err(|e| format!("Errore interno: {}", e))?
}

fn run_demucs_blocking(
    input_path: String,
    output_dir: String,
    window: tauri::Window,
) -> Result<StemPaths, String> {
    emit_progress(&window, "starting", "Avvio separazione tracce...", None);

    let input = Path::new(&input_path);
    let filename_stem = input.file_stem().and_then(|s| s.to_str())
        .ok_or("Nome file non valido")?.to_string();

    let demucs_path = find_demucs_path().ok_or("Demucs non trovato.")?;
    // Controllo ffmpeg PRIMA di separare: evita minuti di lavoro inutile
    let ffmpeg_path = find_binary("ffmpeg")
        .ok_or("ffmpeg non trovato. Installalo e riavvia l'app.")?;

    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Impossibile creare cartella output: {}", e))?;

    emit_progress(&window, "running", "Separazione in corso... (qualche minuto)", None);

    let mut cmd = Command::new(&demucs_path);
    if cfg!(target_os = "macos") {
        cmd.args(&["--prefetch-tracks", "0"]);
    }
    cmd.args(&["-o", &output_dir, &input_path])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn()
        .map_err(|e| format!("Errore avvio demucs: {}", e))?;

    // stdout letto in un thread a parte (evita blocchi se il buffer si riempie)
    let stdout_pipe = child.stdout.take();
    let stdout_thread = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(mut o) = stdout_pipe {
            let mut bytes = Vec::new();
            o.read_to_end(&mut bytes).ok();
            buf = String::from_utf8_lossy(&bytes).to_string();
        }
        buf
    });

    // stderr letto a pezzi: da qui si ricava la percentuale reale
    let mut stderr_all = String::new();
    let mut last_percent: f32 = -1.0;
    if let Some(mut e) = child.stderr.take() {
        let mut chunk = [0u8; 4096];
        let mut carry = String::new();
        loop {
            match e.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&chunk[..n]).to_string();
                    stderr_all.push_str(&text);
                    if stderr_all.len() > 8000 {
                        let mut cut = stderr_all.len() - 6000;
                        while !stderr_all.is_char_boundary(cut) { cut += 1; }
                        stderr_all = stderr_all[cut..].to_string();
                    }
                    let joined = format!("{}{}", carry, text);
                    if let Some(p) = parse_percent(&joined) {
                        if (p - last_percent).abs() >= 1.0 {
                            last_percent = p;
                            emit_progress(&window, "running",
                                &format!("Separazione in corso... {:.0}%", p), Some(p));
                        }
                    }
                    let mut start = joined.len().saturating_sub(8);
                    while !joined.is_char_boundary(start) { start += 1; }
                    carry = joined[start..].to_string();
                }
            }
        }
    }

    let status = child.wait().map_err(|e| format!("Errore attesa demucs-mlx: {}", e))?;
    let stdout_all = stdout_thread.join().unwrap_or_default();

    if !status.success() {
        return Err(format!("Demucs fallito:\nSTDERR: {}\nSTDOUT: {}", stderr_all, stdout_all));
    }

    let stem_dir = PathBuf::from(&output_dir).join(&filename_stem);

    if !cfg!(target_os = "macos") {
        // demucs classico salva in <output>/htdemucs/<brano>: lo sposto in <output>/<brano>
        let model_dir = PathBuf::from(&output_dir).join("htdemucs").join(&filename_stem);
        if model_dir.exists() {
            std::fs::remove_dir_all(&stem_dir).ok();
            std::fs::rename(&model_dir, &stem_dir)
                .map_err(|e| format!("Impossibile spostare gli stem: {}", e))?;
            std::fs::remove_dir(PathBuf::from(&output_dir).join("htdemucs")).ok();
        }
    }

    emit_progress(&window, "converting", "Conversione in MP3...", Some(100.0));

    let mut failed: Vec<String> = Vec::new();
    for stem_name in &["vocals", "drums", "bass", "other"] {
        let wav = stem_dir.join(format!("{}.wav", stem_name));
        let mp3 = stem_dir.join(format!("{}.mp3", stem_name));
        if wav.exists() {
            let ok = Command::new(&ffmpeg_path)
                .arg("-y").arg("-i").arg(&wav)
                .arg("-q:a").arg("2")
                .arg(&mp3)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            // Il wav si cancella SOLO se l'mp3 è stato creato davvero
            if ok && mp3.exists() {
                std::fs::remove_file(&wav).ok();
            } else {
                failed.push(stem_name.to_string());
            }
        }
    }

    let done_msg = if failed.is_empty() {
        "Separazione completata!".to_string()
    } else {
        format!("Completata, ma conversione MP3 fallita per: {} (file WAV conservati)", failed.join(", "))
    };
    emit_progress(&window, "done", &done_msg, Some(100.0));

    let find_stem = |name: &str| -> String {
        for ext in &["mp3", "wav", "flac"] {
            let p = stem_dir.join(format!("{}.{}", name, ext));
            if p.exists() { return p.to_string_lossy().to_string(); }
        }
        stem_dir.join(format!("{}.mp3", name)).to_string_lossy().to_string()
    };

    Ok(StemPaths {
        vocals: find_stem("vocals"),
        bass:   find_stem("bass"),
        drums:  find_stem("drums"),
        other:  find_stem("other"),
        output_dir: stem_dir.to_string_lossy().to_string(),
    })
}

// ── Audio ─────────────────────────────────────────────────────────

#[tauri::command]
fn read_audio_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Errore lettura {}: {}", path, e))?;
    Ok(base64_encode(&bytes))
}

#[tauri::command]
fn get_audio_info(path: String) -> Result<serde_json::Value, String> {
    let ffprobe = find_binary("ffprobe").ok_or("ffprobe non trovato")?;
    let output = Command::new(ffprobe)
        .args(&["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", &path])
        .output().map_err(|e| format!("ffprobe non trovato: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    serde_json::from_slice(&output.stdout).map_err(|e| format!("Parse error: {}", e))
}

fn base64_encode(bytes: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        result.push(CHARS[b0 >> 2] as char);
        result.push(CHARS[((b0 & 3) << 4) | (b1 >> 4)] as char);
        if chunk.len() > 1 { result.push(CHARS[((b1 & 0xf) << 2) | (b2 >> 6)] as char); } else { result.push('='); }
        if chunk.len() > 2 { result.push(CHARS[b2 & 0x3f] as char); } else { result.push('='); }
    }
    result
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            list_sessions,
            pick_audio_file,
            pick_output_dir,
            check_demucs,
            run_demucs,
            read_audio_file,
            get_audio_info,
        ])
        .run(tauri::generate_context!())
        .expect("Errore avvio applicazione Tauri");
}
