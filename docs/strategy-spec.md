# Strategy Spec — Forex Discipline Coach

Living document. Source of truth voor de analyzer-logica. Wijzigingen hier
gaan vóór op bestaande code; code wordt aangepast om dit te volgen.

## Kernprincipes

1. **Wachten op closed candles.** Beslissingen worden alleen genomen op basis
   van gesloten candles van de timeframe waarop het signaal ontstaat.
   De nog-vormende candle is ruis.
2. **Mean-reversion is de basisstrategie**, niet trend-following. Een "rode"
   EMA-trend kan tegelijk een long setup zijn als de close buiten de onderband
   ligt (en omgekeerd).
3. **Per timeframe een onafhankelijke status.** 1H kan "job done" zijn terwijl
   4H nog onderweg is. Signalen leven naast elkaar; geen verplichte alignment.
4. **De app luistert naar de strategie van de gebruiker** — geen generiek
   trading-advies, geen eigen interpretatie buiten deze spec om.

## Trigger: BB-extreme close

- **Voorwaarde:** een gesloten candle op een TF ≥ 30m sluit *buiten* de
  Bollinger Band (boven de bovenband of onder de onderband).
- **Geldige TFs:** 30m, 1H, 4H, 8H, 1D, 1W, 1M.
- **Richting van de setup:**
  - Close boven bovenband → mean-reversion **short** setup
  - Close onder onderband → mean-reversion **long** setup
- **Trigger-TF wordt vastgelegd bij de setup** en bepaalt invalidatie + targets.

## Targets — "de job van de prijs"

De prijs heeft als doel een magnetisch niveau te bereiken. Mogelijke
magneten (gelijkwaardig):

1. **EMA11** (oranje lijn)
2. **EMA25** (gele lijn)
3. **Psycho-numbers** — laatste 2 decimalen `00`, `50`, `25`, `75`.
   - `00` en `50` zijn sterker dan `25` en `75`.
   - Geldt voor alle paren en alle TFs identiek.
   - Voor JPY-paren op de 2e decimaal (bv. 156.50, 157.00).
   - Geen afstandsfilter: dichtstbijzijnde magneet in de bewegingsrichting telt.

**Primair doel** = welke magneet de prijs als eerste raakt vanaf de
trigger-candle, in de richting van de mean-reversion.

## Status per TF

Elke TF krijgt onafhankelijk een van deze statussen:

| Status              | Betekenis                                                                  |
|---------------------|----------------------------------------------------------------------------|
| `neutral`           | Geen actief signaal. Prijs binnen BB, niks bijzonders.                     |
| `outside_bb`        | Laatste closed candle sloot buiten de BB. Trigger actief, target = magneet.|
| `traveling_to_target` | Trigger geweest, prijs onderweg naar magneet, nog niet geraakt.          |
| `job_done`          | Magneet (EMA11/EMA25/psycho-number) is geraakt. Wachten op reactie.        |
| `breaking_through`  | Prijs is door zowel EMA11 als EMA25 heen. Nieuw doel = tegenoverliggende BB.|

### Touch vs. doorbraak — definitie

Dit onderscheid is fundamenteel:

- **Aangeraakt (touch)** = de **wick** (high/low) van een closed candle raakt of
  passeert de magneet, maar de **close** van die candle eindigt nog aan de
  oorspronkelijke kant (de kant waar de prijs vandaan kwam). De magneet heeft
  zijn werk gedaan; de prijs heeft afgeketst.
- **Doorgebroken (broken)** = de **close** van een closed candle eindigt voorbij
  de magneet (in de mean-reversion richting). Eén candle is genoeg, geen
  bevestigingscandle nodig.

### Statusovergangen

- `neutral` → `outside_bb`: nieuwe closed candle sluit buiten BB.
- `outside_bb` → `traveling_to_target`: volgende candle bevestigt richting naar magneet.
- `traveling_to_target` → `job_done`: een candle **raakt** een magneet maar
  **sluit terug aan de oorspronkelijke kant** (touch, geen doorbraak).
- `job_done` → `neutral`: prijs reageert op de magneet en keert (terug richting BB).
- `traveling_to_target` of `job_done` → `breaking_through`: een candle **sluit
  voorbij** een magneet. Het volgende doel wordt de eerstvolgende magneet
  daarachter (of de tegenoverliggende BB-band als er geen magneet meer over is).
- `breaking_through` blijft `breaking_through` zolang de close aan de doorbraak-kant blijft.

> "Job done" betekent: de oorspronkelijke trigger mag niet opnieuw afgevuurd
> worden voor dezelfde beweging. Nieuwe context (reactie op de lijn) telt
> zwaarder dan de oorspronkelijke trigger.

## Beslismomenten

- **Vóór de close van de trigger-TF**: geen entry. De app communiceert
  expliciet: *"setup geldig na {TF} close om {HH:MM}"*, niet vaag "wacht nog even".
- **Na de close**: setup is geldig zolang status `outside_bb` of
  `traveling_to_target` is.
- **Bij `job_done`**: geen nieuwe entries op deze trigger. Wachten op reactie.
- **Bij `breaking_through`**: nieuw target wordt de tegenoverliggende BB-band;
  invalidatie verandert mee.

## Wat de app moet onthouden per actieve setup

- `trigger_tf` — op welke TF ontstond het signaal
- `trigger_candle_close_time` — wanneer sloot de candle die de trigger gaf
- `direction` — long of short (mean-reversion richting)
- `target_magnet` — welke magneet primair (EMA11 / EMA25 / psycho-number + waarde)
- `secondary_target` — tegenoverliggende BB-band, alleen bij `breaking_through`
- `status` — een van bovenstaande
- `invalidation` — afhankelijk van trigger-TF en huidige status

## Wat dit NIET is

- Geen trend-following alignment-check tussen TFs.
- Geen "alle EMA's moeten groen zijn" criterium.
- Geen advies over wanneer wél of niet te traden buiten deze regels — de app
  modelleert deze strategie en wijst af wat er niet in past.

## Open punten (nog te beslissen)

- **Wave / swing structuur** (Fase 3): hoe detecteert de app lower-highs /
  higher-lows binnen de huidige beweging? Bill Williams 5-bar fractals als
  startpunt, maar nog niet vastgelegd.
- **Multi-TF Donchian** (Fase 4): hoe BBB-criteria per TF wegen.
- **Reactie-detectie bij `job_done`**: hoeveel candles wachten voordat we
  "reactie bevestigd" zeggen? Op welke TF wordt de reactie gemeten?
