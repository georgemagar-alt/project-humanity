# Project Humanity – Vereinswebseite

Zweisprachige (DE/EN) Website für einen gemeinnützigen Verein mit
projektbezogenen **Spendenkampagnen**, **PayPal**-Zahlung, **Live-Spendenbalken**
und **automatischer Dankes-E-Mail**.

- **Framework:** Astro (statische Seiten + serverseitige API-Routen)
- **Hosting:** Netlify
- **Datenbank:** Turso (libSQL/SQLite)
- **E-Mail:** Brevo
- **Zahlungen:** PayPal Orders API v2 + Webhook

---

## 1. Lokal starten

Voraussetzung: Node 20+.

```bash
npm install
cp .env.example .env      # dann .env ausfüllen (siehe Abschnitt 2)
npm run db:schema         # Tabellen anlegen
npm run db:seed           # 2 Demo-Kampagnen
npm run dev               # http://localhost:4321
```

Für rein lokales Arbeiten genügt in `.env`:

```
TURSO_DATABASE_URL=file:local.db
ADMIN_TOKEN=irgendein-langer-string
```

Ohne PayPal-/Brevo-Schlüssel funktionieren alle Seiten; nur das tatsächliche
Spenden und der Mailversand sind deaktiviert.

## 2. Zugänge einrichten

### PayPal  (developer.paypal.com)
1. Einloggen mit dem **Geschäftskonto** des Vereins → *Apps & Credentials*.
2. Oben zwischen **Sandbox** (Tests) und **Live** umschalten.
3. *Create App* → Name z. B. „Humanity Website“.
4. `Client ID` und `Secret` kopieren:
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`
   - `PUBLIC_PAYPAL_CLIENT_ID` = dieselbe Client ID (wird im Browser gebraucht)
5. `PAYPAL_ENV=sandbox` (später `live`).
6. Webhook: in der App unter *Webhooks* → *Add Webhook*
   - URL: `https://DEINE-DOMAIN/api/paypal/webhook`
   - Events: **Payment capture completed**, **Payment capture refunded**,
     **Payment capture reversed**
   - Die erzeugte **Webhook ID** → `PAYPAL_WEBHOOK_ID`

### Turso  (turso.tech)
```bash
# einmalig: CLI installieren, siehe turso.tech/docs
turso auth login
turso db create humanity
turso db show humanity --url            # -> TURSO_DATABASE_URL
turso db tokens create humanity         # -> TURSO_AUTH_TOKEN
```
Danach einmal gegen die echte DB:
```bash
npm run db:schema
npm run db:seed        # optional
```

### Brevo  (app.brevo.com)
1. *Settings → SMTP & API → API Keys* → Key erstellen → `BREVO_API_KEY`.
2. *Senders, Domains & Dedicated IPs → Domains* → Vereins-Domain hinzufügen und
   die angezeigten **SPF-/DKIM-DNS-Einträge** beim Domain-Anbieter eintragen.
3. `EMAIL_FROM` = `Project Humanity <spenden@deine-domain.org>` (Adresse auf der
   verifizierten Domain).
4. `MEMBERSHIP_NOTIFY_EMAIL` = Postfach des Vorstands für neue Mitgliedsanfragen.

### Admin
`ADMIN_TOKEN` = langer Zufallsstring. Damit meldest du dich unter `/admin` an,
um Kampagnen anzulegen/zu bearbeiten und Spenden zu sehen.

## 3. Deploy zu Netlify

1. Projekt in ein Git-Repo legen und zu GitHub pushen.
2. Auf netlify.com → *Add new site → Import an existing project* → Repo wählen.
   Build-Command `npm run build`, Publish-Verzeichnis wird automatisch erkannt
   (`dist`), das Netlify-Adapter-Plugin übernimmt die API-Funktionen.
3. *Site settings → Environment variables*: **alle** Werte aus `.env` eintragen
   (ohne `.env`-Datei – die wird nicht deployt).
4. Deploy starten. Danach `PUBLIC_SITE_URL` auf die echte Netlify-/Domain-URL
   setzen und neu deployen.
