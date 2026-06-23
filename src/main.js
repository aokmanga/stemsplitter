import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { appWindow } from '@tauri-apps/api/window';
window._invoke = invoke;
window._listen = listen;
window._appWindow = appWindow;
