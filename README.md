# Kaštela — događanja i kalendar

Kalendar lokalnih događanja u Kaštelima. Na istoj stranici su i kalendari za Trogir, Solin i Split; ti gradovi još nemaju unesena događanja. Stranica čita `data/events.csv` u pregledniku, a `calendar.ics` je pretplata koju telefoni i Google, Apple i Outlook znaju osvježiti sami.

U tablici je program Božićnog grada i Fritulice, od 5. prosinca 2026. do 2. siječnja 2027.: koncerti u Novom parku, dječji program u Kulturnom centru Kaštela, paljenje svijeća na Đardinu i podjela bakalara na Poratu.

Nema baze. Novo događanje je novi redak u tablici.

## Dodavanje događanja

1. Na GitHubu otvori [`data/events.csv`](data/events.csv).
2. Odaberi olovku (Edit).
3. Dodaj redak na dno. Zarezom odvojeni stupci, UTF-8. Ako u nazivu ili opisu ima zarez ili navodnik, cijelo polje stavi u navodnike, a navodnik udvostruči (`""`).
4. Snimi promjenu (Commit).

Nakon pusha na `main`, GitHub Action [`.github/workflows/build-calendar.yml`](.github/workflows/build-calendar.yml) provjeri retke, izgradi `calendar.ics` i objavi stranicu na GitHub Pages. Vercel pri buildu radi istu naredbu: `node scripts/build-site.mjs`.

Excel na hrvatskom sučelju često sprema točku-zarez. To je u redu: skripta prepozna `;` ako je zaglavlje odvojeno točkom-zarezom. Sigurnije je ipak spremiti **CSV UTF-8** sa zarezima, kao u ovoj datoteci.

Ako redak ne valja, Action staje i u logu piše broj retka. Uobičajene greške: krivo mjesto, kategorija izvan popisa, datum koji ne postoji, `is_free` koje nije `true` ili `false`.

## Stupci

| Stupac | Što upisati |
| --- | --- |
| `id` | Jedinstveno, mala slova i crtice, npr. `kastela-2026-027` |
| `title` | Naziv, izvođač ili aktivnost |
| `date` | `YYYY-MM-DD` |
| `start_time` | `HH:MM`, 24 sata, vrijeme u Europi/Zagrebu |
| `end_time` | `HH:MM` ili prazno. Prazno znači dva sata nakon početka. Ako je kraj prije početka, događaj prelazi u sljedeći dan. |
| `venue` | Točno mjesto, npr. `Riva`, `Novi park`, `Brca`, `Kaštilac` |
| `district` | `Kaštel Novi`, `Kaštel Stari`, `Kaštel Lukšić`, `Kaštel Kambelovac`, `Kaštel Gomilica` ili `Kaštel Sućurac` |
| `category` | `Glazba`, `Djeca`, `Predstava`, `Gastro`, `Kultura`, `Sport i rekreacija` ili `Tradicionalno` |
| `is_free` | `true` ili `false` |
| `indoor_outdoor` | `Vanjski prostor`, `Natkriveno` ili `Kombinirano` |
| `image_url` | Neobavezno. Prazno polje daje karticu u boji kategorije. Slomljeni URL isto. |
| `description` | Kratko, jedna rečenica ili dvije |
| `programme` | Naziv skupa ako je događaj ubačen zajedno s drugima, npr. `Advent u Kaštelima`. Prazno polje nudi samo taj događaj. |

Vremena u kalendaru nose `TZID=Europe/Zagreb`. Svaki događaj ima svoj `UID` (`id@kastela.live`) i podsjetnik dva sata prije početka.

## Kalendar i obavijest

**Dodaj u kalendar** nudi dvije odvojene stvari:

- **Dodaj u privatni kalendar** otvara potvrdu za taj događaj (Google Kalendar, ili datoteka događaja na iPhoneu).
- **Dodaj samo obavijest** uključuje Web Push. Poslužitelj šalje poruku točno 8 sati prije početka, po vremenu Europe/Zagreb. Ako je do početka ostalo manje od 8 sati, podsjetnik se ne uključuje.

Na iPhoneu obavijest radi nakon dodavanja stranice na početni zaslon. Dopuštenje se traži tek na dodir. **Moji podsjetnici** u izborniku isključuju obavijest na tom uređaju. Brisanje pretplate je `DELETE /api/push-subscriptions`.

`node scripts/serve.mjs` svake minute provjeri rok. Na Vercelu isto radi zakazana funkcija `api/push-dispatch` svakih 15 minuta. Ručno slanje je `POST /api/push-dispatch`. S lokalnog računala token nije potreban. Inače zaglavlje `x-admin-token` mora biti `PUSH_ADMIN_TOKEN`. Statistika je na `admin.html` i `GET /api/push-stats`.

Na Vercelu pretplate stoje u privatnom Blob spremištu (`push/store.json`), a ključevi u `VAPID_PUBLIC_KEY` i `VAPID_PRIVATE_KEY`. Lokalno i dalje vrijede `data/vapid.json` i `data/push-store.json`.

VAPID ključevi su u `data/vapid.json` (nije u gitu) ili u varijablama:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (npr. `mailto:podsjetnik@kastela.live`)
- `PUSH_ADMIN_TOKEN`

Pretplate i podsjetnici stoje u `data/push-store.json`. Nema prijave korisnika. Promjena vremena u `data/events.csv` preračuna rok. Nestanak događaja gasi podsjetnik i, ako pretplata još vrijedi, pošalje obavijest da je događaj uklonjen.

**Preuzmi odabir (.ics)** i dalje skida samo trenutni filtar. To nije push ni živa pretplata.

## Lokalno

Treba Node 22.

```bash
node scripts/check.mjs
node scripts/build-site.mjs
node scripts/serve.mjs
```

Stranica je na [http://127.0.0.1:4173](http://127.0.0.1:4173). Poslužitelj `calendar.ics` šalje kao `text/calendar`.

## Objava

- **GitHub Pages:** u postavkama repozitorija izvor stranica treba biti **GitHub Actions**. Workflow na `main` objavljuje mapu `_site`.
- **Vercel:** `vercel.json` gradi istu mapu i postavlja `Content-Type` za `calendar.ics`. Produkcija se ažurira pushom na granu koju Vercel prati.

Filteri na stranici rade u pregledniku: mjesto, danas / sutra / vikend, kategorija, večeras, besplatno i za djecu. Pretraga hvata naziv, mjesto, naselje i opis, i bez kvačica (`djardin` nađe Đardin).
