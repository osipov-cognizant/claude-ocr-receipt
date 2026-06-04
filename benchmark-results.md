# Extraction benchmark — Tesseract vs Sonnet 4.6 vs Opus 4.8

9 Costco samples · generated 2026-06-04T01:41:52.809Z

Tesseract input downscaled to 2000px; landscape pages auto-rotated (best of ±90°).
Vision = Anthropic API. "Match" = items reconcile with printed subtotal.


## PXL_20260124_203447770.jpg

| Extractor | Store | Date | Items | Subtotal | Tax | Total | Sum | Match | Time |
|---|---|---|---|---|---|---|---|---|---|
| Tesseract | Costco | 01/24/2026 | 7 | $74.44 | $0.00 | n/a | $148.88 | false | 3.7s rot 0 |
| Sonnet 4.6 | Costco | 2026-01-24 | 6 | $74.44 | $0.00 | $74.44 | $74.44 | true | 7.2s  |
| Opus 4.8 | Costco | 2026-01-24 | 6 | $74.44 | $0.00 | $74.44 | $74.44 | true | 7.5s  |

<details><summary>items</summary>

**Tesseract** (7 items)

- % 3 E 1025795 KS HDZ EGGS — $9.49 [1025795]
- EU = E 931484 KS WATER GAL — $4.99 [931484]
- =. E 1913652 OTTAVIO EVOO — $20.99 [1913652]
- — E 1262178 A2 YILK3/59Z — $10.99 [1262178]
- Ee E 1262178 A2 MILK3/59Z — $10.99 [1262178]
- Sarna E 9262015 KS $PARK WAT — $16.99 [9262015]
- = AMOUNT: — $74.44

**Sonnet 4.6** (6 items)

- KS 5DZ EGGS — $9.49 [1025795]
- KS WATER GAL — $4.99 [931484]
- OTTAVIO EVOO — $20.99 [1913652]
- A2 MILK 3/59Z — $10.99 [1262178]
- A2 MILK 3/59Z — $10.99 [1262178]
- KS SPARK WAT — $16.99 [9262015]

**Opus 4.8** (6 items)

- KS 5DZ EGGS — $9.49 [1025795]
- KS WATER GAL — $4.99 [931484]
- OTTAVIO EVOO — $20.99 [1913652]
- A2 MILK 3/59Z — $10.99 [1262178]
- A2 MILK 3/59Z — $10.99 [1262178]
- KS SPARK WAT — $16.99 [9262015]

</details>

## PXL_20260221_190349014.jpg

| Extractor | Store | Date | Items | Subtotal | Tax | Total | Sum | Match | Time |
|---|---|---|---|---|---|---|---|---|---|
| Tesseract | — | — | 5 | n/a | n/a | n/a | $81.04 | null | 2.1s rot 0 |
| Sonnet 4.6 | Costco | — | 9 | n/a | n/a | n/a | $91.52 | null | 7.6s  |
| Opus 4.8 | Costco | — | 9 | n/a | n/a | n/a | $91.52 | null | 8.8s  |

<details><summary>items</summary>

**Tesseract** (5 items)

- E 975416 SAN PELL: MIN — $22.74 [975416]
- E 975416 SAN PELL: MIN — $22.74 [975416]
- : LL he GR FO BTR — $13.99
- E 99006 SWISS | — $15.58 [99006]
- E 1199652 BUTER CROISS — $5.99 [1199652]

**Sonnet 4.6** (9 items)

- San Pellegrino Mineral Water — $22.74 [975416]
- San Pellegrino Mineral Water - Instant Savings — $-5.75 [0000372064]
- San Pellegrino Mineral Water — $22.74 [975416]
- San Pellegrino Mineral Water - Instant Savings — $-5.75 [0000372064]
- A2 Milk 3/59oz — $10.99 [1262178]
- A2 Milk 3/59oz — $10.99 [1262178]
- Kirkland Signature Grass Fed Butter — $13.99 [1424237]
- Swiss Cheese — $15.58 [99006]
- Butter Croissants — $5.99 [1199652]

**Opus 4.8** (9 items)

