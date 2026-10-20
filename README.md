# Loresmith

Loresmith is a worldbuilding and story manager for [Obsidian](https://obsidian.md). It keeps characters, places,
cultures, species, creatures, items, events, languages and stories together in one project, works out how
everything is connected, and helps you plan, write and track a book, all stored as ordinary markdown notes.

- **Plain markdown, no database.** Every entry is a note with frontmatter, so your work stays readable without the
  plugin and works with the graph, backlinks, search, Dataview and Bases.
- **Desktop and mobile.** No Node APIs, so it runs on desktop, iPad and phones.
- **Theme-friendly.** Styling uses Obsidian's theme variables only, so your theme restyles it.

## Contents

- [Installation](#installation)
- [Getting started](#getting-started)
- [How your data is stored](#how-your-data-is-stored)
- [Views](#views)
- [Entries](#entries)
- [Characters](#characters)
- [Relationships](#relationships)
- [Organizations, groups and roles](#organizations-groups-and-roles)
- [Species, creatures and plants](#species-creatures-and-plants)
- [Stories, chapters and scenes](#stories-chapters-and-scenes)
- [Outlines and plot arcs](#outlines-and-plot-arcs)
- [Time: timeline, calendar and holidays](#time-timeline-calendar-and-holidays)
- [Languages and the dictionary](#languages-and-the-dictionary)
- [Relations web](#relations-web)
- [Who has met whom](#who-has-met-whom)
- [Writing log](#writing-log)
- [Generators](#generators)
- [Name builder](#name-builder)
- [Moodboards and tension](#moodboards-and-tension)
- [Export](#export)
- [Commands](#commands)
- [Settings](#settings)

## Installation

### Manual

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Create a folder called `loresmith` in `<your vault>/.obsidian/plugins/` and put the three files in it.
3. In Obsidian, open **Settings → Community plugins**, refresh the list and enable **Loresmith**.

### Optional companion plugins

- **[Randomness](https://github.com/Obsidian-TTRPG-Community/Randomness)** is required for the
  [Generators](#generators). Everything else works without it.

## Getting started

1. Click the **library** icon in the ribbon, or run **Loresmith: Open overview**.
2. Create a project. A project is a folder inside your lore folder (`Lore` by default).
3. Use the **+** buttons, the **Create entry** command or the category pages to add characters, places, stories and
   anything else.
4. Click the **bookmark** icon in the ribbon to open the sidebar panel, and keep it open while you write.

## How your data is stored

Everything is a normal markdown note.

```
Lore/
  Example Project/              ← a project
    Characters/Elena Hart.md
    Locations/Saltmarsh.md
    Organizations/Lantern Guild.md
    Calendar.md                 ← the project's calendar
    Stories/
      First Draft/
        First Draft.md          ← story note: synopsis, main characters, chapter order
        First Draft outline.md  ← the story's outline
        Chapter 1/
          Scene 1.md            ← write here
```

- Each entry has `type: <type>` in its frontmatter (`lore:` is also read).
- Links between entries (species, residence, member of, owns and so on) are frontmatter wikilinks, so they appear in
  the graph, backlinks, Dataview and Bases.
- The large text boxes in the editor are the note's `## Heading` sections. Edit them in Loresmith or in the note.
- Custom attributes are top-level properties, listed in `attributes` to keep their order.
- Scene folders follow a chapter/scene layout that works alongside other writing plugins such as Longform and Novelr.

## Views

### Overview

The main view, opened from the ribbon or **Open overview**. A navigation column on the left reaches every part of
the project: stories, notes, the writing log, plotting tools, generators and every category, grouped into People,
Nature, Places, Things, History and Language. The home page shows writing goals, stories with chapter and word counts,
character portraits, a tile for every category and a tag cloud.

### Sidebar panel

A compact Loresmith for the right sidebar, opened with the bookmark icon or **Open sidebar panel**. It moves between
its own pages with back and home buttons instead of opening tabs.

- **Home**: what you are writing right now (status, story and chapter, who is in the scene), today's words, stories,
  plotting tools, generators and every category with counts.
- **Writing log**: the Today, Trend, Goals and Authorship tabs, sized for the sidebar. The Today tab and a running
  pomodoro update while you type.
- **Story**: synopsis, main characters and word goal, then collapsible chapters with scenes. Change status, cast,
  order and names, and add chapters and scenes. Tapping a scene opens it in the editor you were last writing in.
- **Category and entry**: search a category, then read an entry's details, sections and appearances as a quick
  reference. Links between entries open inside the panel.

**Edit**, **Board**, **Outline** and anything marked with an arrow open the full view in the main area.

### Category pages

Grid or list layout, search, and a right-click menu to open, open as a note, move to a folder or delete.

- **Grouping**: group any list by **folders** (subfolders inside the type's folder, nested as deep as you like), **by
  type** (the Type or Kind field; species by classification, characters by importance) or not at all. Pick it on the
  overview or with the folder button in the sidebar; it is remembered per type. Click a heading to fold it, and use
  the **+** on a heading to create an entry in that folder or with that type.
- **Nesting**: subspecies sit under their species, branches under the organization they are part of, and places
  under the place they are part of.
- **Move to folder…** in an entry's right-click menu files it into a subfolder with its links intact.

### Entry editor

Section editors with preview, reorderable Details sections, linked fields, custom attributes, tags and a
**Linked from** list. Fields such as Classification, Type, Era, Status, Role, Heritage and Part of speech suggest
values you have already used, so "Noble" and "noble" don't become two groups.

## Entries

| Group | Entry types |
| --- | --- |
| People | Characters, Organizations, Cultures, Species |
| Nature | Creatures (Bestiary), Plants (Flora) |
| Places | Locations |
| Things | Items, Discoveries, Relations |
| History | Events, Holidays, plus the Timeline and Calendar |
| Language | Languages, Dictionary words |
| Plotting | Stories, Plot arcs, Notes |

Every entry lists **Connections**: what it links to and what links to it. A location shows its residents, who was
born there and its events; an organization shows its members; a species shows its characters.

## Characters

Character sheets have a portrait header with age, status, species, role, home, traits and flaws, then:

- **At a glance**: scenes, chapters, first and last appearance, and who they appear with most. A strip of every scene
  in the book with theirs filled in (click one to open it), a warning when they vanish for three or more chapters,
  and a profile checklist of what is still blank. Click a checklist item to jump to it.
- **A one-line look** under the header: apparent age, height, build, hair, eyes and skin.
- **Relationship cards**, a **family tree** across five generations, and **Connections**.
- **Sidebar fields** in groups you can fold away: Identity, Appearance, Personality, Abilities, Life, Family, Ties and
  Holdings.
- **Author's notes**: Want, Need, Wound, Lie, Arc, Voice and Secrets.

Other details:

- **Birth names**: the Birth name field holds a maiden or former name, shown as "née …" (or "né", or "born" when
  gender isn't set) under their name, on relationship cards and in the family tree. Searching for it finds them.
- **Heritage**: a free label for what people call someone, separate from biology ("noble-born", "clanless").
- **Initials** on cards and avatars use the first and last name ("Elena Mae Hart" is EH).
- **Ages** are worked out from their birth date and the story's in-world date (see [Time](#time-timeline-calendar-and-holidays)).
- The **Species** check on the profile only appears once the project has a species, so the plugin suits any genre.

### Scene cast

Each scene has a `characters` list in its frontmatter. Fill it from the people icon on the chapters board or in the
sidebar, with the **Characters in this scene** command, or by hand. Characters listed there appear in the scene;
characters only linked in the text count as mentioned. **Add an empty characters property to scenes that lack one**
updates older scenes.

## Relationships

One engine reads links from both notes, so if Jonah lists Elena as an ally, Elena's page shows Jonah too.

- **Worked out for you**: full, half and step siblings, grandparents, aunts and uncles, nieces and nephews, cousins,
  in-laws and step-family. Siblings listed by name share parents, and named siblings of siblings are siblings too.
- **Labels follow pronouns or gender**: "Sister", "Half-brother", "Mother-in-law".
- Anything found from another note is marked with a sparkle and says where it came from.
- Add relationships with **Add relationship** on a character, or in the sidebar fields.

### Ties that change over time

The clock icon on a relationship card (or **A tie that changed over time…** under Add relationship) opens a history
for that pair, one line per stage, with optional years:

```yaml
ties:
  - "[[Jonah]]: Enemy (1000–1015)"
  - "[[Jonah]]: Friend (1015–)"
  - "[[Rafe]]: Lover (until 1010)"
  - "[[Rafe]]: Nemesis (1010–)"
  - "[[Corin]]: Ex-wife"
  - "[[Pell]]: Brother, estranged"
```

- The current stage becomes the relationship card, with "Before: Former enemy (1000–1015)" underneath.
- Someone with only past ties moves to a **Past ties** group ("Ex-wife", "Former rival").
- A past stage retires the same kind of link written in the plain fields, so you don't have to delete it.
- Everyday words are understood (nemesis, lover, fiancée, apprentice, best friend); anything else shows as typed, and
  a note after a comma ("estranged") is kept.
- Lines are read from both characters' notes, so you only write them once.

### Two-way links

With **Keep links two-way** on (the default), adding or removing a link also updates the other note: spouses,
partners, siblings, friends, allies, rivals, enemies, mentors and students, parents and children, members, leaders,
owners, pioneers, regions and cultures. **Make relationship links two-way** fills in every missing side in the
project at once; nothing is removed.

## Organizations, groups and roles

Schools, companies, teams, bands, crews, guilds and noble houses are all Organizations. A character joins one through
**Affiliation**, **Leader of**, **Education** or **Workplace** (**House**, under Family, is for a noble house or
dynasty).

Use the pencil on a group chip to give someone roles there, one line per position, each with optional years and a
**No longer active** switch:

```yaml
roles:
  - "[[Northgate Academy]]: Student (1971–1978)"
  - "[[Northgate Academy]]: Professor, Chemistry (1981–)"
  - "[[Ember House]]: Head of House (1985–)"
  - "[[Lantern Guild]]: (former)"
```

- A role is **former** when its end year is before the story's present date, when it is marked former, or when the
  character has died. Former members stay linked and keep their titles ("Former Student").
- **Subdivisions**: an organization that is **Part of** another (houses of a school, departments of a government,
  squads of an army) is a subdivision, at any depth. Its people also appear on the parent's page, labeled with their
  subdivision. Adding someone to the parent asks which subdivision they belong to.
- **People section** on organization pages: everyone current, grouped by role or by subdivision, with earlier titles
  on each card. Former members follow in their own section, which you can hide.
- **Groups and positions** on character sheets: every group they are or were in, with each title and its years,
  active ones first. The header shows their current titles.

## Species, creatures and plants

### Species

Three layers. A species' **Classification** sits above it ("Being", "Beast", "Spirit", or a path like
"Beast › Dragon"). **Subspecies of** sits below, as many levels deep as you like, and a subspecies without its own
classification inherits its parent's.

```
Being    › Human › Highlander, Lowlander
Being    › Elf   › Wood Elf, Sea Elf
Beast    › Dragon › Ash Drake
```

- The Species page groups everything under its classification, with subspecies indented under their parents.
- Each species page lists its characters, including those of every subspecies.
- A character's header shows the whole line ("Wood Elf · Elf · Being").
- Note names are unique, so name subspecies in full ("Wood Elf").

### Hybrids and ancestry

- For a one-off mix, give a character more than one Species ("Human, Elf").
- For a mixed people with a name of its own, make it a species and set **Hybrid of** ("Half-elf" → Human, Elf).
- **Ancestry** is worked out from the family tree: each parent gives half, all the way up. A character with parents of
  different species gets a line like "Ancestry: ½ Elf, ½ Human", "¾ Human, ¼ Elf" a generation later, or
  "Human (½ Highlander, ½ Lowlander)" within one species. Named hybrids count as their parts.
- If the parents can't have produced the species you set, the line becomes a dashed "Parents: …" warning, which is
  fine for someone who was turned or cursed and a continuity check otherwise.

### Bestiary and Flora

Creatures and plants are their own kinds of entry, kept apart from Species (which is for peoples your characters
belong to). Each has its own folder (`Bestiary/`, `Flora/`).

- **Creatures**: Classification, Variant of, Threat, Mind (animal, cunning, sapient), Temperament, Size, Diet,
  Lifespan, Rarity, Active (nocturnal, winter only) and Habitat; Abilities, Weaknesses and Yields; Companions
  (characters) and Kept by (cultures, organizations). Sections: About, Appearance, Behavior, Lore, plus Ecology.
- **Plants**: Classification, Variant of, Toxicity, Rarity, Season, Climate, Habitat, Useful parts, Uses and Grown by.
  Sections: About, Appearance, Uses, Lore, plus Cultivation.

Both work like species: Classification groups the list, variants nest under their parent, and the page shows key facts
at the top (deadly threats and toxins in red). Characters have a **Creatures** field for pets, mounts and familiars,
kept two-way with the creature's Companions. Items have **Made from**, events can involve creatures, and locations
list the creatures and plants that live there.

**Moving existing species**: **Move to Species, Bestiary or Flora** (on a species page and in its right-click menu)
moves the entry and everything filed under it, renaming Subspecies of to Variant of and Homeland to Habitat, with every
link kept. **Move a whole classification of species to the Bestiary or Flora** moves a whole group at once.

## Stories, chapters and scenes

- **Story notes** hold the synopsis, themes, main characters, locations, status, word goal, deadline and present date.
- **Chapters board**: chapters and scenes with word counts, clickable status dots (draft / revised / done), reordering
  through menus, moving scenes between chapters, and compiling a story into one note. Scenes and chapters attached to
  an outline card show that beat's name.

## Outlines and plot arcs

### Outline

One per story, opened from the story card, the chapters board or **Open story outline**. Start from a structure
(three-act, Save the Cat, hero's journey, seven-point, kishōtenketsu, Freytag, blank, or one you saved yourself), then
rename, add and reorder beats. Each plot line is a column: write cards under each beat, attach scenes or chapters to
them, or turn a card into a new scene. Saved as `<Story> outline.md` in the story folder:

```markdown
## Act 1: Inciting incident
> The event that upends normal life.

### Main
- Elena finds the letter.
  → [[Chapter 2/Scene 1|Scene 1]]
```

### Plot arcs

An optional `type: arc` entry for a thread you want to develop in depth, with Premise, Stakes and Resolution. Link a
plot line to it from the outline's column menu, and the arc's page lists every card on that line and its events.

## Time: timeline, calendar and holidays

### In-world dates

Set when a story, chapter or scene takes place (the story's **Present date**, or **Set chapter date** /
**Set scene date** on the chapters board). Character pages show their age, appearances show their age in each scene
(red if the scene falls before birth or after death), and organizations, events and the timeline show "N years ago".

Dates can be written however your world writes them: "6 October 2026", "October 6, 2026", "6 Oct 2026", a date
property ("2026-10-06") or your own calendar's months.

### Timeline

`type: event` entries (date, sort year, era, who was involved, where, which plot arcs) in historical order, grouped by
era, plus character births and deaths and organization foundings. Filter to one character, organization or arc.
Characters get a Timeline section, arcs an Events section.

The timeline sorts by an event's **Sort year** when set, otherwise by the year in its date. Years in an era that counts
backwards (BC and BCE, or your own) sort as negative years.

### The world's calendar

Out of the box every project uses the modern calendar (January to December, leap years, real weekdays, Earth's moon)
with today's date as the present, so a contemporary story needs no setup. Everything else lives in the project's
**Calendar note** (`Lore/<Project>/Calendar.md`), opened from the Calendar page, **Settings → Loresmith → World
calendar**, or **Open calendar note**.

```markdown
---
type: calendar
present: "12 Thaw, 1060 AR"        # empty: today
custom_calendar: true              # off: the modern calendar
custom_eras: true                  # off: BC and plain years
backward_eras: "Before the Reckoning, BR"
forward_era: AR
year_zero: false
---
## Months
- Deepwinter, 30
- Thaw, 31
- Sowing, 30

## Weekdays
- Firstday
- Moonday

## Moons
- Pale, 29.5, 0

## History
- Midwinter Feast: 1 Deepwinter
- Founders' Day: 3 Thaw (from 1012)
- Feast of Lanterns: 14 Sowing (until 1050), forgotten after the plague
- Harvest Night: last Moonday of Sowing
- 1050: The Grey Plague.

## Months (from 1100)
- Ember, 180
- Ash, 185
```

- The two switches are checkbox properties, so they are toggles in the Properties view and in settings.
- **Months**, **Weekdays** and **Moons** apply when `custom_calendar` is on. Leave Moons empty on the modern calendar
  for Earth's moon.
- **History** holds holidays as plain lines ("Name: day Month", or a weekday rule such as "fourth Thursday of
  November"), with years in brackets for when they were kept ("(from 1012)", "(until 1050)", "(1000–1020)"). Lines
  that start with a year are history notes.
- **Calendar changes**: a section with a year in its heading, like `## Months (from 1100)`, takes over from that year.
  Day counts, weekdays and moons run on unbroken. Write "Modern" in a dated Months section to switch to January to
  December.
- The timeline shows calendar history as dashed entries, which the **Calendar history** button hides.

### Holidays

A holiday is its own kind of entry: an event happened once, a holiday comes back every year.

- **When**: a day and month with no year, or a weekday rule.
- **Lasts (days)**, **First held** and **Last held**, **Type**, **Kept by** (cultures, organizations, species, places)
  and **Commemorates** (an event).
- About, Traditions and History sections.

The page shows when it next falls, how long it has been kept, or why its date can't be read. Holidays appear on the
calendar, and their first and last years go on the timeline.

### Calendar page

Places every dated event, birth, founding and scene on its day, with weekdays, moon phases and holidays.

- **Year** and **Month** views. Tap a day or a month name in the year view to open that month.
- In the month view, tap a day for its weekday, holidays, moon phases, everything on that day, a **New event on this
  day** button and a copy-date button. With no day picked, the side panel lists the month as an agenda.
- Birthdays and anniversaries repeat every year ("Elena turns 25", "Siege of Saltmarsh · 20 yrs"); round
  anniversaries are bold, and birthdays stop after a character dies.
- Scenes without their own date use their chapter's or story's date.
- The legend is also the filter: tap a kind to hide or show it.

## Languages and the dictionary

### Languages

A language is its own kind of entry, so a world can have as many as it needs: invented, dead, ritual or trade
languages, and real ones your characters borrow from (set **Basis** to Real-world).

- **Type**, **Status** (living, dying, dead), **Language family**, **Descended from** and **Also called**.
- **Spoken by** (cultures), **Species**, **Spoken in** (locations) and **Speakers**.
- **Word order** and **Script**.
- About, Sounds, Grammar, Writing and History sections.

Cultures and locations have a **Languages** field kept in step with the language's Spoken by and Spoken in. A
language's page shows its own dictionary, the words it lent to other languages, and its daughter languages.

### Dictionary

`type: word` entries with meaning, part of speech, pronunciation and other forms, plus **Language**, **Used by**
(cultures), **Borrowed from** and **Original word** for loanwords, and **Register** (formal, slang, archaic, ritual).

- Group the Dictionary **by language**; the **+** on a language heading starts a new word in it.
- **Hover a word in a scene** to see its definition. When the same spelling exists in two languages, the tip shows
  both.
- The sidebar lists the invented words in the scene you are writing.

## Relations web

A graph of your entries built from the relationship engine, so ties written on either note and family it works out
all appear. Parents and children, siblings, extended family, marriage, partners, friends and allies, mentors, rivals
and enemies, membership, Relation entries, past ties, shared scenes and other links each have their own line style
and can be switched off. Each end of a line keeps its own label.

Drag a dot to pin it (pins are saved per project), tap to see its ties, double-tap to open it, and pinch or scroll to
zoom. **Show in relations web** on any entry jumps there.

## Who has met whom

Pick a character from the portrait strip to see everyone they have shared a scene with, closest first, with their
relationship and first scene together, plus who they have never met. Or switch to the grid of everyone. **Tied but
never together** lists close family, friends and rivals who never share a scene. The sidebar shows how the people in
your current scene are related and flags first meetings.

## Writing log

Opened from the top of the navigation, the sidebar's home page, or **Open writing log**. Four tabs:

- **Today**: active typing time, characters typed, pasted and deleted, net words, peak and current speed, with chips
  to count scenes, lore and other notes together or apart. Rings for the daily word goal and a daily typing-time goal.
  A pomodoro that counts typing time only, so it waits while you think (also in the status bar, and **Start pomodoro**
  in the command palette). The note you last typed in, with this session's numbers and a words-over-time chart.
- **Trend**: 7, 30 or 90 days of typed, active time, net words, pasted or peak speed, stacked by kind, and an 18-week
  heatmap.
- **Goals**: the daily word goal, streak, history, and per-story word goals with deadlines.
- **Authorship**: for a story, how long each scene took to type, how much was typed versus pasted, and whether each
  scene still matches what was there when you last finished typing it. **Export report** writes
  `<Story> authorship report.md` next to the story.

### How tracking works

- Every change in the editor is sorted by how it arrived: typed (including autocorrect and autocomplete), pasted or
  dropped, deleted, undone or redone, or inserted by a command or another plugin. Typing in Loresmith's own text
  boxes counts too.
- Scenes, lore (other notes in the lore folder) and other notes (the rest of the vault, which you can switch off) are
  kept apart.
- Typing time adds up the gaps between keystrokes shorter than the idle limit (30 seconds by default).

### Sessions and seals

A session is a stretch of typing in one note with no break over 20 minutes. When it ends, the note's text (without its
properties) is fingerprinted with SHA-256 and the session is sealed by hashing it with the seal before it. If a note's
text changes between sessions without being typed in a tracked editor, the next session is flagged, and altering an
old session breaks the chain, which the Authorship tab and report check.

The log is stored as `typing/<device>.json` in the plugin folder, one file per device, so devices syncing the same
vault never overwrite each other. The log is evidence rather than proof; keeping a dated copy of the latest seal (an
email to yourself, for example) whenever you finish a draft pins the record in time.

## Generators

Roll a **Story prompt**, **Plot**, **Character** or **Place**, look it over, then save it as a real entry. Open them
from the **Generators** group in the navigation or the sidebar, or with the **Generate: …** commands.

1. Pick an audience (Middle Grade, Young Adult, New Adult, Adult, Adult with mature themes, or Random) and a genre
   family (Fantasy, Science Fiction, Horror, Mystery, Thriller, Romance, Historical, or Random). Characters and places
   can also have no genre.
2. Press **Roll**. Every field has its own dice to reroll it and a lock; locked fields stay put when you roll again.
   Every box can be edited by hand.
3. Name it and **Save**.

| Generator | Saved as | What gets filled in |
| --- | --- | --- |
| Story prompt | A note in `Notes/Prompts` | Genre, setting, theme, tone, central conflict, plot tropes, two characters and their dynamic |
| Plot | A plot arc | Premise (genre, theme, tone, inciting incident, conflict, tropes), Stakes, Resolution (twist, ending) |
| Character | A character | Occupation, build, features, traits, flaws, skills and fears; archetype and genre tropes as attributes; wound and motivation in Author's notes; the inner conflict in Psychology |
| Place | A location | Type, About, Points of Interest, History (secret and trouble brewing) |

A story prompt's two characters can be saved as characters too, linked to each other by the rolled relationship
(siblings, rivals, mentor and student, and so on). Everything saved is tagged `generated`.

### Generator tables

The lists the generators roll are [Randomness](https://github.com/Obsidian-TTRPG-Community/Randomness) generator files
(`.rdm`), published in this repository's [`generators/`](generators) folder, so the Randomness plugin must be enabled.

- **Install them** with **Settings → Loresmith → Generator tables → Install or update**, the **Install or update
  generator tables** command, or the button the Generators page shows when tables are missing.
- They are downloaded into `<Randomness Generator root>/Loresmith/`, or `Lore/Generators/` when Randomness has no
  Generator root, from the release tag matching your version of Loresmith (falling back to `main`).
- **Your edits are safe**: a file you have edited is never overwritten; the new version is saved beside it as a `.txt`
  to copy from. A file whose tables you already have elsewhere in the vault is skipped, so nothing is defined twice.

### Audience-appropriate lists

Every table is tried in the audience's own version first. For Middle Grade that is `<Table> MG`, then `<Table> YA`,
then `<Table>`; for Young Adult `<Table> YA`, then `<Table>`. To keep a list age-appropriate, add an `MG` or `YA` copy
with the unsuitable lines removed. Middle Grade never rolls Romance.

### Adding your own

The generators are the `GENERATORS` list near the top of `main.js`. Each field names the Randomness table it rolls,
with `{family}` standing for the chosen genre ("{family} Plot Tropes" becomes "Horror Plot Tropes"), and `count`
rolling several different results. See [`generators/README.md`](generators/README.md) for adding tables.

## Name builder

Run **Name builder**, use the dice on a culture page, or **Roll a name** when creating a character. Fill in a
culture's Naming lists (starts, middles, ends), or let it learn from the names already used in that culture.

## Moodboards and tension

- **Moodboards**: images on any entry, chapter or scene (`moodboard:`). The sidebar shows the moodboard for the scene
  you are writing, gathered from the scene, its chapter, its cast and the story.
- **Tension graph**: rate scenes 1 to 5 with the number button on the chapters board (`tension:` in the scene) and
  toggle **Tension** for a graph of the whole book.

## Export

**Export** on the chapters board, or the export commands, produce:

- **Manuscript (.docx)**: a standard manuscript with a title page and word count, 12 pt double spacing, a
  "Surname / TITLE / page" header, chapters on new pages and `#` scene breaks.
- **Ebook (.epub)**, with the story's image as the cover.

Files are saved next to the story note. Headings and `%%comments%%` in scenes are left out. Your name and contact
details go under **Settings → Loresmith → Manuscript and ebook**.

## Commands

| Command | What it does |
| --- | --- |
| Open overview | Opens the main view |
| Open sidebar panel | Opens the compact panel in the right sidebar |
| Switch project | Picks the active project |
| Create entry / character / story / event / holiday / plot arc / creature / plant / language / dictionary word | Creates an entry of that type |
| Open current note in lore editor | Opens the active note in Loresmith's entry editor |
| Open chapters for current story | Opens the chapters board |
| Open story outline | Opens a story's outline |
| Characters in this scene | Edits the active scene's cast |
| Add an empty characters property to scenes that lack one | Prepares older scenes for scene casts |
| Open relations web | Opens the relations web |
| Open timeline / Open calendar / Open calendar note | Opens the timeline, calendar or calendar note |
| Open who has met whom | Opens the meetings view |
| Open writing log | Opens goals, typing time and authorship |
| Start pomodoro | Starts a pomodoro that counts typing time |
| Export authorship report for a story | Writes the authorship report |
| Export manuscript (.docx) / Export ebook (.epub) | Exports the current or a chosen story |
| Make relationship links two-way | Fills in missing sides of links across the project |
| Move a whole classification of species to the Bestiary or Flora | Moves a group of species |
| Name builder | Opens the name builder |
| Generate: story prompt / plot / character / place | Opens a generator |
| Install or update generator tables | Downloads the generator tables into the vault |

## Settings

- **Lore folder**: the folder whose subfolders are projects (`Lore` by default).
- **Open entries in a new tab**.
- **Relationships**: **Keep links two-way**, and **Fill in missing sides now**.
- **Writing goals**: the daily word goal and whether the status bar shows today's words.
- **Typing log**: whether notes outside the lore folder are tracked, the idle limit (seconds), a daily typing-time
  goal and the pomodoro length.
- **World calendar**: the custom calendar and custom eras switches, year 0, and a button to open the calendar note.
- **Generators**: install or update the generator tables, with a status line showing whether they are all found.
- **Manuscript and ebook**: your name, byline, contact details, manuscript font and ebook language.
