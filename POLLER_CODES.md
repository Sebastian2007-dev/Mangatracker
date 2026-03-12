# Poller – Ablehnungscodes

Log-Einträge der Form `kein neues Kapitel [CODE]` erklären warum ein Kapitel abgelehnt wurde.

| Code | Bedeutung |
|---|---|
| `NO_URL` | Kein URL-Template gesetzt oder URL beginnt nicht mit `http` |
| `HTTP_404` | Server antwortet mit HTTP 404 – Kapitel existiert nicht |
| `HTTP_403` | Server antwortet mit HTTP 403 – Zugriff verweigert (ggf. Cloudflare) |
| `HTTP_xxx` | Sonstiger HTTP-Fehlercode ≥ 400 |
| `SHORT` | Antwort-Body < 2000 Zeichen – wahrscheinlich leere Fehlerseite mit HTTP 200 |
| `URL_MISMATCH` | Kapitelnummer war in der angefragten URL, fehlt aber in der finalen URL – Seite hat intern umgeleitet |
| `TITLE_404` | Seitentitel enthält „not found", „page not found", „chapter not found" o.ä. – Seite gibt 200 zurück, aber es ist eine Fehlerseite |
| `MDX_SAME` | MangaDex: neuestes Kapitel ≤ currentChapter — kein neues Kapitel |
| `MDX_NO_DATA` | MangaDex: keine englischen Kapitel gefunden → fällt auf ComicK oder HTTP-Fallback zurück |
| `MDX_ERR(...)` | MangaDex: API-Fehler (HTTP-Code oder Parse-Fehler) → fällt auf ComicK oder HTTP-Fallback zurück |
| `CK_SAME` | ComicK: neuestes Kapitel ≤ currentChapter — kein neues Kapitel |
| `CK_NO_DATA` | ComicK: keine englischen Kapitel gefunden → fällt auf HTTP-Fallback zurück (falls URL-Template gesetzt) |
| `CK_ERR(...)` | ComicK: API-Fehler (HTTP-Code oder Parse-Fehler) → fällt auf HTTP-Fallback zurück |
