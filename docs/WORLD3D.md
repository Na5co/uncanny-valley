# The 3D world

> This page documents the archive viewer (`pnpm site`) of the original 72-hour engine the project grew from; it draws chronicle archives too. The live site runs on `src/chronicle` and `src/live/worker.ts` and has no 3D view; see [LIVE.md](LIVE.md).

Every archive page has a low-poly three.js view of the world, driven by the same `frames` the 2D map uses (`docs/ARCHIVE.md`). Toggle **3D world / 2D map** in the Replay section; the 2D map is the fallback when three.js cannot load (offline), so a page never breaks.

What you see:
- **A biome from the scenario's words** — open water with the ship's decks as plates and a mast when the premise is at sea; hills with pines for a mining town; grassland otherwise. Every world has its own dressing from its seed.
- **Places** as plates with low-poly buildings tinted by tag (work · social · rest · exit) and labelled; **paths** as roads between them.
- **Citizens** as figures coloured by their current lean, a light ring at their feet once committed, a name over the ones the scenario wrote by hand. They walk between places hour by hour; what they say appears above their heads.
- **A day/night cycle** on the sim clock: the sun crosses the sky, dusk turns amber, night is deep blue and the social places light their lamps.
- **An event lights its place** when it fires; a tie that sours shakes the camera a little.
- Drag to orbit, scroll to zoom; it slowly orbits on its own until you touch it.

## Effects — what the world itself does

Events can carry an `fx` (`docs/SCENARIO.md`): the sky, the ground and the air answer.

| fx | what happens |
|---|---|
| `rain` | rain falls; the sky dims |
| `storm` | heavy wind-blown rain, lightning flashes, a darker sky, rougher water |
| `quake` | the camera and the ground shake |
| `fog` | the world dissolves a few plates away |
| `fire` | a flickering orange glow and rising embers at the event's place |
| `snow` | slow white snow |
| `flood` | the water rises over the decks (sea worlds) |
| `eclipse` | the sun goes red and the world darkens at noon |
| `aurora` | a shifting green-violet curtain across the sky |
| `swarm` | a dark cloud of *something* over the town |
| `silence` | colour drains; the lamps stay lit in daylight |

`fxHours` sets how long it lasts (1–24). On top of that, every world gets a couple of seeded showers or fogs of its own, so no two skies are the same.

**The Architect is invited to use these** (`prompts/architect-scenario.md`, step 5): weather is a pressure, and strange is welcome if it belongs to the premise's world — a fog that stops the ferry, a swarm nobody can explain, an eclipse on the last morning. The validator accepts only the names above, so a generated world can be weird but never broken. Adding a new effect is one entry in `src/validate.ts` (`FX`) and one block in `src/site3d.ts`.

## Beyond this

`record.json` → `frames` (place, lean, commitment, lines per hour per citizen) + `map` (places, tags, paths, optional x/y) is a complete scene description. The three.js view is one consumer; a Godot or Unity scene would read the same file.


## A chronicle season is one scripted day

The scene does not run free between seasons; it plays each season as a day with a fixed shape, so time reads:

1. **Title card** — the season, and the epoch headline if one begins.
2. **Morning** — everyone walks the roads to work: miners to the pit, farmers to the rows, stall-keepers to the square.
3. **The working day** — this is when the season's events are shown, **one at a time**, as vignettes: the camera cuts close to the two people, the actor walks over and stops with a ❓ (the choice), then the deed with its icon (💰 theft, 👊 violence, 🗡 betrayal, 🚪 abandonment, 🍞 gift, ❤ help, 🤝 mercy, ⚖ justice, 🕊 sacrifice, 🛡 loyalty, 💀 death, 👶 birth, 🤒 sickness, 🎒 leaving, 🏚 losing the roof), the other person flinches, falls or lifts, and one narration line at the bottom says what happened ("Gerd helped drive Mona out as a plague-bringer"). Deaths fall and leave a grave in the churchyard; leavers walk out of the valley. How many events you see depends on the tempo: at 60 s a season every one that matters, at 10 s the few biggest, at 2 s only the deaths — the rest are applied quietly.
4. **Evening** — where each person chose to spend it this season (the quiet-season choice in their journey): staying on at work, the tavern, the chapel, the square, or visiting someone — the host comes out to the door. Nothing here is a rule of the renderer; it plays the ledger. Windows light, chimneys smoke.
5. **Night** — everyone inside; the roofless sleep in the lanes.

**State on the body**: the starving slump and thin; the sick bend and cough; the rich wear a gold band; someone known for harm is turned away from. **Epochs staged**: in a famine the stalls empty and a queue forms at the store; in a plague the sick lie outside their houses and the doctor does the rounds; in wartime soldiers stand in the square and patrol the roads, and the bold gather there; winter empties the streets; a fire leaves the Row's houses black. A small HUD shows the season, the epoch, and alive / dead / gone. Hover a person for their name; click for their story; **▶ watch** on a journey follows one person and shows only their events, with their situation and choice as a caption.

### Watching one life

Every journey has a **▶ watch** button. It rewinds to season one, locks the camera on that person (gold ring; they are drawn even at night), and plays their fifteen years: their situation and choice for the season appears as a caption in the scene, the deeds done by and to them are acted out first and are the only ones labelled, and the replay stops a moment after their death or departure. ✕ on the caption, or the same button, stops following. Default pace when you start watching is 5 s a season (a life in about five minutes); the tempo buttons still apply.

## The lane: ten people, a cast, a look

With a cast of fourteen or fewer (`scenarios/chronicle/the-lane.json` has ten) the page becomes personal: every household has its own house with its name on it; every figure wears a coat and hair that are theirs and a name tag that is always on; the town is smaller and the camera closer and lower. The look is toon-shaded on a warm paper palette with a vignette at the edges.

Under the scene is the **cast**: one card per person with live health / food / money bars (from the season's `vitals`), the actor lit in gold and the person they are dealing with in blue, their tie in a word ("friends", "neighbours", "bad blood"), and — the point of the whole thing — the **impact of every decision** as chips that pop on the card when the dice land: `+8 money`, `−10 mood`, `closer`, `colder`, `a child`, `no roof`. Click a card to follow that person. The **timeline strip** below marks epochs in gold and deaths in red; click a season to jump to it.

The camera is a rig — a target plus a per-shot offset — moved on a time basis, so a slow frame snaps rather than crawls.
