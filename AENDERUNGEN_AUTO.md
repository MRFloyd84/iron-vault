# Automatische Verbesserungen

Kurze Notizen zu den Änderungen, die die geplante Aufgabe aus `ROADMAP.md` umsetzt.
Neueste Einträge oben.

## NVIDIA-Grafikkarte nutzen

- Auf Laptops mit zwei Grafikchips (Intel oder AMD plus NVIDIA) lief die Desktop-App unter
  Linux meist auf dem schwachen Chip. Jetzt fordert sie beim Start die NVIDIA-Karte an,
  genau wie ein Start mit `prime-run`. Das passiert nur, wenn der NVIDIA-Treiber geladen
  ist und ein zweiter Chip erkannt wird; reine NVIDIA-PCs ändern sich nicht.
- Wer selbst mit `prime-run` startet, behält seine Einstellungen.
- `IRON_VAULT_GPU=auto` schaltet die Wahl ab, `IRON_VAULT_GPU=nvidia` erzwingt sie.
- Die Diagnose (F3) zeigt in der ersten Zeile, welche Grafikkarte rendert. Läuft das Spiel
  ohne Grafikkarte (Software-Rendering), steht dort rot „ohne Grafikkarte!“.
