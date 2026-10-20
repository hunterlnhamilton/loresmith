# Loresmith

A LoreForge-style worldbuilding and story manager that lives inside Obsidian.

## Install
1. Copy this `loresmith` folder into `<your vault>/.obsidian/plugins/`.
2. Settings > Community plugins > enable **Loresmith**.
3. Click the library icon in the ribbon (or run "Loresmith: Open overview").

Works on desktop and iPad (no Node APIs). Styling uses only theme variables, so ITS restyles it.

## How data is stored
Everything is a normal markdown note. No database.

```
Lore/
  The Order/                 <- a project
    Characters/Aria.md
    Locations/Rifthold.md
    Stories/
      The First Draft/
        The First Draft.md   <- story note (synopsis, main characters, chapter order)
        Chapter 1/
          Scene 1.md         <- write here; Novelr/Longform-friendly
```

Each entry has `type: <type>` in its frontmatter (`lore:` is also read). Links between entries (species, residence,
member of, owns...) are frontmatter wikilinks, so they show in the graph, backlinks, Dataview and Bases.
The big text boxes are the note's `## Heading` sections; edit them in the plugin or in the raw note.
Custom attributes are top-level properties, listed in `attributes` to keep their order.

## Views
- **Sidebar panel**: the bookmark icon in the ribbon (or "Loresmith: Open sidebar panel") puts a compact
  Loresmith in the right sidebar that you can leave open while you write. It moves between its own pages
  with back and home buttons instead of opening tabs:
  - *Home*: what you are writing right now (status, story and chapter, who is in the scene), today's words,
    stories, plotting, and every category with counts.
  - *Writing log*: the same Today, Trend, Goals and Authorship tabs as the main view, sized for the sidebar.
    Tap "Writing log" or today's word count on the home page. The Today tab and a running pomodoro update
    on their own while you type in the editor beside it.
  - *Story*: synopsis, main characters and word goal, then collapsible chapters with scenes. Change status,
    cast, order and names, add scenes and chapters, all from here. Tapping a scene opens it in the editor
    you were last writing in, so tabs don't pile up.
  - *Category* and *Entry*: search a category, then read an entry's details, sections and appearances as
    a quick reference. Links between entries open inside the panel.
  "Edit", "Board", "Outline", the arrow in the top bar, and anything marked with an arrow open the full view
  in the main area, where detailed editing happens. The full overview still works as before, and has a button
  to open the sidebar.
- **Overview**: stories with chapter and word counts, character portraits, world counts, tag cloud.
- **Category pages**: grid or list, search, right-click for open / open as note / delete.
- **Entry editor**: section editors with preview, reorderable Details sections, linked fields,
  custom attributes, tags, and a "Linked from" list.
- **Scene cast**: each scene has a `characters` list in its frontmatter (new scenes get an empty one, and
  "Add an empty characters property to scenes that lack one" fills in older scenes). Fill it from the people
  icon on the chapters board or sidebar, the "Characters in this scene" command, or by hand. Characters listed
  there appear in the scene; characters only linked in the text count as mentioned.
- **Chapters board**: chapters and scenes with word counts, clickable status dots
  (draft / revised / done), reorder via menus, move scenes between chapters, compile to one note.
  Scenes and chapters that an outline card points at show that beat's name.
- **Outline**: one per story, opened from the story card, the chapters board, or the command
  palette. Start from a structure (three-act, Save the Cat, hero's journey, seven-point,
  kishōtenketsu, Freytag, blank, or one you saved yourself), then rename, add and reorder beats.
  Each plot line is a column; write cards under each beat, then attach scenes or chapters to them,
  or turn a card straight into a new scene. Saved as `<Story> outline.md` in the story folder:

  ```
  ## Act 1: Inciting incident
  > The event that upends normal life.

  ### Main
  - Aria finds the letter.
    → [[Chapter 2/Scene 1|Scene 1]]
  ```

