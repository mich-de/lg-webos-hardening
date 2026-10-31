# Specifiche hardware — LG 49NANO866NA

Dati letti dal TV via shell root il 31/10/2026 (`/proc`, `/sys`, luna `systemproperty`/`config`). Output grezzo: `D:\tv\hw_raw.txt`.

## Identità
| Campo | Valore |
|---|---|
| Modello | 49NANO866NA (NanoCell 49", serie NANO86, anno modello **2020** — otaId `W20H`) |
| Produttore | LG Electronics |
| Seriale | <redatto> |
| Board | `K6HP_DVB_EU` (hardwareVersion 1, area EU) |
| otaId | `HE_DTV_W20H_AFADABAA` |
| Firmware | 04.64.00 (webOS **5.6.2**, codename `jhericurl-jimna`) |
| Kernel | Linux 4.4.84-612.40.jimna.1 SMP PREEMPT, armv7l (userspace 32 bit) |

## SoC / CPU
| Campo | Valore |
|---|---|
| SoC | **Realtek RTD2880** (`Hardware: rtd288o`; device `rtk_*` in `/sys/class/misc`) |
| CPU | 4× **ARM Cortex-A55** (implementer 0x41, part 0xd05) in modalità ARMv7 32 bit |
| Frequenza | 700 MHz – **1.1 GHz** (governor `performance`) |
| Estensioni | NEON, VFPv4, AES, SHA1/SHA2, CRC32, PMULL, LPAE, idiv |
| GPU | ARM **Mali** (`/dev/mali0`); presente anche nodo `pvrsrvkm` |
| Sensore termico | `rtk-thermal` — ~56 °C in uso normale |

## Memoria
| Campo | Valore |
|---|---|
| RAM totale (visibile al kernel) | **1.6 GB** (1 637 416 kB) |
| RAM disponibile in uso tipico | ~480–500 MB (MemAvailable) |
| CMA (riservata video/decoder) | 372 MB |
| Swap | 600 MB |

## Storage (eMMC)
| Campo | Valore |
|---|---|
| eMMC | **8 GB** (`8GTF4R`, manfid 0x15 = Samsung), `mmcblk0` 7.3 GiB, ~58 partizioni |
| `/media` + appstore (`mmcblk0p58`) | 2.3 GB, 854 MB liberi |
| `/var` (`mmcblk0p57`) | 722 MB, 473 MB liberi |
| `/tmp` | tmpfs ~800 MB (condiviso con RAM) |
| `/etc` | read-only (`/etc/hosts` è un tmpfs rigenerato a ogni boot) |

## Display / immagine
| Campo | Valore |
|---|---|
| Pannello | LCD 4K UHD (3840×2160), gamut `wcg lcd` (NanoCell), retroilluminazione LED (`panelLedBarType 6`) |
| Local dimming | non supportato da menu (`supportLocalDimmingOsdMenu: false`); `localDimming: off` |
| VRR | supportato (`vrr_on`) |
| Motion | "LCD Motion Pro" |
| Super Resolution (upscaling) | attivo, livello `high` |
| 3D / 8K / OLED | no |
| ISF | supportato |
| **Piano grafico app** | **1920×1080** (app web/Hearth renderizzate a 1080p e scalate a 4K dallo scaler; l'upscaling "AI"/Super Resolution agisce sul piano video, non sulle app). Capture service restituisce 960×540. |

## Audio
| Campo | Valore |
|---|---|
| Altoparlanti | 2.0, **10 W** totali |
| Amplificatore | SY6045 (1 amp) |
| Uscita ottica | no (`supportOptic: false`) |
| WiSA | no |

## Connettività
| Campo | Valore |
|---|---|
| Ethernet | `eth0` MAC <redatto> |
| Wi-Fi | `wlan0` MAC <redatto> (+ `p2p0` Wi-Fi Direct) |
| USB | 3 porte |
| HDMI | HDCP 2.x, driver `rtk_hdmi` (CEC/SimpLink) |
| Tuner | DVB-T2/C + **satellite** (S2), tuner singolo (`supportDualTuner: false`), slot CI |
| Bluetooth | sì (stack bluedroid-rtk), Magic Remote |
| DRM | Widevine; no Marlin |

## Browser / web engine
- Motore web di sistema: Chromium **79** (WebOS 5) — niente `gap` flex (≥84), `inset` (≥87), `?.`/`??` (≥80).
- Nessun browser alternativo installabile su webOS 5.

## Implicazioni per le app del progetto
- Progettare UI a **1920×1080**; immagini mai oltre 1080p (lo sfondo 4K costava ~33 MB di RAM decodificata per niente → sostituito con 1080p).
- RAM libera ~500 MB condivisa con Live TV/YouTube: evitare blur/filter a schermo intero, ri-render completi, animazioni continue.
- CPU 4× A55 a 1.1 GHz in 32 bit: JS leggero, throttle input (≥120 ms), timer lenti (≥30 s).
