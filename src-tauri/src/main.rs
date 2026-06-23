#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
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

fn config_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home)
        .join("Library/Application Support/StemSplitter/config.json")
}

fn default_library_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    format!("{}/Downloads/StemSplitter", home)
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

/// Legge la durata in secondi di un file audio tramite ffprobe
fn get_duration(path: &Path) -> f64 {
    let out = Command::new("/opt/homebrew/bin/ffprobe")
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

/// Legge la data di modifica di un file come stringa ISO 8601
fn get_mtime_iso(path: &Path) -> String {
    if let Ok(meta) = std::fs::metadata(path) {
        if let Ok(mtime) = meta.modified() {
            if let Ok(dur) = mtime.duration_since(std::time::UNIX_EPOCH) {
                let secs = dur.as_secs();
                // Formatta come YYYY-MM-DD HH:MM — conversione manuale senza chrono
                let s = secs as i64;
                let days = s / 86400;
                let time = s % 86400;
                let h = time / 3600;
                let m = (time % 3600) / 60;
                // Data approssimativa (abbastanza per mostrare in UI)
                let year = 1970 + days / 365;
                let day_of_year = days % 365;
                let month = day_of_year / 30 + 1;
                let day = day_of_year % 30 + 1;
                return format!("{:04}-{:02}-{:02} {:02}:{:02}", year, month.min(12), day.min(31), h, m);
            }
        }
    }
    String::from("—")
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
    let home = std::env::var("HOME").unwrap_or_default();
    let conda_base  = String::from("/opt/homebrew/Caskroom/miniconda/base/bin/demucs-mlx");
    let conda_user  = format!("{}/miniconda3/bin/demucs-mlx", home);
    let conda_user2 = format!("{}/opt/miniconda3/bin/demucs-mlx", home);
    let conda_user3 = format!("{}/miniforge3/bin/demucs-mlx", home);
    let conda_user4 = format!("{}/anaconda3/bin/demucs-mlx", home);
    let homebrew    = String::from("/opt/homebrew/bin/demucs-mlx");
    let usr_local   = String::from("/usr/local/bin/demucs-mlx");
    let py313       = format!("{}/Library/Python/3.13/bin/demucs-mlx", home);
    let local_bin   = format!("{}/.local/bin/demucs-mlx", home);

    let candidates = vec![
        conda_base, conda_user, conda_user2, conda_user3, conda_user4,
        homebrew, usr_local, py313, local_bin,
    ];
    for path in &candidates {
        if Path::new(path).exists() { return Some(path.clone()); }
    }
    if let Ok(out) = Command::new("sh").args(&["-c", "command -v demucs-mlx"]).output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() { return Some(p); }
        }
    }
    None
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

#[tauri::command]
async fn run_demucs(
    input_path: String,
    output_dir: String,
    model: String,
    window: tauri::Window,
) -> Result<StemPaths, String> {
    window.emit("demucs-progress", SplitProgress {
        status: "starting".to_string(),
        message: "Avvio separazione tracce...".to_string(),
    }).ok();

    let input = Path::new(&input_path);
    let filename_stem = input.file_stem().and_then(|s| s.to_str())
        .ok_or("Nome file non valido")?.to_string();

    let demucs_path = find_demucs_path()
        .ok_or("Demucs non trovato.")?;

    // Crea la cartella di output se non esiste
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Impossibile creare cartella output: {}", e))?;

    window.emit("demucs-progress", SplitProgress {
        status: "running".to_string(),
        message: "Separazione in corso... (qualche minuto)".to_string(),
    }).ok();

    let output = Command::new(&demucs_path)
        .args(&["--prefetch-tracks", "0", "-o", &output_dir, &input_path])
        .output()
        .map_err(|e| format!("Errore avvio demucs-mlx: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Demucs fallito:\nSTDERR: {}\nSTDOUT: {}", stderr, stdout));
    }

    let stem_dir = PathBuf::from(&output_dir).join(&filename_stem);

    window.emit("demucs-progress", SplitProgress {
        status: "converting".to_string(),
        message: "Conversione in MP3...".to_string(),
    }).ok();

    for stem_name in &["vocals", "drums", "bass", "other"] {
        let wav = stem_dir.join(format!("{}.wav", stem_name));
        let mp3 = stem_dir.join(format!("{}.mp3", stem_name));
        if wav.exists() {
            Command::new("/opt/homebrew/bin/ffmpeg")
                .args(&["-i", wav.to_str().unwrap(), "-q:a", "2", mp3.to_str().unwrap(), "-y"])
                .output().ok();
            std::fs::remove_file(&wav).ok();
        }
    }

    window.emit("demucs-progress", SplitProgress {
        status: "done".to_string(),
        message: "Separazione completata!".to_string(),
    }).ok();

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
    let output = Command::new("ffprobe")
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