- SAN PELL MIN — $22.74 [975416]
- Discount 975416 — $-5.75 [0000372064]
- SAN PELL MIN — $22.74 [975416]
- Discount 975416 — $-5.75 [0000372064]
- A2 MILK 3/59Z — $10.99 [1262178]
- A2 MILK 3/59Z — $10.99 [1262178]
- KS GR FD BTR — $13.99 [1424237]
- SWISS — $15.58 [99006]
- BUTER CROISS — $5.99 [1199652]

</details>

## PXL_20260302_233836293.jpg

| Extractor | Store | Date | Items | Subtotal | Tax | Total | Sum | Match | Time |
|---|---|---|---|---|---|---|---|---|---|
| Tesseract | Costco | 03/02/2026 | 16 | $198.13 | $0.00 | n/a | $274.90 | false | 4.2s rot 0 |
| Sonnet 4.6 | Costco | 2026-03-02 | 19 | $198.13 | $0.00 | $198.13 | $198.13 | true | 12.8s  |
| Opus 4.8 | Costco | 2026-03-02 | 19 | $198.13 | $0.00 | $198.13 | $198.13 | true | 13.4s  |

<details><summary>items</summary>

**Tesseract** (16 items)

- E 931484 KS WATER GAL — $4.99 [931484]
- E 9262015 KS SPARK WAT — $16.99 [9262015]
- E 9262015 KS SPARK WAT — $16.99 [9262015]
- E 1136340 3LB ORG GALA — $3.99 [1136340]
- E 60357 MIXED PEPPER — $6.89 [60357]
- E 1959421 RAW PSTACHIO — $14.99 [1959421]
- E 7950 AB COSMIC — $4.89
- E 1428777 BLWCKBERRIES — $6.49 [1428777]
- E 56356 RASPBERRIES — $4.79 [56356]
- E 57554 BLJEBERRIES — $6.59 [57554]
- E 77053 GRAPE TOMATO — $6.59 [77053]
- E 1285352 K$ GUAC SNGL — $11.99 [1285352]
- E 1785992 BROCOLI CHDR — $9.99 [1785992]
- E 99006 SWISS — $17.83 [99006]
- E 47729 [TENDERLOIN — $2.77 [47729]
- j AMOUNT: — $138.13

**Sonnet 4.6** (19 items)

- A2 MILK 3/59Z — $10.99 [1262178]
- A2 MILK 3/59Z — $10.99 [1262178]
- KS 5DZ EGGS — $9.39 [1025795]
- KS ORG BROCI — $9.99 [1217608]
- KS WATER GAL — $4.99 [931484]
- KS SPARK WAT — $16.99 [9262015]
- KS SPARK WAT — $16.99 [9262015]
- 3LB ORG GALA — $3.99 [1136340]
- MIXED PEPPER — $6.89 [60357]
- RAW PISTACHIO — $14.99 [1959421]
- 4LB COSMIC — $4.89 [7950]
- BLACKBERRIES — $6.49 [1428777]
- RASPBERRIES — $4.79 [56356]
- BLUEBERRIES — $6.59 [57554]
- GRAPE TOMATO — $6.59 [77053]
- KS GUAC SNGL — $11.99 [1285362]
- BROCOLI CHDR — $9.99 [1785992]
- SWISS — $17.83 [99006]
- TENDERLOIN — $22.77 [47729]

**Opus 4.8** (19 items)

- A2 MILK 3/59Z — $10.99 [1262178]
- A2 MILK 3/59Z — $10.99 [1262178]
- KS 5DZ EGGS — $9.39 [1025795]
- KS ORG BROCI — $9.99 [1217608]
- KS WATER GAL — $4.99 [931484]
- KS SPARK WAT — $16.99 [9262015]
- KS SPARK WAT — $16.99 [9262015]
- 3LB ORG GALA — $3.99 [1136340]
- MIXED PEPPER — $6.89 [60357]
- RAW PSTACHIO — $14.99 [1959421]
- 4LB COSMIC — $4.89 [7950]
- BLACKBERRIES — $6.49 [1428777]
- RASPBERRIES — $4.79 [56366]
- BLUEBERRIES — $6.59 [57554]
- GRAPE TOMATO — $6.59 [77053]
- KS GUAC SNGL — $11.99 [1285362]
- BROCOLI CHDR — $9.99 [1785992]
- SWISS — $17.83 [99006]
- TENDERLOIN — $22.77 [47729]

</details>

## PXL_20260309_224537595.MP.jpg

| Extractor | Store | Date | Items | Subtotal | Tax | Total | Sum | Match | Time |
|---|---|---|---|---|---|---|---|---|---|
| Tesseract | — | — | 0 | n/a | n/a | n/a | $0.00 | null | 3.2s rot +90 |
| Sonnet 4.6 | Costco | 2026-03-09 | 6 | $73.94 | $0.71 | $74.65 | $77.94 | false | 9.0s  |
| Opus 4.8 | Costco | 2026-03-09 | 6 | $73.94 | $0.71 | $74.65 | $77.94 | false | 8.8s  |

<details><summary>items</summary>

**Tesseract** (0 items)

_none_

**Sonnet 4.6** (6 items)

- KS SPARK WAT — $16.99 [926201E]
- A2 MILK3/597 — $10.99 [93174B4]
- KS WATER GAL — $4.99 [1489812]
- KS PUMA SOCK — $14.99 [10021212]
- KS GR FD BTR — $13.99 [14243237]
- KS GREEN TEA — $15.99 [000375539]

**Opus 4.8** (6 items)

- KS SPARK WAT — $16.99 [926201]
- A2 MILK 3/59Z — $10.99 [126217]
- KS WATER GAL — $4.99 [931484]
- PUMA SOCK — $14.99 [1489812]
- KS GREEN TEA — $15.99 [100212]
- KS GR FD BTR — $13.99 [142423]

</details>

## PXL_20260322_180925431.jpg

| Extractor | Store | Date | Items | Subtotal | Tax | Total | Sum | Match | Time |
|---|---|---|---|---|---|---|---|---|---|
| Tesseract | Costco | — | 8 | $62.92 | $0.00 | n/a | $71.42 | false | 2.2s rot 0 |
| Sonnet 4.6 | Costco | 2026-03-22 | 8 | $62.92 | $0.00 | $62.92 | $62.92 | true | 7.2s  |
| Opus 4.8 | Costco | 2026-03-22 | 8 | $62.92 | $0.00 | $62.92 | $62.92 | true | 7.8s  |

<details><summary>items</summary>

**Tesseract** (8 items)

- SE © o2c0015 KS SPARK WAT — $16.99
- a = 9702 CSR SLD KIT — $5.99
- : 99006 SWISS — $15.73 [99006]
- BEE © 0000377227 / 99006 — $4.25 [0000377227]
- BE 1948524 TRIMO YOGURT — $8.99 [1948524]
- E 568915 ORG CUCUMBER — $5.99 [568915]
- pn E 25695 COCKTAIL TOM — $6.49 [25695]
- E 1199652 BUTER CROISS — $6.99 [1199652]

**Sonnet 4.6** (8 items)

- KS Spark Water — $16.99 [9262015]
- CSR Salad Kit — $5.99 [9702]
- Swiss — $15.73 [99006]
- Swiss (Discount) — $-4.25 [0000377227/99006]
- Trimona Yogurt — $8.99 [1948524]
- Organic Cucumber — $5.99 [568915]
- Cocktail Tomatoes — $6.49 [25595]
- Butter Croissant — $6.99 [1199652]

**Opus 4.8** (8 items)

- KS Sparkling Water — $16.99 [9262015]
- CSR Salad Kit — $5.99 [9702]
- Swiss — $15.73 [99006]
- Discount / 99006 — $-4.25 [0000377227]
- Trimo Yogurt — $8.99 [1948524]
- Org Cucumber — $5.99 [568915]
- Cocktail Tomatoes — $6.49 [25595]
- Butter Croissant — $6.99 [1199652]

</details>

## PXL_20260324_234118755.jpg

| Extractor | Store | Date | Items | Subtotal | Tax | Total | Sum | Match | Time |
|---|---|---|---|---|---|---|---|---|---|
| Tesseract | Costco | 03/24/2026 | 7 | n/a | $1.36 | n/a | $172.70 | null | 3.1s rot 0 |
| Sonnet 4.6 | Costco | 2026-03-24 | 4 | $56.66 | $1.36 | $58.02 | $56.66 | true | 5.7s  |
| Opus 4.8 | Costco | 2026-03-24 | 4 | $56.66 | $1.36 | $58.02 | $56.66 | true | 5.7s  |

<details><summary>items</summary>

**Tesseract** (7 items)

- BN FE 1068083 ORG FR EGGS — $7.69 [1068083]
- BE 9262015 KS SPARK WAT — $16.99 [9262015]
- wl 6262016 ¥%KS BATH“ — $20.99 [6262016]
- & Bl FE 1262178 A2 MILK3/69Z — $10.99 [1262178]
- ! a SUBTOTA — $56.66
- a TK — $1.36
- 5 AMOUNT: — $58.02

**Sonnet 4.6** (4 items)

- ORG FR EGGS — $7.69 [1068083]
- KS SPARK WAT — $16.99 [9262015]
- KS BATH — $20.99 [6262016]
- A2 MILK 3/59Z — $10.99 [1262178]

**Opus 4.8** (4 items)

- ORG FR EGGS — $7.69 [1068083]
- KS SPARK WAT — $16.99 [9262015]
- KS BATH — $20.99 [6262016]
- A2 MILK3/59Z — $10.99 [1262178]

</details>

## PXL_20260408_001845207.jpg

| Extractor | Store | Date | Items | Subtotal | Tax | Total | Sum | Match | Time |
|---|---|---|---|---|---|---|---|---|---|
| Tesseract | — | — | 11 | $132.99 | $0.00 | n/a | $132.99 | true | 2.9s rot 0 |
| Sonnet 4.6 | Costco | — | 11 | $132.99 | $0.00 | $132.99 | $132.99 | true | 9.4s  |
| Opus 4.8 | Costco | — | 11 | $132.99 | $0.00 | $132.99 | $132.99 | true | 8.2s  |

<details><summary>items</summary>

**Tesseract** (11 items)

- BE FE 1165284 KS MEX CHEES — $11.99 [1165284]
- SWE £77053 GRAPE TOMATO — $6.99 [77053]
- M E 57664 BLUEBERRIES — $9.99 [57664]
- E 66366 RASPBERRIES — $6.49 [66366]
- E 7950 4LB COSMIC — $5.99
- E 7950 4LB COSMIC — $5.99
- 1935003 HUG PU 5T-6T — $39.99 [1935003]
- E 1462714 KS ORG A2 PR — $11.79 [1462714]
- "E 1462714 KS ORG A2 PR — $11.79 [1462714]
- ~ E 931484 KS WATER GAL — $4.99 [931484]
- ~ E 9262015 KS SPARK WAT — $16.99 [9262015]

**Sonnet 4.6** (11 items)

- KS MEX CHEES — $11.99 [1165284]
- GRAPE TOMATO — $6.99 [77053]
- BLUEBERRIES — $9.99 [57554]
- RASPBERRIES — $6.49 [56366]
- 4LB COSMIC — $5.99 [7950]
- 4LB COSMIC — $5.99 [7950]
- HUG PU 5T-6T — $39.99 [1935003]
- KS ORG A2 PR — $11.79 [1462714]
- KS ORG A2 PR — $11.79 [1462714]
- KS WATER GAL — $4.99 [931484]
- KS SPARK WAT — $16.99 [9262015]

**Opus 4.8** (11 items)

- KS MEX CHEES — $11.99 [1165284]
- GRAPE TOMATO — $6.99 [77053]
- BLUEBERRIES — $9.99 [57554]
- RASPBERRIES — $6.49 [56366]
- 4LB COSMIC — $5.99 [7950]
- 4LB COSMIC — $5.99 [7950]
- HUG PU 5T-6T — $39.99 [1935003]
- KS ORG A2 PR — $11.79 [1462714]
- KS ORG A2 PR — $11.79 [1462714]
- KS WATER GAL — $4.99 [931484]
- KS SPARK WAT — $16.99 [9262015]

</details>

## PXL_20260426_145649846.jpg

| Extractor | Store | Date | Items | Subtotal | Tax | Total | Sum | Match | Time |
|---|---|---|---|---|---|---|---|---|---|
| Tesseract | — | — | 11 | $101.80 | n/a | n/a | $178.75 | false | 5.4s rot +90 |
| Sonnet 4.6 | Costco | 2026-04-26 | 10 | $101.80 | $1.55 | $103.35 | $101.80 | true | 10.5s  |
| Opus 4.8 | Costco | 2026-04-26 | 10 | $101.80 | $1.55 | $103.35 | $101.80 | true | 8.7s  |

<details><summary>items</summary>

**Tesseract** (11 items)

- El E 56366 RASPBERRIES — $3.99 [56366]
- E 57554 BLUEBERRIES — $8.29 [57554]
- E 77053 GRAPES TOMATO — $6.59 [77053]
- IT E 21020 VINE /TOMATO — $6.99 [21020]
- BER £ 1424237 8 oe BIR — $13.99 [1424237]
- a EE 720650 UKES — $5.99 [720650]
- | 9262015 KS BPARK WAT — $16.99 [9262015]
- 1262178 A2 [ese — $10.99 [1262178]
- ics l — $103.35
- My. 2200 — $0.00
- [iby Ki 2 — $1.58

**Sonnet 4.6** (10 items)

- Raspberries — $3.99 [56366]
- Blueberries — $8.29 [57554]
- Grape/Tomato — $6.59 [77053]
- Vine/Tomato — $6.99 [21020]
- KS GR FD BTR — $13.99 [1424237]
- Mini Cukes — $5.99 [720650]
- KS OUT 20PCR — $4.19 [1738408]
- KS Spark Wat — $23.79 [1755444]
- A2 Milk 3/59Z — $16.99 [9262015]
- KS Spark Wat — $10.99 [1262178]

**Opus 4.8** (10 items)

- RASPBERRIES — $3.99 [56366]
- BLUEBERRIES — $8.29 [57554]
- GRAPE TOMATO — $6.59 [77053]
- VINE TOMATO — $6.99 [21020]
- KS GR FD BTR — $13.99 [1424237]
- MINI CUKES — $5.99 [720650]
- KS FR 2DZ — $4.19 [1738408]
- KS OUT 20PCR — $23.79 [1755444]
- KS SPARK WAT — $16.99 [9262015]
- A2 MILK3/59Z — $10.99 [1262178]

</details>

## PXL_20260526_235419811.jpg

| Extractor | Store | Date | Items | Subtotal | Tax | Total | Sum | Match | Time |
|---|---|---|---|---|---|---|---|---|---|
| Tesseract | — | — | 0 | n/a | n/a | n/a | $0.00 | null | 2.1s rot +90 |
| Sonnet 4.6 | Costco | — | 13 | n/a | n/a | n/a | $115.22 | null | 16.6s  |
| Opus 4.8 | Costco | — | 13 | n/a | n/a | n/a | $115.22 | null | 9.0s  |

<details><summary>items</summary>

**Tesseract** (0 items)

_none_

**Sonnet 4.6** (13 items)

- KS WATER GAL — $4.99 [931484]
- KS ORG A2 PR — $12.99 [1462714]
- BUTTER CROISS — $5.99 [1199652]
- SAN PELL MIN — $23.74 [975416]
- SAN PELL MIN DISCOUNT — $-5.75 [975355]
- TRIMO YOGURT — $8.99 [1948524]
- KS FR 2DZ — $4.89 [1738408]
- 3LB ORG ENVY — $5.99 [7017]
- SWISS — $16.33 [99006]
- US WAGYUBEEF — $19.99 [1455728]
- MIXED PEPPER — $7.49 [60357]
- SOUR CREAM — $5.59 [31222]
- YELLOW ONION — $3.99 [7812]

**Opus 4.8** (13 items)

- KS Water Gal — $4.99 [9314844]
- KS Org A2 PR — $12.99 [1462714]
- Buter Croiss — $5.99 [1199652]
- San Pell Min — $23.74 [975416]
- San Pell Min — $-5.75 [0000379355 / 975416]
- Trimo Yogurt — $8.99 [1948524]
- KS FR 2DZ — $4.89 [1738408]
- 3LB Org Envy — $5.99 [7017]
- Swiss — $16.33 [99006]
- US Wagyubeef — $19.99 [1455728]
- Mixed Pepper — $7.49 [60357]
- Sour Cream — $5.59 [331222]
- Yellow Onion — $3.99 [7812]

</details>

---
done
