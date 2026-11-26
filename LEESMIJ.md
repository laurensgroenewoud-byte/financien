# Financiën – installeren (gratis)

Je zet de app op **GitHub Pages**. Dat is gratis en geeft je een eigen https-adres.
Dit doe je één keer, en het kan het makkelijkst op je Mac.

## 1. Online zetten
1. Maak een gratis account aan op **github.com**.
2. Klik rechtsboven op **+ → New repository**.
   - Naam: bijvoorbeeld `financien`
   - Kies **Public**. Dat is nodig voor gratis Pages. Alleen de programmacode wordt openbaar, je financiële gegevens niet: die komen nooit op GitHub.
   - Klik op **Create repository**.
3. Klik op **uploading an existing file** en sleep **alle bestanden en de map `icons`** uit deze zip erin.
   Klik daarna op **Commit changes**.
4. Ga naar **Settings → Pages**. Kies bij *Branch* `main` en `/ (root)` en klik op **Save**.
5. Na ongeveer 1 minuut staat je app op `https://<jouw-gebruikersnaam>.github.io/financien/`.

> ⚠️ Upload nooit je CSV-bestanden of back-ups naar GitHub.

## 2. Installeren op je apparaten
- **iPhone:** open het adres in Safari → deelknop → **Zet op beginscherm**.
- **Mac:** open het adres in Safari → menu **Archief → Voeg toe aan Dock**.

Open de app altijd via dat icoon. Dan bewaart Safari je gegevens blijvend.
Gewone websites worden soms na 7 dagen zonder gebruik door Safari gewist.

## 3. Gebruik
1. Kies een sterk wachtwoord. Er is geen "wachtwoord vergeten": bewaar het in je wachtwoordbeheerder.
2. Rabobank: ga naar je rekening → **Downloaden** → formaat **CSV** → importeer het bestand in de app.
3. Tik op een transactie om de categorie te wijzigen. Met "Onthoud…" geldt die categorie voortaan voor die tegenpartij.

## 4. Back-up en synchroniseren via Google Drive
- **Instellingen → Back-up maken.** Op de iPhone kies je daarna *Bewaar in Bestanden → Google Drive*.
  Op de Mac sleep je het gedownloade bestand naar je Google Drive-map.
- Op je andere apparaat kies je **Back-up terugzetten → Samenvoegen**.
- Het back-upbestand is versleuteld (AES-256). Google kan het niet lezen.

## Beveiliging in het kort
- Je gegevens worden alleen versleuteld op je eigen apparaat opgeslagen (AES-256-GCM, sleutel via PBKDF2 met 600.000 rondes).
- Er gaat niets naar een server, en er zijn geen trackers of externe scripts. Een strikte Content-Security-Policy blokkeert ook externe verbindingen.
- De app vergrendelt automatisch bij inactiviteit, en het scherm wordt vervaagd in de app-wisselaar.
- Updaten: upload de nieuwe bestanden opnieuw naar je repository.
