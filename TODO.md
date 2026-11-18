# TODO — StemSplitter

Priorità: P1 alta, P2 media, P3 bassa. Spostare in CHANGELOG quando fatto.

## Migliorie concordate (non applicare senza ok)
| P | Cosa | Note |
|---|---|---|
| P2 | Barra vera durante il ricalcolo | Etichetta `1.25x ...` già fatta |
| P2 | Cache buffer per velocità già usate | Mappa `velocità → buffer` per stem; svuotare al cambio brano |
| P2 | Sezioni automatiche (All-In-One → marker) | Python sidecar; poi accordi/griglia/time signature |
| P2 | Cambio tonalità separato dalla velocità | SoundTouch ha `pitchSemitones` |
| P2 | Esporta mix (WAV/MP3) con mute/solo/velocità | Serve OfflineAudioContext |
| P2 | `check_demucs` controlla solo demucs | Se manca `mlx-audio-separator` l'app non avvisa prima: errore solo a separazione avviata |
| P2 | Motore BS-Roformer per Windows/Linux | MLX è solo Mac: serve `audio-separator` o `bs-roformer-infer` (PyTorch) |
| P3 | Scorciatoie da tastiera (spazio = play/pausa) | |
| P3 | File audio di prova (30 s) | In `test-assets/` |
| P3 | `mlx-audio-separator` cercato solo nelle cartelle conda/homebrew | Come per demucs, vedi `find_tool_path` |

## Bug trovati leggendo il codice
Tutti corretti e testati (vedi CHANGELOG).

## Idee non valutate
- Riapri ultimo progetto all'avvio
- Rinomina/elimina brano dalla libreria
- Versione per altri sistemi (vedi memoria progetto: migrazione cross-platform)
