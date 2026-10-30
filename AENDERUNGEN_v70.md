# Änderungen in Version 70 – Grafikkarte wählbar

- Auf Laptops mit zwei Grafikchips (Intel oder AMD plus NVIDIA) lief die Desktop-App unter
  Linux meist auf dem schwachen Chip. Jetzt fordert sie beim Start die NVIDIA-Karte an,
  genau wie ein Start mit `prime-run`.
- Im Grafikmenü oben rechts gibt es die neue Zeile „Grafikkarte“: Automatisch, NVIDIA oder
  Integriert. Die Wahl wird gespeichert und wirkt nach einem Neustart; dafür erscheint ein
  Knopf „Neu starten“. Darunter steht, welche Chips erkannt wurden und welcher aktiv ist.
- Die Diagnose (F3) zeigt in der ersten Zeile, welche Grafikkarte rendert. Läuft das Spiel
  ohne Grafikkarte, steht dort rot „ohne Grafikkarte!“.
- Neun Skripte, Tests und die Übersetzungsdatei sind einheitlich formatiert (nur Technik).