- **Character sheets**: a portrait header with age, status, species, role, home, traits and flaws; an "At a glance"
  block (scenes, chapters, first and last appearance, who they're most often with); relationship cards; a family
  tree across five generations; and Connections. Sidebar fields sit in groups you can fold away (Identity,
  Appearance, Personality, Abilities, Life, Family, Ties, Holdings).
- **Sheet extras**: under the header, a one-line look (age they look, height, build, hair, eyes, skin). In "At a
  glance", a strip of every scene in the book with theirs filled in (click any scene to open it), a warning when they
  vanish for three or more chapters, and a profile checklist of what's still blank. Click an item on the checklist to
  jump to that field or section. Initials on cards and avatars use first and last name ("Aria Elowen Vale" is AV).
- **Birth names**: a character's "Birth name" field (Identity group) holds a maiden or former name. It shows as
  "née Valen" (or "né", or "born" when gender isn't set) under their name, on relationship cards and in the family
  tree, and searching for it finds them anywhere you pick a character.
- **Relationships**: one engine reads links from both notes, so if Bram lists Aria as an ally, Aria's page shows Bram
  too. It also works out what you didn't write: full, half and step siblings, grandparents, aunts and uncles, nieces
  and nephews, cousins, in-laws and step-family. Siblings listed by name share parents, and named siblings of
  siblings are siblings too. Labels follow pronouns or gender ("Sister", "Half-brother", "Mother-in-law"). Anything
  found from another note has a sparkle and says where it came from. Use "Add relationship" on a character, or the
  sidebar fields.
- **Ties that change over time**: the clock icon on a relationship card (or "A tie that changed over time..." under
  Add relationship) opens a history for that pair, one line per stage, with optional years:

  ```yaml
  ties:
    - "[[Vex]]: Enemy (1000–1015)"
    - "[[Vex]]: Friend (1015–)"
    - "[[Gorm]]: Lover (until 1010)"
    - "[[Gorm]]: Nemesis (1010–)"
    - "[[Mara]]: Ex-wife"
    - "[[Kael]]: Brother, estranged"
  ```

  The current stage becomes their relationship card, with "Before: Former enemy (1000–1015)" underneath. Someone
  with only past ties moves to a "Past ties" group ("Ex-wife", "Former rival"). A past stage retires the same kind of
  link written in the plain fields, so you don't have to delete it. Everyday words are understood (nemesis, lover,
  fiancée, apprentice, best friend), anything else shows as typed, and a note after a comma ("estranged") is kept.
  Lines are read from both characters' notes, so you only need to write them once. In the web, past ties are faint
  dotted lines you can switch off with "Past ties".
- **Two-way links**: with Settings > Loresmith > "Keep links two-way" on (the default), adding or removing a link also
  updates the other note: spouses, partners, siblings, friends, allies, rivals, enemies, mentors and students,
  parents and children, members, leaders, owners, pioneers, regions and cultures. "Make relationship links
  two-way" (command or settings button) fills in every missing side in the project at once. Nothing is removed.
- **Connections**: every entry lists what it links to and what links to it. A location shows its residents, who was
  born there and its events; an organization shows members from character pages; a species shows its characters.
- **Groups and roles**: schools, companies, teams, bands, crews, guilds and noble houses are all Organizations. A
  character joins one through Affiliation, Leader of, Education or Workplace (House, under Family, is for a noble
  house or dynasty). Use the pencil on a group chip to give them roles there, one line per position, each with
  optional years and a "No longer active" switch:

  ```yaml
  roles:
    - "[[Hogwarts]]: Student (1971–1978)"
    - "[[Hogwarts]]: Professor, Potions (1981–)"
    - "[[Slytherin]]: Head of House (1985–)"
    - "[[Order of the Phoenix]]: (former)"
  ```

  A role is **former** when its end year is before the story's present date, when it's marked former, or when the
  character has died; otherwise it's active. Former members stay linked and keep their titles ("Former Student").
- **Subdivisions**: an Organization that is Part of another (houses of a school, departments of a government,
  squads of an army) is a subdivision, at any depth. Its people also appear on the parent's page, labeled with their
  subdivision. When you add someone to the parent (from their sheet or the parent's "Add person"), the roles editor
  asks "Which house at Hogwarts?" with every subdivision as a button; pick one or more, or change it later from the
  same editor. Picking joins them through Affiliation; unpicking removes them from that subdivision.
- **People section** on organization pages: everyone current, grouped by role (Professor, Student) or, with the
  toggle, by subdivision (Gryffindor, Slytherin). Each card lists earlier titles ("Formerly Student (1971–1978)").
  Former members follow in their own section, which you can hide.
- **Groups and positions** on character sheets: every group they're in or were in, with each title and its years,
  active ones first. The header shows their current titles, or their last one if all are former.
- **Any genre**: the Species check on the profile only appears once your project has a species, the fourth
  character section is "Skills & Abilities" (older notes keep "Powers & Abilities"), and example text covers
  schools, cafés, heists and phones as well as guilds and relics.
- **Species, subspecies and classifications**: three layers. A species' **Classification** sits above it ("Being",
  "Beast", "Spirit", or a path like "Beast › Dragon"). **Subspecies of** sits below, as many levels deep as you
  like, and a subspecies without its own classification inherits its parent's:

  ```
  Being    › Human › Muggle, Witch or wizard, Squib
  Beast    › Dragon › Hungarian Horntail
  Spirit   › Ghost
  ```

  The Species page groups everything under its classification, with subspecies indented under their parents. Each
  species page lists its characters, including those of every subspecies, grouped by exact species. A character's
  header shows the whole line ("Witch or wizard · Human · Being"), and searching a species picker for "being" or
  "elf" finds everything filed under it. Note names are unique, so name subspecies in full ("Seelie Elf").
- **Bestiary and Flora** (the Nature group): creatures and plants are their own kinds of entry, kept apart from
  Species, which is for peoples your characters belong to. Each has its own folder (`Bestiary/`, `Flora/`).
  - *Creatures*: Classification ("Beast › Dragon", "Undead", "Vermin"), Variant of, Threat, Mind (animal, cunning,
    sapient), Temperament, Size, Diet, Lifespan, Rarity, Active (nocturnal, winter only) and Habitat; Abilities,
    Weaknesses and Yields (hide, venom, scales); Companions (characters) and Kept by (cultures, organizations).
    Sections: About, Appearance, Behavior, Lore, plus an Ecology detail.
  - *Plants*: Classification ("Tree", "Herb", "Fungus › Mushroom"), Variant of, Toxicity, Rarity, Season, Climate,
    Habitat, Useful parts, Uses and Grown by. Sections: About, Appearance, Uses, Lore, plus a Cultivation detail.

  Both work like species: Classification groups the list (and is inherited by variants), variants nest under their
  parent, and the page shows the key facts at the top (deadly threats and toxins in red). Characters have a
  **Creatures** field (Holdings) for pets, mounts and familiars, kept two-way with the creature's Companions. Items
  have **Made from** (creatures and plants), events can involve creatures, and locations list the creatures and
  plants that live there.

  **Moving existing species**: "Move to Species, Bestiary or Flora" is on a species page's top bar (the swap icon)
  and in its right-click menu; it moves the entry and everything filed under it, renames Subspecies of to Variant
  of and Homeland to Habitat, and keeps every link working. To move a whole group at once, run "Move a whole
  classification of species to the Bestiary or Flora" and pick one, like "Beast".
- **Hybrids and mixed ancestry**: for a one-off mix, give a character more than one Species ("Human, Elf"). For a
  mixed people with a name of its own, make it a species and set **Hybrid of** ("Half-elf" → Human, Elf). Its header
  line reads "Half-elf · Human × Elf · Being", it takes its parents' classification if it has none, and the Elf
  page lists it under Hybrids, with half-elf characters gathered there too.
- **Ancestry** is worked out from the family tree: each parent gives half, all the way up. A character whose
  parents are of different species (or different subspecies) gets a line in their header like "Ancestry: ½ Elf,
  ½ Human", "¾ Human, ¼ Elf" a generation later, or "Human (½ Muggle, ½ Witch or wizard)" when the mix is within
  one species. Named hybrids count as their parts, so a Half-elf parent passes on ¼ Elf. A missing parent counts as
  unknown, and someone with no parents recorded uses their own Species. If the parents can't have produced the
  Species you set (two elves, Species "Dragon"), the line turns into a dashed "Parents: …" warning; that's fine for
  someone who was turned or cursed, and a continuity check otherwise.
- **Heritage** (Identity group): a free label for what people call someone, separate from biology: "Half-blood",
  "Muggle-born", "noble-born", "clanless". It shows in the header and autocompletes from values you've used.
- **Grouped lists**: every list on the overview and in the sidebar can be grouped by **Folders** (subfolders inside
  the type's folder, nested as deep as you like: `Organizations/Guilds/Merchant`), **by type** (the Type or Kind
  field; species by classification, characters by importance), or not at all. Pick it with the dropdown on the
  overview page or the folder button beside the sidebar search; it's remembered per type. Click a heading to fold it
  (folding a folder hides its subfolders too). The **+** on a heading creates the new entry in that folder or with
  that type. "Move to folder…" in an entry's right-click menu files it into a subfolder, links intact.
- **Nesting**: inside each group, subspecies sit under their species, branches under the organization they're
  **Part of**, and places under the place they're part of. A child in a different folder from its parent shows at
  the top of its own folder.
- **Autocomplete**: Classification, Type, Era, Status, Role, Heritage and Part of speech suggest values you've already used, so
  "Being" and "being" don't split into two groups.
- **Generators** (the Generators group in the nav and the sidebar, or "Generate: …" in the command palette): roll a
  **Story prompt**, **Plot**, **Character** or **Place**, look it over, then save it as a real entry.
  - Pick an audience (Middle Grade to Adult, or Random) and a genre family (or Random; characters and places can
    have no genre), then **Roll**. Every field has its own dice to reroll it and a lock; locked fields stay put when
    you roll again. Every box can be edited by hand before saving.
  - **Save** makes a character (occupation, build, features, traits, flaws, skills and fears filled in; archetype and
    genre tropes as attributes; the wound and motivation in Author's notes; the inner conflict in Psychology), a
    location (type, About, Points of Interest, History), a plot arc (Premise, Stakes, Resolution) or, for a prompt, a
    note in `Notes/Prompts`. A prompt's two characters can be saved too, linked to each other by the rolled
    relationship (siblings, rivals, mentor and student…). Everything saved is tagged `generated`.
  - The lists live in the **Randomness** plugin's `.rdm` files, which Loresmith rolls by table name, so Randomness
    must be enabled. Each audience tries its own version of a table first (`Occupation MG`, then `Occupation YA`,
    then `Occupation`), so adding an MG or YA table to an `.rdm` file is all it takes to keep a list age-appropriate.
    Middle Grade never rolls Romance. The generators themselves are the `GENERATORS` list near the top of `main.js`:
    each field names the table it rolls, and `{family}` stands for the chosen genre.
- **Plot arcs** (optional): a `type: arc` entry for a thread you want to develop in depth. Link a
  plot line to it from the column menu, and the arc's page lists every card on that line.
- **Timeline**: `type: event` entries (date, sort year, era, who was involved, where, which plot arcs)
  in historical order, grouped by era, plus character births and deaths and organization
  foundings when their dates contain a year. Filter to one character, organization or arc.
  Characters get a Timeline section on their page, arcs get an Events section.
- **Relations web**: a graph of your entries built from the relationship engine, so ties written on
  either note, and family it works out, all appear. Parents and children, siblings, extended family,
  marriage, partners, friends and allies, mentors, rivals and enemies, membership, Relation entries,
  shared scenes and other links each have their own line style and can be switched off. Each end of a
  line keeps its own label (Aria sees "Mother", Mara sees "Daughter"). Drag a dot to pin it (pins are saved per project), tap to see its ties,
  double-tap to open it, pinch or scroll to zoom. "Show in relations web" on any entry jumps there.
- **Writing log** (top of the nav, the sidebar's home page, or "Open writing log"), in four tabs:
  - *Today*: active typing time, characters typed, pasted and deleted, net words, peak and current speed (CPM),
    with chips to count scenes, lore and other notes together or apart, plus a side-by-side table of all three.
    Rings for the daily word goal and a daily typing-time goal. A pomodoro that counts typing time only, so it
    waits while you think (also in the status bar, and "Start pomodoro" in the command palette). The note you
    last typed in, with this session's numbers and a words-over-time chart.
  - *Trend*: 7, 30 or 90 days of typed, active time, net words, pasted or peak speed, stacked by kind; and an
    18-week heatmap of active time, typed or words.
  - *Goals*: the daily word goal, streak, history and per-story word goals with deadlines, as before.
  - *Authorship*: for a story, how long each scene took to type, how much was typed versus pasted, and whether
    each scene still matches what was there when you last finished typing it. "Export report" writes
    `<Story> authorship report.md` next to the story with every session listed and fingerprinted.

  **How tracking works.** Every change in the editor is sorted by how it arrived: typed (including autocorrect
  and autocomplete), pasted or dropped, deleted, undone or redone, or inserted by a command or another plugin.
  Typing in Loresmith's own text boxes (sections, author's notes, outline cards) counts too. Scenes, lore (every
  other note in the Loresmith folder) and other notes (the rest of the vault, which you can switch off) are kept
  apart. Typing time adds up the gaps between keystrokes shorter than the idle limit (30 seconds by default).

  **Sessions and seals.** A session is a stretch of typing in one note with no break over 20 minutes. When it
  ends, the note's text (without its properties) is fingerprinted with SHA-256 and the session is sealed by
  hashing it with the seal before it. If a note's text changes between sessions without being typed in a
  tracked editor (another app, a device without Loresmith, a file edit), the next session is flagged. Altering
  an old session in the log breaks the chain, which the Authorship tab and report check.

  **Where it's stored.** `typing/<device>.json` in the plugin folder, one file per device, so a desktop and an
  iPad syncing the vault never overwrite each other; the views add them together. The log is evidence, not
  proof: someone with the files could build a log from scratch. Keeping a copy of the latest seal somewhere
  dated (an email to yourself, say) whenever you finish a draft pins the record in time.

  The older net-word count for the word goal and streak still counts net words added to scene notes that are
  open on this device, so changes arriving by sync are not counted twice.

- **In-world dates**: set when a story, chapter or scene takes place (story field "Present date", or "Set chapter
  date" / "Set scene date" in the chapters board menus). Character pages show their age, appearances show their age
  in each scene (red if the scene falls before birth or after death), and organizations, events and the timeline
  show "N years ago". Ages count from the latest date in the project.
- **The world's calendar**: out of the box every project uses the modern calendar (January to December, leap years,
  real weekdays, Earth's moon) and today's date as the present, so a contemporary story needs no setup. Dates can
  be written "6 October 2026", "October 6, 2026", "6 Oct 2026" or as a date property ("2026-10-06").
  Everything else lives in the project's **Calendar note** (`Lore/<Project>/Calendar.md`, `type: calendar`). Open
  it from the pencil on the Calendar page, Settings > Loresmith > World calendar, or "Open calendar note". The
  settings page creates it for you the first time, carrying over anything from older versions' settings boxes.

  ```markdown
  ---
  type: calendar
  present: "12 Frostmoon, 1060 AC"   # empty: today (modern calendar and eras)
  custom_calendar: true              # off: the modern calendar
  custom_eras: true                  # off: BC and plain years
  backward_eras: "Before Glass, BG"
  forward_era: AC
  year_zero: false
  ---
  ## Months
  - Frostmoon, 30
  - Thawing, 31

  ## Weekdays
  - Sunday
  - Moonday

  ## Moons
  - Selune, 29.5, 0

  ## History
  - Midwinter Feast: 1 Frostmoon
  - Founders' Day: 3 Frostmoon (from 1012)
  - Feast of Lanterns: 14 Seedtime (until 1050), forgotten after the Grey Plague
  - Harvest Night: last Moonday of Seedtime
  - 1050: The Grey Plague. Nobody lights the lanterns that autumn.

  ## Months (from 1100)
  - Ember, 180
  - Ash, 185
  ```

  - The two switches are checkbox properties, so they're toggles in Obsidian's Properties view (and in settings).
  - *Months*, *Weekdays* and *Moons* are used when `custom_calendar` is on. Leave *Moons* empty on the modern
    calendar for Earth's moon, or fill it in for a modern world with moons of its own.
  - *History* can also hold holidays as plain lines, if you prefer typing to the Holidays tab: "Name: day Month" ("1 Frostmoon", "Frostmoon 1", "July 4"), or a
    weekday rule ("last Moonday of Seedtime", "fourth Thursday of November"). Years in brackets say when it was kept:
    "(from 1012)", "(until 1050)", "(1000–1020)"; the end year is the first year it isn't held. A note after a
    comma shows in the calendar's day details. Lines that start with a date ("1050: ...") are history notes.
  - **Calendar changes**: a section with a year in its heading, like `## Months (from 1100)` or
    `## Weekdays (from 1100)`, takes over from that year on. Day counts, weekdays and moons run on unbroken across
    the change. Write "Modern" in a dated Months section to switch to January to December. Holidays tied to old
    month names stop when those months do; add new lines with "(from 1100)" for the ones that carry over.
  - The timeline shows the calendar's history (holidays first held or forgotten, calendar changes, history notes)
    as dashed purple entries, which the "Calendar history" button hides.
- **Holidays** (History > Holidays): a holiday is its own kind of entry, not an event. An event happened once;
  a holiday comes back every year. Fill in:
  - *When*: a day and month with no year ("1 Frostmoon", "July 4"), or a weekday rule ("last Moonday of Seedtime",
    "fourth Thursday of November").
  - *Lasts (days)*: for festivals longer than a day.
  - *First held* and *Last held*: the years it was kept, for holidays founded or forgotten during your history.
  - *Type*, *Kept by* (cultures, organizations, species, places) and *Commemorates* (an event).
  - About, Traditions and History sections for the writing.

  Under the fields, the page tells you when it next falls ("Next: Moonday, 27 Seedtime, 1060 AC"), how long it has
  been kept, or why its date can't be read. Holidays show on the calendar (tap one to open it), and the day
  details have a "New holiday on this day" button. A holiday's first and last years go on the timeline, and
  filtering the timeline to a culture shows the holidays it keeps.
- **Calendar page**: places every dated event, birth, founding and scene on its day, with weekdays, moon phases
  and holidays.
  - *Year* and *Month* views (the toggle in the top bar remembers your choice). Tap a day or a month name in the
    year view to open that month.
  - In the month view, tap a day for its details: weekday, holidays, every moon's phase and days until full,
    everything on that day, a "New event on this day" button and a copy-date button. With no day picked, the
    side panel lists the month's dated days as an agenda.
  - Birthdays and anniversaries repeat every year: "Aspen turns 25", "Siege of Rifthold · 20 yrs". They have dashed
    edges, round anniversaries are bold, and birthdays stop after a character dies.
  - Scenes without their own date ride along on their chapter's or story's date, so the chapter shows a scene
    count and the day's details list the scenes.
  - The legend is also the filter: tap a kind to hide or show it.
  - Moons are drawn at their real phase; the exact new, quarter and full moon days are outlined.
- **Name builder**: "Name builder" command, the dice on a culture page, or "Roll a name" when creating a character.
  Fill in a culture's Naming lists (starts, middles, ends) or let it learn from the names you already use.
- **Languages** (Language > Languages): a language is its own kind of entry, so a world can have as many as it
  needs: invented tongues, dead ones, ritual or trade languages, and real ones your characters borrow from (set
  **Basis** to Real-world). Fill in:
  - *Type*, *Status* (living, dying, dead), *Language family* and *Descended from* (another language), *Also called*.
  - *Spoken by* (cultures), *Species*, *Spoken in* (locations) and *Speakers*, under the Speakers group.
  - *Word order* and *Script*, under Structure.
  - About, Sounds, Grammar, Writing and History sections for the writing.

  Cultures and locations have a **Languages** field, and with two-way links on, linking from either side fills in
  the other (a culture's Languages and the language's Spoken by stay in step, likewise places). A language's page
  shows its own **Dictionary** (every word in it, with pronunciation and meaning, and a button to add a word
  already filed under it), the words it lent to other languages, and its daughter languages. Species pages list
  the languages linked to them.
- **Dictionary**: `type: word` entries with meaning, part of speech, pronunciation and other forms, plus:
  - *Language*: which language the word is in. Link a word to more than one if it exists in several.
  - *Used by*: the cultures that use it.
  - *Borrowed from* and *Original word*: for a loanword, the language it came from and how it reads there.
  - *Register*: formal, slang, archaic, ritual.

  Group the Dictionary **by language** with the dropdown on the overview or the folder button in the sidebar; the
  **+** on a language heading starts a new word in it. Hover a word in a scene to see its definition. If the same
  spelling exists in two languages, the tip shows each entry with its language, source and culture. The sidebar
  lists the invented words in the scene you're writing (works on iPad).
- **Tension graph**: rate scenes 1 to 5 with the number button on the chapters board (`tension:` in the scene) and
  toggle "Tension" for a graph of the whole book.
- **Who has met whom**: pick a character from the portrait strip to see everyone they've shared a scene with, closest
  first, with their relationship and first scene together, plus who they've never met. Or switch to the grid of
  everyone. "Tied but never together" lists close family, friends and rivals who never share a scene. The sidebar
  shows how the people in your current scene are related and flags first meetings.
- **Moodboards**: images on any entry (`moodboard:`), chapter or scene. The sidebar shows the moodboard for the scene
  you're writing: the scene's, its chapter's, its cast's and the story's.
- **Export**: "Export" on the chapters board makes a standard manuscript (.docx: title page with word count,
  12pt double-spaced, "Surname / TITLE / page" header, chapters on new pages, # scene breaks) or an ebook (.epub,
  with the story's image as the cover). Files land next to the story note. Headings and %%comments%% in scenes
  are left out. Your name and contact details go under Settings > Loresmith > Manuscript and ebook.

## Dates on the timeline

Write dates however your world writes them. The timeline sorts by the event's **Sort year** if you
set one, and otherwise by the year in the date ("12 Frostmoon, 1023 AE" sorts as 1023, "2026-10-06" as 2026).
Years in an era that counts backwards (BC and BCE, or your own with custom eras on) sort as negative years,
so "300 BC" comes before "5 AE".
