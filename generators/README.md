# Generator tables

The lists Loresmith's Generators roll: genres, tropes, conflicts, characters, plots and places. They are
plain-text [Randomness](https://github.com/Obsidian-TTRPG-Community/Randomness) generator files.

Loresmith installs them for you: **Settings > Loresmith > Generator tables > Install or update**. They land in
`<Randomness Generator root>/Loresmith/` (or `Lore/Generators/` if Randomness has no Generator root).

## Adding or changing a file

1. Edit or add the `.rdm` file here.
2. List any new file in `index.json`; only listed files are installed.
3. Table names are global in Randomness, so start helper tables with the file's subject ("Horror Setting", "Char Flaw").

## Audience versions

Every table a generator rolls is tried in the audience's own version first. For Middle Grade that is
`<Table> MG`, then `<Table> YA`, then `<Table>`; for Young Adult `<Table> YA`, then `<Table>`. To keep a list
age-appropriate, add an `MG` or `YA` copy of it with the unsuitable lines removed.

## Versions

The plugin downloads from the release tag matching its version (`0.13.0`), so a release always gets the tables it
was written for. Without that tag it uses `main`.