5. Eigene Domain unter *Domain management* verbinden.

## 4. Testen (Sandbox)

1. `PAYPAL_ENV=sandbox`, Sandbox-Schlüssel gesetzt, Site deployed (oder
   `npm run dev` + ein Tunnel wie `npx localtunnel --port 4321` für den Webhook).
2. Auf `/spenden` eine Kampagne + Betrag wählen, mit einem
   **Sandbox-Käuferkonto** (developer.paypal.com → *Testing Tools → Sandbox
   Accounts*) bezahlen.
3. Prüfen:
   - Spendenbalken steigt sofort und bleibt nach Reload korrekt
   - Zeile in der Tabelle `donations` (`status = completed`, `gross_cents` stimmt)
   - Dankes-E-Mail kommt an
4. Webhook-Robustheit: developer.paypal.com → App → *Webhooks* →
   **Webhooks Simulator** → Event `PAYMENT.CAPTURE.COMPLETED` an die Webhook-URL
   senden. Es darf **keine** doppelte Zählung entstehen (Schutz über
   `paypal_capture_id UNIQUE`).
5. Rückerstattung im PayPal-Konto testen → Event `PAYMENT.CAPTURE.REFUNDED` →
   `status` der Spende wird `refunded`, Summe sinkt wieder.

## 5. Live schalten

1. In PayPal auf **Live** umstellen, Live-App anlegen, Live-Webhook auf
   `https://DEINE-DOMAIN/api/paypal/webhook` registrieren.
2. In Netlify die Live-Werte setzen: `PAYPAL_ENV=live`, Live `PAYPAL_CLIENT_ID` /
   `PAYPAL_CLIENT_SECRET` / `PUBLIC_PAYPAL_CLIENT_ID` / `PAYPAL_WEBHOOK_ID`.
3. Eine echte 1-€-Spende durchspielen, dann im PayPal-Konto erstatten.

## 6. Inhalte pflegen

| Was | Wo |
|---|---|
| Seitentexte (Wer wir sind, Was wir tun, Kontakt, Impressum, Datenschutz) | `src/views/*.astro` |
| News-Beitrag | neue `.md` in `src/content/news/de/` **und** `src/content/news/en/` (gleicher `translationKey`) |
| Termin | neue `.md` in `src/content/events/de/` und `.../en/` |
| Menü-/UI-Texte | `src/i18n/ui.ts` |
| Kampagnen (Titel, Ziel, Status) | Web-Oberfläche unter `/admin` |
| Logo / Bilder / `satzung.pdf` | `public/` |

Nach Änderungen an Dateien: committen und pushen → Netlify baut automatisch neu.
Kampagnen-Änderungen über `/admin` wirken sofort (keine Neu-Deploy nötig).

## 7. Rechtliches (noch zu erledigen)

- `src/views/Imprint.astro` mit echten Vereinsdaten füllen (Anschrift, Vorstand,
  Registergericht, VR-Nummer).
- `src/views/Privacy.astro` an die tatsächlichen Verhältnisse anpassen und
  **rechtlich prüfen lassen** (PayPal, Brevo, Netlify, Turso, Aufbewahrung von
  Spendendaten).
- Die Dankes-E-Mail ist **keine** Zuwendungsbestätigung.

## Struktur

```
src/
  pages/            Routen (DE unter /, EN unter /en/)
    api/            serverseitige Endpunkte (prerender = false)
  views/            Seiteninhalte, nehmen `lang` als Prop
  components/       Nav, Footer, CampaignList, DonateWidget, MembershipForm
  content/          News- und Termin-Markdown (de/ und en/)
  lib/              db, paypal, email, money, env, http
  i18n/ui.ts        Sprach-Strings + Helfer
schema.sql          Datenbankschema
scripts/            db:schema, db:seed
```

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | lokaler Server |
| `npm run build` | Produktions-Build |
| `npm run preview` | Build lokal ansehen |
| `npm run db:schema` | Schema anwenden |
| `npm run db:seed` | Demo-Kampagnen einfügen |
| `npx astro check` | Typprüfung |
