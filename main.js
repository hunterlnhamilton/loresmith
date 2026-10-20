'use strict';

/*
 * Loresmith — a worldbuilding and story manager for Obsidian.
 * Everything is stored as ordinary markdown notes with frontmatter, so the
 * vault stays readable without the plugin (Dataview, Bases, graph, Novelr).
 */

const {
  Plugin, ItemView, Modal, SuggestModal, FuzzySuggestModal, PluginSettingTab, Setting,
  Notice, TFile, TFolder, Menu, setIcon, normalizePath, parseYaml, MarkdownRenderer, debounce, Component, Platform,
  requestUrl,
} = require('obsidian');
let CM_VIEW = null;
try { CM_VIEW = require('@codemirror/view'); } catch (e) { /* hover definitions are optional */ }
let EDITOR_INFO = null;
try { EDITOR_INFO = require('obsidian').editorInfoField || null; } catch (e) { /* older Obsidian */ }

const VIEW_OVERVIEW = 'loresmith-overview';
const VIEW_ENTITY = 'loresmith-entity';
const VIEW_CHAPTERS = 'loresmith-chapters';
const VIEW_WEB = 'loresmith-web';
const VIEW_OUTLINE = 'loresmith-outline';
const VIEW_PANEL = 'loresmith-panel';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'];
const STATUSES = ['draft', 'revised', 'done'];
const GROUPS = ['People', 'Nature', 'Places', 'Things', 'History', 'Language'];
/* Kinds of entry with a classification path and parents above them: species (subspecies), creatures and plants (variants). */
const TAXA = ['species', 'creature', 'plant'];
const ANY = ['character', 'organization', 'culture', 'species', 'creature', 'plant', 'location', 'discovery', 'item', 'event'];
const COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];

/* Relations web: kinds of line. Each relationship kind below maps onto one of these. */
const EDGE_KINDS = {
  family: { label: 'Parents and children', color: 'cyan', icon: 'baby' },
  sibling: { label: 'Siblings', color: 'blue', icon: 'users' },
  kin: { label: 'Extended family', color: 'cyan', icon: 'tree-deciduous' },
  spouse: { label: 'Married', color: 'yellow', icon: 'heart-handshake' },
  partner: { label: 'Romantic partners', color: 'purple', icon: 'heart' },
  allies: { label: 'Friends and allies', color: 'green', icon: 'handshake' },
  mentor: { label: 'Mentors', color: 'blue', icon: 'graduation-cap' },
  rivals: { label: 'Rivals and enemies', color: 'red', icon: 'swords' },
  member: { label: 'Membership', color: 'orange', icon: 'shield' },
  relation: { label: 'Relation entries', color: 'pink', icon: 'git-fork' },
  past: { label: 'Past ties', color: 'base', icon: 'history' },
  scenes: { label: 'Shared scenes', color: 'base', icon: 'clapperboard' },
  other: { label: 'Other links', color: 'base', icon: 'link' },
};
/* Non-person link fields that get their own line style in the web. */
const FIELD_EDGE = {
  house: 'member', affiliation: 'member', leaderOf: 'member', leaders: 'member', members: 'member', rulers: 'member',
  education: 'member', workplace: 'member', founders: 'member',
  allies: 'allies', rivals: 'rivals', creatures: 'allies', bonded: 'allies',
};
const WEB_SKIP_FIELDS = new Set(['story', 'arcs']);
/* Character fields that put someone in a group. Each can carry a role ("Student, Class of '24") in the character's roles list. */
const ROLE_FIELDS = ['affiliation', 'house', 'leaderOf', 'education', 'workplace'];
const SECTION_OLD_NAMES = { 'Skills & Abilities': 'Powers & Abilities' };

/* Character-to-character fields. The relationship engine reads these; everything else is a "connection". */
const PERSON_FIELDS = new Set(['mother', 'father', 'siblings', 'children', 'spouses', 'partners', 'relatives',
  'friends', 'allies', 'mentors', 'students', 'rivals', 'enemies']);

/* Every relationship the engine can find. l = [label if she, if he, otherwise], for the OTHER person. */
const REL = {
  parent: { group: 'Family', edge: 'family', icon: 'arrow-up', l: ['Mother', 'Father', 'Parent'] },
  stepparent: { group: 'Family', edge: 'kin', icon: 'arrow-up', l: ['Stepmother', 'Stepfather', 'Step-parent'] },
  sibling: { group: 'Family', edge: 'sibling', icon: 'users', l: ['Sister', 'Brother', 'Sibling'] },
  halfsibling: { group: 'Family', edge: 'sibling', icon: 'users', l: ['Half-sister', 'Half-brother', 'Half-sibling'] },
  stepsibling: { group: 'Family', edge: 'kin', icon: 'users', l: ['Stepsister', 'Stepbrother', 'Step-sibling'] },
  spouse: { group: 'Family', edge: 'spouse', icon: 'heart-handshake', l: ['Wife', 'Husband', 'Spouse'] },
  partner: { group: 'Family', edge: 'partner', icon: 'heart', l: ['Partner', 'Partner', 'Partner'] },
  child: { group: 'Family', edge: 'family', icon: 'arrow-down', l: ['Daughter', 'Son', 'Child'] },
  stepchild: { group: 'Family', edge: 'kin', icon: 'arrow-down', l: ['Stepdaughter', 'Stepson', 'Stepchild'] },
  grandparent: { group: 'Extended family', edge: 'kin', icon: 'chevrons-up', l: ['Grandmother', 'Grandfather', 'Grandparent'] },
  grandchild: { group: 'Extended family', edge: 'kin', icon: 'chevrons-down', l: ['Granddaughter', 'Grandson', 'Grandchild'] },
  auntuncle: { group: 'Extended family', edge: 'kin', icon: 'corner-left-up', l: ['Aunt', 'Uncle', 'Aunt or uncle'] },
  nibling: { group: 'Extended family', edge: 'kin', icon: 'corner-right-down', l: ['Niece', 'Nephew', 'Niece or nephew'] },
  cousin: { group: 'Extended family', edge: 'kin', icon: 'shuffle', l: ['Cousin', 'Cousin', 'Cousin'] },
  parentinlaw: { group: 'Extended family', edge: 'kin', icon: 'arrow-up', l: ['Mother-in-law', 'Father-in-law', 'Parent-in-law'] },
  siblinginlaw: { group: 'Extended family', edge: 'kin', icon: 'users', l: ['Sister-in-law', 'Brother-in-law', 'Sibling-in-law'] },
  childinlaw: { group: 'Extended family', edge: 'kin', icon: 'arrow-down', l: ['Daughter-in-law', 'Son-in-law', 'Child-in-law'] },
  relative: { group: 'Extended family', edge: 'kin', icon: 'tree-deciduous', l: ['Relative', 'Relative', 'Relative'] },
  friend: { group: 'Ties', edge: 'allies', icon: 'smile', l: ['Friend', 'Friend', 'Friend'] },
  ally: { group: 'Ties', edge: 'allies', icon: 'handshake', l: ['Ally', 'Ally', 'Ally'] },
  mentor: { group: 'Ties', edge: 'mentor', icon: 'graduation-cap', l: ['Mentor', 'Mentor', 'Mentor'] },
  student: { group: 'Ties', edge: 'mentor', icon: 'book-open', l: ['Student', 'Student', 'Student'] },
  rival: { group: 'Ties', edge: 'rivals', icon: 'swords', l: ['Rival', 'Rival', 'Rival'] },
  enemy: { group: 'Ties', edge: 'rivals', icon: 'skull', l: ['Enemy', 'Enemy', 'Enemy'] },
  relation: { group: 'Ties', edge: 'relation', icon: 'git-fork', l: ['Related', 'Related', 'Related'] },
};
const REL_GROUPS = ['Family', 'Extended family', 'Ties', 'Past'];
/* Ties close enough that never sharing a scene is worth pointing out. */
const CLOSE_KINDS = new Set(['parent', 'child', 'sibling', 'halfsibling', 'spouse', 'partner', 'friend', 'ally', 'mentor', 'student', 'rival', 'enemy', 'relation']);
/* One-of labels for plural field names, for single lines in the web. */
const SINGULAR = {
  Leaders: 'Leader', Members: 'Member', Allies: 'Ally', Rivals: 'Rival', Owners: 'Owner', Pioneers: 'Pioneer',
  Participants: 'Participant', Regions: 'Region', Cultures: 'Culture', Locations: 'Location', 'Main characters': 'Main character',
  Characters: 'Character', Homeland: 'Homeland', 'Plot arcs': 'Plot arc',
};
/* Symmetric person fields and the kind they produce. */
const SYM_FIELDS = { spouses: 'spouse', partners: 'partner', relatives: 'relative', friends: 'friend', allies: 'ally', rivals: 'rival', enemies: 'enemy' };
/* Which fields hold a relationship, on this person's note and on the other person's note. Used to remove one. */
const KIND_FIELDS = {
  parent: [['mother', 'father'], ['children']], child: [['children'], ['mother', 'father']],
  sibling: [['siblings'], ['siblings']], halfsibling: [['siblings'], ['siblings']],
  spouse: [['spouses'], ['spouses']], partner: [['partners'], ['partners']], relative: [['relatives'], ['relatives']],
  friend: [['friends'], ['friends']], ally: [['allies'], ['allies']], rival: [['rivals'], ['rivals']], enemy: [['enemies'], ['enemies']],
  mentor: [['mentors'], ['students']], student: [['students'], ['mentors']],
};
/* "Add relationship" menu: label, field written on this character. */
const ADD_REL = [
  ['Mother', 'mother', 'arrow-up'], ['Father', 'father', 'arrow-up'], ['Sibling', 'siblings', 'users'], ['Child', 'children', 'arrow-down'],
  ['Spouse', 'spouses', 'heart-handshake'], ['Partner', 'partners', 'heart'], ['Other relative', 'relatives', 'tree-deciduous'], null,
  ['Friend', 'friends', 'smile'], ['Ally', 'allies', 'handshake'], ['Mentor', 'mentors', 'graduation-cap'], ['Student', 'students', 'book-open'],
  ['Rival', 'rivals', 'swords'], ['Enemy', 'enemies', 'skull'],
];

/* When an entry links here, how that shows up on this page. "merge" folds it into one of this page's own fields. */
const INVERSE = {
  'character.species': { label: 'Characters', one: 'Member' },
  'character.birthplace': { label: 'Born here', one: 'Born here' },
  'character.death_place': { label: 'Died here', one: 'Died here' },
  'character.residence': { label: 'Residents', one: 'Resident' },
  'character.culture': { label: 'People', one: 'Member' },
  'character.house': { label: 'Members', one: 'Member', merge: 'members' },
  'character.affiliation': { label: 'Members', one: 'Member', merge: 'members' },
  'character.leaderOf': { label: 'Leaders', one: 'Leader', merge: 'leaders' },
  'character.owns': { label: 'Owners', one: 'Owner', merge: 'owners' },
  'character.pioneered': { label: 'Pioneers', one: 'Pioneer', merge: 'pioneers' },
  'character.uses': { label: 'Used by', one: 'User' },
  'character.education': { label: 'Members', one: 'Student', merge: 'members' },
  'character.workplace': { label: 'Members', one: 'Works here', merge: 'members' },
  'organization.founders': { label: 'Founded', one: 'Founded' },
  'organization.headquarters': { label: 'Headquarters of', one: 'Based here' },
  'organization.leaders': { label: 'Leader of', one: 'Leader of', merge: 'leaderOf' },
  'organization.members': { label: 'Affiliation', one: 'Member of', merge: 'affiliation' },
  'organization.allies': { label: 'Allies', one: 'Ally', merge: 'allies' },
  'organization.rivals': { label: 'Rivals', one: 'Rival', merge: 'rivals' },
  'organization.partOf': { label: 'Branches', one: 'Branch' },
  'culture.species': { label: 'Cultures', one: 'Culture' },
  'culture.regions': { label: 'Cultures', one: 'Culture', merge: 'cultures' },
  'location.cultures': { label: 'Regions', one: 'Region', merge: 'regions' },
  'species.homeland': { label: 'Native species', one: 'Native species' },
  'species.hybridOf': { label: 'Hybrids', one: 'Hybrid' },
  'creature.habitat': { label: 'Creatures', one: 'Lives here' },
  'plant.habitat': { label: 'Plants', one: 'Grows here' },
  'creature.variantOf': { label: 'Variants', one: 'Variant' },
  'plant.variantOf': { label: 'Variants', one: 'Variant' },
  'creature.bonded': { label: 'Creatures', one: 'Companion', merge: 'creatures' },
  'character.creatures': { label: 'Companions', one: 'Companion', merge: 'bonded' },
  'creature.kept_by': { label: 'Creatures', one: 'Keeps' },
  'plant.kept_by': { label: 'Plants', one: 'Grows' },
  'item.materials': { label: 'Made into', one: 'Made from this' },
  'location.partOf': { label: 'Places within', one: 'Within' },
  'location.rulers': { label: 'Rules', one: 'Ruled' },
  'discovery.pioneers': { label: 'Pioneered', one: 'Pioneered', merge: 'pioneered' },
  'discovery.origin': { label: 'Discoveries from here', one: 'Discovered here' },
  'item.owners': { label: 'Owns', one: 'Owns', merge: 'owns' },
  'item.origin': { label: 'Items from here', one: 'Made here' },
  'event.participants': { label: 'Events', one: 'Took part' },
  'event.location': { label: 'Events here', one: 'Happened here' },
  'story.mainCharacters': { label: 'Main character in', one: 'Main character' },
  'story.locations': { label: 'Setting of', one: 'Setting' },
  'arc.characters': { label: 'Plot arcs', one: 'In arc' },
  'word.language': { label: 'Words', one: 'Word' },
  'word.cultures': { label: 'Words', one: 'Word' },
  'word.borrowed_from': { label: 'Loanwords', one: 'Loanword' },
  'language.parent': { label: 'Daughter languages', one: 'Daughter language' },
  'language.species': { label: 'Languages', one: 'Language' },
  'language.cultures': { label: 'Languages', one: 'Language', merge: 'languages' },
  'culture.languages': { label: 'Spoken by', one: 'Culture', merge: 'cultures' },
  'language.regions': { label: 'Languages', one: 'Language', merge: 'languages' },
  'location.languages': { label: 'Spoken in', one: 'Region', merge: 'regions' },
};
/* Incoming links that another part of the page already shows. */
const INVERSE_SKIP = new Set(['species.subspeciesOf', 'creature.variantOf', 'plant.variantOf', 'event.arcs', 'relation.from', 'relation.to', 'character.species']);

/* Writing one side of a link writes the other side too (Settings > "Keep links two-way"). */
const MIRROR = {
  'character.spouses': 'spouses', 'character.partners': 'partners', 'character.siblings': 'siblings',
  'character.relatives': 'relatives', 'character.friends': 'friends', 'character.allies': 'allies',
  'character.rivals': 'rivals', 'character.enemies': 'enemies',
  'character.mentors': 'students', 'character.students': 'mentors',
  'character.mother': 'children', 'character.father': 'children', 'character.children': '@parent',
  'character.affiliation': 'members', 'character.house': 'members', 'character.leaderOf': 'leaders',
  'character.education': 'members', 'character.workplace': 'members',
  'character.owns': 'owners', 'character.pioneered': 'pioneers',
  'character.creatures': 'bonded', 'creature.bonded': 'creatures',
  'organization.members': 'affiliation', 'organization.leaders': 'leaderOf',
  'organization.allies': 'allies', 'organization.rivals': 'rivals',
  'item.owners': 'owns', 'discovery.pioneers': 'pioneered',
  'location.cultures': 'regions', 'culture.regions': 'cultures',
  'language.cultures': 'languages', 'culture.languages': 'cultures',
  'language.regions': 'languages', 'location.languages': 'regions',
};
/* A link already counts as present if it sits in one of these sibling fields. */
const MIRROR_ALSO = { affiliation: ['house', 'education', 'workplace'] };


const CATEGORY_INFO = {
  main: 'Main characters carry the story. They have a conflict, a goal, and they change along the way.',
  major: 'Major characters have no central conflict of their own, but they shape the story. They travel with the main cast or pull strings behind the scenes.',
  minor: 'Minor characters fill out the world. They serve a scene rather than the plot.',
};

const DETAIL_HINTS = {
  Appearance: 'Build, distinguishing features, coloring, usual clothing, how they carry themselves.',
  Psychology: 'Temperament, fears, coping habits, how they think under pressure.',
  Affiliations: 'Groups, causes and people they are bound to, and how tightly.',
  Sociology: 'Class, upbringing, education, and how society sees them.',
  Perspective: 'How they see the world and their place in it.',
  Journey: 'How they change over the course of the story.',
  'Early Life': 'Childhood, the household they grew up in, the moment that set them on their path.',
  Relationships: 'How they feel about the people around them, in their own words.',
  Motivation: 'What drives them, what they would never do, and what would make them do it anyway.',
  History: 'What happened before the story begins.',
  'Points of Interest': 'Landmarks, hidden places, and where things happen.',
  Economy: 'Trade, resources, wealth, and who controls it.',
  Ecology: 'What it eats, what eats it, and what happens to the land when it is gone.',
  Cultivation: 'How it is grown, harvested, stored and traded.',
};

const TYPES = {
  story: {
    label: 'Story', plural: 'Stories', folder: 'Stories', icon: 'book-open', color: 'cyan',
    sections: ['Synopsis', 'Themes'], details: [],
    hints: {
      Synopsis: 'What happens, start to finish, in a paragraph or two.',
      Themes: 'What the story is really about underneath the plot.',
    },
    fields: [
      { key: 'status', label: 'Status', kind: 'text', placeholder: 'Drafting' },
      { key: 'mainCharacters', label: 'Main characters', kind: 'links', types: ['character'] },
      { key: 'locations', label: 'Locations', kind: 'links', types: ['location'] },
      { key: 'word_goal', label: 'Word goal', kind: 'number', placeholder: '80000' },
      { key: 'deadline', label: 'Deadline', kind: 'date' },
      { key: 'present_year', label: 'Present date', kind: 'text', placeholder: '12 Frostmoon, 1023 AC' },
    ],
  },
  arc: {
    label: 'Plot arc', plural: 'Plot arcs', folder: 'Arcs', icon: 'route', color: 'purple',
    computed: true,
    sections: ['Premise', 'Stakes', 'Resolution'], details: [],
    hints: {
      Premise: 'What this thread is about and what sets it moving.',
      Stakes: 'What is won or lost depending on how it ends.',
      Resolution: 'How the thread pays off, or how you think it might.',
    },
    fields: [
      { key: 'kind', label: 'Type', kind: 'text', suggest: true, placeholder: 'Main plot, subplot, character arc' },
      { key: 'characters', label: 'Characters', kind: 'links', types: ['character'] },
      { key: 'status', label: 'Status', kind: 'text', placeholder: 'Open, resolved' },
      { key: 'color', label: 'Color', kind: 'select', options: COLORS },
    ],
  },
  character: {
    label: 'Character', plural: 'Characters', folder: 'Characters', icon: 'user', color: 'red',
    group: 'People', portrait: true, nameParts: true, computed: true,
    sections: ['Biography', 'Personality', 'Physical Description', 'Skills & Abilities'],
    hints: {
      Biography: 'Their life story, from birth to where the story finds them.',
      Personality: 'How they think, feel and behave. What others notice first.',
      'Physical Description': 'Build, features, coloring, how they dress and carry themselves.',
      'Skills & Abilities': 'Training, talents, powers or expertise, and the limits on all of it.',
    },
    details: ['Early Life', 'Psychology', 'Journey'],
    attributes: [],
    notesKeys: ['Want', 'Need', 'Wound', 'Lie', 'Arc', 'Voice', 'Secrets'],
    fields: [
      { group: 'Identity', key: 'full_name', label: 'Full name', kind: 'text' },
      { group: 'Identity', key: 'birth_name', label: 'Birth name', kind: 'text', placeholder: 'Maiden or former name' },
      { group: 'Identity', key: 'aliases', label: 'Aliases', kind: 'list', placeholder: 'Comma separated' },
      { group: 'Identity', key: 'titles', label: 'Titles', kind: 'list', placeholder: 'Comma separated' },
      { group: 'Identity', key: 'epithet', label: 'Epithet', kind: 'text' },
      { group: 'Identity', key: 'quote', label: 'Quote', kind: 'text' },
      { group: 'Identity', key: 'pronouns', label: 'Pronouns', kind: 'text', placeholder: 'she/her' },
      { group: 'Identity', key: 'status', label: 'Status', kind: 'text', placeholder: 'Alive', suggest: true },
      { group: 'Identity', key: 'role', label: 'Role', kind: 'text', placeholder: 'Protagonist, antagonist', suggest: true },
      { group: 'Identity', key: 'occupation', label: 'Occupation', kind: 'text' },
      { group: 'Identity', key: 'heritage', label: 'Heritage', kind: 'text', placeholder: 'Half-blood, noble-born, clanless', suggest: true },
      { group: 'Appearance', key: 'species', label: 'Species', kind: 'links', types: ['species'] },
      { group: 'Appearance', key: 'gender', label: 'Gender', kind: 'text' },
      { group: 'Appearance', key: 'apparent_age', label: 'Looks', kind: 'text', placeholder: 'Mid-twenties' },
      { group: 'Appearance', key: 'height', label: 'Height', kind: 'text' },
      { group: 'Appearance', key: 'build', label: 'Build', kind: 'text', placeholder: 'Wiry, broad, slight' },
      { group: 'Appearance', key: 'hair_color', label: 'Hair', kind: 'text' },
      { group: 'Appearance', key: 'eye_color', label: 'Eyes', kind: 'text' },
      { group: 'Appearance', key: 'skin', label: 'Skin', kind: 'text' },
      { group: 'Appearance', key: 'features', label: 'Features', kind: 'text', placeholder: 'Scars, marks, tells' },
      { group: 'Appearance', key: 'voice', label: 'Voice', kind: 'text', placeholder: 'Low, clipped, a northern burr' },
      { group: 'Personality', key: 'traits', label: 'Traits', kind: 'list', placeholder: 'Loyal, reckless, dry' },
      { group: 'Personality', key: 'flaws', label: 'Flaws', kind: 'list', placeholder: 'Proud, jealous' },
      { group: 'Personality', key: 'likes', label: 'Likes', kind: 'list' },
      { group: 'Personality', key: 'dislikes', label: 'Dislikes', kind: 'list' },
      { group: 'Personality', key: 'fears', label: 'Fears', kind: 'list' },
      { group: 'Personality', key: 'habits', label: 'Habits', kind: 'list', placeholder: 'Taps rings, hums' },
      { group: 'Personality', key: 'alignment', label: 'Morality', kind: 'text', placeholder: 'Ruthless pragmatist' },
      { group: 'Abilities', key: 'skills', label: 'Skills', kind: 'list', placeholder: 'Swordplay, lockpicking' },
      { group: 'Abilities', key: 'weaknesses', label: 'Weaknesses', kind: 'list' },
      { group: 'Abilities', key: 'languages', label: 'Languages', kind: 'list' },
      { group: 'Life', key: 'born', label: 'Born', kind: 'text' },
      { group: 'Life', key: 'birthplace', label: 'Birthplace', kind: 'link', types: ['location'] },
      { group: 'Life', key: 'culture', label: 'Culture', kind: 'links', types: ['culture'] },
      { group: 'Life', key: 'residence', label: 'Residence', kind: 'links', types: ['location'] },
      { group: 'Life', key: 'died', label: 'Died', kind: 'text' },
      { group: 'Life', key: 'death_place', label: 'Place of death', kind: 'link', types: ['location'] },
      { group: 'Life', key: 'cause_of_death', label: 'Cause of death', kind: 'text' },
      { group: 'Life', key: 'first_appearance', label: 'First appearance', kind: 'text', placeholder: 'Found from your scenes' },
      { group: 'Family', key: 'mother', label: 'Mother', kind: 'link', types: ['character'] },
      { group: 'Family', key: 'father', label: 'Father', kind: 'link', types: ['character'] },
      { group: 'Family', key: 'siblings', label: 'Siblings', kind: 'links', types: ['character'] },
      { group: 'Family', key: 'children', label: 'Children', kind: 'links', types: ['character'] },
      { group: 'Family', key: 'spouses', label: 'Spouses', kind: 'links', types: ['character'] },
      { group: 'Family', key: 'partners', label: 'Partners', kind: 'links', types: ['character'] },
      { group: 'Family', key: 'relatives', label: 'Other relatives', kind: 'links', types: ['character'] },
      { group: 'Family', key: 'house', label: 'House', kind: 'links', types: ['organization'] },
      { group: 'Ties', key: 'affiliation', label: 'Affiliation', kind: 'links', types: ['organization', 'culture'] },
      { group: 'Ties', key: 'leaderOf', label: 'Leader of', kind: 'links', types: ['organization', 'culture'] },
      { group: 'Ties', key: 'education', label: 'Education', kind: 'links', types: ['organization'] },
      { group: 'Ties', key: 'workplace', label: 'Workplace', kind: 'links', types: ['organization'] },
      { group: 'Ties', key: 'friends', label: 'Friends', kind: 'links', types: ['character'] },
      { group: 'Ties', key: 'allies', label: 'Allies', kind: 'links', types: ['character'] },
      { group: 'Ties', key: 'mentors', label: 'Mentors', kind: 'links', types: ['character'] },
      { group: 'Ties', key: 'students', label: 'Students', kind: 'links', types: ['character'] },
      { group: 'Ties', key: 'rivals', label: 'Rivals', kind: 'links', types: ['character'] },
      { group: 'Ties', key: 'enemies', label: 'Enemies', kind: 'links', types: ['character'] },
      { group: 'Holdings', key: 'owns', label: 'Owns', kind: 'links', types: ['item'] },
      { group: 'Holdings', key: 'pioneered', label: 'Pioneered', kind: 'links', types: ['discovery'] },
      { group: 'Holdings', key: 'uses', label: 'Uses', kind: 'links', types: ['discovery'] },
      { group: 'Holdings', key: 'creatures', label: 'Creatures', kind: 'links', types: ['creature'], placeholder: 'Pets, mounts, familiars' },
    ],
  },
  organization: {
    label: 'Organization', plural: 'Organizations', folder: 'Organizations', icon: 'users', color: 'orange',
    group: 'People', sections: ['About', 'Goals', 'Structure', 'History'], details: [],
    fields: [
      { key: 'kind', label: 'Type', kind: 'text', suggest: true, placeholder: 'School, company, team, gang, band, guild' },
      { key: 'aliases', label: 'Aliases', kind: 'list', placeholder: 'Comma separated' },
      { key: 'founded', label: 'Founded', kind: 'text' },
      { key: 'headquarters', label: 'Headquarters', kind: 'link', types: ['location'] },
      { key: 'partOf', label: 'Part of', kind: 'link', types: ['organization'] },
      { key: 'founders', label: 'Founded by', kind: 'links', types: ['character', 'organization'] },
      { key: 'leaders', label: 'Leaders', kind: 'links', types: ['character'] },
      { key: 'members', label: 'Members', kind: 'links', types: ['character'] },
      { key: 'allies', label: 'Allies', kind: 'links', types: ['organization'] },
      { key: 'rivals', label: 'Rivals', kind: 'links', types: ['organization'] },
    ],
  },
  culture: {
    label: 'Culture', plural: 'Cultures', folder: 'Cultures', icon: 'landmark', color: 'yellow',
    group: 'People', sections: ['About', 'Values', 'Customs', 'Language'], details: [],
    fields: [
      { key: 'aliases', label: 'Aliases', kind: 'list', placeholder: 'Comma separated' },
      { key: 'species', label: 'Species', kind: 'links', types: ['species'] },
      { key: 'regions', label: 'Regions', kind: 'links', types: ['location'] },
      { key: 'languages', label: 'Languages', kind: 'links', types: ['language'] },
      { group: 'Naming', key: 'name_starts', label: 'Name starts', kind: 'list', placeholder: 'Ra, Ev, Leo, Tha' },
      { group: 'Naming', key: 'name_middles', label: 'Name middles', kind: 'list', placeholder: 'va, li, nor' },
      { group: 'Naming', key: 'name_ends', label: 'Name ends', kind: 'list', placeholder: 'na, ric, eth, wyn' },
      { group: 'Naming', key: 'surname_starts', label: 'Surname starts', kind: 'list', placeholder: 'Vir, Bry, Hel' },
      { group: 'Naming', key: 'surname_ends', label: 'Surname ends', kind: 'list', placeholder: 'neiros, maer, horn' },
    ],
  },
  species: {
    label: 'Species', plural: 'Species', folder: 'Species', icon: 'dna', color: 'green',
    group: 'People', sections: ['About', 'Biology', 'Society', 'History'], details: [],
    fields: [
      { key: 'subspeciesOf', label: 'Subspecies of', kind: 'link', types: ['species'] },
      { key: 'hybridOf', label: 'Hybrid of', kind: 'links', types: ['species'] },
      { key: 'classification', label: 'Classification', kind: 'text', placeholder: 'Humanoid, Fae, Spirit', suggest: true },
      { key: 'lifespan', label: 'Lifespan', kind: 'text' },
      { key: 'homeland', label: 'Homeland', kind: 'links', types: ['location'] },
    ],
  },
  creature: {
    label: 'Creature', plural: 'Bestiary', folder: 'Bestiary', icon: 'paw-print', color: 'orange',
    group: 'Nature', sections: ['About', 'Appearance', 'Behavior', 'Lore'], details: ['Ecology'],
    hints: {
      About: 'What it is, and what people say about it.',
      Appearance: 'Size, build, hide or scales, how it moves, what gives it away before you see it.',
      Behavior: 'How it hunts, feeds, breeds and fights. Whether it can be tamed, and what it takes.',
      Lore: 'Legends, superstitions, and what the people who survived it believe.',
    },
    fields: [
      { key: 'classification', label: 'Classification', kind: 'text', suggest: true, placeholder: 'Beast › Dragon, Undead, Vermin' },
      { key: 'variantOf', label: 'Variant of', kind: 'link', types: ['creature'] },
      { key: 'aliases', label: 'Also called', kind: 'list', placeholder: 'Comma separated' },
      { key: 'threat', label: 'Threat', kind: 'text', suggest: true, placeholder: 'Harmless, dangerous, deadly' },
      { key: 'mind', label: 'Mind', kind: 'text', suggest: true, placeholder: 'Animal, cunning, sapient' },
      { key: 'temperament', label: 'Temperament', kind: 'text', suggest: true, placeholder: 'Skittish, territorial, docile' },
      { key: 'size', label: 'Size', kind: 'text', placeholder: 'Cat-sized, as long as a barge' },
      { key: 'diet', label: 'Diet', kind: 'text', suggest: true, placeholder: 'Carrion, grazer, blood' },
      { key: 'lifespan', label: 'Lifespan', kind: 'text' },
      { key: 'rarity', label: 'Rarity', kind: 'text', suggest: true, placeholder: 'Common, rare, thought extinct' },
      { key: 'active', label: 'Active', kind: 'text', suggest: true, placeholder: 'Nocturnal, winter only' },
      { key: 'habitat', label: 'Habitat', kind: 'links', types: ['location'] },
      { group: 'Abilities', key: 'abilities', label: 'Abilities', kind: 'list', placeholder: 'Venom, flight, mimicry' },
      { group: 'Abilities', key: 'weaknesses', label: 'Weaknesses', kind: 'list', placeholder: 'Silver, fire, salt' },
      { group: 'Abilities', key: 'products', label: 'Yields', kind: 'list', placeholder: 'Hide, venom, scales' },
      { group: 'Ties', key: 'bonded', label: 'Companions', kind: 'links', types: ['character'] },
      { group: 'Ties', key: 'kept_by', label: 'Kept by', kind: 'links', types: ['culture', 'organization'] },
    ],
  },
  plant: {
    label: 'Plant', plural: 'Flora', folder: 'Flora', icon: 'sprout', color: 'green',
    group: 'Nature', sections: ['About', 'Appearance', 'Uses', 'Lore'], details: ['Cultivation'],
    hints: {
      About: 'What it is, where it grows, and how common it is.',
      Appearance: 'Leaves, flowers, bark, smell, and what it is mistaken for.',
      Uses: 'Food, medicine, poison, dye, timber, magic. Which part, and how it is prepared.',
      Lore: 'Folk names, superstitions, and the stories told about it.',
    },
    fields: [
      { key: 'classification', label: 'Classification', kind: 'text', suggest: true, placeholder: 'Tree, Herb, Fungus › Mushroom' },
      { key: 'variantOf', label: 'Variant of', kind: 'link', types: ['plant'] },
      { key: 'aliases', label: 'Also called', kind: 'list', placeholder: 'Folk names, comma separated' },
      { key: 'toxicity', label: 'Toxicity', kind: 'text', suggest: true, placeholder: 'Edible, mildly toxic, deadly' },
      { key: 'rarity', label: 'Rarity', kind: 'text', suggest: true, placeholder: 'Common, rare, sacred' },
      { key: 'season', label: 'Season', kind: 'text', placeholder: 'Blooms late spring, fruits in autumn' },
      { key: 'climate', label: 'Climate', kind: 'text', suggest: true, placeholder: 'Marsh, alpine, desert' },
      { key: 'habitat', label: 'Habitat', kind: 'links', types: ['location'] },
      { key: 'parts', label: 'Useful parts', kind: 'list', placeholder: 'Root, bark, seeds' },
      { key: 'uses', label: 'Uses', kind: 'list', placeholder: 'Healing, dye, poison, timber' },
      { key: 'kept_by', label: 'Grown by', kind: 'links', types: ['culture', 'organization'] },
    ],
  },
  location: {
    label: 'Location', plural: 'Locations', folder: 'Locations', icon: 'map-pin', color: 'blue',
    group: 'Places', sections: ['About', 'Geography', 'Climate', 'History'],
    details: ['Points of Interest', 'Economy'],
    fields: [
      { key: 'kind', label: 'Type', kind: 'text', suggest: true, placeholder: 'City, school, café, ruin' },
      { key: 'aliases', label: 'Aliases', kind: 'list', placeholder: 'Comma separated' },
      { key: 'partOf', label: 'Part of', kind: 'link', types: ['location'] },
      { key: 'rulers', label: 'Ruled by', kind: 'links', types: ['character', 'organization'] },
      { key: 'population', label: 'Population', kind: 'text' },
      { key: 'cultures', label: 'Cultures', kind: 'links', types: ['culture'] },
      { key: 'languages', label: 'Languages', kind: 'links', types: ['language'] },
    ],
  },
  discovery: {
    label: 'Discovery', plural: 'Discoveries', folder: 'Discoveries', icon: 'lightbulb', color: 'purple',
    group: 'Things', sections: ['About', 'How It Works', 'Impact'], details: [],
    fields: [
      { key: 'kind', label: 'Type', kind: 'text', suggest: true, placeholder: 'Spell, invention, theory' },
      { key: 'pioneers', label: 'Pioneers', kind: 'links', types: ['character'] },
      { key: 'origin', label: 'Origin', kind: 'link', types: ['location'] },
    ],
  },
  relation: {
    label: 'Relation', plural: 'Relations', folder: 'Relations', icon: 'git-fork', color: 'pink',
    group: 'Things', sections: ['About', 'History'], details: [],
    fields: [
      { key: 'kind', label: 'Kind', kind: 'text', suggest: true, placeholder: 'Rivals, siblings, sworn oath' },
      { key: 'from', label: 'Between', kind: 'link', types: ANY },
      { key: 'to', label: 'And', kind: 'link', types: ANY },
    ],
  },
  item: {
    label: 'Item', plural: 'Items', folder: 'Items', icon: 'gem', color: 'orange',
    group: 'Things', sections: ['About', 'Properties', 'History'], details: [],
    fields: [
      { key: 'kind', label: 'Type', kind: 'text', suggest: true, placeholder: 'Heirloom, weapon, car, letter' },
      { key: 'rarity', label: 'Rarity', kind: 'text' },
      { key: 'owners', label: 'Owners', kind: 'links', types: ['character'] },
      { key: 'origin', label: 'Origin', kind: 'link', types: ['location'] },
      { key: 'materials', label: 'Made from', kind: 'links', types: ['creature', 'plant'] },
    ],
  },
  event: {
    label: 'Event', plural: 'Events', folder: 'Events', icon: 'calendar', color: 'yellow',
    group: 'History', sections: ['About', 'Causes', 'Consequences'], details: [],
    hints: {
      About: 'What happened, as the history books (or the survivors) tell it.',
      Causes: 'What led up to it.',
      Consequences: 'What changed because of it.',
    },
    fields: [
      { key: 'date', label: 'Date', kind: 'text', placeholder: '12 Frostmoon, 1023 AE' },
      { key: 'year', label: 'Sort year', kind: 'number', placeholder: 'Read from the date if empty' },
      { key: 'end_year', label: 'Ends', kind: 'number', placeholder: 'Year it ends, if it lasts' },
      { key: 'era', label: 'Era', kind: 'text', placeholder: 'Age of Glass', suggest: true },
      { key: 'kind', label: 'Type', kind: 'text', suggest: true, placeholder: 'Battle, wedding, exam, heist' },
      { key: 'participants', label: 'Involved', kind: 'links', types: ['character', 'organization', 'culture', 'species', 'creature'] },
      { key: 'location', label: 'Where', kind: 'link', types: ['location'] },
      { key: 'arcs', label: 'Plot arcs', kind: 'links', types: ['arc'] },
    ],
  },
  holiday: {
    label: 'Holiday', plural: 'Holidays', folder: 'Holidays', icon: 'party-popper', color: 'purple',
    group: 'History', sections: ['About', 'Traditions', 'History'], details: [],
    hints: {
      About: 'What the day is for and how it feels to live through one.',
      Traditions: 'Food, rites, songs, gifts, what people wear and what is forbidden.',
      History: 'How it began, how it changed, and why it was forgotten, if it was.',
    },
    fields: [
      { key: 'date', label: 'When', kind: 'text', placeholder: '1 Frostmoon, or last Moonday of Seedtime' },
      { key: 'days', label: 'Lasts (days)', kind: 'number', placeholder: '1' },
      { key: 'first_held', label: 'First held', kind: 'text', placeholder: 'Year, if it began in your history' },
      { key: 'last_held', label: 'Last held', kind: 'text', placeholder: 'Year, if it was abandoned or forgotten' },
      { key: 'kind', label: 'Type', kind: 'text', suggest: true, placeholder: 'Festival, feast, holy day, remembrance' },
      { key: 'kept_by', label: 'Kept by', kind: 'links', types: ['culture', 'organization', 'species', 'location'] },
      { key: 'commemorates', label: 'Commemorates', kind: 'link', types: ['event'] },
    ],
  },
  language: {
    label: 'Language', plural: 'Languages', folder: 'Languages', icon: 'speech', color: 'purple',
    group: 'Language', sections: ['About', 'Sounds', 'Grammar', 'Writing', 'History'], details: [],
    hints: {
      About: 'Who speaks it, what it sounds and feels like, and what it is used for.',
      Sounds: 'Vowels, consonants, stress, and the sounds that give it away. Pronunciation notes for readers.',
      Grammar: 'Word order, cases, tenses, politeness, and the rules a learner would stumble on.',
      Writing: 'Its script or alphabet, how it is romanised, and who can read it.',
      History: 'Where it came from, what it borrowed, and how it changed.',
    },
    fields: [
      { key: 'kind', label: 'Type', kind: 'text', suggest: true, placeholder: 'Spoken, ritual, trade tongue, cant, sign' },
      { key: 'basis', label: 'Basis', kind: 'select', options: ['invented', 'real-world'] },
      { key: 'aliases', label: 'Also called', kind: 'list', placeholder: 'Comma separated' },
      { key: 'status', label: 'Status', kind: 'text', suggest: true, placeholder: 'Living, dying, dead, revived' },
      { key: 'family', label: 'Language family', kind: 'text', suggest: true, placeholder: 'Goidelic, the Old Tongues' },
      { key: 'parent', label: 'Descended from', kind: 'link', types: ['language'] },
      { group: 'Speakers', key: 'cultures', label: 'Spoken by', kind: 'links', types: ['culture'] },
      { group: 'Speakers', key: 'species', label: 'Species', kind: 'links', types: ['species'] },
      { group: 'Speakers', key: 'regions', label: 'Spoken in', kind: 'links', types: ['location'] },
      { group: 'Speakers', key: 'speakers', label: 'Speakers', kind: 'text', placeholder: 'About 40,000, mostly elderly' },
      { group: 'Structure', key: 'word_order', label: 'Word order', kind: 'text', placeholder: 'SVO, VSO, free' },
      { group: 'Structure', key: 'script', label: 'Script', kind: 'text', placeholder: 'Runes, Latin, none (spoken only)' },
    ],
  },
  word: {
    label: 'Word', plural: 'Dictionary', folder: 'Dictionary', icon: 'languages', color: 'pink',
    group: 'Language', sections: ['Usage', 'Etymology'], details: [],
    hints: {
      Usage: 'How and when it is said, with an example line.',
      Etymology: 'Where the word comes from and how it changed.',
    },
    fields: [
      { key: 'meaning', label: 'Meaning', kind: 'text', placeholder: 'River; also "to wander"' },
      { key: 'part_of_speech', label: 'Part of speech', kind: 'text', placeholder: 'Noun, verb', suggest: true },
      { key: 'pronunciation', label: 'Pronunciation', kind: 'text', placeholder: 'VAY-el' },
      { key: 'language', label: 'Language', kind: 'links', types: ['language'] },
      { key: 'cultures', label: 'Used by', kind: 'links', types: ['culture'] },
      { key: 'borrowed_from', label: 'Borrowed from', kind: 'links', types: ['language'] },
      { key: 'source_word', label: 'Original word', kind: 'text', placeholder: 'How it reads in the language it came from' },
      { key: 'register', label: 'Register', kind: 'text', suggest: true, placeholder: 'Formal, slang, archaic, ritual' },
      { key: 'aliases', label: 'Other forms', kind: 'list', placeholder: 'Plurals, conjugations' },
    ],
  },
  note: {
    label: 'Note', plural: 'Notes', folder: 'Notes', icon: 'sticky-note', color: 'base',
    plain: true, sections: [], details: [], fields: [],
  },
};

const RESERVED = new Set(['lore', 'type', 'tags', 'details', 'attributes', 'image', 'category', 'aliases', 'order', 'chapters', 'chapter_years']);
for (const def of Object.values(TYPES)) for (const f of def.fields) RESERVED.add(f.key.toLowerCase());
RESERVED.add('roles');
RESERVED.add('ties');

const NOTE_HINTS = {
  Want: 'What they think they need',
  Need: 'What they actually need',
  Wound: 'The hurt that shaped them',
  Lie: 'The false belief they live by',
  Arc: 'How they change',
  Voice: 'How they sound',
  Secrets: 'What they hide',
};

const DEFAULT_SETTINGS = {
  rootFolder: 'Lore',
  activeProject: '',
  openInNewTab: true,
  layouts: {},
  dailyGoal: 500,
  showStatusBar: true,
  negativeEras: 'BC, BCE',
  forwardEra: '',
  yearZero: false,
  presentYears: {},
  calendars: {},
  calendarView: { mode: 'year', show: {} },
  manuscript: { legalName: '', byline: '', contact: '', font: 'Times New Roman', lang: 'en' },
  timeline: { births: true, foundings: true, calendar: true },
  web: {
    types: ['character', 'organization'],
    edges: {
      family: true, sibling: true, kin: false, spouse: true, partner: true, allies: true, mentor: true,
      rivals: true, member: true, relation: true, past: true, scenes: false, other: false,
    },
    hideIsolated: false,
  },
  mirrorLinks: true,
  sheetGroups: {},
  groupBy: {},
  foldedGroups: {},
  meet: { mode: 'people', filter: 'all' },
  peopleView: {},
  webPins: {},
  wordLog: {},
  typing: { outside: true, idleSeconds: 30, timeGoal: 0, pomodoro: 25, tab: 'today', kinds: ['scene', 'lore', 'other'], range: 7, metric: 'typed', heat: 'active', story: '' },
  customStructures: {},
  generatorFiles: {},
};

/* ------------------------------------------------------------------ */
/* Generators                                                          */
/* ------------------------------------------------------------------ */
/*
 * Generators roll tables from the Randomness plugin (your .rdm files) and save the result as an ordinary
 * entry. Nothing here holds any content: every field names a Randomness table, so the lists are edited
 * in the .rdm files and a new generator is a new block in GENERATORS.
 *
 * Every table is tried in the audience's own version first: for Middle Grade "Occupation MG", then
 * "Occupation YA", then plain "Occupation"; for Young Adult "Occupation YA", then "Occupation". So adding an
 * MG or YA table to an .rdm file is all it takes to keep a list age-appropriate.
 *
 * A field:
 *   table    the Randomness table to roll. "{family}" becomes the chosen genre ("{family} Plot Tropes"
 *            → "Horror Plot Tropes").
 *   count    roll that many different results (a list).
 *   family   needs a genre; skipped when the generator is run with "No genre".
 */
const GEN_AUDIENCES = [
  { name: 'Middle Grade', weight: 1, tier: 'MG' },
  { name: 'Young Adult', weight: 2, tier: 'YA' },
  { name: 'New Adult', weight: 2, tier: '' },
  { name: 'Adult', weight: 4, tier: '' },
  { name: 'Adult (Mature Themes)', weight: 1, tier: '' },
];
/* Genre families. Each name is also the main table of its .rdm file ("Horror" in Horror.rdm). */
const GEN_FAMILIES = ['Fantasy', 'Science Fiction', 'Horror', 'Mystery', 'Thriller', 'Romance', 'Historical'];
/* Genres an audience tier never rolls. */
const GEN_NOT_FOR = { MG: ['Romance'] };

const GEN_CHARACTER_FIELDS = [
  { key: 'archetype', label: 'Archetype', table: 'Archetype' },
  { key: 'occupation', label: 'Occupation', table: 'Occupation' },
  { key: 'build', label: 'Build', table: 'Char Build' },
  { key: 'features', label: 'Features', table: 'Char Feature' },
  { key: 'style', label: 'Style', table: 'Char Style' },
  { key: 'skills', label: 'Talents & skills', table: 'Char Talent', count: 2 },
  { key: 'traits', label: 'Traits', table: 'Char Virtue', count: 2 },
  { key: 'flaws', label: 'Flaw', table: 'Char Flaw', count: 1 },
  { key: 'tropes', label: 'Genre tropes', table: '{family} Character Tropes', count: 2, family: true },
  { key: 'wound', label: 'Emotional wound', table: 'CharWound' },
  { key: 'fear', label: 'Fear', table: 'CharFear' },
  { key: 'motivation', label: 'Motivation', table: 'CharMotivation' },
  { key: 'trouble', label: 'Current trouble', table: 'Conflicts' },
];

const GENERATORS = {
  prompt: {
    label: 'Story prompt', icon: 'sparkles', color: 'cyan', saveAs: 'note', nameLabel: 'Prompt title',
    blurb: 'A whole story to start from: genre, setting, theme, conflict and tropes, two characters and how they pull on each other. Saved as a note in Notes/Prompts; the characters can be saved as characters too, linked to each other.',
    fields: [
      { key: 'genre', label: 'Genre', table: '{family}', family: true },
      { key: 'setting', label: 'Setting', table: '{family} Locations', family: true },
      { key: 'theme', label: 'Core theme', table: 'Theme' },
      { key: 'tone', label: 'Emotional tone', table: 'Emotional Tone' },
      { key: 'conflict', label: 'Central conflict', table: '{family} Conflict Mix', family: true },
      { key: 'tropes', label: 'Plot tropes', table: '{family} Plot Tropes', count: 3, family: true },
      { key: 'relationship', label: 'Relationship', table: 'Relationship Type' },
      { key: 'subplot', label: 'Subplot trope', table: 'Subplot Trope' },
      { key: 'friction', label: 'Friction point', table: 'Friction Point' },
    ],
    cast: ['Character A', 'Character B'],
  },
  plot: {
    label: 'Plot', icon: 'route', color: 'purple', saveAs: 'arc', nameLabel: 'Plot name',
    blurb: 'A plot thread from start to finish: what sets it off, what goes wrong, what is at stake and how it might end. Saved as a plot arc.',
    fields: [
      { key: 'genre', label: 'Genre', table: '{family}', family: true },
      { key: 'theme', label: 'Core theme', table: 'Theme' },
      { key: 'tone', label: 'Emotional tone', table: 'Emotional Tone' },
      { key: 'inciting', label: 'Inciting incident', table: 'Plot Inciting Incident' },
      { key: 'conflict', label: 'Central conflict', table: '{family} Conflict Mix', family: true },
      { key: 'tropes', label: 'Plot tropes', table: '{family} Plot Tropes', count: 3, family: true },
      { key: 'twist', label: 'Twist', table: 'Plot Twist' },
      { key: 'stakes', label: 'Stakes', table: 'Plot Stakes' },
      { key: 'ending', label: 'Ending', table: 'Plot Ending' },
    ],
  },
  character: {
    label: 'Character', icon: 'user', color: 'red', saveAs: 'character', nameLabel: 'Full name', allowNoFamily: true,
    blurb: 'A person with a look, skills, traits, a wound, a fear and what drives them. Saved as a character with those fields filled in.',
    fields: GEN_CHARACTER_FIELDS,
  },
  place: {
    label: 'Place', icon: 'map-pin', color: 'blue', saveAs: 'location', nameLabel: 'Place name', allowNoFamily: true,
    blurb: 'Somewhere for things to happen: what kind of place, how it feels, who you meet, what it hides and what is about to go wrong. Saved as a location.',
    fields: [
      { key: 'kind', label: 'Kind of place', table: 'Setting' },
      { key: 'flavor', label: 'Genre flavor', table: '{family} Locations', family: true },
      { key: 'atmosphere', label: 'Atmosphere', table: 'Place Atmosphere' },
      { key: 'feature', label: 'Notable feature', table: 'Place Feature' },
      { key: 'people', label: 'Who you meet there', table: 'Place Inhabitants' },
      { key: 'secret', label: 'Secret', table: 'Place Secret' },
      { key: 'trouble', label: 'Trouble brewing', table: 'Place Trouble' },
    ],
  },
};

/* A rolled relationship ("Rivals", "Mentor and student") → the character field it fills, first match wins.
   two: the field on the second character when the link runs both ways. tie: a line in Character A's ties. */
const GEN_REL = [
  { re: /former lover/, tie: 'Ex' },
  { re: /former friend/, tie: 'Former friend' },
  { re: /romantic|lover/, field: 'partners', two: 'partners' },
  { re: /sibling/, field: 'siblings', two: 'siblings' },
  { re: /cousin|relative/, field: 'relatives', two: 'relatives' },
  { re: /mentor/, field: 'students', two: 'mentors' },
  { re: /rival/, field: 'rivals', two: 'rivals' },
  { re: /enem|hunter/, field: 'enemies', two: 'enemies' },
  { re: /parent and child/, field: 'children' },
  { re: /friend/, field: 'friends', two: 'friends' },
  { re: /all(y|ies)|partners in crime/, field: 'allies', two: 'allies' },
];

/* Table output can carry formatting meant for notes (<b>, <br>); generator fields are plain text. */
function genClean(s) {
  return String(s == null ? '' : s).replace(/<br\s*\/?>/gi, '; ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
/* "Escaping Certain Death" → "escaping certain death", for use mid-sentence. Acronyms and initials ("E.R.") stay. */
function genLower(s) {
  return String(s || '').replace(/\b([A-Z])([a-z’']*)(?![.\w’'])/g, (m, a, b) => a.toLowerCase() + b);
}
function genSentence(s) {
  s = String(s || '').trim();
  if (!s) return '';
  s = cap(s);
  return /[.!?…]$/.test(s) ? s : s + '.';
}
function genInnerLine(v) {
  if (!v.motivation && !v.fear && !v.wound) return '';
  return `Driven by ${genLower(v.motivation) || '…'}, but afraid of ${genLower(v.fear) || '…'}, because of ${genLower(v.wound) || '…'}.`;
}
function genWeighted(list) {
  let n = Math.random() * list.reduce((s, a) => s + a.weight, 0);
  return list.find((a) => (n -= a.weight) < 0) || list[list.length - 1];
}
/* Genres open to an audience picked in the dropdown ("Random" allows all; the roll sorts it out). */
function genFamiliesFor(audienceName) {
  const a = GEN_AUDIENCES.find((x) => x.name === audienceName);
  const no = (a && GEN_NOT_FOR[a.tier]) || [];
  return GEN_FAMILIES.filter((f) => !no.includes(f));
}
/* Turn the dropdown picks into a concrete audience and genre. A fixed genre limits which audiences "Random" can land on. */
function genResolve(st, g) {
  let fam = st.family;
  const okFor = (a, f) => !f || f === 'None' || f === 'Random' || !(GEN_NOT_FOR[a.tier] || []).includes(f);
  const auds = GEN_AUDIENCES.filter((a) => okFor(a, fam));
  const aud = GEN_AUDIENCES.find((a) => a.name === st.audience && okFor(a, fam)) || genWeighted(auds.length ? auds : GEN_AUDIENCES);
  if (fam === 'None' && !g.allowNoFamily) fam = 'Random';
  if (fam === 'Random' || !fam) fam = pick(genFamiliesFor(aud.name));
  return { audience: aud.name, tier: aud.tier, family: fam === 'None' ? '' : fam };
}

/* Where the generator tables (.rdm files) are published. "Install generator tables" downloads them from the
   release tag that matches this plugin's version, or from main when there is no such tag, into the vault. */
const GEN_REPO = 'hunterlnhamilton/loresmith';
const GEN_REPO_DIR = 'generators';
function genTableNamesIn(text) {
  return [...String(text).matchAll(/^[ \t]*Table:[ \t]*(.+?)[ \t]*$/gim)].map((m) => m[1]);
}
/* Every table name the generators can ask for, with {family} filled in for each genre. */
function genAllTables() {
  const out = new Set();
  const fields = [...Object.values(GENERATORS).flatMap((g) => g.fields), ...GEN_CHARACTER_FIELDS];
  for (const f of fields) {
    if (f.table.includes('{family}')) for (const fam of GEN_FAMILIES) out.add(f.table.replace('{family}', fam).trim());
    else out.add(f.table);
  }
  return [...out];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/* 0.5 -> "½", 0.375 -> "⅜", 0.3125 -> "5/16"; anything that isn't a clean fraction becomes a percentage. */
function fracText(x) {
  const glyph = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞', '1/3': '⅓', '2/3': '⅔' };
  for (const d of [2, 3, 4, 8, 16, 32, 64]) {
    const n = Math.round(x * d);
    if (n > 0 && Math.abs(n / d - x) < 1e-9) {
      let a = n, b = d;
      while (a % 2 === 0 && b % 2 === 0) { a /= 2; b /= 2; }
      if (a === b) return 'all';
      return glyph[`${a}/${b}`] || `${a}/${b}`;
    }
  }
  return `${Math.round(x * 100)}%`;
}
function toArr(v) {
  if (v == null || v === '') return [];
  return (Array.isArray(v) ? v : [v]).filter((x) => x != null && x !== '').map(String);
}
function linkText(s) {
  return String(s).replace(/^\s*\[\[/, '').replace(/\]\]\s*$/, '').split('|')[0].split('#')[0].trim();
}
function natural(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
function sanitize(s) {
  return String(s || '').replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim();
}
function cleanTag(t) {
  return String(t || '').trim().replace(/^#/, '').replace(/\s+/g, '-');
}
function noteRe(k) {
  const key = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^([ \\t]*(?:[-*+][ \\t]+)?(?:\\*\\*|__)?' + key + '(?:\\*\\*|__)?[ \\t]*:(?:\\*\\*|__)?[ \\t]*)(.*)$', 'mi');
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function fmtNum(n) { return Number(n || 0).toLocaleString(); }
function initials(name) {
  /* First and last name: "Aria Elowen Vale" -> "AV". Skips "(young)" notes and suffixes like "Jr." or "III". */
  const words = String(name || '').replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1 && /^(jr|sr|i{1,3}|iv|vi{0,3}|ix|x)\.?,?$/i.test(words[words.length - 1])) words.pop();
  const first = (w) => ([...w.replace(/^[^\p{L}\p{N}]+/u, '')][0] || '').toUpperCase();
  if (!words.length) return '';
  if (words.length === 1) return first(words[0]);
  return first(words[0]) + first(words[words.length - 1]);
}
/* What kind of relationship a typed word means: "Nemesis" -> enemy, "Girlfriend" -> partner. Null if unknown. */
const TIE_WORDS = {
  friend: ['friend', 'best friend', 'bff', 'companion', 'confidant', 'confidante'],
  ally: ['ally', 'comrade', 'partner in crime', 'accomplice', 'sworn brother', 'sworn sister'],
  enemy: ['enemy', 'nemesis', 'foe', 'archenemy', 'arch-enemy', 'arch enemy', 'adversary', 'betrayer', 'traitor'],
  rival: ['rival', 'competitor'],
  mentor: ['mentor', 'teacher', 'master', 'guardian', 'tutor'],
  student: ['student', 'apprentice', 'pupil', 'protégé', 'protege', 'ward', 'squire'],
  spouse: ['spouse', 'husband', 'wife', 'consort'],
  partner: ['partner', 'lover', 'boyfriend', 'girlfriend', 'fiancé', 'fiancée', 'fiance', 'fiancee', 'betrothed', 'sweetheart', 'love interest', 'crush', 'paramour'],
  sibling: ['sibling', 'brother', 'sister'],
  parent: ['parent', 'mother', 'father', 'mom', 'dad', 'mum'],
  child: ['child', 'son', 'daughter'],
  relative: ['relative', 'cousin', 'kin'],
};
const TIE_LOOKUP = new Map();
for (const [k, ws] of Object.entries(TIE_WORDS)) for (const w of ws) TIE_LOOKUP.set(w, k);
function tieKind(word) {
  const w = String(word || '').toLowerCase().trim().replace(/^(former|ex-?|past)\s*/, '').replace(/\s+/g, ' ');
  return TIE_LOOKUP.get(w) || TIE_LOOKUP.get(w.replace(/s$/, '')) || null;
}
function ordinal(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}
function oneLine(s) { return String(s || '').replace(/\s*\n\s*/g, ' ').trim(); }
function dayKey(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const m = String(v || '').match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}
function daysUntil(iso) {
  const m = isoDate(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((end - now) / 86400000);
}
function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/* Reads a sortable year out of free text: "12 Frostmoon, 1023 AE" -> 1023. Eras listed as
   counting backwards (BC by default) come out negative. */
function parseYear(v, negEras) {
  if (typeof v === 'number') return v;
  const s = String(v || '');
  /* ISO dates from date properties: "2026-07-04" is 2026, not -4. */
  const iso = s.match(/^\s*(-?\d{1,6})-\d{1,2}-\d{1,2}(?!\d)/);
  if (iso) return Number(iso[1]);
  const nums = s.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return null;
  let y = Number(nums[nums.length - 1]);
  if (y > 0 && negEras) {
    for (const era of negEras) {
      const esc = era.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('(^|[^\\p{L}])' + esc + '($|[^\\p{L}])', 'iu').test(s)) { y = -y; break; }
    }
  }
  return y;
}
/* Outline: a note per story ("<Story> outline.md") with one "## Beat" per structure beat, the beat's
   guidance as a "> quote", and one "### Plot line" per column holding that line's cards as list items.
   Card attachments are indented "→ [[Scene]]" or "→ Chapter: Name" lines. */
const STRUCTURES = {
  'Three-act structure': [
    ['Act 1: Opening scene', 'Sets the tone and shows the protagonist\'s world before anything changes.'],
    ['Act 1: Setup', 'The world, the supporting cast, and what the protagonist wants. Hint at what is coming.'],
    ['Act 1: Inciting incident', 'The event that upends normal life and starts the main plot moving.'],
    ['Act 1: First plot point', 'The protagonist commits. From here there is no going back.'],
    ['Act 2: Rising action', 'Obstacles stack up, allies and enemies take shape, the stakes climb.'],
    ['Act 2: Midpoint', 'A reversal or revelation that changes what the protagonist is fighting for.'],
    ['Act 2: All is lost', 'The plan fails. The lowest point, where the cost becomes real.'],
    ['Act 3: Climax', 'The final confrontation, where everything the protagonist has learned is tested.'],
    ['Act 3: Resolution', 'What the world looks like afterwards, and what it cost.'],
  ],
  'Save the Cat': [
    ['Act 1: Opening image', 'A snapshot of the hero and their world before the story changes them.'],
    ['Act 1: Theme stated', 'Someone hints at the lesson the hero will have to learn.'],
    ['Act 1: Setup', 'The hero\'s life, flaws, and what is missing from it.'],
    ['Act 1: Catalyst', 'The life-changing event that knocks the hero off course.'],
    ['Act 1: Debate', 'The hero hesitates. Should they go? Can they?'],
    ['Act 2: Break into two', 'The hero chooses to act and steps into a new world or situation.'],
    ['Act 2: B story', 'A new relationship that carries the theme.'],
    ['Act 2: Fun and games', 'The promise of the premise: the hero explores the new world.'],
    ['Act 2: Midpoint', 'A false victory or false defeat. The stakes go up.'],
    ['Act 2: Bad guys close in', 'Outside pressure and inside doubts tighten around the hero.'],
    ['Act 2: All is lost', 'The opposite of the midpoint. Something or someone is lost.'],
    ['Act 2: Dark night of the soul', 'The hero sits with the loss and finally sees the truth.'],
    ['Act 3: Break into three', 'Armed with the lesson, the hero finds a new way forward.'],
    ['Act 3: Finale', 'The hero puts the lesson into action and faces the final test.'],
    ['Act 3: Final image', 'A mirror of the opening image, showing how much has changed.'],
  ],
  "Hero's journey": [
    ['Ordinary world', 'The hero at home, before the adventure.'],
    ['Call to adventure', 'A problem or opportunity disturbs the ordinary world.'],
    ['Refusal of the call', 'Fear or duty holds the hero back.'],
    ['Meeting the mentor', 'Someone gives the hero advice, training, or a gift.'],
    ['Crossing the threshold', 'The hero leaves the known world behind.'],
    ['Tests, allies and enemies', 'The hero learns the rules of the new world and who to trust.'],
    ['Approach to the inmost cave', 'Preparing for the greatest danger.'],
    ['The ordeal', 'The hero faces death, literal or not, and survives changed.'],
    ['Reward', 'The hero claims what they came for.'],
    ['The road back', 'Consequences follow the hero home.'],
    ['Resurrection', 'A final test where the hero proves the change is real.'],
    ['Return with the elixir', 'The hero comes home with something that heals their world.'],
  ],
  'Seven-point structure': [
    ['Hook', 'Where the protagonist starts, ideally the opposite of where they end.'],
    ['Plot turn 1', 'The call to action that moves the story from the start toward the midpoint.'],
    ['Pinch point 1', 'The antagonist applies pressure and forces the protagonist to act.'],
    ['Midpoint', 'The protagonist stops reacting and starts acting.'],
    ['Pinch point 2', 'More pressure. Things fall apart and the protagonist is alone.'],
    ['Plot turn 2', 'The protagonist finds the final piece they need to win.'],
    ['Resolution', 'The climax and everything the story has built toward.'],
  ],
  'Kishōtenketsu': [
    ['Ki: Introduction', 'Introduce the characters and their world.'],
    ['Shō: Development', 'Develop them further, with no major change yet.'],
    ['Ten: Twist', 'An unexpected turn that recasts everything before it.'],
    ['Ketsu: Reconciliation', 'Bring the pieces together in light of the twist.'],
  ],
  "Freytag's pyramid": [
    ['Exposition', 'Background, setting, and the people involved.'],
    ['Rising action', 'Complications build toward the turning point.'],
    ['Climax', 'The turning point, for better or worse.'],
    ['Falling action', 'The consequences unwind.'],
    ['Denouement', 'Loose ends tied up and a new normal.'],
  ],
  'Blank': [],
};

/* "Act 1: Setup" -> { act: "Act 1", name: "Setup" } */
function splitBeatTitle(t) {
  const m = String(t).match(/^((?:Act|Part|Arc|Book)\s+[\w-]+|Ki|Shō|Sho|Ten|Ketsu)\s*:\s*(.+)$/i);
  return m ? { act: m[1], name: m[2] } : { act: '', name: String(t) };
}

function parseAttach(s) {
  const out = [];
  const ch = s.match(/^Chapter:\s*(.+)$/i);
  if (ch) { out.push({ kind: 'chapter', name: ch[1].trim() }); return out; }
  for (const m of s.matchAll(/\[\[([^\]]+)\]\]/g)) out.push({ kind: 'scene', link: `[[${m[1]}]]` });
  return out;
}

function parseCards(lines) {
  const cards = [];
  let cur = null;
  let blank = false;
  for (const line of lines) {
    if (!line.trim()) { if (cur) blank = true; continue; }
    const item = !/^\s/.test(line) && line.match(/^[-*+](?:\s+(.*))?$/);
    if (item) {
      cur = { text: [item[1] || ''], attach: [] };
      cards.push(cur);
    } else if (cur && /^(\t| {2,})/.test(line)) {
      const t = line.replace(/^(\t| {2,4})/, '');
      const a = t.match(/^→\s*(.*)$/);
      if (a) cur.attach.push(...parseAttach(a[1]));
      else { if (blank) cur.text.push(''); cur.text.push(t); }
    } else {
      cur = { text: [line.trim()], attach: [] };
      cards.push(cur);
    }
    blank = false;
  }
  return cards.map((c) => ({ text: c.text.join('\n').replace(/\s+$/, ''), attach: c.attach }));
}

function parseOutline(body, plotlines) {
  const p = parseSections(body);
  const model = { pre: p.pre.join('\n').trim(), plotlines: [...plotlines], beats: [] };
  for (const sec of p.sections) {
    const beat = { title: sec.name, hint: [], notes: [], cells: {} };
    let pl = null;
    let buf = [];
    const flush = () => {
      if (pl == null) return;
      beat.cells[pl] = (beat.cells[pl] || []).concat(parseCards(buf));
      if (!model.plotlines.includes(pl)) model.plotlines.push(pl);
    };
    for (const line of sec.lines) {
      const h = line.match(/^###\s+(.+?)\s*#*\s*$/);
      if (h) { flush(); pl = h[1].trim(); buf = []; continue; }
      if (pl != null) { buf.push(line); continue; }
      const q = line.match(/^>\s?(.*)$/);
      if (q) beat.hint.push(q[1]);
      else beat.notes.push(line);
    }
    flush();
    beat.hint = beat.hint.join('\n').trim();
    beat.notes = beat.notes.join('\n').trim();
    model.beats.push(beat);
  }
  return model;
}

function cardToMd(c) {
  const lines = String(c.text || '').replace(/\s+$/, '').split('\n');
  const out = [lines[0] ? `- ${lines[0]}` : '-'];
  for (const l of lines.slice(1)) out.push(l ? `  ${l}` : '');
  for (const a of c.attach) out.push(a.kind === 'chapter' ? `  → Chapter: ${a.name}` : `  → ${a.link}`);
  return out.join('\n');
}

function serializeOutline(model) {
  const parts = [];
  if (model.pre) parts.push(model.pre);
  for (const b of model.beats) {
    const blk = [`## ${b.title}`];
    if (b.hint) blk.push(b.hint.split('\n').map((l) => `> ${l}`).join('\n'));
    if (b.notes) blk.push(b.notes);
    for (const pl of model.plotlines) {
      const cards = b.cells[pl] || [];
      if (!cards.length) continue;
      blk.push(`### ${pl}\n\n${cards.map(cardToMd).join('\n')}`);
    }
    parts.push(blk.join('\n\n'));
  }
  return '\n' + parts.join('\n\n') + '\n';
}

function splitFm(text) {
  const m = text.match(/^---\r?\n([\s\S]*?\r?\n)?---[ \t]*(\r?\n|$)/);
  if (m) return { fm: m[0], inner: m[1] || '', body: text.slice(m[0].length) };
  return { fm: '', inner: '', body: text };
}
function readFm(text) {
  const { inner } = splitFm(text);
  if (!inner.trim()) return {};
  try { return parseYaml(inner) || {}; } catch (e) { return {}; }
}
function wordCount(text) {
  const m = splitFm(text).body.replace(/%%[\s\S]*?%%/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

/* Body sections are "## Heading" blocks. Anything above the first one is kept as-is. */
function parseSections(body) {
  const out = { pre: [], sections: [] };
  let cur = null;
  let inCode = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    const m = !inCode && line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (m) { cur = { name: m[1].trim(), lines: [] }; out.sections.push(cur); }
    else (cur ? cur.lines : out.pre).push(line);
  }
  return out;
}
function secText(sec) {
  return sec ? sec.lines.join('\n').replace(/^(\s*\n)+/, '').replace(/\s+$/, '') : '';
}
function findSec(p, name) {
  const n = name.toLowerCase();
  return p.sections.find((s) => s.name.toLowerCase() === n);
}
function buildBody(p) {
  const parts = [];
  const pre = p.pre.join('\n').replace(/\s+$/, '');
  if (pre.trim()) parts.push(pre.replace(/^(\s*\n)+/, ''));
  for (const s of p.sections) parts.push(`## ${s.name}\n\n${secText(s)}`.replace(/\s+$/, ''));
  return '\n' + parts.join('\n\n') + '\n';
}
function editBody(body, fn) {
  const p = parseSections(body);
  fn(p);
  return buildBody(p);
}
function snippetOf(text) {
  const p = parseSections(splitFm(text).body);
  for (const s of p.sections) {
    const t = secText(s).replace(/[#*_`>~[\]]/g, '').replace(/\s+/g, ' ').trim();
    if (t) return t.length > 170 ? t.slice(0, 170).trim() + '…' : t;
  }
  return '';
}

function iconBtn(parent, icon, label, onClick, cls) {
  const b = parent.createEl('button', { cls: 'ls-icon-btn clickable-icon' + (cls ? ' ' + cls : ''), attr: { 'aria-label': label } });
  setIcon(b, icon);
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
  return b;
}
function textBtn(parent, text, onClick, cls) {
  const b = parent.createEl('button', { text, cls: cls || '' });
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
  return b;
}
function wrapSel(ta, a, b) {
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
  ta.value = v.slice(0, s) + a + v.slice(s, e) + b + v.slice(e);
  ta.selectionStart = s + a.length;
  ta.selectionEnd = e + a.length;
}
function prefixLines(ta, prefix) {
  const v = ta.value;
  const ls = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
  let le = v.indexOf('\n', ta.selectionEnd);
  if (le < 0) le = v.length;
  const block = v.slice(ls, le).split('\n')
    .map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l)).join('\n');
  ta.value = v.slice(0, ls) + block + v.slice(le);
  ta.selectionStart = ls;
  ta.selectionEnd = ls + block.length;
}
function addMenuItem(menu, title, icon, fn, warning) {
  menu.addItem((i) => {
    i.setTitle(title).setIcon(icon).onClick(fn);
    if (warning && i.setWarning) i.setWarning(true);
  });
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

const MOON_PHASES = ['New', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
const MOON_GLYPHS = ['●', '◑', '◑', '◑', '○', '◐', '◐', '◐'];
function mod(n, m) { return ((n % m) + m) % m; }

/* A small moon drawn at its exact phase. frac: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
function moonSvg(parent, frac, label, cls) {
  const r = 6;
  const svg = parent.createSvg('svg', { cls: ['ls-moon', ...(cls ? cls.split(' ') : [])], attr: { viewBox: '-7 -7 14 14', role: 'img', 'aria-label': label || '' } });
  svg.createSvg('circle', { cls: 'ls-moon-dark', attr: { r: String(r) } });
  const f = mod(frac, 1);
  const g = f <= 0.5 ? f : 1 - f; // waxing-equivalent: 0 new .. 0.5 full
  if (g > 0.004) {
    const rx = (Math.abs(Math.cos(2 * Math.PI * g)) * r).toFixed(2);
    const d = `M0,${-r} A${r},${r} 0 0 1 0,${r} A${rx},${r} 0 0 ${g > 0.25 ? 1 : 0} 0,${-r}Z`;
    const lit = svg.createSvg('path', { cls: 'ls-moon-lit', attr: { d } });
    if (f > 0.5) lit.setAttr('transform', 'scale(-1,1)'); // waning: lit on the left
  }
  return svg;
}
/* Shortest abbreviation (3+ letters) that keeps every weekday distinct: Dimàirt/Dimèrcles -> Dimà/Dimè. */
function shortNames(names) {
  const max = Math.max(3, ...names.map((n) => n.length));
  for (let len = 3; len <= max; len++) {
    const cut = names.map((n) => n.slice(0, len));
    if (new Set(cut.map((c) => c.toLowerCase())).size === cut.length) return cut;
  }
  return names.slice();
}

/* The world's calendar lives in a "Calendar" note in the project folder (type: calendar). With no note,
   or with its switches off, the project uses the modern calendar and today's date.

     custom_calendar   on: months, weekdays and moons come from the note's sections
     custom_eras       on: backward_eras, forward_era and year_zero name the years
     present           the world's "now"; empty means today (modern calendar, modern eras)

   Sections, one item per line ("- " bullets and %%comments%% are fine):
     ## Months            "Frostmoon, 30"
     ## Weekdays          "Sunday" (the first is the weekday of the first day of year 1)
     ## Moons             "Selune, 29.5, 0"  (cycle in days, days after year 1 began that it was new)
     ## Months (from 1100), ## Weekdays (from 1100)   a calendar change; "Modern" switches back
     ## History           holidays and dated notes:
                            "Founders' Day: 3 Frostmoon (from 1012), a note"
                            "Harvest Night: last Moonday of Seedtime"
                            "1050: The Feast of Lanterns is forgotten."                                   */
const MODERN_MONTHS = [
  ['January', 31, ['Jan']], ['February', 28, ['Feb']], ['March', 31, ['Mar']], ['April', 30, ['Apr']],
  ['May', 31, []], ['June', 30, ['Jun']], ['July', 31, ['Jul']], ['August', 31, ['Aug']],
  ['September', 30, ['Sep', 'Sept']], ['October', 31, ['Oct']], ['November', 30, ['Nov']], ['December', 31, ['Dec']],
];
const MODERN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/* Earth's moon: mean synodic month, and the new moon of 6 January 2000, 18:14 UTC, counted in days from 1 January, year 1. */
const EARTH_MOON = { name: 'Moon', cycle: 29.530588853, offset: 730124.76 };
const NTH_WORDS = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, last: -1 };

/* Astronomical year (1 BC is 0) for a written year, so leap years and day counts line up. */
function astroYear(y, zero) { return zero || y > 0 ? y : y + 1; }
function isLeapYear(ay) { return mod(ay, 4) === 0 && (mod(ay, 100) !== 0 || mod(ay, 400) === 0); }
/* Days from 1 January, year 1 to 1 January of astronomical year ay (proleptic Gregorian). */
function gregDaysBefore(ay) { const n = ay - 1; return 365 * n + Math.floor(n / 4) - Math.floor(n / 100) + Math.floor(n / 400); }
function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* The data lines of a calendar section: bullets, numbering and comments stripped. */
function calLines(text) {
  return String(text || '').replace(/%%[\s\S]*?%%/g, '').replace(/<!--[\s\S]*?-->/g, '').split('\n')
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/, '').trim())
    .filter((l) => l && !l.startsWith('>'));
}
/* "from 1012", "since 1012", "until 1050", "1012–1050", "1012–", "300 BC – 100 AC", or a lone "1012" (from). */
function parseRange(s, neg) {
  const t = String(s || '').trim();
  let m;
  if ((m = t.match(/^(?:from|since|after)\s+(.+)$/i))) return { from: parseYear(m[1], neg), to: null };
  if ((m = t.match(/^(?:until|till|to|before)\s+(.+)$/i))) return { from: null, to: parseYear(m[1], neg) };
  if ((m = t.match(/^(.*?\d[^–—]*?)\s*(?:[–—]|-(?=\s*(?:\d|$))|\bto\b)\s*(.*)$/i))) {
    const end = m[2].trim();
    return { from: parseYear(m[1], neg), to: !end || /^(present|now|today)$/i.test(end) ? null : parseYear(end, neg) };
  }
  return { from: parseYear(t, neg), to: null };
}
/* "1 Frostmoon", "Frostmoon 1", "1st of Frostmoon", "last Moonday of Seedtime", "fourth Thursday in November". */
function parseDayRule(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)\s+(.+?)\s+(?:of|in)\s+(.+)$/i);
  if (m) return { kind: 'nth', n: NTH_WORDS[m[1].toLowerCase()], weekday: m[2].trim(), month: m[3].trim() };
  m = t.match(/^(\d{1,3})(?:st|nd|rd|th)?\s+(?:of\s+)?(.+)$/i);
  if (m) return { kind: 'date', day: Number(m[1]), month: m[2].trim() };
  m = t.match(/^(.+?)\.?\s+(\d{1,3})(?:st|nd|rd|th)?$/i);
  if (m) return { kind: 'date', day: Number(m[2]), month: m[1].trim() };
  return null;
}
function parseMonthLines(text) {
  const months = [];
  for (const l of calLines(text)) {
    const [name, d] = l.split(',').map((x) => x.trim());
    const days = Math.round(Number(d));
    if (name && days > 0) months.push({ name, days, aliases: [] });
  }
  return months;
}
function parseWeekdayLines(text) {
  return calLines(text).join(',').split(',').map((x) => x.trim()).filter(Boolean);
}
function isModernWord(text) { const l = calLines(text); return l.length === 1 && /^(modern|gregorian)$/i.test(l[0]); }

/* Builds the calendar model from the note's frontmatter and body (or from old settings: see legacyCalSource). */
function buildCalModel(fm, body, path) {
  fm = fm || {};
  const truthy = (v) => v === true || /^(true|yes|on|1)$/i.test(String(v || '').trim());
  const customEras = truthy(fm.custom_eras);
  const eras = customEras
    ? {
      custom: true,
      neg: String(fm.backward_eras == null ? 'BC, BCE' : fm.backward_eras).split(',').map((s) => s.trim()).filter(Boolean),
      fwd: String(fm.forward_era || '').trim(),
      zero: truthy(fm.year_zero),
    }
    : { custom: false, neg: ['BC', 'BCE'], fwd: '', zero: false };
  const custom = truthy(fm.custom_calendar);
  const neg = eras.neg;

  /* Sections, with an optional "(from 1100)" range in the heading. */
  const secs = { months: [], weekdays: [], moons: [], history: [] };
  for (const s of parseSections(body || '').sections) {
    const m = s.name.match(/^(months|weekdays|moons|history|holidays)\s*(?:\((.*)\))?\s*$/i);
    if (!m) continue;
    const key = m[1].toLowerCase() === 'holidays' ? 'history' : m[1].toLowerCase();
    const from = m[2] ? parseRange(m[2], neg).from : null;
    secs[key].push({ from, text: s.lines.join('\n') });
  }
  const undated = (k) => secs[k].filter((s) => s.from == null).map((s) => s.text).join('\n');

  /* Month sets: the base calendar, then each dated change. */
  const monthSets = [];
  if (custom) {
    const months = parseMonthLines(undated('months'));
    if (!months.length) return { path, custom, eras, broken: 'no-months', monthSets: [], weekSets: [], moons: [], holidays: [], notes: [], present: fm.present };
    monthSets.push({ from: -Infinity, modern: false, months });
  } else monthSets.push({ from: -Infinity, modern: true });
  for (const s of secs.months.filter((x) => x.from != null)) {
    if (isModernWord(s.text)) monthSets.push({ from: s.from, modern: true });
    else {
      const months = parseMonthLines(s.text);
      if (months.length) monthSets.push({ from: s.from, modern: false, months });
    }
  }
  monthSets.sort((a, b) => a.from - b.from);
  for (const set of monthSets) set.yearDays = set.modern ? 365.2425 : set.months.reduce((n, m) => n + m.days, 0);

  /* Weekday sets. The base modern week makes 1 January, year 1 a Monday; a dated week starts on the first day of its year. */
  const weekSets = [];
  if (custom) {
    const list = parseWeekdayLines(undated('weekdays'));
    if (list.length) weekSets.push({ from: -Infinity, list, base: 0 });
  } else weekSets.push({ from: -Infinity, list: MODERN_WEEKDAYS, base: -1 });
  for (const s of secs.weekdays.filter((x) => x.from != null)) {
    const list = isModernWord(s.text) ? MODERN_WEEKDAYS : parseWeekdayLines(s.text);
    if (list.length) weekSets.push({ from: s.from, list, base: null });
  }
  weekSets.sort((a, b) => a.from - b.from);

  const moons = [];
  for (const l of calLines(undated('moons'))) {
    const [name, c, o] = l.split(',').map((x) => x.trim());
    const cycle = Number(c);
    if (name && cycle > 0) moons.push({ name, cycle, offset: Number(o) || 0 });
  }
  if (!moons.length && monthSets.some((s) => s.modern)) moons.push(EARTH_MOON);

  /* History: holidays (with optional years) and dated notes. */
  const monthNames = new Set();
  for (const set of monthSets) {
    for (const [n, , al] of set.modern ? MODERN_MONTHS : set.months.map((m) => [m.name, 0, []])) {
      monthNames.add(n.toLowerCase());
      for (const a of al) monthNames.add(a.toLowerCase());
    }
  }
  const holidays = [];
  const notes = [];
  for (const sec of secs.history) {
    for (const line of calLines(sec.text)) {
      const h = parseHistoryLine(line, neg, monthNames);
      if (!h) continue;
      if (h.kind === 'holiday') {
        if (h.from == null && sec.from != null) h.from = sec.from;
        holidays.push(h);
      } else notes.push(h);
    }
  }
  const present = fm.present != null && String(fm.present).trim() !== '' ? fm.present : null;
  return { path, custom, eras, monthSets, weekSets, moons, holidays, notes, present };
}

/* One line of the History section -> a holiday or a dated note (or null). */
function parseHistoryLine(line, neg, monthNames) {
  const knownMonth = (r) => r && monthNames.has(r.month.toLowerCase().replace(/\.$/, ''));
  const colon = line.indexOf(':');
  if (colon > 0) {
    const left = line.slice(0, colon).trim();
    let right = line.slice(colon + 1).trim();
    let range = { from: null, to: null };
    const pm = right.match(/\s*\(([^()]*\d[^()]*)\)/);
    if (pm) { range = parseRange(pm[1], neg); right = (right.slice(0, pm.index) + right.slice(pm.index + pm[0].length)).trim(); }
    const cut = right.search(/\s*(?:,|;|\s[—–]\s)\s*/);
    const ruleText = cut >= 0 ? right.slice(0, cut) : right;
    const note = cut >= 0 ? right.slice(cut).replace(/^\s*(?:,|;|[—–])\s*/, '').trim() : '';
    const rule = parseDayRule(ruleText);
    if (knownMonth(rule)) return { kind: 'holiday', name: left, rule, ruleText: ruleText.trim(), note, from: range.from, to: range.to, raw: line };
    if (/\d/.test(left) && parseYear(left, neg) != null) return { kind: 'note', when: left, text: line.slice(colon + 1).trim(), raw: line };
    return null;
  }
  /* Older form: "Midwinter Feast, Frostmoon, 1". */
  const parts = line.split(',').map((x) => x.trim());
  if (parts.length >= 3) {
    const rule = { kind: 'date', month: parts[1], day: Number(parts[2]) };
    if (rule.day > 0 && knownMonth(rule)) return { kind: 'holiday', name: parts[0], rule, ruleText: `${rule.day} ${rule.month}`, note: parts.slice(3).join(', '), from: null, to: null, raw: line };
  }
  return null;
}

/* The calendar note a project starts with, carrying over anything set in the old settings boxes. */
function calendarTemplate(old) {
  old = old || {};
  const q = (v) => JSON.stringify(String(v == null ? '' : v));
  const hol = calLines(old.holidays).map((l) => {
    const [name, mo, d] = l.split(',').map((x) => x.trim());
    return name && mo && d ? `- ${name}: ${d} ${mo}` : `- ${l}`;
  });
  const list = (t) => calLines(t).map((l) => `- ${l}`).join('\n');
  return [
    '---',
    'type: calendar',
    `present: ${q(old.present || '')}`,
    `custom_calendar: ${old.custom ? 'true' : 'false'}`,
    `custom_eras: ${old.customEras ? 'true' : 'false'}`,
    `backward_eras: ${q(old.negativeEras || 'BC, BCE')}`,
    `forward_era: ${q(old.forwardEra || '')}`,
    `year_zero: ${old.yearZero ? 'true' : 'false'}`,
    '---',
    '',
    '%% Loresmith reads this note. With custom_calendar and custom_eras off, the world uses the modern calendar,',
    'and an empty "present" means today. Anything between double percent signs is ignored. %%',
    '',
    '## Months',
    '',
    '%% Used when custom_calendar is on. One per line, in order: name, number of days.',
    'If the calendar changes partway through history, add another section such as "## Months (from 1100)".',
    'Write "Modern" in a dated section to switch back to January to December. %%',
    list(old.months),
    '',
    '## Weekdays',
    '',
    '%% Used when custom_calendar is on. One per line, starting with the weekday of the first day of year 1.',
    'A dated section such as "## Weekdays (from 1100)" starts its week on the first day of that year. %%',
    list(old.weekdays),
    '',
    '## Moons',
    '',
    '%% One per line: name, days per cycle, days after the first day of year 1 that it was new.',
    'Leave empty for Earth\'s moon on the modern calendar. %%',
    list(old.moons),
    '',
    '## History',
    '',
    '%% The easy way to add holidays is the Holidays tab, under History. You can also write them here,',
    'one per line: "Name: day Month". Add years in brackets for when it was kept, and a note after a comma:',
    '- Midwinter Feast: 1 Frostmoon',
    '- Founders\' Day: 3 Frostmoon (from 1012)',
    '- Feast of Lanterns: 14 Seedtime (until 1050), forgotten after the Grey Plague',
    '- Harvest Night: last Moonday of Seedtime',
    'Lines that start with a date are history notes, shown on the timeline and calendar:',
    '- 1050: The Grey Plague. Nobody lights the lanterns that autumn. %%',
    hol.join('\n'),
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Name builder                                                        */
/* ------------------------------------------------------------------ */

const VOWELS = 'aeiouyàáâäãåæèéêëìíîïòóôöõøùúûüýÿ';
/* Splits a name into rough syllables: "Ravana" -> ["Ra", "va", "na"]. */
function syllables(word) {
  const re = new RegExp(`[^${VOWELS}]*[${VOWELS}]+(?:[^${VOWELS}]+$|[^${VOWELS}](?![${VOWELS}]))?`, 'gi');
  return String(word).match(re) || [String(word)];
}
/* Builds start, middle and end pieces from existing names. */
function learnNameParts(names) {
  const out = { starts: [], middles: [], ends: [] };
  for (const n of names) {
    const s = syllables(n);
    if (s.length < 2) continue;
    out.starts.push(s[0]);
    out.ends.push(s[s.length - 1].toLowerCase());
    for (const m of s.slice(1, -1)) out.middles.push(m.toLowerCase());
  }
  return out;
}
function pairKey(a, b) { return a.path < b.path ? `${a.path}|${b.path}` : `${b.path}|${a.path}`; }
function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
function rollName(parts, middleChance = 0.35) {
  if (!parts.starts.length) return '';
  let n = pick(parts.starts);
  if (parts.middles.length && Math.random() < middleChance) n += pick(parts.middles).toLowerCase();
  if (parts.ends.length) n += pick(parts.ends).toLowerCase();
  n = n.replace(/(.)\1\1+/gi, '$1$1');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/* ------------------------------------------------------------------ */
/* Manuscript and ebook export                                         */
/* ------------------------------------------------------------------ */

function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/* Scene markdown -> paragraphs of { runs: [{ t, b, i }] } or { brk: true } for a scene break.
   Drops frontmatter, comments, embeds and link syntax; one line is one paragraph. */
function proseParagraphs(md) {
  let s = splitFm(md).body;
  s = s.replace(/%%[\s\S]*?%%/g, '').replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/!\[\[[^\]]*\]\]/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, (m, a) => a.split('#').pop());
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/==([^=]+)==/g, '$1').replace(/~~([^~]+)~~/g, '$1');
  const out = [];
  for (let line of s.split('\n')) {
    line = line.trim();
    if (!line) continue;
    if (/^([-*_])(\s*\1){2,}$/.test(line) || /^#$/.test(line)) { out.push({ brk: true }); continue; }
    if (/^#{1,6}\s/.test(line)) continue; // scene headings are for you, not the reader
    line = line.replace(/^>\s?/, '').replace(/^\[!\w+\][-+]?\s*/, '');
    if (!line) continue;
    out.push({ runs: inlineRuns(line) });
  }
  while (out.length && out[0].brk) out.shift();
  while (out.length && out[out.length - 1].brk) out.pop();
  return out;
}
function inlineRuns(line) {
  const runs = [];
  let b = false, i = false, buf = '';
  const flush = () => { if (buf) runs.push({ t: buf, b, i }); buf = ''; };
  const re = /(\*\*\*|___|\*\*|__|\*|_)/g;
  let last = 0, m;
  while ((m = re.exec(line))) {
    const tok = m[1];
    if (tok[0] === '_') {
      const prev = line[m.index - 1], next = line[m.index + tok.length];
      if ((prev && /\w/.test(prev)) && (next && /\w/.test(next))) continue; // snake_case, not emphasis
    }
    buf += line.slice(last, m.index);
    last = m.index + tok.length;
    flush();
    if (tok.length === 3) { b = !b; i = !i; } else if (tok.length === 2) b = !b; else i = !i;
  }
  buf += line.slice(last);
  flush();
  return runs.length ? runs : [{ t: '', b: false, i: false }];
}

/* A minimal zip writer (stored, no compression). Enough for .docx and .epub. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : new Uint8Array(f.data);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, time, true); local.setUint16(12, date, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true); cen.setUint16(12, time, true); cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out.buffer;
}

/* Manuscript format: 12pt, double spaced, 1" margins, half-inch indents, title page with word count,
   "Surname / TITLE / page" header, chapters on new pages a third of the way down, "#" scene breaks. */
function buildDocx(book) {
  const font = book.font || 'Times New Roman';
  const r = (run) => `<w:r>${run.b || run.i ? `<w:rPr>${run.b ? '<w:b/>' : ''}${run.i ? '<w:i/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(run.t)}</w:t></w:r>`;
  const para = (runs, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs.map(r).join('')}</w:p>`;
  const plain = (t, ppr) => para([{ t }], ppr);
  const single = '<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/>';
  const body = [];
  // title page
  body.push(para([{ t: book.legalName || book.byline || '' }, { t: '\t' }, { t: `about ${fmtNum(book.roundedWords)} words` }],
    `<w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>${single}`));
  for (const l of book.contact) body.push(plain(l, single));
  body.push(plain(book.title, `<w:spacing w:before="4320" w:after="0" w:line="480" w:lineRule="auto"/><w:jc w:val="center"/>`));
  if (book.byline) body.push(plain(`by ${book.byline}`, '<w:jc w:val="center"/>'));
  body.push(`<w:p><w:pPr><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>`);
  // chapters
  book.chapters.forEach((ch) => {
    body.push(plain(ch.title, '<w:pageBreakBefore/><w:spacing w:before="2880" w:after="480"/><w:jc w:val="center"/>'));
    for (const p of ch.paras) {
      if (p.brk) body.push(plain('#', '<w:jc w:val="center"/>'));
      else body.push(para(p.runs, '<w:ind w:firstLine="720"/>'));
    }
  });
  body.push(plain('END', '<w:spacing w:before="480"/><w:jc w:val="center"/>'));
  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:pgNumType w:start="1"/></w:sectPr>`;
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join('')}${sect}</w:body></w:document>`;
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}><w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEsc(book.headerText)} / </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:hdr>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${xmlEsc(font)}" w:hAnsi="${xmlEsc(font)}" w:cs="${xmlEsc(font)}" w:eastAsia="${xmlEsc(font)}"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(book.title)}</dc:title><dc:creator>${xmlEsc(book.byline || book.legalName || '')}</dc:creator></cp:coreProperties>`;
  return makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>' },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/header1.xml', data: header },
    { name: 'docProps/core.xml', data: core },
  ]);
}

function buildEpub(book) {
  const uid = 'urn:uuid:' + ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16));
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const page = (title, inner, cls = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${book.lang}" xml:lang="${book.lang}"><head><meta charset="UTF-8"/><title>${xmlEsc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body${cls ? ` class="${cls}"` : ''}>${inner}</body></html>`;
  const runHtml = (run) => { let t = xmlEsc(run.t); if (run.i) t = `<em>${t}</em>`; if (run.b) t = `<strong>${t}</strong>`; return t; };
  const files = [{ name: 'mimetype', data: 'application/epub+zip' }];
  files.push({ name: 'META-INF/container.xml', data: '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' });
  files.push({ name: 'OEBPS/style.css', data: 'body{font-family:serif;line-height:1.5;margin:0 5%;}p{margin:0;text-indent:1.5em;text-align:justify;}h1+p,p.brk+p{text-indent:0;}p.brk{text-indent:0;text-align:center;margin:1em 0;}h1{text-align:center;font-weight:normal;font-size:1.6em;margin:3em 0 2em;page-break-before:always;}.title{text-align:center;margin-top:30%;}.title h1{margin:0 0 .5em;page-break-before:auto;font-size:2em;}.title p{text-indent:0;text-align:center;}.cover{margin:0;padding:0;text-align:center;}.cover img{max-width:100%;max-height:100%;}' });
  const manifest = [], spine = [], nav = [];
  if (book.cover) {
    files.push({ name: `OEBPS/cover.${book.cover.ext}`, data: book.cover.data });
    manifest.push(`<item id="cover-image" href="cover.${book.cover.ext}" media-type="${book.cover.mime}" properties="cover-image"/>`);
    files.push({ name: 'OEBPS/cover.xhtml', data: page('Cover', `<div class="cover"><img src="cover.${book.cover.ext}" alt="${xmlEsc(book.title)}"/></div>`, 'cover') });
    manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="cover" linear="no"/>');
  }
  files.push({ name: 'OEBPS/title.xhtml', data: page(book.title, `<div class="title"><h1>${xmlEsc(book.title)}</h1>${book.byline ? `<p>${xmlEsc(book.byline)}</p>` : ''}</div>`) });
  manifest.push('<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>');
  spine.push('<itemref idref="title"/>');
  book.chapters.forEach((ch, i) => {
    const id = `ch${String(i + 1).padStart(3, '0')}`;
    let html = `<section epub:type="chapter"><h1>${xmlEsc(ch.title)}</h1>`;
    for (const p of ch.paras) html += p.brk ? '<p class="brk">*</p>' : `<p>${p.runs.map(runHtml).join('')}</p>`;
    html += '</section>';
    files.push({ name: `OEBPS/${id}.xhtml`, data: page(ch.title, html) });
    manifest.push(`<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    nav.push(`<li><a href="${id}.xhtml">${xmlEsc(ch.title)}</a></li>`);
  });
  files.push({ name: 'OEBPS/nav.xhtml', data: page('Contents', `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${nav.join('')}</ol></nav>`) });
  manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
  manifest.push('<item id="css" href="style.css" media-type="text/css"/>');
  files.push({ name: 'OEBPS/content.opf', data: `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${book.lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${uid}</dc:identifier><dc:title>${xmlEsc(book.title)}</dc:title><dc:creator>${xmlEsc(book.byline || book.legalName || 'Unknown')}</dc:creator><dc:language>${book.lang}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>` });
  return makeZip(files);
}

/* Shared image grid for moodboards: thumbnails, tap to open, x to remove, + to add. */
/* A round portrait, or initials when there is no image. Marks the dead. */
function avatarEl(parent, plugin, f, cls) {
  const a = parent.createSpan('ls-avatar' + (cls ? ' ' + cls : ''));
  const img = plugin.resolveLink(plugin.fm(f).image, f);
  if (img && IMAGE_EXT.includes(img.extension.toLowerCase())) {
    a.createEl('img', { attr: { src: plugin.app.vault.getResourcePath(img), alt: '', loading: 'lazy', draggable: 'false' } });
  } else a.createSpan({ cls: 'ls-avatar-initials', text: initials(f.basename) });
  if (plugin.typeOf(f) === 'character' && plugin.isDead(f)) a.addClass('is-dead');
  return a;
}
/* Small icon + text, used for facts and relationship labels. */
function iconText(parent, icon, text, cls) {
  const el = parent.createSpan('ls-icon-text' + (cls ? ' ' + cls : ''));
  setIcon(el.createSpan('ls-icon-text-icon'), icon);
  el.createSpan({ text });
  return el;
}

function renderMoodboard(parent, plugin, links, source, onChange, opts = {}) {
  const grid = parent.createDiv('ls-mood' + (opts.strip ? ' is-strip' : ''));
  for (const s of links) {
    const f = plugin.resolveLink(s, source);
    const cell = grid.createDiv('ls-mood-cell');
    if (f) {
      cell.createEl('img', { attr: { src: plugin.app.vault.getResourcePath(f), alt: f.basename, loading: 'lazy' } });
      cell.addEventListener('click', () => plugin.app.workspace.getLeaf('tab').openFile(f));
    } else cell.createDiv({ cls: 'ls-mood-missing', text: linkText(s) });
    if (onChange) iconBtn(cell, 'x', 'Remove from moodboard', () => onChange(links.filter((x) => x !== s)), 'ls-mood-x');
  }
  if (onChange) {
    const add = grid.createEl('button', { cls: 'ls-mood-add', attr: { 'aria-label': 'Add image' } });
    setIcon(add, 'image-plus');
    add.addEventListener('click', (e) => {
      e.stopPropagation();
      new ImageSuggest(plugin.app, (f) => onChange([...links, plugin.linkTo(f, source)])).open();
    });
  }
  return grid;
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Typing log                                                          */
/* ------------------------------------------------------------------ */

/* Everything typed in the editor (and in Loresmith's own text boxes) is counted as it happens, sorted into
   scenes, lore (every other note in the Loresmith folder) and other notes. Each device keeps its own log in
   the plugin folder (typing/<device>.json), so two devices syncing never overwrite each other.

   A session is a stretch of typing in one note with no gap longer than 20 minutes. When it ends it is sealed:
   the SHA-256 of the note's text is stored, and the session is chained to the previous one by hashing it
   together with the previous seal. Editing an old session in the log breaks the chain; text that changed
   between sessions without being typed here shows up as a fingerprint that doesn't match. */
const TYPING_KINDS = { scene: 'Scenes', lore: 'Lore', other: 'Other notes' };
const SESSION_GAP_MS = 20 * 60 * 1000;
const COUNT_KEYS = ['typed', 'pasted', 'deleted', 'other', 'undo'];

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
/* The prose a seal covers: the note without its properties, so changing a scene's status doesn't count as an edit. */
function proseOf(text) { return splitFm(String(text || '')).body.replace(/\r\n?/g, '\n').replace(/\s+$/, ''); }
function emptyStats() { return { typed: 0, pasted: 0, deleted: 0, other: 0, undo: 0, active: 0, words: 0, peak: 0 }; }
function addStats(a, b) {
  for (const k of [...COUNT_KEYS, 'active', 'words']) a[k] += b[k] || 0;
  a.peak = Math.max(a.peak, b.peak || 0);
  return a;
}
/* 6m 59s, 1h 20m, 45s */
function fmtDur(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtStamp(t) {
  const d = new Date(t);
  return `${dayKey(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/* The fields a seal covers, in a fixed order. */
function sealFields(s) {
  return {
    id: s.id, device: s.device, path: s.path, start: s.start, end: s.end, active: s.active,
    typed: s.typed, pasted: s.pasted, deleted: s.deleted, other: s.other, undo: s.undo,
    startWords: s.startWords, endWords: s.endWords, startHash: s.startHash, endHash: s.endHash, outside: !!s.outside,
  };
}

class TypingTracker {
  constructor(plugin) {
    this.p = plugin;
    this.app = plugin.app;
    this.dir = normalizePath(`${plugin.manifest.dir}/typing`);
    this.device = this.deviceId();
    const label = Platform.isMobile ? (Platform.isIosApp ? 'iPhone or iPad' : 'Phone or tablet') : 'Desktop';
    this.data = { version: 1, device: this.device, label, head: '', days: {}, files: {} };
    this.live = new Map(); // path -> { last, words, wordsAt, growth, session, text }
    this.recent = []; // [time, chars typed] over the last minute, for the current speed
    this.minute = { key: null, kinds: {}, all: 0 };
    this.others = new Map(); // other devices' logs: path -> { mtime, data }
    this.lastPath = null;
    this.pomo = null;
    this.chain = Promise.resolve();
    this.save = debounce(() => this.write(), 4000, true);
    this.loaded = false;
  }

  deviceId() {
    const key = 'loresmith-typing-device';
    let id = null;
    try { id = this.app.loadLocalStorage(key); } catch (e) { /* older Obsidian */ }
    if (!id) { try { id = window.localStorage.getItem(`${this.app.appId || ''}-${key}`); } catch (e) { /* no storage */ } }
    if (!id) {
      id = Math.random().toString(16).slice(2, 10);
      try { this.app.saveLocalStorage(key, id); } catch (e) { try { window.localStorage.setItem(`${this.app.appId || ''}-${key}`, id); } catch (e2) { /* no storage */ } }
    }
    return id;
  }
  get path() { return `${this.dir}/${this.device}.json`; }

  async load() {
    const a = this.app.vault.adapter;
    try { if (!(await a.exists(this.dir))) await a.mkdir(this.dir); } catch (e) { /* made below on write */ }
    try {
      if (await a.exists(this.path)) {
        const raw = await a.read(this.path);
        try { Object.assign(this.data, JSON.parse(raw)); } catch (e) {
          /* Never write over a log we couldn't read: keep it beside the new one. */
          await a.write(`${this.dir}/${this.device}.unreadable-${Date.now()}.txt`, raw);
          new Notice('Loresmith: the typing log on this device could not be read. A copy was kept in the plugin\'s typing folder.');
        }
      }
    } catch (e) { console.error('Loresmith: could not load the typing log', e); }
    this.data.device = this.device;
    this.loaded = true;
    await this.all();
    await this.closeStale();
  }
  async write() {
    if (!this.loaded) return;
    try {
      const a = this.app.vault.adapter;
      if (!(await a.exists(this.dir))) await a.mkdir(this.dir);
      await a.write(this.path, JSON.stringify(this.data));
    } catch (e) { console.error('Loresmith: could not save the typing log', e); }
  }
  /* Every device's log: this one live, the others as last synced. */
  async all() {
    const out = [this.data];
    const a = this.app.vault.adapter;
    try {
      const list = await a.list(this.dir);
      for (const f of list.files) {
        if (!f.endsWith('.json') || f.endsWith(`/${this.device}.json`)) continue;
        const st = await a.stat(f);
        const c = this.others.get(f);
        if (c && st && c.mtime === st.mtime) { out.push(c.data); continue; }
        try {
          const d = JSON.parse(await a.read(f));
          this.others.set(f, { mtime: st ? st.mtime : 0, data: d });
          out.push(d);
        } catch (e) { /* half-synced file: try again next time */ }
      }
    } catch (e) { /* no folder yet */ }
    return out;
  }
  cachedAll() { return [this.data, ...[...this.others.values()].map((c) => c.data)]; }

  kindOf(file) {
    if (!(file instanceof TFile) || file.extension !== 'md') return null;
    if (this.p.underRoot(file.path)) return this.p.typeOf(file) === 'scene' ? 'scene' : 'lore';
    return this.p.settings.typing.outside ? 'other' : null;
  }
  day(key, kind) {
    const d = this.data.days[key] || (this.data.days[key] = { peakAll: 0 });
    return d[kind] || (d[kind] = emptyStats());
  }

  /* ---------- capture ---------- */

  /* A CodeMirror update from any markdown editor. */
  onUpdate(update) {
    if (!update.docChanged || !EDITOR_INFO) return;
    const info = update.state.field(EDITOR_INFO, false);
    const file = info && info.file;
    if (!file) return;
    const c = { typed: 0, pasted: 0, deleted: 0, other: 0, undo: 0 };
    for (const tr of update.transactions) {
      if (!tr.docChanged) continue;
      let ins = 0, del = 0;
      tr.changes.iterChanges((fA, tA, fB, tB, text) => { del += tA - fA; ins += text.length; });
      const ev = (n) => tr.isUserEvent(n);
      if (ev('input.paste') || ev('input.drop')) { c.pasted += ins; c.deleted += del; }
      else if (ev('undo') || ev('redo')) c.undo += ins + del;
      else if (ev('input')) { c.typed += ins; c.deleted += del; } // typing, IME, autocorrect, autocomplete
      else if (ev('delete')) c.deleted += del; // backspace, delete, cut
      else if (ev('move')) { /* text dragged within the note */ }
      else c.other += ins; // a command, template or plugin
    }
    const state = update.state, before = update.startState;
    this.record(file, c, () => state.doc.toString(), () => before.doc.toString());
  }

  /* One of Loresmith's own text boxes (section editors, author's notes, outline cards). */
  trackInput(ta, getFile) {
    let len = ta.value.length;
    let before = null;
    ta.addEventListener('beforeinput', () => { before = { len: ta.value.length, sel: Math.abs(ta.selectionEnd - ta.selectionStart) }; });
    ta.addEventListener('input', (e) => {
      const f = getFile();
      const now = ta.value.length;
      const c = { typed: 0, pasted: 0, deleted: 0, other: 0, undo: 0 };
      const t = (e && e.inputType) || '';
      if (before && t) {
        const diff = now - before.len;
        if (t.startsWith('history')) c.undo += Math.abs(diff);
        else if (t.startsWith('delete')) c.deleted += Math.max(0, -diff);
        else if (t.startsWith('insertFromPaste') || t.startsWith('insertFromDrop')) { c.pasted += Math.max(0, diff + before.sel); c.deleted += before.sel; }
        else { c.typed += Math.max(0, diff + before.sel); c.deleted += before.sel; }
      } else c.other += Math.max(0, now - len); // toolbar buttons
      before = null;
      len = now;
      if (f) this.record(f, c, null);
    });
  }

  record(file, c, getText, getBefore) {
    if (!this.loaded) return;
    const kind = this.kindOf(file);
    if (!kind) return;
    if (!COUNT_KEYS.some((k) => c[k])) return;
    const now = Date.now();
    const path = file.path;
    const fr = this.data.files[path] || (this.data.files[path] = { kind, first: now, totals: emptyStats(), sessions: [] });
    fr.kind = kind;
    let lv = this.live.get(path);
    if (!lv) {
      lv = { last: 0, words: getText ? wordCount(getText()) : null, wordsAt: now, growth: [], session: null, text: null };
      this.live.set(path, lv);
    }
    if (!lv.session || now - lv.last > SESSION_GAP_MS) {
      if (lv.session) this.closeSession(path, lv);
      this.openSession(file, fr, lv, kind, now, getBefore);
    }
    const idle = Math.max(5, Number(this.p.settings.typing.idleSeconds) || 30) * 1000;
    const gap = lv.last ? now - lv.last : Infinity;
    const active = gap <= idle ? gap : 0;
    lv.last = now;
    this.lastPath = path;

    const dk = dayKey();
    const day = this.day(dk, kind);
    const s = lv.session;
    for (const k of COUNT_KEYS) { day[k] += c[k]; fr.totals[k] += c[k]; s[k] += c[k]; }
    day.active += active; fr.totals.active += active; s.active += active;
    fr.last = now;

    if (c.typed) {
      this.recent.push([now, c.typed]);
      const mk = Math.floor(now / 60000);
      if (this.minute.key !== mk) this.minute = { key: mk, kinds: {}, all: 0 };
      this.minute.kinds[kind] = (this.minute.kinds[kind] || 0) + c.typed;
      this.minute.all += c.typed;
      day.peak = Math.max(day.peak, this.minute.kinds[kind]);
      this.data.days[dk].peakAll = Math.max(this.data.days[dk].peakAll || 0, this.minute.all);
    }
    if (getText) {
      lv.text = getText;
      lv.snap = getText; // the editor's text at the last keystroke, used to seal the session
      if (now - lv.wordsAt > 5000) this.countWords(path, lv, kind);
    } else lv.snap = null;
    if (this.pomo && !this.pomo.done) {
      this.pomo.active += active;
      if (this.pomo.active >= this.pomo.target) {
        this.pomo.done = true;
        new Notice(`Pomodoro done: ${Math.round(this.pomo.target / 60000)} minutes of writing. Time for a break.`);
      }
    }
    this.save();
    this.p.statusSoon();
  }
  /* Net words, worked out from the editor text at most every few seconds. */
  countWords(path, lv, kind) {
    if (!lv.text) return;
    const n = wordCount(lv.text());
    lv.text = null;
    lv.wordsAt = Date.now();
    if (lv.words != null) {
      const dk = dayKey();
      this.day(dk, kind).words += n - lv.words;
      const fr = this.data.files[path];
      if (fr) fr.totals.words += n - lv.words;
    }
    lv.words = n;
    if (lv.session) {
      lv.session.endWords = n;
      lv.growth.push([lv.wordsAt - lv.session.start, n]);
      if (lv.growth.length > 240) lv.growth = lv.growth.filter((_, i) => i % 2 === 0);
    }
  }

  /* ---------- sessions and seals ---------- */

  openSession(file, fr, lv, kind, now, getBefore) {
    const s = {
      id: `${this.device}-${now.toString(36)}`, device: this.device, path: file.path, kind,
      start: now, end: now, active: 0, typed: 0, pasted: 0, deleted: 0, other: 0, undo: 0,
      startWords: lv.words, endWords: lv.words, startHash: null, endHash: null, outside: false, open: true,
    };
    fr.sessions.push(s);
    lv.session = s;
    lv.growth = lv.words != null ? [[0, lv.words]] : [];
    /* The note as it was just before this session's first keystroke: from the editor when there is one
       (the disk can lag a couple of seconds behind), otherwise from the disk. */
    const before = getBefore ? Promise.resolve(getBefore()) : this.app.vault.cachedRead(file);
    before.then(async (t) => {
      s.startWords = wordCount(t);
      s.startHash = await sha256(proseOf(t));
      await this.chain; // let the previous session finish sealing first
      const prev = this.lastSeal(file.path, s);
      if (prev && prev.endHash && prev.endHash !== s.startHash) {
        s.outside = true;
        s.outsideFrom = prev.endWords;
      }
      if (lv.growth.length && lv.growth[0][0] === 0) lv.growth[0][1] = s.startWords;
      this.save();
    }).catch(() => { /* note gone */ });
  }
  /* The most recent sealed session for a note, from any device. */
  lastSeal(path, except) {
    let best = null;
    for (const d of this.cachedAll()) {
      const fr = d.files && d.files[path];
      if (!fr) continue;
      for (const s of fr.sessions) if (s !== except && s.endHash && (!best || s.end > best.end)) best = s;
    }
    return best;
  }
  closeSession(path, lv) {
    const s = lv.session;
    lv.session = null;
    if (!s) return;
    this.countWords(path, lv, s.kind);
    s.end = lv.last || s.end;
    s.open = false;
    delete s.pending;
    this.seal(s, false, lv.snap ? lv.snap() : null);
  }
  /* Fingerprints the note and chains the session to the one before. Runs one at a time. */
  seal(s, stale, text) {
    this.chain = this.chain.then(async () => {
      const f = this.app.vault.getAbstractFileByPath(this.findPath(s));
      if (text != null) {
        s.endHash = await sha256(proseOf(text));
        s.endWords = wordCount(text);
      } else if (f instanceof TFile) {
        /* Typed in a Loresmith text box, or left open when the app closed: seal from the note on disk,
           unless it was saved again well after the last keystroke. */
        if (f.stat.mtime > s.end + 30000) s.unsealed = 'The note changed before this session could be sealed.';
        else {
          const t = await this.app.vault.read(f);
          s.endHash = await sha256(proseOf(t));
          s.endWords = wordCount(t);
        }
      } else s.unsealed = 'The note was gone when this session ended.';
      s.prev = this.data.head || '';
      s.link = await sha256(s.prev + JSON.stringify(sealFields(s)));
      this.data.head = s.link;
      s.open = false;
      this.save();
    }).catch((e) => console.error('Loresmith: could not seal a typing session', e));
    return this.chain;
  }
  /* Where a session's note lives now (it may have been renamed since). */
  findPath(s) {
    for (const [path, fr] of Object.entries(this.data.files)) if (fr.sessions.includes(s)) return path;
    return s.path;
  }
  /* Sessions left open when the app last closed. */
  async closeStale() {
    for (const fr of Object.values(this.data.files)) {
      for (const s of fr.sessions) {
        if (!s.open) continue;
        s.open = false;
        const text = s.pending;
        delete s.pending;
        this.seal(s, true, text != null ? text : null);
      }
    }
    await this.chain;
  }
  tick() {
    const now = Date.now();
    for (const [path, lv] of this.live) {
      if (lv.text && now - lv.wordsAt > 5000 && lv.session) this.countWords(path, lv, lv.session.kind);
      if (lv.session && now - lv.last > SESSION_GAP_MS) this.closeSession(path, lv);
    }
  }
  /* Ends every open session now, so a report includes the latest writing. The next keystroke starts a new one. */
  async sealOpen() {
    for (const [path, lv] of this.live) if (lv.session) this.closeSession(path, lv);
    await this.chain;
    await this.write();
  }
  rename(file, old) {
    if (this.data.files[old]) { this.data.files[file.path] = this.data.files[old]; delete this.data.files[old]; this.save(); }
    if (this.live.has(old)) { this.live.set(file.path, this.live.get(old)); this.live.delete(old); }
    if (this.lastPath === old) this.lastPath = file.path;
  }
  /* Keeps the editor text of open sessions in the log, so they can be sealed exactly next time if the app
     is closed before they end. Cleared once sealed. */
  snapshot() {
    for (const [path, lv] of this.live) {
      if (!lv.session) continue;
      if (lv.text) this.countWords(path, lv, lv.session.kind);
      if (lv.snap) lv.session.pending = lv.snap();
    }
    this.write();
  }
  unload() { this.snapshot(); }

  /* ---------- reading ---------- */

  cpm() {
    const cut = Date.now() - 60000;
    this.recent = this.recent.filter(([t]) => t >= cut);
    return this.recent.reduce((n, [, c]) => n + c, 0);
  }
  /* Totals for one day across devices, for the kinds asked for. */
  dayStats(all, key, kinds) {
    const out = emptyStats();
    for (const d of all) {
      const day = d.days && d.days[key];
      if (!day) continue;
      for (const k of kinds) if (day[k]) addStats(out, day[k]);
      if (kinds.length === 3) out.peak = Math.max(out.peak, day.peakAll || 0);
    }
    return out;
  }
  /* A note's totals and sessions across devices. */
  fileRecord(all, path) {
    const totals = emptyStats();
    const sessions = [];
    let kind = null, first = null;
    for (const d of all) {
      const fr = d.files && d.files[path];
      if (!fr) continue;
      addStats(totals, fr.totals);
      kind = fr.kind;
      first = first == null ? fr.first : Math.min(first, fr.first);
      for (const s of fr.sessions) sessions.push(Object.assign({ deviceLabel: d.label || d.device }, s));
    }
    sessions.sort((a, b) => a.start - b.start);
    return sessions.length ? { path, kind, first, totals, sessions } : null;
  }
  /* Checks a device's chain of seals: every seal recomputes, and they link up into one line ending at the head. */
  async verify(d) {
    const sealed = [];
    for (const fr of Object.values(d.files || {})) for (const s of fr.sessions) if (s.link) sealed.push(s);
    let bad = 0;
    for (const s of sealed) if ((await sha256((s.prev || '') + JSON.stringify(sealFields(s)))) !== s.link) bad++;
    const links = new Set(sealed.map((s) => s.link));
    const prevs = new Set(sealed.map((s) => s.prev || ''));
    const broken = sealed.filter((s) => s.prev && !links.has(s.prev)).length;
    const heads = sealed.filter((s) => !prevs.has(s.link));
    const ok = !bad && !broken && (!sealed.length || (heads.length === 1 && heads[0].link === d.head));
    return { device: d.device, label: d.label || d.device, sessions: sealed.length, bad, broken, ok, head: d.head || '' };
  }

  /* ---------- pomodoro ---------- */

  startPomodoro() {
    const min = Math.max(1, Number(this.p.settings.typing.pomodoro) || 25);
    this.pomo = { active: 0, target: min * 60000, done: false, started: Date.now() };
    this.p.statusSoon();
  }
  stopPomodoro() { this.pomo = null; this.p.statusSoon(); }
}

class LoresmithPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    /* Typing log: every editor reports its changes; Loresmith's own text boxes report through trackInput. */
    this.typing = new TypingTracker(this);
    if (CM_VIEW && CM_VIEW.EditorView && CM_VIEW.EditorView.updateListener) {
      this.registerEditorExtension(CM_VIEW.EditorView.updateListener.of((u) => { try { this.typing.onUpdate(u); } catch (e) { console.error('Loresmith: typing log', e); } }));
    }
    this.app.workspace.onLayoutReady(() => this.typing.load());
    this.registerInterval(window.setInterval(() => this.typing.tick(), 30000));
    this.registerEvent(this.app.vault.on('rename', (f, old) => this.typing.rename(f, old)));
    /* Phones and tablets often close apps from the background without warning: save a snapshot on the way out. */
    this.registerDomEvent(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') this.typing.snapshot(); });
    this.statusSoon = debounce(() => this.updateStatusBar(), 1500, false);
    this.addCommand({ id: 'start-pomodoro', name: 'Start pomodoro (counts typing time)', callback: () => this.typing.startPomodoro() });
    this.addCommand({ id: 'authorship-report', name: 'Export authorship report for a story', callback: () => this.pickStory((s) => this.exportAuthorship(s)) });

    this.registerView(VIEW_OVERVIEW, (leaf) => new OverviewView(leaf, this));
    this.registerView(VIEW_ENTITY, (leaf) => new EntityView(leaf, this));
    this.registerView(VIEW_CHAPTERS, (leaf) => new ChaptersView(leaf, this));
    this.registerView(VIEW_WEB, (leaf) => new WebView(leaf, this));
    this.registerView(VIEW_OUTLINE, (leaf) => new OutlineView(leaf, this));
    this.registerView(VIEW_PANEL, (leaf) => new PanelView(leaf, this));

    this.addRibbonIcon('library', 'Open lore overview', () => this.openOverview());
    this.addRibbonIcon('book-marked', 'Open lore sidebar', () => this.openPanel());

    this.addCommand({ id: 'open-overview', name: 'Open overview', callback: () => this.openOverview() });
    this.addCommand({ id: 'open-panel', name: 'Open sidebar panel', callback: () => this.openPanel() });
    this.addCommand({
      id: 'scene-cast', name: 'Characters in this scene',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f || this.typeOf(f) !== 'scene') return false;
        if (!checking) new CastModal(this.app, this, f).open();
        return true;
      },
    });
    this.addCommand({ id: 'add-characters-property', name: 'Add an empty characters property to scenes that lack one', callback: () => this.addCastProperty() });
    this.addCommand({ id: 'new-entry', name: 'Create entry', callback: () => new TypeSuggest(this.app, (t) => this.promptCreate(t)).open() });
    this.addCommand({ id: 'new-character', name: 'Create character', callback: () => this.promptCreate('character') });
    this.addCommand({ id: 'new-story', name: 'Create story', callback: () => this.promptCreate('story') });
    this.addCommand({ id: 'new-event', name: 'Create event', callback: () => this.promptCreate('event') });
    this.addCommand({ id: 'new-holiday', name: 'Create holiday', callback: () => this.promptCreate('holiday') });
    this.addCommand({ id: 'new-arc', name: 'Create plot arc', callback: () => this.promptCreate('arc') });
    this.addCommand({ id: 'new-creature', name: 'Create creature', callback: () => this.promptCreate('creature') });
    this.addCommand({ id: 'new-plant', name: 'Create plant', callback: () => this.promptCreate('plant') });
    this.addCommand({ id: 'move-classification', name: 'Move a whole classification of species to the Bestiary or Flora', callback: () => this.moveClassification() });
    this.addCommand({ id: 'open-web', name: 'Open relations web', callback: () => this.openWeb() });
    this.addCommand({ id: 'open-timeline', name: 'Open timeline', callback: () => this.openOverview('timeline') });
    this.addCommand({ id: 'open-goals', name: 'Open writing log (goals, typing time, authorship)', callback: () => this.openOverview('goals') });
    this.addCommand({
      id: 'open-outline', name: 'Open story outline',
      callback: () => {
        const f = this.app.workspace.getActiveFile();
        const story = f && this.storyFor(f);
        if (story) this.openOutline(story);
        else this.pickStory((s) => this.openOutline(s));
      },
    });
    this.addCommand({
      id: 'switch-project', name: 'Switch project',
      callback: () => new ProjectSuggest(this.app, this, async (name) => {
        this.settings.activeProject = name;
        await this.saveSettings();
        this.refreshOverviews();
      }).open(),
    });
    this.addCommand({
      id: 'open-in-editor', name: 'Open current note in lore editor',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const t = f && this.typeOf(f);
        if (!t || t === 'scene' || t === 'note') return false;
        if (!checking) this.openEntity(f, t);
        return true;
      },
    });
    // Dictionary: hover a word in a scene to see its meaning. Cache is dropped whenever notes change.
    const dropWords = () => { this._words = null; this._scan = undefined; this.dropGraph(); };
    /* The calendar note's text is kept in memory so dates can be worked out without waiting on a read.
       Registered before the views' own listeners, so they redraw with the new calendar. */
    this.registerEvent(this.app.metadataCache.on('changed', (f, data, cache) => {
      const isCal = String(((cache && cache.frontmatter) || {}).type || '').toLowerCase() === 'calendar';
      this._calTexts = this._calTexts || new Map();
      if (isCal || this._calTexts.has(f.path)) {
        if (isCal) this._calTexts.set(f.path, data); else this._calTexts.delete(f.path);
        this.dropCalendar();
      } else if (this.typeOf(f) === 'holiday' || (this._calModel && this._calModel.holidays.some((h) => h.file === f))) this.dropCalendar();
    }));
    const dropCal = (f, old) => {
      if (this._calTexts && (this._calTexts.has(f.path) || this._calTexts.has(old))) { this._calTexts.delete(old); this._calTexts.delete(f.path); }
      this.dropCalendar();
    };
    this.registerEvent(this.app.vault.on('rename', dropCal));
    this.registerEvent(this.app.vault.on('delete', dropCal));
    this.registerEvent(this.app.metadataCache.on('changed', dropWords));
    this.registerEvent(this.app.vault.on('rename', dropWords));
    this.registerEvent(this.app.vault.on('rename', (f, oldPath) => { window.setTimeout(() => this.fixRoleLinks(f, oldPath), 1500); }));
    this.registerEvent(this.app.vault.on('delete', dropWords));
    if (CM_VIEW && CM_VIEW.hoverTooltip) {
      this.registerEditorExtension(CM_VIEW.hoverTooltip((view, pos) => this.wordTooltip(view, pos), { hoverTime: 350 }));
    }
    this.addCommand({ id: 'new-word', name: 'Create dictionary word', callback: () => this.promptCreate('word') });
    this.addCommand({ id: 'new-language', name: 'Create language', callback: () => this.promptCreate('language') });
    this.addCommand({ id: 'name-builder', name: 'Name builder', callback: () => new NameBuilderModal(this.app, this).open() });
    this.addCommand({ id: 'install-generator-tables', name: 'Install or update generator tables', callback: () => this.installGeneratorTables() });
    for (const [k, g] of Object.entries(GENERATORS)) {
      this.addCommand({ id: `generate-${k}`, name: `Generate: ${g.label.toLowerCase()}`, callback: () => this.openOverview(`gen:${k}`) });
    }
    this.addCommand({ id: 'open-calendar', name: 'Open calendar', callback: () => this.openOverview('calendar') });
    this.addCommand({ id: 'open-calendar-note', name: 'Open calendar note (months, holidays, history)', callback: () => this.openCalendarNote() });
    this.addCommand({ id: 'open-meetings', name: 'Open who has met whom', callback: () => this.openOverview('meetings') });
    this.addCommand({ id: 'sync-links', name: 'Make relationship links two-way', callback: () => this.syncLinks() });
    for (const [kind, label] of [['docx', 'Export manuscript (.docx)'], ['epub', 'Export ebook (.epub)']]) {
      this.addCommand({
        id: `export-${kind}`, name: label,
        callback: () => {
          const f = this.app.workspace.getActiveFile();
          const story = f && this.storyFor(f);
          if (story) this.exportStory(story, kind);
          else this.pickStory((s) => this.exportStory(s, kind));
        },
      });
    }
    this.addCommand({
      id: 'open-chapters', name: 'Open chapters for current story',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const story = f && this.storyFor(f);
        if (!story) return false;
        if (!checking) this.openChapters(story);
        return true;
      },
    });

    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile)) return;
      const t = this.typeOf(file);
      if (t && t !== 'scene' && t !== 'note' && t !== 'outline') {
        menu.addItem((i) => i.setTitle('Open in lore editor').setIcon('library').onClick(() => this.openEntity(file, t)));
      }
      const story = this.storyFor(file);
      if (story) {
        menu.addItem((i) => i.setTitle('Open chapters board').setIcon('list-tree').onClick(() => this.openChapters(story)));
        menu.addItem((i) => i.setTitle('Open outline').setIcon('list-ordered').onClick(() => this.openOutline(story)));
      }
    }));

    this.addSettingTab(new LoresmithSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => { const f = this.calNoteFile(); if (f) this.loadCalText(f); });

    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('ls-status-bar', 'mod-clickable');
    this.statusEl.addEventListener('click', () => this.openOverview('goals'));
    this.saveSoon = debounce(() => this.saveSettings(), 3000, true);
    this.initWordTracker();
  }

  async loadSettings() {
    const data = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.settings.layouts = Object.assign({}, data.layouts);
    this.settings.timeline = Object.assign({}, DEFAULT_SETTINGS.timeline, data.timeline);
    const web = data.web || {};
    this.settings.web = Object.assign({}, DEFAULT_SETTINGS.web, web);
    this.settings.web.edges = Object.assign({}, DEFAULT_SETTINGS.web.edges, web.edges);
    this.settings.web.types = Array.isArray(web.types) ? web.types.filter((t) => TYPES[t]) : [...DEFAULT_SETTINGS.web.types];
    this.settings.webPins = Object.assign({}, data.webPins);
    this.settings.wordLog = Object.assign({}, data.wordLog);
    this.settings.typing = Object.assign({}, DEFAULT_SETTINGS.typing, data.typing);
    if (!Array.isArray(this.settings.typing.kinds) || !this.settings.typing.kinds.length) this.settings.typing.kinds = [...DEFAULT_SETTINGS.typing.kinds];
    this.settings.customStructures = Object.assign({}, data.customStructures);
    this.settings.presentYears = Object.assign({}, data.presentYears);
    this.settings.calendars = Object.assign({}, data.calendars);
    const cv = data.calendarView || {};
    this.settings.calendarView = { mode: cv.mode === 'month' ? 'month' : 'year', show: Object.assign({}, cv.show) };
    this.settings.manuscript = Object.assign({}, DEFAULT_SETTINGS.manuscript, data.manuscript);
    this.settings.sheetGroups = Object.assign({}, data.sheetGroups);
    this.settings.groupBy = Object.assign({}, data.groupBy);
    this.settings.foldedGroups = Object.assign({}, data.foldedGroups);
    this.settings.meet = Object.assign({}, DEFAULT_SETTINGS.meet, data.meet);
    this.settings.peopleView = Object.assign({}, data.peopleView);
    /* 0.7: "family" used to include other relatives; siblings now have their own line. */
    if (web.edges && !('sibling' in web.edges)) this.settings.web.edges.sibling = this.settings.web.edges.family !== false;
  }
  async saveSettings() { this._graph = null; this.dropCalendar(); await this.saveData(this.settings); if (this.statusEl) this.updateStatusBar(); }

  /* ---------- in-world dates: calendar, eras, ages, "years ago" ---------- */

  eras() { return this.calModel().eras; }
  negEras() { return this.eras().neg; }

  /* -300 -> "300 BC", 1023 -> "1023 AC" (or "1023" with no forward era label). */
  fmtYear(y) {
    if (y == null) return '';
    const e = this.eras();
    if (y < 0) return `${-y} ${e.neg[0] || 'BC'}`;
    return e.fwd ? `${y} ${e.fwd}` : String(y);
  }
  /* Whole calendar years from year a to year b. Without a year 0, 1 BC to 1 AC is one year, not two. */
  yearsBetween(a, b) {
    let d = b - a;
    if (!this.eras().zero) {
      if (a < 0 && b > 0) d -= 1;
      else if (a > 0 && b < 0) d += 1;
    }
    return d;
  }

  /* The project's calendar note: a note with type: calendar directly in the project folder. */
  calNoteFile() {
    const root = this.projectPath();
    const folder = root && this.app.vault.getAbstractFileByPath(root);
    if (!(folder instanceof TFolder)) return null;
    return folder.children.find((c) => c instanceof TFile && c.extension === 'md' && String(this.fm(c).type || '').toLowerCase() === 'calendar') || null;
  }
  /* What the old settings boxes held for this project, used until the project has a calendar note. */
  legacyCalSource() {
    const s = this.settings;
    const proj = s.activeProject;
    const raw = (s.calendars && s.calendars[proj]) || {};
    const negs = String(s.negativeEras || '').trim();
    return {
      months: raw.months || '', weekdays: raw.weekdays || '', moons: raw.moons || '', holidays: raw.holidays || '',
      present: (s.presentYears && s.presentYears[proj]) || '',
      custom: calLines(raw.months).length > 0,
      customEras: (negs && negs !== 'BC, BCE') || !!String(s.forwardEra || '').trim() || !!s.yearZero,
      negativeEras: negs || 'BC, BCE', forwardEra: s.forwardEra || '', yearZero: !!s.yearZero,
    };
  }
  /* The calendar model, rebuilt when the calendar note or settings change. */
  calModel() {
    if (this._calModel) return this._calModel;
    this._calTexts = this._calTexts || new Map();
    const f = this.calNoteFile();
    let model;
    if (f) {
      let text = this._calTexts.get(f.path);
      if (text == null) { this.loadCalText(f); text = ''; }
      model = buildCalModel(this.fm(f), splitFm(text).body, f.path);
    } else {
      const old = this.legacyCalSource();
      model = buildCalModel(readFm(calendarTemplate(old)), splitFm(calendarTemplate(old)).body, null);
    }
    /* Holiday entries (the Holidays tab) join the ones written in the calendar note's History section. */
    if (!model.broken) for (const f of this.index().holiday) {
      const h = this.holidayFromNote(f, model.eras.neg);
      if (h) model.holidays.push(h);
    }
    model.years = new Map();
    model.before = new Map();
    this._calModel = model;
    return model;
  }
  /* A Holiday entry as a calendar rule. "Last held" is the last year it was kept, so it stops the year after. */
  holidayFromNote(f, neg) {
    const h = this.holidayFromFm(this.fm(f), f.basename, neg);
    if (h) h.file = f;
    return h;
  }
  holidayFromFm(fm, name, neg) {
    const ruleText = String(fm.date || '').trim();
    const rule = parseDayRule(ruleText);
    if (!rule) return null;
    const from = fm.first_held != null && String(fm.first_held).trim() ? parseYear(fm.first_held, neg) : null;
    const lastHeld = fm.last_held != null && String(fm.last_held).trim() ? parseYear(fm.last_held, neg) : null;
    return {
      kind: 'holiday', name, rule, ruleText, note: fm.kind ? String(fm.kind) : '',
      from, to: lastHeld == null ? null : lastHeld + 1, lastHeld,
      days: Math.max(1, Math.round(Number(fm.days)) || 1), file: null, keptBy: toArr(fm.kept_by),
    };
  }
  /* Day of the year a holiday falls on in year y, or null if it isn't held that year or its date can't be read. */
  holidayDay(h, y, cal) {
    cal = cal || this.calendar(y);
    if (!cal) return null;
    if (h.from != null && y < h.from) return null;
    if (h.to != null && y >= h.to) return null;
    const k = h.rule.month.toLowerCase().replace(/\.$/, '');
    const m = cal.months.find((x) => x.name.toLowerCase() === k || x.aliases.some((a) => a.toLowerCase() === k));
    if (!m) return null;
    if (h.rule.kind === 'date') return h.rule.day >= 1 && h.rule.day <= m.days ? m.start + h.rule.day : null;
    if (!cal.weekdays.length) return null;
    const want = cal.weekdays.findIndex((w) => w.toLowerCase() === h.rule.weekday.toLowerCase());
    if (want < 0) return null;
    const len = cal.weekdays.length;
    const firstWd = mod(this.daysBefore(y) + m.start - cal.wdBase, len);
    const first = 1 + mod(want - firstWd, len);
    const day = h.rule.n > 0 ? first + (h.rule.n - 1) * len : first + Math.floor((m.days - first) / len) * len;
    return day <= m.days ? m.start + day : null;
  }
  /* Lines for a holiday's page: when it next falls, how long it has been kept, or why its date can't be read. */
  holidaySummary(fm, file) {
    const raw = String(fm.date || '').trim();
    if (!raw) return ['Set "When" to put it on the calendar: a day and month like "1 Frostmoon", or "last Moonday of Seedtime".'];
    const h = this.holidayFromFm(fm, file ? file.basename : 'It', this.negEras());
    if (!h) return [`Can't read "${raw}". Write a day and month ("1 Frostmoon", "Frostmoon 1"), or a weekday rule ("last Moonday of Seedtime"), with no year.`];
    const now = this.latestPresent() || { y: h.from != null ? h.from : 1, d: null };
    const cal = this.calendar(now.y);
    if (!cal) return ['Your custom calendar has no months yet, so this can\'t be placed.'];
    const lines = [];
    const k = h.rule.month.toLowerCase().replace(/\.$/, '');
    const month = cal.months.find((x) => x.name.toLowerCase() === k || x.aliases.some((a) => a.toLowerCase() === k));
    if (!month && !(h.from != null && h.from > now.y)) lines.push(`"${h.rule.month}" isn't a month on your calendar in ${this.fmtYear(now.y)}.`);
    if (h.rule.kind === 'nth' && cal.weekdays.length && !cal.weekdays.some((w) => w.toLowerCase() === h.rule.weekday.toLowerCase())) {
      lines.push(`"${h.rule.weekday}" isn't one of your weekdays (${cal.weekdays.join(', ')}).`);
    }
    if (h.from != null && h.lastHeld != null && h.lastHeld < h.from) lines.push('"Last held" is before "First held".');
    if (lines.length) return lines;
    const ago = (y) => this.agoText({ y, d: null }, now);
    if (h.lastHeld != null && h.lastHeld < now.y) {
      lines.push(`No longer kept: last held in ${this.fmtYear(h.lastHeld)}, ${ago(h.lastHeld)}.`);
      if (h.from != null) lines.push(`It was kept for ${fmtNum(this.yearsBetween(h.from, h.lastHeld) + 1)} years.`);
      return lines;
    }
    const next = this.nextHoliday(h, now);
    if (next) {
      const wd = this.weekdayOf(next);
      const when = `${wd ? wd + ', ' : ''}${this.dateText(next)}`;
      const today = now.d != null && next.y === now.y && next.d === now.d;
      lines.push(today ? `Falls on the present day: ${when}.` : `Next: ${when}${h.days > 1 ? ` (${h.days} days)` : ''}.`);
    } else lines.push('It never falls on a day in the coming years: check the date.');
    if (h.from != null && h.from <= now.y) lines.push(`Kept since ${this.fmtYear(h.from)} (${fmtNum(this.yearsBetween(h.from, now.y))} years as of ${now.raw}).`);
    else if (h.from != null) lines.push(`First held in ${this.fmtYear(h.from)}, ${ago(h.from)}.`);
    if (h.lastHeld != null) lines.push(`Last held in ${this.fmtYear(h.lastHeld)}.`);
    return lines;
  }
  /* The next time a holiday is held, on or after `from` (a point), looking up to 400 years ahead. */
  nextHoliday(h, from) {
    for (let y = from.y, i = 0; i < 400; i++, y = y === -1 && !this.eras().zero ? 1 : y + 1) {
      if (h.to != null && y >= h.to) return null;
      const d = this.holidayDay(h, y);
      if (d != null && (y > from.y || from.d == null || d >= from.d)) return { y, d };
    }
    return null;
  }
  loadCalText(f) {
    this._calLoading = this._calLoading || new Set();
    if (this._calLoading.has(f.path)) return;
    this._calLoading.add(f.path);
    this.app.vault.cachedRead(f).then((t) => {
      this._calTexts.set(f.path, t);
      this._calLoading.delete(f.path);
      this.dropCalendar();
      this.rerenderViews();
    }, () => this._calLoading.delete(f.path));
  }
  dropCalendar() { this._calModel = null; this._scan = undefined; }
  rerenderViews() {
    for (const type of [VIEW_OVERVIEW, VIEW_PANEL, VIEW_ENTITY]) {
      for (const l of this.app.workspace.getLeavesOfType(type)) {
        const v = l.view;
        if (!v) continue;
        if (type === VIEW_ENTITY && v.softRefresh) v.softRefresh(); // keeps anything being typed
        else if (v.requestRender) v.requestRender();
        else if (v.render) v.render();
      }
    }
  }
  /* Creates the calendar note if the project has none yet, carrying over the old settings. */
  async ensureCalendarNote() {
    const existing = this.calNoteFile();
    if (existing) return existing;
    const root = this.projectPath();
    if (!root) { new Notice('Create a project first.'); return null; }
    let path = normalizePath(`${root}/Calendar.md`);
    if (this.app.vault.getAbstractFileByPath(path)) path = normalizePath(`${root}/World calendar.md`);
    if (this.app.vault.getAbstractFileByPath(path)) { new Notice(`"${path}" already exists and isn't a calendar note.`); return null; }
    const text = calendarTemplate(this.legacyCalSource());
    const indexed = this.nextMetaChange(path);
    const f = await this.app.vault.create(path, text);
    this._calTexts = this._calTexts || new Map();
    this._calTexts.set(f.path, text);
    await indexed;
    this.dropCalendar();
    return f;
  }
  /* Resolves once Obsidian has re-read the note at `path` (or after a moment, whichever comes first). */
  nextMetaChange(path) {
    return new Promise((resolve) => {
      let ref = null;
      const done = () => { if (ref) this.app.metadataCache.offref(ref); ref = null; resolve(); };
      ref = this.app.metadataCache.on('changed', (f) => { if (f.path === path) done(); });
      window.setTimeout(done, 2000);
    });
  }
  async openCalendarNote() {
    const f = await this.ensureCalendarNote();
    if (f) await this.openNote(f);
  }
  /* Sets calendar note properties (creating the note if needed): { custom_calendar: true, present: '1023 AC' }. */
  async setCalendarProps(props) {
    const f = await this.ensureCalendarNote();
    if (!f) return;
    const indexed = this.nextMetaChange(f.path);
    await this.app.fileManager.processFrontMatter(f, (fm) => Object.assign(fm, props));
    await indexed;
    this.dropCalendar();
    this.rerenderViews();
  }

  /* Days from the first day of year 1 to the first day of year y, across every calendar change. */
  daysBefore(y) {
    const model = this.calModel();
    if (model.before.has(y)) return model.before.get(y);
    const zero = model.eras.zero;
    const segs = model.monthSets;
    const span = (seg, a, b) => (seg.modern
      ? gregDaysBefore(astroYear(b, zero)) - gregDaysBefore(astroYear(a, zero))
      : this.yearsBetween(a, b) * seg.yearDays);
    const between = (a, b) => {
      let t = 0;
      segs.forEach((s, i) => {
        const lo = Math.max(a, s.from);
        const hi = Math.min(b, i + 1 < segs.length ? segs[i + 1].from : Infinity);
        if (lo < hi) t += span(s, lo, hi);
      });
      return t;
    };
    const n = y >= 1 ? between(1, y) : -between(y, 1);
    model.before.set(y, n);
    return n;
  }

  /* The calendar in force in year y: { months, byLength, yearDays, weekdays, moons, holidays, modern }, or null
     when a custom calendar has no months yet. Without y, the present year. */
  calendar(y) {
    const model = this.calModel();
    if (model.broken) return null;
    if (y == null) { const now = this.latestPresent(); y = now ? now.y : 1; }
    if (model.years.has(y)) return model.years.get(y);
    let seg = model.monthSets[0];
    for (const s of model.monthSets) if (s.from <= y) seg = s;
    let ws = null;
    for (const s of model.weekSets) if (s.from <= y) ws = s;

    const src = seg.modern
      ? MODERN_MONTHS.map(([name, days, aliases], i) => ({ name, aliases, days: i === 1 && isLeapYear(astroYear(y, model.eras.zero)) ? 29 : days }))
      : seg.months;
    const months = [];
    let start = 0;
    for (const m of src) { months.push({ name: m.name, aliases: m.aliases || [], days: m.days, start, index: months.length }); start += m.days; }
    const byLength = [];
    for (const m of months) for (const name of [m.name, ...m.aliases]) {
      const esc = reEsc(name);
      byLength.push({
        name, m,
        before: new RegExp('(\\d+)(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + esc + '\\.?(?![\\p{L}])', 'iu'),
        /* "July 4, 2026", "July 4th", "July 4 2026". No lookbehind: older iPad Safari can't compile it. */
        after: new RegExp('(?:^|[^\\p{L}])' + esc + '\\.?\\s+(\\d{1,3})(?!\\d)(?:st|nd|rd|th)?(?=\\s*,|\\s+\\d|\\s*$)', 'iu'),
        any: new RegExp('(?:^|[^\\p{L}])' + esc + '(?![\\p{L}])', 'iu'),
      });
    }
    byLength.sort((a, b) => b.name.length - a.name.length);

    const cal = {
      months, byLength, yearDays: start, modern: !!seg.modern,
      weekdays: ws ? ws.list : [],
      wdBase: ws ? (ws.base != null ? ws.base : this.daysBefore(ws.from)) : 0,
      moons: model.moons, holidays: [],
    };
    model.years.set(y, cal);

    /* Holidays kept this year. The end year is the first year it is no longer held. */
    for (const h of model.holidays) {
      const doy = this.holidayDay(h, y, cal);
      if (doy == null) continue;
      const days = h.days || 1;
      for (let i = 0; i < days && doy + i <= cal.yearDays; i++) {
        const m = months.find((x) => doy + i > x.start && doy + i <= x.start + x.days);
        cal.holidays.push({
          month: m.index, day: doy + i - m.start,
          name: i ? `${h.name} (day ${i + 1})` : h.name, base: h.name, note: h.note, doy: doy + i, part: i + 1, of: days,
          from: h.from, to: h.to, lastHeld: h.lastHeld, file: h.file || null,
        });
      }
    }
    return cal;
  }

  /* Finds "12 Frostmoon", "Frostmoon 12, ...", "July 4th" or "2026-07-04" in a date and returns its day of the year, 1-based. */
  dayOfYear(v, y) {
    if (v == null || typeof v === 'number') return null;
    const s = String(v);
    if (y == null) y = parseYear(s, this.negEras());
    const cal = y == null ? null : this.calendar(y);
    if (!cal) return null;
    const iso = s.match(/^\s*-?\d{1,6}-(\d{1,2})-(\d{1,2})(?!\d)/);
    if (iso) {
      const m = cal.months[Number(iso[1]) - 1];
      if (m) { const day = Math.min(Math.max(Number(iso[2]), 1), m.days); return { doy: m.start + day, month: m.index, day, monthOnly: false }; }
    }
    for (const e of cal.byLength) {
      const hit = s.match(e.before) || s.match(e.after);
      if (!hit && !e.any.test(s)) continue;
      const m = e.m;
      const day = hit ? Math.min(Math.max(Number(hit[1]), 1), m.days) : 1;
      return { doy: m.start + day, month: m.index, day, monthOnly: !hit };
    }
    return null;
  }
  /* A point in time: { y, d (day of year or null), raw }. Accepts numbers, free-text dates, or points. */
  toPt(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'object' && 'y' in v) return v;
    const y = parseYear(v, this.negEras());
    if (y == null) return null;
    const day = this.dayOfYear(v, y);
    return { y, d: day && !day.monthOnly ? day.doy : null, raw: typeof v === 'number' ? this.fmtYear(v) : String(v).trim() };
  }
  cmpPt(a, b) {
    if (a.y !== b.y) return a.y - b.y;
    return a.d != null && b.d != null ? a.d - b.d : 0;
  }
  /* Full years from a to b, counting the day of the year when both dates have one. */
  spanYears(a, b) {
    a = this.toPt(a); b = this.toPt(b);
    let n = this.yearsBetween(a.y, b.y);
    if (a.d != null && b.d != null) {
      if (n > 0 && b.d < a.d) n -= 1;
      else if (n < 0 && b.d > a.d) n += 1;
    }
    return n;
  }
  /* Days since the first day of year 1, for weekdays and moon phases. */
  absDay(pt) {
    if (!pt || pt.d == null || !this.calendar(pt.y)) return null;
    return this.daysBefore(pt.y) + (pt.d - 1);
  }
  weekdayOf(pt) {
    const cal = pt && this.calendar(pt.y);
    const n = this.absDay(pt);
    if (!cal || n == null || !cal.weekdays.length) return null;
    return cal.weekdays[mod(n - cal.wdBase, cal.weekdays.length)];
  }
  moonsOf(pt) {
    const cal = pt && this.calendar(pt.y);
    const n = this.absDay(pt);
    if (!cal || n == null) return [];
    return cal.moons.map((m) => {
      const pos = mod(n - m.offset, m.cycle); // at the start of the day
      const frac = mod(pos + 0.5, m.cycle) / m.cycle; // drawn as it looks at midday
      const i = Math.floor(frac * 8 + 0.5) % 8;
      /* The exact new, quarter or full moon happens during this day. */
      let exact = null;
      for (const k of [0, 2, 4, 6]) if (mod((k / 8) * m.cycle - pos, m.cycle) < 1) exact = k;
      const toFull = Math.round(mod(m.cycle / 2 - pos - 0.5, m.cycle));
      return { name: m.name, phase: MOON_PHASES[i], index: i, frac, exact, toFull: toFull >= Math.round(m.cycle) ? 0 : toFull };
    });
  }
  holidayInfoOf(pt) {
    const cal = pt && pt.d != null && this.calendar(pt.y);
    if (!cal) return [];
    return cal.holidays.filter((h) => h.doy === pt.d);
  }
  holidaysOf(pt) { return this.holidayInfoOf(pt).map((h) => h.name); }
  /* "Moonday, Selune full, Midwinter Feast" for a dated scene. */
  describeDay(pt) {
    pt = this.toPt(pt);
    if (!pt || pt.d == null) return '';
    const out = [];
    const wd = this.weekdayOf(pt);
    if (wd) out.push(wd);
    for (const m of this.moonsOf(pt)) out.push(`${m.name}: ${m.phase.toLowerCase()}`);
    out.push(...this.holidaysOf(pt));
    return out.join(', ');
  }
  /* "6 October 2026" for a point on the calendar. */
  dateText(pt) {
    const cal = pt && pt.d != null && this.calendar(pt.y);
    if (!cal) return pt ? this.fmtYear(pt.y) : '';
    const m = cal.months.find((x) => pt.d > x.start && pt.d <= x.start + x.days) || cal.months[0];
    return `${pt.d - m.start} ${m.name}${cal.modern && !this.eras().custom ? ' ' : ', '}${this.fmtYear(pt.y)}`;
  }

  /* The calendar's own history, for the timeline and calendar: holidays starting and ending, calendar changes, notes. */
  calendarHistory() {
    const model = this.calModel();
    const out = [];
    for (const h of model.holidays) {
      const meta = [h.ruleText, h.note].filter(Boolean).join(', ');
      const extra = { file: h.file || null, who: h.keptBy || [] };
      if (h.from != null) out.push(Object.assign({ year: h.from, d: null, title: `${h.name} first held`, meta }, extra));
      if (h.lastHeld != null) out.push(Object.assign({ year: h.lastHeld, d: null, title: `${h.name} last held`, meta }, extra));
      else if (h.to != null) out.push(Object.assign({ year: h.to, d: null, title: `${h.name} no longer held`, meta }, extra));
    }
    for (const s of model.monthSets) {
      if (s.from === -Infinity) continue;
      out.push({ year: s.from, d: null, title: s.modern ? 'The modern calendar is adopted' : `A new calendar: ${s.months.length} months`, meta: s.modern ? '' : s.months.map((m) => m.name).join(', ') });
    }
    for (const s of model.weekSets) {
      if (s.from === -Infinity) continue;
      out.push({ year: s.from, d: null, title: `A new week: ${s.list.length} days`, meta: s.list.join(', ') });
    }
    for (const n of model.notes) {
      const pt = this.toPt(n.when);
      if (pt) out.push({ year: pt.y, d: pt.d, title: n.text, meta: n.when !== String(pt.y) ? n.when : '', when: n.when });
    }
    return out;
  }

  /* "Now" in the world. The calendar note's present date; or today, on the modern calendar with modern eras,
     as long as nothing in the project has a date of its own. */
  explicitPresent() { return this.toPt(this.calModel().present); }
  defaultPresent() {
    const model = this.calModel();
    if (model.custom || model.eras.custom) return null;
    const t = new Date();
    return this.toPt(`${t.getDate()} ${MODERN_MONTHS[t.getMonth()][0]} ${t.getFullYear()}`);
  }
  /* The latest story, chapter or scene date in the project, or null. Kept until a note changes. */
  scanPresent() {
    if (this._scan !== undefined && this._scanKey === this.settings.activeProject) return this._scan;
    let best = null;
    const take = (v) => { const p = this.toPt(v); if (p && (!best || this.cmpPt(p, best) > 0)) best = p; };
    const root = this.projectPath();
    if (root) {
      for (const f of this.app.vault.getMarkdownFiles()) {
        if (!f.path.startsWith(root + '/')) continue;
        const fm = this.fm(f);
        if (fm.present_year != null) take(fm.present_year);
        if (fm.chapter_years && typeof fm.chapter_years === 'object') for (const v of Object.values(fm.chapter_years)) take(v);
      }
    }
    this._scan = best;
    this._scanKey = this.settings.activeProject;
    return best;
  }
  projectPresent() { return this.explicitPresent() || (this.scanPresent() ? null : this.defaultPresent()); }
  storyPresent(story) { return story ? this.toPt(this.fm(story).present_year) : null; }
  chapterPresent(story, chapter) {
    const map = story && this.fm(story).chapter_years;
    return map && typeof map === 'object' ? this.toPt(map[chapter]) : null;
  }
  /* When a scene (or story) takes place: scene, then its chapter, then the story, then the project. */
  presentOf(file) {
    const story = this.storyFor(file);
    if (file !== story) {
      const own = this.toPt(this.fm(file).present_year);
      if (own) return own;
      if (story && file.parent && file.parent.parent === story.parent) {
        const ch = this.chapterPresent(story, file.parent.name);
        if (ch) return ch;
      }
    }
    return this.storyPresent(story) || this.projectPresent();
  }
  /* The latest present date anywhere in the project. Ages and "years ago" are measured from here. */
  latestPresent() {
    let best = this.explicitPresent();
    const scan = this.scanPresent();
    if (scan && (!best || this.cmpPt(scan, best) > 0)) best = scan;
    return best || this.defaultPresent();
  }
  /* "Age 34 in 1023 AC", "Died aged 41", "Not born yet in 990 AC", or null with no birth year. */
  ageText(fm, at) {
    const born = this.toPt(fm.born);
    if (!born) return null;
    const died = this.toPt(fm.died);
    at = this.toPt(at);
    if (died && (!at || this.cmpPt(died, at) <= 0)) return `Died aged ${this.spanYears(born, died)}`;
    if (!at) return null;
    if (this.cmpPt(at, born) < 0) return `Not born yet in ${this.fmtYear(at.y)}`;
    return `Age ${this.spanYears(born, at)} in ${this.fmtYear(at.y)}`;
  }
  /* Short form for scene lists: { text: 'age 34' } or a warning when the scene falls outside their life. */
  ageShort(fm, at) {
    const born = this.toPt(fm.born);
    at = this.toPt(at);
    if (!born || !at) return null;
    const died = this.toPt(fm.died);
    if (this.cmpPt(at, born) < 0) return { text: 'not born yet', warn: true };
    if (died && this.cmpPt(at, died) > 0) return { text: 'after death', warn: true };
    return { text: `age ${this.spanYears(born, at)}`, warn: false };
  }
  agoText(from, at) {
    from = this.toPt(from); at = this.toPt(at);
    if (!from || !at) return '';
    const d = this.spanYears(from, at);
    if (d === 0) return 'this year';
    if (d > 0) return `${fmtNum(d)} year${d === 1 ? '' : 's'} ago`;
    return `in ${fmtNum(-d)} year${d === -1 ? '' : 's'}`;
  }
  /* ---------- dictionary ---------- */

  /* Names of the languages a word is in (or any other link field), falling back to the link text. */
  languageNames(f, key) {
    return toArr(this.fm(f)[key || 'language']).map((s) => { const d = this.resolveLink(s, f); return d ? d.basename : linkText(s); }).filter(Boolean);
  }
  /* Lowercase word (name and other forms) -> its dictionary entry, for the active project. Rebuilt on change.
     The same spelling in two languages keeps every entry in _wordsAll; the map itself holds the first. */
  wordIndex() {
    if (this._words) return this._words;
    const map = new Map();
    const all = new Map();
    for (const f of this.index().word) {
      for (const w of [f.basename, ...toArr(this.fm(f).aliases)]) {
        const k = String(w).trim().toLowerCase();
        if (!k) continue;
        if (!map.has(k)) map.set(k, f);
        const list = all.get(k) || [];
        if (!list.includes(f)) list.push(f);
        all.set(k, list);
      }
    }
    this._words = map;
    this._wordsAll = all;
    return map;
  }
  wordsIn(text) {
    const idx = this.wordIndex();
    if (!idx.size) return [];
    const found = new Map();
    const body = splitFm(text).body.replace(/%%[\s\S]*?%%/g, '');
    for (const m of body.matchAll(/[\p{L}\p{M}'’-]+/gu)) {
      const f = idx.get(m[0].toLowerCase()) || idx.get(m[0].toLowerCase().replace(/['’]s$/, ''));
      if (f) found.set(f, (found.get(f) || 0) + 1);
    }
    return [...found.keys()].sort((a, b) => natural(a.basename, b.basename));
  }
  wordTooltip(view, pos) {
    if (EDITOR_INFO) {
      const info = view.state.field(EDITOR_INFO, false);
      if (info && info.file && !this.underRoot(info.file.path)) return null;
    }
    const range = view.state.wordAt(pos);
    if (!range) return null;
    const key = view.state.sliceDoc(range.from, range.to).toLowerCase();
    if (!this.wordIndex().has(key)) return null;
    const entries = this._wordsAll.get(key) || [this.wordIndex().get(key)];
    return {
      pos: range.from, end: range.to, above: true,
      create: () => {
        const dom = createDiv('ls-word-tip');
        for (const f of entries) {
          const fm = this.fm(f);
          const box = dom.createDiv('ls-word-tip-entry');
          const head = box.createDiv('ls-word-tip-head');
          head.createSpan({ cls: 'ls-word-tip-name', text: f.basename });
          if (fm.pronunciation) head.createSpan({ cls: 'ls-word-tip-say', text: `/${fm.pronunciation}/` });
          if (fm.part_of_speech) box.createDiv({ cls: 'ls-word-tip-pos', text: String(fm.part_of_speech) });
          if (fm.meaning) box.createDiv({ cls: 'ls-word-tip-meaning', text: String(fm.meaning) });
          const lang = this.languageNames(f).join(', ');
          const from = this.languageNames(f, 'borrowed_from').join(', ');
          const used = this.languageNames(f, 'cultures').join(', ');
          const line = [lang, from && `borrowed from ${from}${fm.source_word ? ` (${fm.source_word})` : ''}`, used && `used by ${used}`].filter(Boolean).join(' · ');
          if (line) box.createDiv({ cls: 'ls-word-tip-lang', text: line });
          box.addEventListener('click', () => this.openEntity(f, 'word'));
        }
        return { dom };
      },
    };
  }

  /* ---------- name builder ---------- */

  /* Name pieces for a culture: its own Naming lists, or learned from its characters' names (or everyone's). */
  nameParts(culture) {
    const fm = culture ? this.fm(culture) : {};
    const lists = (k) => toArr(fm[k]).map((s) => s.trim()).filter(Boolean);
    const given = { starts: lists('name_starts'), middles: lists('name_middles'), ends: lists('name_ends') };
    const sur = { starts: lists('surname_starts'), middles: [], ends: lists('surname_ends') };
    const idx = this.index();
    let people = idx.character;
    if (culture) {
      const mine = people.filter((c) => ['affiliation', 'house'].some((k) => toArr(this.fm(c)[k]).some((s) => this.resolveLink(s, c) === culture)));
      if (mine.length >= 3) people = mine;
    }
    const firsts = people.map((c) => c.basename.split(/\s+/)[0]);
    const lasts = people.map((c) => c.basename.split(/\s+/)).filter((w) => w.length > 1).map((w) => w[w.length - 1]);
    const learnedGiven = learnNameParts(firsts);
    const learnedSur = learnNameParts(lasts);
    const learned = !given.starts.length;
    return {
      learned,
      given: given.starts.length ? given : learnedGiven,
      sur: sur.starts.length ? sur : (given.starts.length && !lasts.length ? given : learnedSur),
    };
  }
  rollNames(culture, n = 12, opts = {}) {
    const parts = this.nameParts(culture);
    const taken = new Set(this.index().character.map((c) => c.basename.toLowerCase()));
    const out = new Set();
    for (let tries = 0; out.size < n && tries < n * 30; tries++) {
      const first = rollName(parts.given);
      if (!first) break;
      const middle = opts.middle ? rollName(parts.given) : '';
      const last = opts.surname ? rollName(parts.sur) : '';
      const full = [first, middle, last].filter(Boolean).join(' ');
      if (full.length < 3 || taken.has(full.toLowerCase())) continue;
      out.add(JSON.stringify({ first, middle, last }));
    }
    return { learned: parts.learned, names: [...out].map((s) => JSON.parse(s)) };
  }

  /* ---------- relationship engine ---------- */

  /* Every frontmatter link between lore entries in the project, indexed both ways, plus who is whose parent.
     Built once and kept until a note changes. */
  graph() {
    const proj = this.settings.activeProject;
    if (this._graph && this._graph.proj === proj) return this._graph;
    const idx = this.index();
    const types = new Map();
    for (const [t, files] of Object.entries(idx)) if (TYPES[t]) for (const f of files) types.set(f, t);
    const out = new Map(), inn = new Map();
    const push = (m, k, v) => { let a = m.get(k); if (!a) m.set(k, a = []); a.push(v); };
    for (const [f, t] of types) {
      const fm = this.fm(f);
      for (const fd of TYPES[t].fields) {
        if (fd.kind !== 'link' && fd.kind !== 'links') continue;
        for (const v of toArr(fm[fd.key])) {
          const d = this.resolveLink(v, f);
          if (!d || d === f || !types.has(d)) continue;
          push(out, f, { field: fd.key, dest: d });
          push(inn, d, { field: fd.key, src: f, srcType: t });
        }
      }
    }
    const isChar = (f) => types.get(f) === 'character';
    const parents = new Map(), children = new Map(), implied = new Map();
    const setOf = (m, k) => { let s = m.get(k); if (!s) m.set(k, s = new Set()); return s; };
    const link = (par, kid) => { setOf(parents, kid).add(par); setOf(children, par).add(kid); };
    for (const c of idx.character) {
      for (const e of out.get(c) || []) {
        if (!isChar(e.dest)) continue;
        if (e.field === 'mother' || e.field === 'father') link(e.dest, c);
        else if (e.field === 'children') link(c, e.dest);
      }
    }
    /* Siblings listed by name share parents: someone with no parents of their own takes them from a sibling,
       as long as every sibling in the group who has parents agrees on them. */
    const sibNb = (x) => {
      const r = [];
      for (const e of out.get(x) || []) if (e.field === 'siblings' && isChar(e.dest)) r.push(e.dest);
      for (const e of inn.get(x) || []) if (e.field === 'siblings' && isChar(e.src)) r.push(e.src);
      return r;
    };
    const done = new Set();
    for (const c of idx.character) {
      if (done.has(c)) continue;
      const group = [], stack = [c];
      while (stack.length) {
        const x = stack.pop();
        if (done.has(x)) continue;
        done.add(x); group.push(x);
        for (const y of sibNb(x)) if (!done.has(y)) stack.push(y);
      }
      if (group.length < 2) continue;
      const withP = group.filter((x) => (parents.get(x) || new Set()).size);
      if (!withP.length) continue;
      const key = (x) => [...parents.get(x)].map((f) => f.path).sort().join('|');
      if (new Set(withP.map(key)).size !== 1) continue;
      const src = withP[0];
      for (const x of group) {
        if ((parents.get(x) || new Set()).size) continue;
        for (const par of parents.get(src)) { link(par, x); implied.set(`${par.path}|${x.path}`, src); }
      }
    }
    this._graph = { proj, idx, types, out, inn, parents, children, implied };
    return this._graph;
  }
  dropGraph() { this._graph = null; this._meet = null; }

  /* 0 = she, 1 = he, 2 = unknown. Read from pronouns, gender, or being someone's mother or father. */
  genderOf(f) {
    const fm = this.fm(f);
    const pr = String(fm.pronouns || '').toLowerCase().trim();
    if (/^she\b/.test(pr)) return 0;
    if (/^he\b/.test(pr)) return 1;
    const g = String(fm.gender || fm.sex || '').toLowerCase().trim();
    if (/^(female|woman|girl|feminine|lady|f)\b/.test(g)) return 0;
    if (/^(male|man|boy|masculine|m)\b/.test(g)) return 1;
    const gr = this.graph();
    for (const e of gr.inn.get(f) || []) {
      if (e.field === 'mother') return 0;
      if (e.field === 'father') return 1;
    }
    return 2;
  }
  /* "née Valen", "né Ashford" or "born Kit Marlow" from a character's birth (maiden) name. */
  birthNameText(f) {
    const fm = this.fm(f);
    const bn = String(fm.birth_name || '').trim();
    if (!bn || bn === f.basename || bn === String(fm.full_name || '').trim()) return '';
    return `${['née', 'né', 'born'][this.genderOf(f)]} ${bn}`;
  }
  /* ---------- roles in groups ---------- */

  /* One role a character holds (or held) in a group, written on the character as
       "[[Hogwarts]]: Professor, Potions (1981–1997)"   years: from–to, "1981–" for ongoing, "until 1997"
       "[[Order of the Phoenix]]: (former)"              a former member with no title
     -> { org, title, start, end, former, active, status: 'active' | 'former' | 'future', raw } */
  parseRole(s, ch, noDeath) {
    const m = String(s).match(/^\s*\[\[([^\]]+)\]\]\s*[:\-–—]?\s*(.*)$/);
    if (!m) return null;
    const org = this.resolveLink(m[1], ch);
    if (!org) return null;
    let rest = m[2].trim();
    let start = '', end = '', former = false, active = false;
    const pm = rest.match(/\(([^()]*)\)\s*$/);
    if (pm) {
      const toks = pm[1].split(/[,;]/).map((t) => t.trim()).filter(Boolean);
      const meta = (t) => /^(former|past|ex|active|current|present)$/i.test(t) || /\d/.test(t) || /^(until|till|to|since|from)\s/i.test(t);
      if (toks.length && toks.every(meta)) {
        rest = rest.slice(0, pm.index).trim();
        for (const t of toks) {
          if (/^(former|past|ex)$/i.test(t)) former = true;
          else if (/^(active|current|present)$/i.test(t)) active = true;
          else if (/^(until|till|to)\s+/i.test(t)) end = t.replace(/^\S+\s+/, '');
          else if (/^(since|from)\s+/i.test(t)) start = t.replace(/^\S+\s+/, '');
          else {
            let r = t.split(/\s*[–—]\s*|\s+-\s+/);
            if (r.length < 2) { const d = t.match(/^(\d+)-(\d*)$/); if (d) r = [d[1], d[2]]; }
            if (r.length >= 2) { start = r[0].trim(); end = /^(present|now)$/i.test(r[1].trim()) ? '' : r[1].trim(); }
            else start = t;
          }
        }
      }
    }
    if (/^(former\s|ex-)/i.test(rest)) {
      former = true;
      rest = rest.replace(/^(former\s+|ex-)/i, '');
      rest = rest.charAt(0).toUpperCase() + rest.slice(1);
    }
    return { org, title: rest, start, end, former, active, status: this.roleStatus({ start, end, former, active }, noDeath ? null : ch), raw: String(s) };
  }
  /* Former once it ended before the story's present (or ended at all, with no present set), when marked former,
     or when the character has died. Not started yet: future. */
  roleStatus(e, ch) {
    if (e.active) return 'active';
    if (e.former) return 'former';
    const neg = this.negEras();
    const g = this.graph();
    if (g.now === undefined) g.now = this.latestPresent();
    const now = g.now;
    const s = e.start ? parseYear(e.start, neg) : null;
    const en = e.end ? parseYear(e.end, neg) : null;
    if (en != null) return !now || en < now.y ? 'former' : 'active';
    if (s != null && now && s > now.y) return 'future';
    if (ch && this.isDead(ch)) return 'former';
    return 'active';
  }
  roleEntriesOf(ch) {
    return toArr(this.fm(ch).roles).map((s) => this.parseRole(s, ch)).filter(Boolean);
  }
  roleYears(e) {
    if (e.start && e.end) return `${e.start}–${e.end}`;
    if (e.start) return `since ${e.start}`;
    if (e.end) return `until ${e.end}`;
    return '';
  }
  /* "Professor, Potions", "Former Student", "Former member" */
  roleText(e, withYears) {
    const t = e.title || (e.status === 'former' ? 'member' : '');
    let out = e.status === 'former' ? `Former ${t}` : t;
    if (e.status === 'future') out = `Future ${t || 'member'}`;
    const y = withYears ? this.roleYears(e) : '';
    return [out, y && `(${y})`].filter(Boolean).join(' ');
  }
  /* Best single description of a character's place in a group: their current role, else their latest one. */
  roleOf(ch, org) {
    if (!ch || !org) return '';
    const es = this.roleEntriesOf(ch).filter((e) => e.org === org);
    if (!es.length) return '';
    const act = es.filter((e) => e.status === 'active');
    return this.roleText(act.length ? act[act.length - 1] : es[es.length - 1]);
  }
  rolesOf(ch) {
    const out = new Map();
    for (const e of this.roleEntriesOf(ch)) if (!out.has(e.org)) out.set(e.org, this.roleOf(ch, e.org));
    return out;
  }
  /* active, former or future, for a character in a group (no roles written: active, unless they've died). */
  memberStatus(ch, org) {
    const es = this.roleEntriesOf(ch).filter((e) => e.org === org);
    if (!es.length) return this.isDead(ch) ? 'former' : 'active';
    if (es.some((e) => e.status === 'active')) return 'active';
    if (es.every((e) => e.status === 'future')) return 'future';
    return 'former';
  }
  roleLine(org, ch, e) {
    const toks = [];
    if (e.start && e.end) toks.push(`${e.start}–${e.end}`);
    else if (e.start) toks.push(`${e.start}–`);
    else if (e.end) toks.push(`until ${e.end}`);
    if (e.former && !e.end) toks.push('former');
    if (e.active && e.end) toks.push('active');
    /* A title ending in something like "(1st)" would read back as years: write it with brackets instead. */
    const title = oneLine(e.title || '').replace(/\(([^()]*)\)\s*$/, (all, inner) => (/\d/.test(inner) || /^(former|past|ex|active|current|present)$/i.test(inner.trim()) ? `[${inner}]` : all));
    return `${this.linkTo(org, ch)}: ${title}${toks.length ? `${title ? ' ' : ''}(${toks.join(', ')})` : ''}`.trim();
  }
  /* Replaces every role this character has in this group. entries: [{ title, start, end, former }] */
  tieEntriesOf(ch) {
    return toArr(this.fm(ch).ties).map((s) => this.parseRole(s, ch, true)).filter(Boolean);
  }
  async setRoles(ch, org, entries, field = 'roles') {
    await this.app.fileManager.processFrontMatter(ch, (fm) => {
      const keep = toArr(fm[field]).filter((s) => {
        const m = String(s).match(/^\s*\[\[([^\]]+)\]\]/);
        return !(m && this.resolveLink(m[1], ch) === org);
      });
      const add = entries.filter((e) => (e.title || '').trim() || e.start || e.end || e.former).map((e) => this.roleLine(org, ch, e));
      const list = [...keep, ...add];
      if (list.length) fm[field] = list; else delete fm[field];
    });
  }
  async setRole(ch, org, title) { return this.setRoles(ch, org, title ? [{ title }] : []); }
  /* Roles are written as "[[Group]]: role". If a group is renamed and the link inside that text was not updated, fix it. */
  async fixRoleLinks(f, oldPath) {
    if (!(f instanceof TFile) || f.extension !== 'md') return;
    const oldName = String(oldPath).split('/').pop().replace(/\.md$/, '');
    const oldNoExt = String(oldPath).replace(/\.md$/, '');
    if (oldName === f.basename) return;
    for (const ch of this.index().character) {
      const roles = toArr(this.fm(ch).roles);
      const stale = roles.some((r) => {
        const m = String(r).match(/^\s*\[\[([^\]|#]+)/);
        return m && (m[1] === oldName || m[1] === oldNoExt) && !this.resolveLink(m[1], ch);
      });
      if (!stale) continue;
      await this.app.fileManager.processFrontMatter(ch, (fm) => {
        fm.roles = toArr(fm.roles).map((r) => String(r).replace(/^(\s*)\[\[([^\]|#]+)([^\]]*)\]\]/, (all, sp, target) =>
          (target === oldName || target === oldNoExt) ? sp + this.linkTo(f, ch) : all));
      });
    }
  }
  /* Every subdivision below a group, any depth: [{ org, depth }] (Ministry > Department > Office). */
  allSubdivisions(org, depth = 0, seen = new Set()) {
    const out = [];
    if (seen.has(org) || depth > 5) return out;
    seen.add(org);
    for (const s of this.subdivisionsOf(org)) {
      if (seen.has(s)) continue;
      out.push({ org: s, depth });
      out.push(...this.allSubdivisions(s, depth + 1, seen));
    }
    return out;
  }
  /* Is this character in this group, through any of their fields or the group's member lists? */
  inGroup(ch, grp) {
    const g = this.graph();
    return (g.out.get(ch) || []).some((e) => e.dest === grp && ROLE_FIELDS.includes(e.field))
      || (g.out.get(grp) || []).some((e) => e.dest === ch && (e.field === 'members' || e.field === 'leaders'));
  }
  /* Puts a character in exactly these subdivisions of a group: joins new ones through Affiliation, leaves the rest. */
  async setSubdivisions(ch, org, chosen) {
    this.dropGraph();
    for (const { org: sub } of this.allSubdivisions(org)) {
      const want = chosen.has(sub);
      const has = this.inGroup(ch, sub);
      if (want && !has) await this.addLink(ch, 'affiliation', sub);
      else if (!want && has) await this.leaveGroup(ch, sub);
    }
    this.dropGraph();
  }
  async leaveGroup(ch, grp) {
    const strip = (file, keys, target) => this.app.fileManager.processFrontMatter(file, (fm) => {
      for (const k of keys) {
        const cur = toArr(fm[k]);
        const rest = cur.filter((x) => this.resolveLink(x, file) !== target);
        if (rest.length === cur.length) continue;
        if (rest.length) fm[k] = rest; else delete fm[k];
      }
    });
    await strip(ch, ROLE_FIELDS, grp);
    await strip(grp, ['members', 'leaders'], ch);
  }

  /* Groups that are Part of this one: houses of a school, departments of a company, squads of an army. */
  subdivisionsOf(org) {
    const g = this.graph();
    return (g.inn.get(org) || []).filter((e) => e.field === 'partOf' && e.srcType === 'organization').map((e) => e.src)
      .sort((a, b) => natural(a.basename, b.basename));
  }
  /* What the subdivisions are called, from their shared Type: "house", "department". */
  subdivisionWord(org) {
    const kinds = new Set(this.subdivisionsOf(org).map((s) => String(this.fm(s).kind || '').trim().toLowerCase()).filter(Boolean));
    return kinds.size === 1 ? [...kinds][0] : 'subgroup';
  }
  /* Everyone in a group, from their sheets, the group's page, and its subdivisions:
     [{ file, entries, how, leader, founder, subs: [{ org, status, title }], status, entry, head }] */
  peopleOf(org, depth = 0) {
    const g = this.graph();
    const map = new Map();
    const get = (c) => {
      let r = map.get(c);
      if (!r) map.set(c, r = { file: c, how: new Set(), leader: false, founder: false, subs: [], direct: false });
      return r;
    };
    const label = (t, k) => { const f = TYPES[t].fields.find((x) => x.key === k); return f ? f.label : k; };
    for (const e of g.inn.get(org) || []) {
      if (e.srcType !== 'character' || !ROLE_FIELDS.includes(e.field)) continue;
      const r = get(e.src); r.direct = true; r.how.add(label('character', e.field));
      if (e.field === 'leaderOf') r.leader = true;
    }
    for (const e of g.out.get(org) || []) {
      if (g.types.get(e.dest) !== 'character') continue;
      const r = get(e.dest);
      if (e.field === 'members') { r.direct = true; r.how.add('Member'); }
      else if (e.field === 'leaders') { r.direct = true; r.how.add('Leader'); r.leader = true; }
      else if (e.field === 'founders') { r.how.add('Founder'); r.founder = true; }
    }
    /* People listed only under a role (no link field) still count. */
    for (const c of g.idx.character) {
      if (map.has(c)) continue;
      if (this.roleEntriesOf(c).some((e) => e.org === org)) { const r = get(c); r.direct = true; r.how.add('Role'); }
    }
    if (depth < 4) {
      for (const sub of this.subdivisionsOf(org)) {
        for (const sr of this.peopleOf(sub, depth + 1)) {
          const r = get(sr.file);
          r.subs.push({ org: sub, status: sr.status, title: sr.entry ? sr.entry.title : '' });
          for (const ss of sr.subs) r.subs.push(ss);
        }
      }
    }
    for (const r of map.values()) {
      r.entries = this.roleEntriesOf(r.file).filter((e) => e.org === org);
      const act = r.entries.filter((e) => e.status === 'active');
      if (r.entries.length) {
        r.status = act.length ? 'active' : r.entries.every((e) => e.status === 'future') ? 'future' : 'former';
      } else if (!r.direct && r.subs.length) {
        r.status = r.subs.some((s) => s.status === 'active') ? 'active' : 'former';
      } else if (r.founder && !r.direct) {
        r.status = 'former';
      } else {
        r.status = this.isDead(r.file) ? 'former' : 'active';
      }
      r.entry = act.length ? act[act.length - 1] : r.entries[r.entries.length - 1] || null;
      const t = r.entry && r.entry.title ? r.entry.title.split(',')[0].trim() : '';
      r.head = t || (r.leader ? 'Leader' : r.founder ? 'Founder' : 'Member');
    }
    return [...map.values()];
  }

  /* Every name an entry goes by, for search. */
  namesOf(f) {
    const fm = this.fm(f);
    return [f.basename, ...toArr(fm.aliases), fm.birth_name, fm.full_name].filter(Boolean).map((x) => String(x));
  }
  relLabel(kind, other) { const d = REL[kind]; return d ? d.l[this.genderOf(other)] : cap(kind); }
  isDead(f) {
    const fm = this.fm(f);
    return !!fm.died || /^(dead|deceased|died|killed|slain|late)\b/i.test(String(fm.status || ''));
  }

  /* Everyone this character is tied to, found from both sides and through family:
     [{ file, kind, label, auto, via, field }]. auto means it is not written on this character's own note. */
  relationsOf(me) {
    const g = this.graph();
    if (g.types.get(me) !== 'character') return [];
    if (!g.rel) g.rel = new Map();
    if (g.rel.has(me)) return g.rel.get(me);
    const out = this.computeRelations(g, me);
    g.rel.set(me, out);
    return out;
  }
  computeRelations(g, me) {
    const isChar = (f) => g.types.get(f) === 'character';
    const P = (x) => g.parents.get(x) || new Set();
    const C = (x) => g.children.get(x) || new Set();
    const ownField = (x, field) => (g.out.get(me) || []).some((e) => e.dest === x && e.field === field);
    const theirField = (x, field) => (g.out.get(x) || []).some((e) => e.dest === me && e.field === field);
    const symOf = (x, field) => {
      const s = new Set();
      for (const e of g.out.get(x) || []) if (e.field === field && isChar(e.dest)) s.add(e.dest);
      for (const e of g.inn.get(x) || []) if (e.field === field && isChar(e.src)) s.add(e.src);
      s.delete(x);
      return s;
    };
    const names = (set) => [...set].map((f) => f.basename).join(' and ');
    /* Full siblings (named, or sharing every known parent) and half siblings (each has a parent the other lacks). */
    const sibsOf = (x) => {
      const full = new Map(), half = new Map();
      const px = P(x);
      for (const par of px) for (const s of C(par)) {
        if (s === x) continue;
        const ps = P(s);
        const shared = new Set([...px].filter((q) => ps.has(q)));
        const isHalf = [...px].some((q) => !ps.has(q)) && [...ps].some((q) => !px.has(q));
        (isHalf ? half : full).set(s, `Both children of ${names(shared)}`);
      }
      /* Named siblings, and their named siblings in turn: if A and B are siblings and so are B and C, A and C are too. */
      const seen = new Set([x]);
      const queue = [[x, null]];
      while (queue.length) {
        const [y, from] = queue.shift();
        for (const s of symOf(y, 'siblings')) {
          if (seen.has(s)) continue;
          seen.add(s);
          if (!full.has(s)) full.set(s, from ? `Sibling of ${from.basename}` : null);
          half.delete(s);
          queue.push([s, s]);
        }
      }
      return { full, half };
    };

    const res = [];
    const family = new Set([me]);
    const add = (other, kind, auto, via, field) => {
      if (!other || other === me || !isChar(other)) return;
      const isFam = REL[kind].group !== 'Ties';
      if (isFam) { if (family.has(other)) return; family.add(other); }
      else if (res.some((r) => r.file === other && r.kind === kind)) return;
      res.push({ file: other, kind, label: this.relLabel(kind, other), auto, via: via || '', field });
    };
    const listedOn = (x) => `Listed on ${x.basename}'s page`;

    const myParents = P(me);
    for (const par of myParents) {
      const own = ownField(par, 'mother') || ownField(par, 'father');
      const imp = g.implied.get(`${par.path}|${me.path}`);
      add(par, 'parent', !own, own ? '' : imp ? `Through ${imp.basename}` : listedOn(par), own ? (ownField(par, 'mother') ? 'mother' : 'father') : null);
    }
    const { full, half } = sibsOf(me);
    for (const [s, via] of full) {
      const own = ownField(s, 'siblings');
      add(s, 'sibling', !own, own ? '' : via || listedOn(s), own ? 'siblings' : null);
    }
    for (const [s, via] of half) add(s, 'halfsibling', !ownField(s, 'siblings'), via, ownField(s, 'siblings') ? 'siblings' : null);
    for (const s of symOf(me, 'spouses')) add(s, 'spouse', !ownField(s, 'spouses'), ownField(s, 'spouses') ? '' : listedOn(s), ownField(s, 'spouses') ? 'spouses' : null);
    for (const s of symOf(me, 'partners')) add(s, 'partner', !ownField(s, 'partners'), ownField(s, 'partners') ? '' : listedOn(s), ownField(s, 'partners') ? 'partners' : null);
    for (const k of C(me)) {
      const own = ownField(k, 'children');
      add(k, 'child', !own, own ? '' : (theirField(k, 'mother') || theirField(k, 'father')) ? listedOn(k) : 'Through a sibling', own ? 'children' : null);
    }
    for (const par of myParents) for (const sp of symOf(par, 'spouses')) if (!myParents.has(sp)) add(sp, 'stepparent', true, `Married to ${par.basename}`);
    for (const r of res.filter((x) => x.kind === 'stepparent')) for (const k of C(r.file)) add(k, 'stepsibling', true, `${r.file.basename}'s child`);
    for (const sp of symOf(me, 'spouses')) for (const k of C(sp)) add(k, 'stepchild', true, `${sp.basename}'s child`);
    for (const par of myParents) for (const gp of P(par)) add(gp, 'grandparent', true, `${par.basename}'s parent`);
    for (const k of C(me)) for (const gk of C(k)) add(gk, 'grandchild', true, `${k.basename}'s child`);
    const aunts = [];
    for (const par of myParents) {
      const ps = sibsOf(par);
      for (const a of [...ps.full.keys(), ...ps.half.keys()]) { add(a, 'auntuncle', true, `${par.basename}'s sibling`); aunts.push(a); }
    }
    for (const s of [...full.keys(), ...half.keys()]) for (const k of C(s)) add(k, 'nibling', true, `${s.basename}'s child`);
    for (const a of aunts) for (const k of C(a)) add(k, 'cousin', true, `${a.basename}'s child`);
    for (const sp of symOf(me, 'spouses')) {
      for (const pl of P(sp)) add(pl, 'parentinlaw', true, `${sp.basename}'s parent`);
      const ss = sibsOf(sp);
      for (const sl of [...ss.full.keys(), ...ss.half.keys()]) add(sl, 'siblinginlaw', true, `${sp.basename}'s sibling`);
    }
    for (const s of full.keys()) for (const sp of symOf(s, 'spouses')) add(sp, 'siblinginlaw', true, `Married to ${s.basename}`);
    for (const k of C(me)) for (const sp of symOf(k, 'spouses')) add(sp, 'childinlaw', true, `Married to ${k.basename}`);
    for (const s of symOf(me, 'relatives')) add(s, 'relative', !ownField(s, 'relatives'), ownField(s, 'relatives') ? '' : listedOn(s), ownField(s, 'relatives') ? 'relatives' : null);

    for (const [field, kind] of Object.entries(SYM_FIELDS)) {
      if (REL[kind].group !== 'Ties') continue;
      for (const s of symOf(me, field)) add(s, kind, !ownField(s, field), ownField(s, field) ? '' : listedOn(s), ownField(s, field) ? field : null);
    }
    for (const e of g.out.get(me) || []) {
      if (e.field === 'mentors' && isChar(e.dest)) add(e.dest, 'mentor', false, '', 'mentors');
      if (e.field === 'students' && isChar(e.dest)) add(e.dest, 'student', false, '', 'students');
    }
    for (const e of g.inn.get(me) || []) {
      if (e.field === 'students' && isChar(e.src)) add(e.src, 'mentor', true, listedOn(e.src));
      if (e.field === 'mentors' && isChar(e.src)) add(e.src, 'student', true, listedOn(e.src));
    }
    for (const r of g.idx.relation) {
      const rf = this.fm(r);
      const a = this.resolveLink(rf.from, r), b = this.resolveLink(rf.to, r);
      const other = a === me ? b : b === me ? a : null;
      if (!other || !isChar(other)) continue;
      res.push({ file: other, kind: 'relation', label: rf.kind ? cap(String(rf.kind)) : r.basename, auto: true, via: `Relation entry "${r.basename}"`, relFile: r });
    }
    this.applyTies(g, me, res, family, listedOn);
    return res;
  }

  /* Ties that change over time, written in either character's "ties" list:
       "[[Bram]]: Enemy (1990–1995)"   "[[Bram]]: Friend (1995–)"   "[[Kael]]: Brother, estranged"   "[[Lio]]: Ex-wife"
     The current tie gets a card with its history ("Formerly enemy (1990–1995)"). Someone with only past ties gets a
     "Past" card ("Former lover"). A past tie also retires the same kind of link in the plain fields. */
  applyTies(g, me, res, family, listedOn) {
    const list = this.tieIndex().get(me) || [];
    if (!list.length) return;
    const INV = { mentor: 'student', student: 'mentor', parent: 'child', child: 'parent' };
    const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
    const byOther = new Map();
    for (const t of list) { if (!byOther.has(t.other)) byOther.set(t.other, []); byOther.get(t.other).push(t); }
    for (const [other, ts] of byOther) {
      const seen = new Set();
      const items = [];
      for (const t of ts) {
        const head = (t.e.title.split(',')[0] || '').trim();
        const note = t.e.title.includes(',') ? t.e.title.slice(t.e.title.indexOf(',') + 1).trim() : '';
        let kind = tieKind(head) || 'relation';
        if (!t.own && INV[kind]) kind = INV[kind];
        const base = (t.own || kind === 'relation') && head ? cap(head) : this.relLabel(kind, other);
        const years = this.roleYears(t.e);
        const key = `${kind}|${t.e.status}|${years}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ kind, base, note, years, status: t.e.status, own: t.own, start: t.e.start });
      }
      const past = items.filter((i) => i.status === 'former');
      const now = items.filter((i) => i.status !== 'former');
      const pastLabel = (i) => (/^(spouse|partner)$/.test(i.kind) ? `Ex-${lower(i.base)}` : `Former ${lower(i.base)}`);
      /* A kind that only appears as past here overrides the same kind written in the plain fields. */
      const retired = new Set(past.map((i) => i.kind).filter((k) => !now.some((n) => n.kind === k) && (REL[k].group === 'Ties' || k === 'spouse' || k === 'partner')));
      for (let i = res.length - 1; i >= 0; i--) {
        const r = res[i];
        if (r.file === other && retired.has(r.kind) && !r.fromTies && KIND_FIELDS[r.kind] && (!r.auto || /^Listed on/.test(r.via || ''))) {
          res.splice(i, 1);
          if (REL[r.kind].group !== 'Ties') family.delete(other);
        }
      }
      for (const a of now) {
        let r = res.find((x) => x.file === other && x.kind === a.kind && (a.kind !== 'relation' || x.label === a.base));
        if (!r && REL[a.kind].group !== 'Ties' && family.has(other)) r = res.find((x) => x.file === other && REL[x.kind].group !== 'Ties');
        if (r) {
          if (a.years) r.years = a.years;
          if (a.note) r.note = a.note;
          if (a.status === 'future') r.future = true;
          continue;
        }
        res.push({ file: other, kind: a.kind, label: a.base, auto: !a.own, via: a.own ? '' : listedOn(other), years: a.years, note: a.note, fromTies: true, future: a.status === 'future' });
        if (REL[a.kind].group !== 'Ties') family.add(other);
      }
      if (past.length) {
        past.sort((x, y) => natural(String(x.start || ''), String(y.start || '')));
        const text = (i) => [pastLabel(i), i.years && `(${i.years})`].filter(Boolean).join(' ');
        /* History belongs on a current tie or partnership, not on a sibling or in-law card. */
        const cards = res.filter((x) => x.file === other && !x.former && (REL[x.kind].group === 'Ties' || x.kind === 'spouse' || x.kind === 'partner'));
        if (cards.length) {
          const c = cards.find((x) => x.fromTies) || cards.find((x) => REL[x.kind].group === 'Ties') || cards[0];
          c.history = [...(c.history || []), ...past.map(text)];
        } else {
          const last = past[past.length - 1];
          res.push({
            file: other, kind: last.kind, label: pastLabel(last), former: true, group: 'Past', fromTies: true,
            auto: !last.own, via: last.own ? '' : listedOn(other), years: last.years, note: last.note,
            history: past.slice(0, -1).map(text),
          });
        }
      }
    }
  }

  /* Every character's tie lines, indexed from both ends. Built once per graph. */
  tieIndex() {
    const g = this.graph();
    if (g.ties) return g.ties;
    const m = new Map();
    const push = (k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    for (const c of g.idx.character) {
      for (const s of toArr(this.fm(c).ties)) {
        const e = this.parseRole(s, c, true);
        if (!e || e.org === c || g.types.get(e.org) !== 'character') continue;
        push(c, { other: e.org, e, own: true });
        push(e.org, { other: c, e, own: false });
      }
    }
    g.ties = m;
    return m;
  }


  /* The closest relationship between two characters, or null. */
  relationBetween(a, b) {
    const rs = this.relationsOf(a).filter((r) => r.file === b);
    return rs.find((r) => !r.former) || rs[0] || null;
  }

  /* Non-person links, from this entry and to it, grouped under one label each:
     [{ label, items: [{ file, auto, field }] }]. Person-to-person ties are left to relationsOf. */
  connectionsOf(me, opts = {}) {
    const g = this.graph();
    const myType = g.types.get(me);
    const roleFor = (other) => myType === 'character' ? this.roleOf(me, other) : g.types.get(other) === 'character' ? this.roleOf(other, me) : '';
    if (!myType) return [];
    const groups = new Map();
    const order = [];
    const put = (label, file, auto, field) => {
      let gr = groups.get(label);
      if (!gr) { gr = { label, items: [] }; groups.set(label, gr); order.push(label); }
      const had = gr.items.find((x) => x.file === file);
      if (had) { if (!auto) { had.auto = false; had.field = field; } return; }
      const former = myType === 'character' && g.types.get(file) === 'organization' ? this.memberStatus(me, file) === 'former'
        : myType === 'organization' && g.types.get(file) === 'character' ? this.memberStatus(file, me) === 'former' : false;
      gr.items.push({ file, auto, field, role: roleFor(file), former });
    };
    const fieldDef = (t, k) => TYPES[t].fields.find((f) => f.key === k);
    for (const e of g.out.get(me) || []) {
      if (myType === 'character' && PERSON_FIELDS.has(e.field) && g.types.get(e.dest) === 'character') continue;
      if (WEB_SKIP_FIELDS.has(e.field) || (myType === 'species' && e.field === 'subspeciesOf')) continue;
      if (opts.skipPeople && ['members', 'leaders', 'founders'].includes(e.field) && g.types.get(e.dest) === 'character') continue;
      if (opts.skipGroups && ROLE_FIELDS.includes(e.field) && g.types.get(e.dest) === 'organization') continue;
      const fd = fieldDef(myType, e.field);
      put(fd ? fd.label : e.field, e.dest, false, e.field);
    }
    for (const e of g.inn.get(me) || []) {
      const key = `${e.srcType}.${e.field}`;
      if (INVERSE_SKIP.has(key)) continue;
      if (myType === 'language' && (key === 'word.language' || key === 'word.borrowed_from')) continue;
      if (myType === 'character' && PERSON_FIELDS.has(e.field) && e.srcType === 'character') continue;
      if (myType === 'character' && key === 'event.participants') continue;
      if (opts.skipPeople && e.srcType === 'character' && ROLE_FIELDS.includes(e.field)) continue;
      if (opts.skipGroups && e.srcType === 'organization' && ['members', 'leaders', 'founders'].includes(e.field)) continue;
      const inv = INVERSE[key];
      const merge = inv && inv.merge && fieldDef(myType, inv.merge);
      const sfd = fieldDef(e.srcType, e.field);
      const label = merge ? merge.label : inv ? inv.label : `${TYPES[e.srcType].plural} (${sfd ? sfd.label.toLowerCase() : e.field})`;
      put(label, e.src, true, null);
    }
    for (const gr of groups.values()) gr.items.sort((a, b) => natural(a.file.basename, b.file.basename));
    return order.map((l) => groups.get(l));
  }

  /* ---------- keeping links two-way ---------- */

  /* The field on `dest` that should list `src` back, or null. */
  mirrorField(src, key, dest) {
    const st = this.typeOf(src), dt = this.typeOf(dest);
    const spec = MIRROR[`${st}.${key}`];
    if (!spec || !TYPES[dt] || src === dest) return null;
    let tk = spec;
    if (spec === '@parent') {
      const fm = this.fm(dest);
      const has = (k) => toArr(fm[k]).some((x) => this.resolveLink(x, dest) === src);
      if (has('mother')) tk = 'mother';
      else if (has('father')) tk = 'father';
      else {
        const gnd = this.genderOf(src);
        if (gnd === 2) return null;
        tk = gnd === 0 ? 'mother' : 'father';
      }
    }
    const tf = TYPES[dt].fields.find((f) => f.key === tk);
    return tf && tf.types && tf.types.includes(st) ? tf : null;
  }
  /* Adds or removes `src` on the matching field of `dest`. srcFm is src's frontmatter after the change. */
  async mirrorLink(src, key, dest, on, srcFm) {
    if (!this.settings.mirrorLinks || !dest || dest === src) return false;
    const tf = this.mirrorField(src, key, dest);
    if (!tf) return false;
    if (!on && srcFm) {
      /* Still linked through another field that writes the same thing back? Then keep it. */
      const st = this.typeOf(src);
      for (const [k, v] of Object.entries(MIRROR)) {
        const [t, f] = k.split('.');
        if (t !== st || f === key || v !== tf.key) continue;
        if (toArr(srcFm[f]).some((x) => this.resolveLink(x, src) === dest)) return false;
      }
    }
    let changed = false;
    await this.app.fileManager.processFrontMatter(dest, (fm) => {
      const keys = [tf.key, ...(MIRROR_ALSO[tf.key] || [])];
      const has = keys.some((k) => toArr(fm[k]).some((x) => this.resolveLink(x, dest) === src));
      if (on && !has) {
        const l = this.linkTo(src, dest);
        if (tf.kind === 'link') { if (fm[tf.key]) return; fm[tf.key] = l; }
        else fm[tf.key] = [...toArr(fm[tf.key]), l];
        changed = true;
      } else if (!on) {
        const cur = toArr(fm[tf.key]);
        const rest = cur.filter((x) => this.resolveLink(x, dest) !== src);
        if (rest.length === cur.length) return;
        if (rest.length && tf.kind === 'links') fm[tf.key] = rest; else delete fm[tf.key];
        changed = true;
      }
    });
    return changed;
  }
  /* Writes a relationship onto a character (and its other half onto the other character). */
  async addLink(src, key, dest) {
    const def = TYPES[this.typeOf(src)];
    const fd = def && def.fields.find((f) => f.key === key);
    if (!fd || dest === src) return;
    let after = null;
    await this.app.fileManager.processFrontMatter(src, (fm) => {
      const l = this.linkTo(dest, src);
      if (fd.kind === 'link') fm[key] = l;
      else if (!toArr(fm[key]).some((x) => this.resolveLink(x, src) === dest)) fm[key] = [...toArr(fm[key]), l];
      after = Object.assign({}, fm);
    });
    await this.mirrorLink(src, key, dest, true, after);
  }
  /* Removes a direct relationship from both notes. */
  async removeTie(me, other, kind) {
    const spec = KIND_FIELDS[kind];
    if (!spec) return;
    const strip = (file, keys, target) => this.app.fileManager.processFrontMatter(file, (fm) => {
      for (const k of keys) {
        const cur = toArr(fm[k]);
        const rest = cur.filter((x) => this.resolveLink(x, file) !== target);
        if (rest.length === cur.length) continue;
        if (rest.length) fm[k] = Array.isArray(fm[k]) ? rest : rest[0]; else delete fm[k];
      }
    });
    await strip(me, spec[0], other);
    await strip(other, spec[1], me);
  }
  /* Finds every one-sided link that has a natural other half. */
  mirrorPlan() {
    const g = this.graph();
    const plan = new Map();
    let n = 0;
    for (const [src, edges] of g.out) {
      for (const e of edges) {
        const tf = this.mirrorField(src, e.field, e.dest);
        if (!tf) continue;
        const dfm = this.fm(e.dest);
        const keys = [tf.key, ...(MIRROR_ALSO[tf.key] || [])];
        if (keys.some((k) => toArr(dfm[k]).some((x) => this.resolveLink(x, e.dest) === src))) continue;
        if (tf.kind === 'link' && dfm[tf.key]) continue;
        let m = plan.get(e.dest);
        if (!m) plan.set(e.dest, m = new Map());
        let s = m.get(tf);
        if (!s) m.set(tf, s = new Set());
        if (!s.has(src)) { s.add(src); n++; }
      }
    }
    return { plan, count: n };
  }
  async syncLinks(silent) {
    const { plan, count } = this.mirrorPlan();
    if (!count) { if (!silent) new Notice('Every relationship link already has its other half.'); return 0; }
    const run = async () => {
      for (const [dest, m] of plan) {
        await this.app.fileManager.processFrontMatter(dest, (fm) => {
          for (const [tf, srcs] of m) {
            for (const src of srcs) {
              const l = this.linkTo(src, dest);
              if (tf.kind === 'link') { if (!fm[tf.key]) fm[tf.key] = l; }
              else if (!toArr(fm[tf.key]).some((x) => this.resolveLink(x, dest) === src)) fm[tf.key] = [...toArr(fm[tf.key]), l];
            }
          }
        });
      }
      new Notice(`Added the other half of ${count} link${count === 1 ? '' : 's'} across ${plan.size} note${plan.size === 1 ? '' : 's'}.`);
    };
    if (silent) { await run(); return count; }
    new ConfirmModal(this.app, {
      title: 'Make relationship links two-way?',
      message: `${count} link${count === 1 ? ' is' : 's are'} written on only one side, for example an ally who doesn't list you back. This adds the missing side to ${plan.size} note${plan.size === 1 ? '' : 's'}. Nothing is removed.`,
      cta: 'Add missing links',
    }, run).open();
    return count;
  }

  /* ---------- who has met whom ---------- */

  async meetings() {
    const pairs = new Map();
    const counts = new Map();
    for (const story of this.index().story) {
      const data = await this.storyData(story);
      for (const ch of data.chapters) {
        for (const sc of ch.scenes) {
          const cast = [...new Set(toArr(this.fm(sc.file).characters).map((s) => this.resolveLink(s, sc.file)).filter((c) => c && this.typeOf(c) === 'character'))];
          for (const c of cast) counts.set(c, (counts.get(c) || 0) + 1);
          for (let i = 0; i < cast.length; i++) {
            for (let j = i + 1; j < cast.length; j++) {
              const k = pairKey(cast[i], cast[j]);
              if (!pairs.has(k)) pairs.set(k, []);
              pairs.get(k).push({ scene: sc.file, chapter: ch.name, story });
            }
          }
        }
      }
    }
    return { pairs, counts };
  }

  /* ---------- export ---------- */

  /* Story text as export-ready chapters. Scenes in a chapter are joined with a scene break. */
  async bookData(story) {
    const data = await this.storyData(story);
    for (const ch of data.chapters) {
      for (const sc of ch.scenes) sc.paras = proseParagraphs(await this.app.vault.cachedRead(sc.file));
    }
    const ms = this.settings.manuscript;
    const chapters = [];
    for (const ch of data.chapters) {
      const paras = [];
      ch.scenes.forEach((sc, i) => {
        if (i > 0 && paras.length && !paras[paras.length - 1].brk) paras.push({ brk: true });
        paras.push(...sc.paras);
      });
      if (paras.length) chapters.push({ title: ch.name, paras });
    }
    const words = data.words;
    const legal = String(ms.legalName || '').trim();
    const surname = (legal || String(ms.byline || '')).split(/\s+/).filter(Boolean).pop() || '';
    const keyword = story.basename.split(/\s+/).slice(0, 4).join(' ').toUpperCase();
    return {
      title: story.basename,
      legalName: legal,
      byline: String(ms.byline || '').trim() || legal,
      contact: String(ms.contact || '').split('\n').map((l) => l.trim()).filter(Boolean),
      font: ms.font || 'Times New Roman',
      lang: String(ms.lang || 'en').trim() || 'en',
      words,
      roundedWords: words >= 10000 ? Math.round(words / 1000) * 1000 : Math.max(100, Math.round(words / 100) * 100),
      headerText: [surname, keyword].filter(Boolean).join(' / '),
      chapters,
    };
  }
  async exportStory(story, kind) {
    const book = await this.bookData(story);
    if (!book.chapters.length) { new Notice('This story has no scene text to export yet.'); return; }
    let buf, path;
    if (kind === 'docx') {
      if (!book.legalName && !book.byline) new Notice('Tip: add your name and contact details under Settings > Loresmith > Manuscript.');
      buf = buildDocx(book);
      path = normalizePath(`${story.parent.path}/${story.basename} manuscript.docx`);
    } else {
      const img = this.resolveLink(this.fm(story).image, story);
      if (img && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(img.extension.toLowerCase())) {
        const ext = img.extension.toLowerCase() === 'jpeg' ? 'jpg' : img.extension.toLowerCase();
        book.cover = { ext, mime: { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext], data: await this.app.vault.readBinary(img) };
      }
      buf = buildEpub(book);
      path = normalizePath(`${story.parent.path}/${story.basename}.epub`);
    }
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, buf);
    else await this.app.vault.createBinary(path, buf);
    new Notice(`Saved "${path.split('/').pop()}" next to the story note. ${fmtNum(book.words)} words, ${book.chapters.length} chapter${book.chapters.length === 1 ? '' : 's'}.`);
  }
  exportMenu(e, story) {
    const m = new Menu();
    addMenuItem(m, 'Manuscript (.docx)', 'file-text', () => this.exportStory(story, 'docx'));
    addMenuItem(m, 'Ebook (.epub)', 'book', () => this.exportStory(story, 'epub'));
    m.showAtMouseEvent(e);
  }

  /* ---------- moodboards ---------- */

  setMoodboard(file, links) {
    return this.app.fileManager.processFrontMatter(file, (fm) => {
      if (links.length) fm.moodboard = links; else delete fm.moodboard;
    });
  }
  chapterMoodboard(story, chapter) {
    const map = story && this.fm(story).chapter_moodboards;
    return map && typeof map === 'object' ? toArr(map[chapter]) : [];
  }
  setChapterMoodboard(story, chapter, links) {
    return this.app.fileManager.processFrontMatter(story, (fm) => {
      const map = fm.chapter_moodboards && typeof fm.chapter_moodboards === 'object' ? fm.chapter_moodboards : {};
      if (links.length) map[chapter] = links; else delete map[chapter];
      if (Object.keys(map).length) fm.chapter_moodboards = map; else delete fm.chapter_moodboards;
    });
  }
  /* Images for the scene you are writing: the scene's own, its chapter's, then its cast's and location's. */
  sceneMoodboard(scene) {
    const out = [];
    const seen = new Set();
    const add = (list, source, from) => {
      for (const s of toArr(list)) {
        const f = this.resolveLink(s, source);
        if (f && !seen.has(f)) { seen.add(f); out.push({ file: f, from }); }
      }
    };
    const fm = this.fm(scene);
    add(fm.moodboard, scene, 'Scene');
    const story = this.storyFor(scene);
    if (story && scene.parent && scene.parent.parent === story.parent) add(this.chapterMoodboard(story, scene.parent.name), story, scene.parent.name);
    for (const s of toArr(fm.characters)) {
      const c = this.resolveLink(s, scene);
      if (c) add(this.fm(c).moodboard, c, c.basename);
    }
    if (story) add(this.fm(story).moodboard, story, story.basename);
    return out;
  }

  /* Chapter years live on the story note as chapter_years: { "Chapter 3": "1003 AC" }. */
  setChapterYear(story, chapter, value) {
    return this.app.fileManager.processFrontMatter(story, (fm) => {
      const map = fm.chapter_years && typeof fm.chapter_years === 'object' ? fm.chapter_years : {};
      const v = String(value == null ? '' : value).trim();
      if (v) map[chapter] = /^-?\d+$/.test(v) ? Number(v) : v;
      else delete map[chapter];
      if (Object.keys(map).length) fm.chapter_years = map;
      else delete fm.chapter_years;
    });
  }
  moveChapterYear(story, from, to) {
    return this.app.fileManager.processFrontMatter(story, (fm) => {
      const map = fm.chapter_years;
      if (!map || typeof map !== 'object' || !(from in map)) return;
      if (to) map[to] = map[from];
      delete map[from];
      if (Object.keys(map).length) fm.chapter_years = map;
      else delete fm.chapter_years;
    });
  }
  setPresentYear(scene, value) {
    const v = String(value == null ? '' : value).trim();
    return this.app.fileManager.processFrontMatter(scene, (fm) => {
      if (v) fm.present_year = /^-?\d+$/.test(v) ? Number(v) : v;
      else delete fm.present_year;
    });
  }

  /* ---------- word tracking (writing goals) ---------- */

  initWordTracker() {
    this.wordCache = new Map();
    this.app.workspace.onLayoutReady(async () => {
      this.registerEvent(this.app.vault.on('modify', (f) => this.trackModify(f)));
      this.registerEvent(this.app.vault.on('create', (f) => {
        // New scenes start from whatever they were created with; only later typing counts.
        if (f instanceof TFile && f.extension === 'md' && this.underRoot(f.path)) {
          this.app.vault.cachedRead(f).then((t) => { if (!this.wordCache.has(f.path)) this.wordCache.set(f.path, wordCount(t)); });
        }
      }));
      this.registerEvent(this.app.vault.on('rename', (f, old) => {
        if (this.wordCache.has(old)) { this.wordCache.set(f.path, this.wordCache.get(old)); this.wordCache.delete(old); }
      }));
      this.registerEvent(this.app.vault.on('delete', (f) => this.wordCache.delete(f.path)));
      this.registerEvent(this.app.workspace.on('file-open', (f) => {
        if (f && !this.wordCache.has(f.path) && this.typeOf(f) === 'scene') {
          this.app.vault.cachedRead(f).then((t) => { if (!this.wordCache.has(f.path)) this.wordCache.set(f.path, wordCount(t)); });
        }
      }));
      this.updateStatusBar();
      // Baseline every scene once, in the background, so the first edit to any of them counts.
      const root = this.rootPath() + '/';
      for (const f of this.app.vault.getMarkdownFiles()) {
        if (!f.path.startsWith(root) || this.wordCache.has(f.path) || this.typeOf(f) !== 'scene') continue;
        const t = await this.app.vault.cachedRead(f);
        if (!this.wordCache.has(f.path)) this.wordCache.set(f.path, wordCount(t));
      }
    });
  }

  underRoot(path) { return path.startsWith(this.rootPath() + '/'); }

  async trackModify(f) {
    if (!(f instanceof TFile) || f.extension !== 'md' || !this.underRoot(f.path)) return;
    if (this.typeOf(f) !== 'scene') return;
    const n = wordCount(await this.app.vault.read(f));
    const prev = this.wordCache.get(f.path);
    this.wordCache.set(f.path, n);
    if (prev === undefined || n === prev) return;
    // Only count edits made here: changes arriving through sync land in files nobody has open.
    let open = false;
    this.app.workspace.iterateAllLeaves((l) => { if (l.view && l.view.file === f) open = true; });
    if (!open) return;
    const project = f.path.slice(this.rootPath().length + 1).split('/')[0];
    const log = this.settings.wordLog[project] || (this.settings.wordLog[project] = {});
    const day = dayKey();
    log[day] = (log[day] || 0) + (n - prev);
    this.saveSoon();
    this.updateStatusBar();
  }

  wordsOn(day, project) {
    const log = this.settings.wordLog[project || this.settings.activeProject] || {};
    return Math.max(0, log[day] || 0);
  }

  streak(project) {
    const goal = Number(this.settings.dailyGoal) || 0;
    if (goal <= 0) return 0;
    let d = new Date();
    if (this.wordsOn(dayKey(d), project) < goal) d = addDays(d, -1);
    let n = 0;
    while (this.wordsOn(dayKey(d), project) >= goal) { n++; d = addDays(d, -1); }
    return n;
  }

  /* ---------- authorship ---------- */

  /* Everything the typing log knows about a story's scenes, checked against the notes as they are now. */
  async authorship(story) {
    const t = this.typing;
    const all = await t.all();
    const data = await this.storyData(story);
    const scenes = [];
    const totals = emptyStats();
    const sessions = [];
    const devices = new Map();
    for (const ch of data.chapters) {
      for (const sc of ch.scenes) {
        const rec = t.fileRecord(all, sc.file.path);
        const hash = await sha256(proseOf(await this.app.vault.cachedRead(sc.file)));
        const sealed = rec ? rec.sessions.filter((s) => s.endHash).sort((a, b) => b.end - a.end) : [];
        const last = sealed[0];
        const open = rec && rec.sessions.some((s) => s.open);
        let status, statusText;
        if (!rec) { status = 'untracked'; statusText = 'No tracked typing'; }
        else if (open) { status = 'open'; statusText = 'Being written'; }
        else if (!last) { status = 'unsealed'; statusText = 'Not sealed'; }
        else if (last.endHash === hash) { status = 'match'; statusText = 'Matches last session'; }
        else {
          status = 'changed';
          const diff = sc.words - (last.endWords || 0);
          statusText = `Changed since (${diff >= 0 ? '+' : ''}${fmtNum(diff)} words)`;
        }
        const outside = rec ? rec.sessions.filter((s) => s.outside) : [];
        if (rec) {
          addStats(totals, rec.totals);
          for (const s of rec.sessions) {
            sessions.push(Object.assign({ scene: sc.file.basename, chapter: ch.name }, s));
            devices.set(s.device, s.deviceLabel);
          }
        }
        scenes.push({ file: sc.file, chapter: ch.name, words: sc.words, rec, status, statusText, outside, hash });
      }
    }
    sessions.sort((a, b) => a.start - b.start);

    /* The chain of seals on every device that wrote part of this story. */
    const chains = [];
    for (const d of all) if (devices.has(d.device)) chains.push(await t.verify(d));

    const verdicts = [];
    const tracked = scenes.filter((s) => s.rec);
    if (!tracked.length) verdicts.push({ level: 'info', text: 'Nothing in this story has been typed since tracking began.' });
    else {
      const changed = scenes.filter((s) => s.status === 'changed');
      const outside = scenes.filter((s) => s.outside.length);
      const untracked = scenes.filter((s) => !s.rec && s.words > 0);
      if (!changed.length && !outside.length) verdicts.push({ level: 'good', text: 'Every tracked scene matches its last sealed session, and no text appeared between sessions.' });
      if (changed.length) verdicts.push({ level: 'warn', text: `${changed.length} scene${changed.length === 1 ? ' has' : 's have'} changed since the last tracked session (edited somewhere Loresmith wasn't tracking).` });
      if (outside.length) verdicts.push({ level: 'warn', text: `${outside.length} scene${outside.length === 1 ? '' : 's'} had text change between sessions without being typed here.` });
      if (untracked.length) verdicts.push({ level: 'info', text: `${untracked.length} scene${untracked.length === 1 ? ' has' : 's have'} text but no tracked typing (written before tracking began, or elsewhere).` });
      const bad = chains.filter((c) => !c.ok);
      if (chains.length && !bad.length) verdicts.push({ level: 'good', text: `The log's chain of seals checks out on ${chains.length === 1 ? 'the device' : `all ${chains.length} devices`} that wrote this story.` });
      for (const c of bad) verdicts.push({ level: 'bad', text: `The log from ${c.label} (${c.device}) doesn't check out: ${c.bad} seal${c.bad === 1 ? '' : 's'} altered, ${c.broken} link${c.broken === 1 ? '' : 's'} missing.` });
    }
    return { story, words: data.words, scenes, totals, sessions, devices, chains, verdicts };
  }

  /* Writes "<Story> authorship report.md" next to the story note. */
  async exportAuthorship(story) {
    await this.typing.sealOpen();
    const a = await this.authorship(story);
    const pct = a.totals.typed + a.totals.pasted ? (a.totals.pasted / (a.totals.typed + a.totals.pasted)) * 100 : 0;
    const when = a.sessions.length ? `${fmtStamp(a.sessions[0].start).slice(0, 10)} to ${fmtStamp(a.sessions[a.sessions.length - 1].end).slice(0, 10)}` : 'no tracked sessions';
    const cell = (s) => String(s).replace(/\|/g, '\\|');
    const L = [];
    L.push(`# Authorship report: ${a.story.basename}`, '');
    L.push(`Generated ${fmtStamp(Date.now())} by Loresmith ${this.manifest.version}.`, '');
    L.push('## Summary', '');
    L.push(`- **Words now:** ${fmtNum(a.words)} in ${a.scenes.length} scene${a.scenes.length === 1 ? '' : 's'} (${a.scenes.filter((s) => s.rec).length} with tracked typing)`);
    L.push(`- **Writing time:** ${fmtDur(a.totals.active)} of active typing over ${fmtNum(a.sessions.length)} session${a.sessions.length === 1 ? '' : 's'}, ${when}`);
    L.push(`- **Characters:** ${fmtNum(a.totals.typed)} typed, ${fmtNum(a.totals.pasted)} pasted (${pct.toFixed(1)}% of everything put in), ${fmtNum(a.totals.deleted)} deleted, ${fmtNum(a.totals.other)} inserted by commands or plugins`);
    L.push(`- **Devices:** ${[...a.devices].map(([id, label]) => `${label} (${id})`).join(', ') || 'none'}`);
    for (const v of a.verdicts) L.push(`- ${v.text}`);
    L.push('', '## Scenes', '');
    L.push('| Chapter | Scene | Words | Typing time | Sessions | Typed | Pasted | Status | Fingerprint now |');
    L.push('|---|---|--:|--:|--:|--:|--:|---|---|');
    for (const s of a.scenes) {
      const r = s.rec;
      L.push(`| ${cell(s.chapter)} | ${cell(s.file.basename)} | ${fmtNum(s.words)} | ${r ? fmtDur(r.totals.active) : '–'} | ${r ? r.sessions.length : 0} | ${r ? fmtNum(r.totals.typed) : '–'} | ${r ? fmtNum(r.totals.pasted) : '–'} | ${s.statusText}${s.outside.length ? `; changed between sessions ${s.outside.length}×` : ''} | \`${s.hash.slice(0, 12)}\` |`);
    }
    L.push('', '## Sessions', '');
    L.push('| Started | Ended | Scene | Device | Active | Typed | Pasted | Deleted | Words | Note | Seal |');
    L.push('|---|---|---|---|--:|--:|--:|--:|---|---|---|');
    for (const s of a.sessions) {
      const words = s.startWords != null && s.endWords != null ? `${fmtNum(s.startWords)} → ${fmtNum(s.endWords)}` : '';
      const note = [s.outside ? `text changed before this session (was ${fmtNum(s.outsideFrom || 0)} words)` : '', s.unsealed || '', s.open ? 'still open' : ''].filter(Boolean).join('; ');
      L.push(`| ${fmtStamp(s.start)} | ${fmtStamp(s.end)} | ${cell(s.scene)} | ${cell(s.deviceLabel || s.device)} | ${fmtDur(s.active)} | ${fmtNum(s.typed)} | ${fmtNum(s.pasted)} | ${fmtNum(s.deleted)} | ${words} | ${cell(note)} | ${s.link ? `\`${s.link.slice(0, 12)}\`` : ''} |`);
    }
    L.push('', '## Seal chains', '');
    for (const c of a.chains) L.push(`- ${c.label} (${c.device}): ${c.sessions} sealed sessions, ${c.ok ? 'chain checks out' : 'chain does not check out'}. Latest seal: \`${c.head}\``);
    L.push('', '## How to read this', '');
    L.push('Loresmith records each change made in the editor as it happens and sorts it by how it arrived: typed (including autocorrect and autocomplete), pasted or dropped in, deleted, undone, or inserted by a command or plugin. Typing time counts only the stretches between keystrokes shorter than the idle limit, so pauses to think are left out.');
    L.push('');
    L.push('A session is a stretch of writing in one scene with no break longer than 20 minutes. When it ends, a SHA-256 fingerprint of the scene\'s text (without its properties) is stored, and the session is sealed by hashing it together with the seal before it, forming a chain. "Matches last session" means the scene today is exactly what was there when the last session ended. "Changed since" and "changed between sessions" mean text arrived some other way: another app, a device without Loresmith, or an edit to the file itself.');
    L.push('');
    L.push('The log lives in the plugin folder (`typing/<device>.json`). The chain shows whether the log was edited after the fact, but someone with the files could rebuild a whole log from scratch. To fix the record in time, send the latest seal above to someone you trust, or keep it somewhere dated, whenever you finish a draft.');
    L.push('');
    const path = normalizePath(`${a.story.parent.path}/${a.story.basename} authorship report.md`);
    const text = L.join('\n');
    const existing = this.app.vault.getAbstractFileByPath(path);
    let f;
    if (existing instanceof TFile) { await this.app.vault.modify(existing, text); f = existing; }
    else f = await this.app.vault.create(path, text);
    new Notice(`Saved ${f.basename}.`);
    return f;
  }

  onunload() { if (this.typing) this.typing.unload(); }

  updateStatusBar() {
    if (!this.statusEl) return;
    const show = this.settings.showStatusBar && this.listProjects().length;
    this.statusEl.toggle(!!show);
    if (!show) return;
    const today = this.wordsOn(dayKey());
    const goal = Number(this.settings.dailyGoal) || 0;
    const parts = [goal ? `${fmtNum(today)} / ${fmtNum(goal)} words today` : `${fmtNum(today)} words today`];
    if (this.typing && this.typing.loaded) {
      const t = this.typing.dayStats([this.typing.data], dayKey(), ['scene', 'lore']);
      if (t.active >= 60000) parts.push(`${fmtDur(t.active)} writing`);
      const pm = this.typing.pomo;
      if (pm) parts.push(pm.done ? 'Pomodoro done' : `Pomodoro ${Math.ceil((pm.target - pm.active) / 60000)}m left`);
    }
    this.statusEl.setText(parts.join(' · '));
    this.statusEl.toggleClass('is-met', goal > 0 && today >= goal);
    this.statusEl.setAttr('aria-label', 'Loresmith: open writing goals');
  }

  /* ---------- project + index ---------- */

  rootPath() { return normalizePath(this.settings.rootFolder || 'Lore'); }

  listProjects() {
    const r = this.app.vault.getAbstractFileByPath(this.rootPath());
    if (!(r instanceof TFolder)) return [];
    return r.children.filter((c) => c instanceof TFolder).map((c) => c.name).sort(natural);
  }

  projectPath() {
    const ps = this.listProjects();
    if (!ps.length) return null;
    if (!ps.includes(this.settings.activeProject)) {
      this.settings.activeProject = ps[0];
      this.saveSettings();
    }
    return normalizePath(`${this.rootPath()}/${this.settings.activeProject}`);
  }

  async createProject(name) {
    name = sanitize(name);
    if (!name) return;
    await this.ensureFolder(`${this.rootPath()}/${name}`);
    this.settings.activeProject = name;
    await this.saveSettings();
  }

  fm(file) {
    const c = this.app.metadataCache.getFileCache(file);
    return (c && c.frontmatter) || {};
  }
  typeOf(file) {
    if (!(file instanceof TFile) || file.extension !== 'md') return null;
    const fm = this.fm(file);
    const t = String(fm.lore || fm.type || '').toLowerCase();
    return t && (TYPES[t] || t === 'scene' || t === 'outline') ? t : null;
  }

  index() {
    const idx = { scene: [] };
    for (const k of Object.keys(TYPES)) idx[k] = [];
    const root = this.projectPath();
    if (!root) return idx;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(root + '/')) continue;
      const t = this.typeOf(f);
      if (t && idx[t]) idx[t].push(f);
    }
    for (const k of Object.keys(idx)) idx[k].sort((a, b) => natural(a.basename, b.basename));
    return idx;
  }

  tagsOf(file) {
    return toArr(this.fm(file).tags).map(cleanTag).filter((t) => t && !TYPES[t.toLowerCase()] && t.toLowerCase() !== 'scene');
  }

  allTags(idx) {
    const counts = new Map();
    for (const [k, files] of Object.entries(idx)) {
      if (k === 'scene') continue;
      for (const f of files) for (const t of this.tagsOf(f)) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return counts;
  }

  storyFor(file) {
    const t = this.typeOf(file);
    if (t === 'story') return file;
    let folder = file instanceof TFolder ? file : file.parent;
    for (let depth = 0; folder && depth < 3; depth++, folder = folder.parent) {
      const s = folder.children.find((c) => c instanceof TFile && this.typeOf(c) === 'story');
      if (s) return s;
    }
    return null;
  }

  /* ---------- links ---------- */

  resolveLink(s, source) {
    if (!s) return null;
    const lp = linkText(s);
    if (!lp) return null;
    return this.app.metadataCache.getFirstLinkpathDest(lp, source ? source.path : '');
  }
  linkTo(file, source) {
    return `[[${this.app.metadataCache.fileToLinktext(file, source ? source.path : '', true)}]]`;
  }

  /* ---------- species hierarchy ---------- */

  parentSpecies(f) {
    const par = this.resolveLink(this.fm(f).subspeciesOf, f);
    return par && par !== f && this.typeOf(par) === 'species' ? par : null;
  }
  /* A species' classification as a path, "Beast › Dragon" -> ['Beast', 'Dragon'], inherited from its parent species
     when it has none of its own: { path, from } where from is the species it came from (or null if its own). */
  classOf(f) {
    const seen = new Set();
    let cur = f;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const raw = String(this.fm(cur).classification || '').trim();
      if (raw) return { path: raw.split(/\s*(?:›|>|\/|\\)\s*/).filter(Boolean), from: cur === f ? null : cur };
      cur = this.taxonParent(cur) || this.hybridParents(cur)[0] || null;
    }
    return { path: [], from: null };
  }
  /* Every subspecies below this one, any depth. */
  descendantSpecies(f, idx) {
    idx = idx || this.index();
    const out = [];
    const walk = (x, d) => { for (const k of this.childSpecies(x, idx)) { if (out.some((o) => o.file === k) || k === f) continue; out.push({ file: k, depth: d }); walk(k, d + 1); } };
    walk(f, 0);
    return out;
  }
  /* "Witch or wizard · Human · Being": the species, its parents, and its top classification. */
  speciesLine(f) {
    const chain = [];
    const seen = new Set([f]);
    let par = this.parentSpecies(f);
    while (par && !seen.has(par)) { chain.push(par.basename); seen.add(par); par = this.parentSpecies(par); }
    const hy = this.hybridParents(f);
    if (hy.length) chain.splice(0, 0, hy.map((h) => h.basename).join(' × '));
    const cls = this.classOf(f).path;
    return [f.basename, ...chain, cls[0]].filter(Boolean).join(' · ');
  }
  /* Values already used for a field across the project, for autocomplete: "Being", "Beast"... */
  usedValues(key) {
    const counts = new Map();
    for (const f of this.graph().types.keys()) {
      for (const v of toArr(this.fm(f)[key])) {
        const t = String(v).trim();
        if (!t || /^\[\[/.test(t)) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || natural(a[0], b[0])).map(([v]) => v);
  }
  childSpecies(f, idx) {
    return (idx || this.index()).species.filter((x) => this.parentSpecies(x) === f);
  }

  /* ---------- species, creatures and plants alike ---------- */

  /* The entry one level up: a subspecies' species, a creature's or plant's "Variant of". */
  taxonParent(f) {
    const t = this.typeOf(f);
    if (t === 'species') return this.parentSpecies(f);
    if (t !== 'creature' && t !== 'plant') return null;
    const par = this.resolveLink(this.fm(f).variantOf, f);
    return par && par !== f && this.typeOf(par) === t ? par : null;
  }
  childTaxa(f, idx) {
    const t = this.typeOf(f);
    if (!TAXA.includes(t)) return [];
    return (idx || this.index())[t].filter((x) => this.taxonParent(x) === f);
  }
  /* What one level down is called: subspecies or variants. */
  childWord(type, n) {
    if (type === 'species') return 'subspecies';
    return n === 1 ? 'variant' : 'variants';
  }
  async createVariant(parent, name) {
    const t = this.typeOf(parent);
    if (t === 'species') return this.createSubspecies(parent, name);
    const f = await this.createEntity(t, { name }, false);
    if (!f) return null;
    await this.app.fileManager.processFrontMatter(f, (fm) => { fm.variantOf = this.linkTo(parent, f); });
    return f;
  }
  /* "Wyvern · Dragon · Beast": the entry, everything above it, and its top classification. */
  taxonLine(f) {
    if (this.typeOf(f) === 'species') return this.speciesLine(f);
    const chain = [];
    const seen = new Set([f]);
    for (let par = this.taxonParent(f); par && !seen.has(par); par = this.taxonParent(par)) { chain.push(par.basename); seen.add(par); }
    return [f.basename, ...chain, this.classOf(f).path[0]].filter(Boolean).join(' · ');
  }

  /* Turns a species into a creature or plant (or back), with everything filed under it. The notes move to the new
     kind's folder (keeping any subfolders) and links to them keep working. */
  async convertTaxon(f, to) {
    const from = this.typeOf(f);
    if (!TAXA.includes(from) || !TAXA.includes(to) || from === to) return;
    const idx = this.index();
    const all = [];
    const walk = (x) => { if (all.includes(x)) return; all.push(x); for (const k of this.childTaxa(x, idx)) walk(k); };
    walk(f);
    const proj = this.projectPath();
    const oldBase = `${proj}/${TYPES[from].folder}`;
    const newBase = `${proj}/${TYPES[to].folder}`;
    const parentKey = (t) => (t === 'species' ? 'subspeciesOf' : 'variantOf');
    const placeKey = (t) => (t === 'species' ? 'homeland' : 'habitat');
    const people = idx.character.filter((c) => toArr(this.fm(c).species).some((v) => all.includes(this.resolveLink(v, c)))).length;
    for (const x of all) {
      await this.app.fileManager.processFrontMatter(x, (fm) => {
        fm.type = to;
        if (fm.lore) fm.lore = to;
        const tags = toArr(fm.tags).map((t) => (cleanTag(t).toLowerCase() === from ? to : t));
        fm.tags = tags.some((t) => cleanTag(t).toLowerCase() === to) ? tags : [to, ...tags];
        const pk = parentKey(from), nk = parentKey(to);
        if (pk !== nk && fm[pk] != null) { if (fm[nk] == null) fm[nk] = fm[pk]; delete fm[pk]; }
        const pl = placeKey(from), nl = placeKey(to);
        if (pl !== nl && fm[pl] != null) {
          const merged = [...toArr(fm[nl]), ...toArr(fm[pl]).filter((v) => !toArr(fm[nl]).includes(v))];
          if (merged.length) fm[nl] = merged;
          delete fm[pl];
        }
        if (TYPES[to].details.length && !toArr(fm.details).length) fm.details = [...TYPES[to].details];
      });
    }
    for (const x of all) {
      const dir = x.parent ? x.parent.path : '';
      const sub = dir === oldBase ? '' : dir.startsWith(oldBase + '/') ? dir.slice(oldBase.length + 1) : '';
      const target = normalizePath(sub ? `${newBase}/${sub}` : newBase);
      if (dir === target) continue;
      await this.ensureFolder(target);
      await this.app.fileManager.renameFile(x, this.uniquePath(target, x.basename));
    }
    this.dropGraph();
    const n = all.length - 1;
    new Notice(`Moved ${f.basename}${n ? ` and ${n} ${this.childWord(from, n)}` : ''} to ${TYPES[to].plural}.`
      + (people && to !== 'species' ? ` ${people} character${people === 1 ? ' still lists' : 's still list'} it as their Species; those links keep working.` : ''), 8000);
  }
  /* Moves every species filed under one top classification ("Beast", "Plant") to the Bestiary or Flora at once. */
  moveClassification() {
    const idx = this.index();
    const by = new Map();
    for (const f of idx.species) {
      if (this.taxonParent(f)) continue; // subspecies travel with their parent
      const c = this.classOf(f).path[0];
      if (!c) continue;
      const k = c.toLowerCase();
      if (!by.has(k)) by.set(k, { name: c, files: [] });
      by.get(k).files.push(f);
    }
    if (!by.size) { new Notice('None of your species have a classification yet. Move them one at a time from their page instead.'); return; }
    new ItemSuggest(this.app, [...by.values()], (g) => `${g.name} (${g.files.length})`, 'Which classification?', (g) => {
      new ItemSuggest(this.app, ['creature', 'plant'], (t) => TYPES[t].plural, `Move ${g.name} to…`, (to) => {
        new ConfirmModal(this.app, {
          title: `Move ${g.name} to ${TYPES[to].plural}?`,
          message: `${g.files.map((f) => f.basename).join(', ')}, and everything filed under them, become ${TYPES[to].plural === 'Flora' ? 'plants' : 'creatures'} and move to the ${TYPES[to].folder} folder. Their writing, fields and links are kept.`,
          cta: 'Move',
        }, async () => { for (const f of g.files) await this.convertTaxon(f, to); }).open();
      }).open();
    }).open();
  }
  /* Menu: move this species, creature or plant to one of the other two. */
  convertMenu(e, f, after) {
    const from = this.typeOf(f);
    const m = new Menu();
    for (const to of TAXA) {
      if (to === from) continue;
      addMenuItem(m, `Move to ${TYPES[to].plural}`, TYPES[to].icon, () => {
        const n = this.childTaxa(f).length;
        new ConfirmModal(this.app, {
          title: `Move ${f.basename} to ${TYPES[to].plural}?`,
          message: `It becomes a ${TYPES[to].label.toLowerCase()}${n ? `, along with everything filed under it` : ''}, and moves to the ${TYPES[to].folder} folder. Its writing and fields are kept, and links to it keep working.`,
          cta: 'Move',
        }, async () => { await this.convertTaxon(f, to); if (after) after(); }).open();
      });
    }
    m.showAtMouseEvent(e);
  }

  /* ---------- hybrids and ancestry ---------- */

  /* The species a hybrid comes from: Half-elf -> [Human, Elf]. */
  hybridParents(f) {
    const out = [];
    for (const s of toArr(this.fm(f).hybridOf)) {
      const d = this.resolveLink(s, f);
      if (d && d !== f && this.typeOf(d) === 'species' && !out.includes(d)) out.push(d);
    }
    return out;
  }
  /* Species that are hybrids of this one: Elf -> [Half-elf]. */
  hybridSpecies(f, idx) {
    return (idx || this.index()).species.filter((x) => this.hybridParents(x).includes(f));
  }
  /* Adds a share of a species to an ancestry map, splitting named hybrids into their parent species. */
  addSpeciesShare(map, sp, share, seen) {
    const hy = sp ? this.hybridParents(sp) : [];
    if (hy.length && !seen.has(sp)) {
      seen.add(sp);
      for (const h of hy) this.addSpeciesShare(map, h, share / hy.length, seen);
      seen.delete(sp);
      return;
    }
    map.set(sp, (map.get(sp) || 0) + share);
  }
  /* A character's species list, resolved: [species files]. */
  ownSpecies(f) {
    const out = [];
    for (const s of toArr(this.fm(f).species)) {
      const d = this.resolveLink(s, f);
      if (d && this.typeOf(d) === 'species' && !out.includes(d)) out.push(d);
    }
    return out;
  }
  /* Blood ancestry worked out from the family tree: { map: Map(species|null -> share), fromParents }.
     Each parent gives an equal share (half each); a parent with nothing known, or a missing second parent, counts
     as unknown (null). Someone with no known parents falls back to their own Species, split evenly. */
  ancestryOf(f) {
    const g = this.graph();
    const memo = g._ancestry || (g._ancestry = new Map());
    const visiting = new Set();
    const own = (x) => {
      const sp = this.ownSpecies(x);
      const m = new Map();
      if (!sp.length) m.set(null, 1);
      for (const s of sp) this.addSpeciesShare(m, s, 1 / sp.length, new Set());
      return m;
    };
    const blank = (m) => m.size === 1 && m.has(null);
    const calc = (x) => {
      if (memo.has(x)) return memo.get(x);
      if (visiting.has(x)) return { map: own(x), fromParents: false };
      visiting.add(x);
      const pars = [...(g.parents.get(x) || [])].filter((q) => q !== x);
      const got = pars.map(calc);
      let res;
      if (!got.some((e) => !blank(e.map))) res = { map: own(x), fromParents: false };
      else {
        const n = Math.max(2, pars.length);
        const map = new Map();
        for (const e of got) for (const [k, v] of e.map) map.set(k, (map.get(k) || 0) + v / n);
        if (pars.length < n) map.set(null, (map.get(null) || 0) + (n - pars.length) / n);
        res = { map, fromParents: true };
      }
      visiting.delete(x);
      memo.set(x, res);
      return res;
    };
    return calc(f);
  }
  /* Species up the subspecies chain, starting with itself. */
  speciesChain(f) {
    const out = [];
    for (let cur = f; cur && !out.includes(cur); cur = this.parentSpecies(cur)) out.push(cur);
    return out;
  }
  /* Same species, one under the other, or a hybrid of something related. */
  speciesRelated(a, b, seen = new Set()) {
    if (a === b) return true;
    if (this.speciesChain(a).includes(b) || this.speciesChain(b).includes(a)) return true;
    const key = a.path + '|' + b.path;
    if (seen.has(key)) return false;
    seen.add(key);
    return this.hybridParents(a).some((h) => this.speciesRelated(h, b, seen))
      || this.hybridParents(b).some((h) => this.speciesRelated(a, h, seen));
  }
  /* "½ Elf, ½ Human", or "Human (½ Witch or wizard, ½ Muggle)" when the mix is within one species.
     { text, mixed, mismatch, fromParents }. */
  ancestrySummary(f) {
    const { map, fromParents } = this.ancestryOf(f);
    const known = [...map.entries()].filter(([k, v]) => k && v > 1e-9);
    const unknown = map.get(null) || 0;
    const groups = new Map();
    for (const [k, v] of known) {
      const ch = this.speciesChain(k);
      const root = ch[ch.length - 1];
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push([k, v]);
    }
    const parts = [...groups.values()].map((list) => {
      const total = list.reduce((a, [, v]) => a + v, 0);
      list.sort((a, b) => b[1] - a[1] || natural(a[0].basename, b[0].basename));
      if (list.length === 1) return { total, text: total > 1 - 1e-9 ? list[0][0].basename : `${fracText(total)} ${list[0][0].basename}` };
      const chains = list.map(([k]) => this.speciesChain(k));
      const lca = chains[0].find((x) => chains.every((c) => c.includes(x)));
      const inner = list.map(([k, v]) => `${fracText(v)} ${k.basename}`).join(', ');
      return { total, text: `${total > 1 - 1e-9 ? '' : fracText(total) + ' '}${lca.basename} (${inner})` };
    }).sort((a, b) => b.total - a.total);
    if (unknown > 1e-9 && parts.length) parts.push({ total: unknown, text: `${fracText(unknown)} unknown` });
    const own = this.ownSpecies(f);
    const mismatch = fromParents && unknown < 1e-9 && own.length > 0
      && own.some((s) => !known.some(([k]) => this.speciesRelated(s, k)));
    return { text: parts.map((x) => x.text).join(', '), mixed: known.length > 1, mismatch, fromParents };
  }
  /* Parents before their subspecies, any depth: [{ file, depth }]. Loops (A under B under A) fall back to top level. */
  speciesTree(files) { return this.entityTree(files, 'species'); }

  /* ---------- grouping lists: folders, type, nesting ---------- */

  /* What an entry nests under in lists: a subspecies under its species, a branch under its organization,
     a place under the place it's part of. */
  nestParent(f, type) {
    if (TAXA.includes(type)) return this.taxonParent(f);
    if (type === 'organization' || type === 'location') {
      const d = this.resolveLink(this.fm(f).partOf, f);
      return d && d !== f && this.typeOf(d) === type ? d : null;
    }
    return null;
  }
  /* The field "group by type" reads for this kind of entry, or null if it has none. */
  kindField(type) {
    if (TAXA.includes(type)) return { key: 'classification', label: 'Classification' };
    if (type === 'character') return { key: 'category', label: 'Importance' };
    if (type === 'word') return { key: 'language', label: 'Language' };
    const fd = TYPES[type] && TYPES[type].fields.find((x) => x.key === 'kind');
    return fd ? { key: 'kind', label: fd.label } : null;
  }
  /* [mode, label, icon] for the group picker. */
  groupModes(type) {
    const out = [['folder', 'Folders', 'folder-tree']];
    const k = this.kindField(type);
    if (k) out.push(['kind', `By ${k.label.toLowerCase()}`, 'tags']);
    out.push(['none', 'No groups', 'list']);
    return out;
  }
  groupMode(type) {
    const m = this.settings.groupBy[type];
    if (this.groupModes(type).some(([x]) => x === m)) return m;
    return TAXA.includes(type) ? 'kind' : 'folder';
  }
  kindOf(f, type) {
    if (TAXA.includes(type)) return this.classOf(f).path[0] || '';
    if (type === 'character') return cap(String(this.fm(f).category || 'major'));
    if (type === 'word') return this.languageNames(f).join(', ');
    const v = toArr(this.fm(f).kind)[0];
    return v ? v.trim() : '';
  }
  /* Where an entry sits under its type's folder: "Lore/Saga/Organizations/Guilds/Merchant/X.md" -> "Guilds/Merchant".
     Entries kept elsewhere in the project use their path from the project root. */
  folderKeyOf(f, type) {
    const proj = this.projectPath() || '';
    const dir = f.parent ? f.parent.path : '';
    let rel = proj && dir.startsWith(proj + '/') ? dir.slice(proj.length + 1) : '';
    const base = TYPES[type].folder;
    if (rel === base) rel = '';
    else if (rel.startsWith(base + '/')) rel = rel.slice(base.length + 1);
    return rel;
  }
  /* Splits entries into groups for the overview and sidebar: [{ key, label, depth, files, total, dir, kind }].
     One group with an empty key means "show it flat". */
  groupEntries(files, type, mode) {
    mode = mode || this.groupMode(type);
    if (mode === 'kind' && this.kindField(type)) {
      const by = new Map();
      for (const f of files) {
        const raw = this.kindOf(f, type);
        const k = raw.toLowerCase();
        if (!by.has(k)) by.set(k, { key: k, label: raw, depth: 0, files: [], kind: raw });
        const g = by.get(k);
        /* "guild" and "Guild" are one group; show the capitalized spelling if anyone used it. */
        if (raw && raw !== g.label && /^[A-Z]/.test(raw) && !/^[A-Z]/.test(g.label)) { g.label = raw; g.kind = raw; }
        g.files.push(f);
      }
      const none = TAXA.includes(type) ? 'Unclassified' : `No ${this.kindField(type).label.toLowerCase()}`;
      return [...by.values()].sort((a, b) => (!a.key) - (!b.key) || natural(a.label, b.label))
        .map((g) => Object.assign(g, { label: g.label ? cap(g.label) : none, kind: g.kind ? cap(g.kind) : '', total: g.files.length }));
    }
    if (mode === 'folder') {
      const proj = this.projectPath() || '';
      const by = new Map();
      const add = (key) => {
        if (!by.has(key)) by.set(key, { key, label: key.split('/').pop() || 'Not in a folder', depth: Math.max(0, key.split('/').length - 1), files: [], total: 0, dir: null });
        return by.get(key);
      };
      for (const f of files) {
        const key = this.folderKeyOf(f, type);
        const g = add(key);
        g.files.push(f);
        if (!g.dir) g.dir = f.parent ? f.parent.path : null;
        /* Parent folders get a heading even when nothing sits directly in them. */
        const parts = key ? key.split('/') : [];
        for (let i = parts.length - 1; i >= 0; i--) {
          const a = add(parts.slice(0, i).join('/'));
          if (!a.dir && g.dir) a.dir = g.dir.split('/').slice(0, g.dir.split('/').length - (parts.length - i)).join('/');
          if (i > 0) a.total += 1;
        }
        g.total += 1;
      }
      /* The type's own folder holds nothing directly: drop its empty heading. */
      const root = by.get('');
      if (root && !root.files.length) by.delete('');
      if (root) root.dir = root.dir || `${proj}/${TYPES[type].folder}`;
      const seg = (k) => (k ? k.split('/') : []);
      /* Folders first, loose entries last, like the file explorer. */
      return [...by.values()].sort((a, b) => {
        if (!a.key !== !b.key) return a.key ? -1 : 1;
        const x = seg(a.key), y = seg(b.key);
        for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = natural(x[i], y[i]); if (c) return c; }
        return x.length - y.length;
      });
    }
    return [{ key: '', label: '', depth: 0, files, total: files.length }];
  }
  /* Groups worth drawing headings for: more than one, or one that isn't the plain top level. */
  hasGroups(groups) { return groups.length > 1 || (groups.length === 1 && !!groups[0].key); }
  groupFolded(type, mode, key) { return !!this.settings.foldedGroups[`${type}:${mode}:${key}`]; }
  async toggleGroup(type, mode, key) {
    const k = `${type}:${mode}:${key}`;
    if (this.settings.foldedGroups[k]) delete this.settings.foldedGroups[k];
    else this.settings.foldedGroups[k] = true;
    await this.saveSettings();
  }
  /* A folder group is hidden when a folder above it is folded. */
  groupHidden(type, mode, key) {
    if (mode !== 'folder' || !key) return false;
    const parts = key.split('/');
    for (let i = 1; i < parts.length; i++) if (this.groupFolded(type, mode, parts.slice(0, i).join('/'))) return true;
    return false;
  }
  /* Moves an entry into a subfolder of its type's folder ("" for the top), keeping links intact. */
  promptMoveToFolder(f, type) {
    const proj = this.projectPath();
    if (!proj) return;
    const base = `${proj}/${TYPES[type].folder}`;
    const cur = this.folderKeyOf(f, type);
    new NameModal(this.app, {
      title: `Move ${f.basename} to folder`, placeholder: 'Guilds/Merchant (empty for the top level)', cta: 'Move',
      initial: cur, allowEmpty: true,
    }, async (v) => {
      const sub = String(v || '').split('/').map((x) => sanitize(x.trim())).filter(Boolean).join('/');
      const dir = normalizePath(sub ? `${base}/${sub}` : base);
      if (f.parent && f.parent.path === dir) return;
      await this.ensureFolder(dir);
      const dest = this.uniquePath(dir, f.basename);
      await this.app.fileManager.renameFile(f, dest);
      new Notice(`Moved ${f.basename} to ${sub || TYPES[type].folder}.`);
    }).open();
  }

  /* Entries in tree order, children under their parents: [{ file, depth }]. Loops fall back to top level. */
  entityTree(files, type) {
    const inList = new Set(files);
    const kids = new Map();
    const roots = [];
    for (const f of files) {
      const par = this.nestParent(f, type);
      if (par && inList.has(par)) { if (!kids.has(par)) kids.set(par, []); kids.get(par).push(f); }
      else roots.push(f);
    }
    const out = [];
    const seen = new Set();
    const walk = (f, depth) => {
      if (seen.has(f)) return;
      seen.add(f);
      out.push({ file: f, depth });
      for (const c of kids.get(f) || []) walk(c, depth + 1);
    };
    for (const r of roots) walk(r, 0);
    for (const f of files) walk(f, 0);
    return out;
  }
  async createSubspecies(parent, name) {
    const f = await this.createEntity('species', { name }, false);
    if (!f) return null;
    await this.app.fileManager.processFrontMatter(f, (fm) => { fm.subspeciesOf = this.linkTo(parent, f); });
    return f;
  }

  /* ---------- files ---------- */

  async ensureFolder(path) {
    path = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(path)) return;
    let cur = '';
    for (const part of path.split('/')) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        try { await this.app.vault.createFolder(cur); } catch (e) { /* created concurrently */ }
      }
    }
  }
  uniquePath(folder, base, ext = 'md') {
    let p = normalizePath(`${folder}/${base}.${ext}`);
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(p)) p = normalizePath(`${folder}/${base} ${i++}.${ext}`);
    return p;
  }
  uniqueFolder(parent, base) {
    let p = normalizePath(`${parent}/${base}`);
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(p)) p = normalizePath(`${parent}/${base} ${i++}`);
    return p;
  }
  async trash(f) {
    if (this.app.fileManager.trashFile) await this.app.fileManager.trashFile(f);
    else await this.app.vault.trash(f, true);
  }
  async renameEntity(file, name) {
    name = sanitize(name);
    if (!name || name === file.basename) return;
    const target = normalizePath(`${file.parent.path}/${name}.${file.extension}`);
    if (this.app.vault.getAbstractFileByPath(target)) {
      new Notice(`"${name}" already exists in this folder.`);
      return;
    }
    await this.app.fileManager.renameFile(file, target);
  }

  /* ---------- creation ---------- */

  promptCreate(type, preset) {
    if (!this.projectPath()) {
      new NameModal(this.app, { title: 'Start a project first', placeholder: 'Project name', cta: 'Create project' }, async (n) => {
        await this.createProject(n);
        this.refreshOverviews();
        new CreateModal(this.app, this, type).open();
      }).open();
      return;
    }
    new CreateModal(this.app, this, type, preset).open();
  }

  async createEntity(type, data = {}, open = true) {
    const def = TYPES[type];
    const proj = this.projectPath();
    if (!def || !proj) { new Notice('Create a project first.'); return null; }

    let name = def.nameParts
      ? ['first', 'middle', 'last'].map((k) => (data[k] || '').trim()).filter(Boolean).join(' ')
      : (data.name || '').trim();
    name = sanitize(name) || `Untitled ${def.label.toLowerCase()}`;

    if (type === 'story') return this.createStory(name, data, open);

    const base = `${proj}/${def.folder}`;
    const folder = data.folder && (data.folder === base || data.folder.startsWith(base + '/') || data.folder.startsWith(proj + '/')) ? data.folder : base;
    await this.ensureFolder(folder);
    const heads = def.plain ? [] : [...def.sections, ...def.details];
    const body = heads.map((h) => `## ${h}\n`).join('\n');
    const file = await this.app.vault.create(this.uniquePath(folder, name), `---\ntype: ${type}\n---\n\n${body}`);

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (def.nameParts) {
        fm.full_name = name;
        if (data.title && data.title.trim()) fm.titles = [data.title.trim()];
        fm.category = data.category || 'major';
        fm.status = 'Alive';
      }
      if (def.details.length) fm.details = [...def.details];
      if (def.attributes) {
        fm.attributes = [...def.attributes];
        for (const a of def.attributes) fm[a] = null;
      }
      const tag = cleanTag(data.tag);
      fm.tags = tag && tag !== type ? [type, tag] : [type];
      /* Made from a group heading: start in that group. */
      if (data.kind && type !== 'character') {
        const kf = this.kindField(type);
        if (kf && type === 'word') {
          const lang = this.index().language.find((l) => l.basename.toLowerCase() === String(data.kind).toLowerCase());
          if (lang) fm.language = [this.linkTo(lang, file)];
        } else if (kf) fm[kf.key] = data.kind;
      }
    });

    if (open) await this.openEntity(file, type);
    return file;
  }

  /* ---------- generators (rolled through the Randomness plugin) ---------- */

  randomness() {
    const r = this.app.plugins && this.app.plugins.plugins && this.app.plugins.plugins.randomness;
    return (r && r.api) || null;
  }

  /*
   * Every table in the vault's generator files: lower-cased name → the file that defines it. Read from the .rdm and
   * .ipt files themselves (only under Randomness's Generator root when it has one, the same files Randomness reads),
   * because Randomness's own table list leaves out tables marked Hidden:, and the audience versions are hidden.
   */
  async genScanTables() {
    if (this._genScan && Date.now() - this._genScan.at < 5000) return this._genScan.map;
    const r = this.app.plugins && this.app.plugins.plugins && this.app.plugins.plugins.randomness;
    const root = String((r && r.settings && r.settings.generatorRoot) || '').trim().replace(/\/+$/, '');
    const map = new Map();
    const files = this.app.vault.getFiles().filter((f) => /\.(rdm|ipt)$/i.test(f.path)
      && (!root || f.path === root || f.path.startsWith(root + '/')));
    files.sort((a, b) => a.path.localeCompare(b.path));
    for (const f of files) {
      let text = '';
      try { text = await this.app.vault.cachedRead(f); } catch (e) { continue; }
      for (const n of genTableNamesIn(text)) if (!map.has(n.toLowerCase())) map.set(n.toLowerCase(), f.path);
    }
    this._genScan = { at: Date.now(), map };
    return map;
  }

  async genTableNames() {
    return new Set((await this.genScanTables()).keys());
  }

  /* Roll the first of these tables that exists. Throws with Randomness's own message when none does. */
  async rollTable(names) {
    const api = this.randomness();
    if (!api) throw new Error('The Randomness plugin is not enabled.');
    const known = await this.genTableNames();
    const order = known.size ? names.filter((n, i) => i === names.length - 1 || known.has(n.toLowerCase())) : names;
    let err = '';
    for (const n of order) {
      let r;
      try { r = await api.rollUnscoped(n); } catch (e) { err = String((e && e.message) || e); continue; }
      if (r && !r.error) return genClean(r.result);
      err = (r && r.error) || `No table named "${n}".`;
    }
    throw new Error(err || `No table named "${names[names.length - 1]}".`);
  }

  /* One generator field: a value, or a list of different values when the field has a count. */
  async genRoll(f, ctx) {
    const base = f.table.replace('{family}', ctx.family || '').trim();
    const tiers = ctx.tier === 'MG' ? ['MG', 'YA'] : ctx.tier === 'YA' ? ['YA'] : [];
    const names = [...tiers.map((t) => `${base} ${t}`), base];
    if (!f.count) return this.rollTable(names);
    const out = [];
    let tries = 0;
    while (out.length < f.count && tries++ < f.count * 8) {
      const v = await this.rollTable(names);
      if (v && !out.includes(v)) out.push(v);
    }
    return out;
  }

  /* Fill a section (made if missing), after anything already in it. */
  genPut(p, name, text) {
    text = String(text || '').trim();
    if (!text) return;
    let sec = findSec(p, name);
    if (!sec) { sec = { name, lines: [] }; p.sections.push(sec); }
    const t = secText(sec);
    sec.lines = [...(t ? [t, ''] : []), ...text.split('\n')];
  }

  async genWriteBody(file, fn) {
    await this.app.vault.process(file, (d) => {
      const s = splitFm(d);
      return s.fm + editBody(s.body, fn);
    });
  }

  /* Save a generator's result as an entry. st holds the rolled values and what they were rolled for. */
  async saveGenerated(kind, st) {
    const name = (st.name || '').trim();
    if (kind === 'character') return this.saveGenCharacter(name, st.values, st.ctx);
    if (kind === 'place') return this.saveGenPlace(name, st.values, st.ctx);
    if (kind === 'plot') return this.saveGenPlot(name, st.values, st.ctx);
    if (kind === 'prompt') return this.saveGenPrompt(name, st);
    return null;
  }

  async saveGenCharacter(name, v, ctx) {
    const file = await this.createEntity('character', { first: name, category: 'major' }, false);
    if (!file) return null;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const set = (k, val) => { if (Array.isArray(val) ? val.length : val) fm[k] = val; };
      set('occupation', v.occupation);
      set('build', v.build);
      set('features', v.features);
      set('traits', toArr(v.traits));
      set('flaws', toArr(v.flaws));
      set('skills', toArr(v.skills));
      set('fears', toArr(v.fear));
      const attrs = toArr(fm.attributes);
      const attr = (k, val) => {
        if (!(Array.isArray(val) ? val.length : val)) return;
        fm[k] = val;
        if (!attrs.includes(k)) attrs.push(k);
      };
      attr('archetype', v.archetype);
      attr('genre_tropes', toArr(v.tropes));
      if (attrs.length) fm.attributes = attrs;
      const tags = toArr(fm.tags);
      if (!tags.includes('generated')) fm.tags = [...tags, 'generated'];
    });
    await this.genWriteBody(file, (p) => {
      const look = [v.build ? `${cap(String(v.build))} build` : '', v.features, v.style].filter(Boolean).join(', ');
      this.genPut(p, 'Physical Description', genSentence(look));
      const traits = toArr(v.traits).map((t) => genLower(t)).join(' and ');
      const flaw = toArr(v.flaws).map((t) => genLower(t)).join(' and ');
      const pers = [v.archetype ? genSentence(v.archetype) : '', traits ? genSentence(traits + (flaw ? `, but ${flaw}` : '')) : ''];
      this.genPut(p, 'Personality', pers.filter(Boolean).join(' '));
      if (v.trouble) this.genPut(p, 'Biography', `Where the story finds them: ${genLower(v.trouble)}.`);
      this.genPut(p, 'Psychology', genInnerLine(v));
      const notes = [v.motivation ? `Want: ${v.motivation}` : '', v.wound ? `Wound: ${v.wound}` : ''].filter(Boolean);
      this.genPut(p, "Author's notes", notes.join('\n'));
    });
    return file;
  }

  async saveGenPlace(name, v, ctx) {
    const file = await this.createEntity('location', { name }, false);
    if (!file) return null;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (v.kind) fm.kind = v.kind;
      const tags = toArr(fm.tags);
      if (!tags.includes('generated')) fm.tags = [...tags, 'generated'];
    });
    await this.genWriteBody(file, (p) => {
      this.genPut(p, 'About', [genSentence(v.flavor), v.atmosphere ? genSentence(`It feels ${genLower(v.atmosphere)}`) : '',
        v.people ? genSentence(`You meet ${genLower(v.people)} here`) : ''].filter(Boolean).join(' '));
      this.genPut(p, 'Points of Interest', v.feature ? `- ${cap(String(v.feature))}` : '');
      this.genPut(p, 'History', [v.secret ? `**Secret:** ${cap(String(v.secret))}` : '', v.trouble ? `**Trouble brewing:** ${cap(String(v.trouble))}` : ''].filter(Boolean).join('\n'));
    });
    return file;
  }

  async saveGenPlot(name, v, ctx) {
    const file = await this.createEntity('arc', { name }, false);
    if (!file) return null;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.kind = 'Main plot';
      fm.status = 'Open';
      const tags = toArr(fm.tags);
      if (!tags.includes('generated')) fm.tags = [...tags, 'generated'];
    });
    await this.genWriteBody(file, (p) => {
      const line = (label, val) => (Array.isArray(val) ? val.length : val) ? `- **${label}:** ${toArr(val).join(', ')}` : '';
      this.genPut(p, 'Premise', [line('Genre', v.genre), line('Audience', ctx && ctx.audience), line('Theme', v.theme),
        line('Tone', v.tone), line('Inciting incident', v.inciting && cap(String(v.inciting))),
        line('Central conflict', v.conflict && cap(String(v.conflict))), line('Tropes', v.tropes)].filter(Boolean).join('\n'));
      this.genPut(p, 'Stakes', v.stakes ? genSentence(`If it goes wrong: ${genLower(v.stakes)}`) : '');
      this.genPut(p, 'Resolution', [line('Twist', v.twist && cap(String(v.twist))), line('Ending', v.ending && cap(String(v.ending)))].filter(Boolean).join('\n'));
    });
    return file;
  }

  /* A prompt is a note. Its characters, when ticked, are saved first so the note can link to them, and linked to each other by the rolled relationship. */
  async saveGenPrompt(name, st) {
    const proj = this.projectPath();
    if (!proj) { new Notice('Create a project first.'); return null; }
    const v = st.values;
    const ctx = st.ctx;
    const files = [];
    for (const c of st.cast) files.push(c.save ? await this.saveGenCharacter(c.name.trim(), c.values, ctx) : null);
    const [a, b] = files;
    if (a && b && v.relationship) await this.genLinkPair(a, b, String(v.relationship));

    const folder = `${proj}/${TYPES.note.folder}/Prompts`;
    const file = await this.createEntity('note', { name: name || `${v.genre || ctx.family || 'Story'} prompt`, folder, tag: 'prompt' }, false);
    if (!file) return null;
    const line = (label, val) => (Array.isArray(val) ? val.length : val) ? `- **${label}:** ${toArr(val).join(', ')}` : '';
    const out = ['## Premise', '', ...[line('Audience', ctx.audience), line('Genre', v.genre), line('Setting', v.setting && cap(String(v.setting))),
      line('Core theme', v.theme), line('Emotional tone', v.tone), line('Central conflict', v.conflict && cap(String(v.conflict))),
      line('Plot tropes', v.tropes)].filter(Boolean), '', '## Characters'];
    st.cast.forEach((c, i) => {
      const cv = c.values;
      const f = files[i];
      out.push('', `### ${f ? this.linkTo(f, file) : (c.name.trim() || c.label)}`, '');
      for (const fd of GEN_CHARACTER_FIELDS) {
        if (fd.key === 'wound' || fd.key === 'fear' || fd.key === 'motivation') continue;
        const l = line(fd.label, cv[fd.key]);
        if (l) out.push(l);
      }
      const inner = genInnerLine(cv);
      if (inner) out.push(`- **Inner conflict:** ${inner}`);
    });
    out.push('', '## Dynamics', '', ...[line('Relationship', v.relationship), line('Subplot trope', v.subplot && cap(String(v.subplot))),
      line('Friction point', v.friction)].filter(Boolean), '');
    await this.app.vault.process(file, (d) => splitFm(d).fm + '\n' + out.join('\n'));
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.audience = ctx.audience;
      if (ctx.family) fm.genre_family = ctx.family;
      const tags = toArr(fm.tags);
      if (!tags.includes('generated')) fm.tags = [...tags, 'generated'];
    });
    return file;
  }

  /* Link two generated characters the way their rolled relationship says. */
  async genLinkPair(a, b, rel) {
    const r = GEN_REL.find((x) => x.re.test(rel.toLowerCase()));
    if (!r) return;
    const add = async (f, key, val) => this.app.fileManager.processFrontMatter(f, (fm) => {
      const list = toArr(fm[key]);
      if (!list.includes(val)) fm[key] = [...list, val];
    });
    if (r.tie) { await add(a, 'ties', `${this.linkTo(b, a)}: ${r.tie}`); return; }
    await add(a, r.field, this.linkTo(b, a));
    if (r.two) await add(b, r.two, this.linkTo(a, b));
  }

  /* ---------- generator tables: shipped in the repo, installed into the vault ---------- */

  /* Randomness only reads .rdm files inside the vault, and only under its Generator root when one is set. */
  genInstallFolder() {
    const r = this.app.plugins && this.app.plugins.plugins && this.app.plugins.plugins.randomness;
    const root = String((r && r.settings && r.settings.generatorRoot) || '').trim().replace(/\/+$/, '');
    return normalizePath(root ? `${root}/Loresmith` : `${this.rootPath()}/Generators`);
  }

  /* Table name (lower case) → the vault file that defines it. */
  async genTableSources() {
    this._genScan = null;
    return this.genScanTables();
  }

  /* Tables the generators use that Randomness can't find. Empty when it can't list its tables. */
  async genMissingTables() {
    if (!this.randomness()) return [];
    this._genScan = null;
    const known = await this.genTableNames();
    return genAllTables().filter((n) => !known.has(n.toLowerCase()));
  }

  async genDownload(file, refs) {
    let last = '';
    for (const ref of refs) {
      const url = `https://raw.githubusercontent.com/${GEN_REPO}/${encodeURIComponent(ref)}/${GEN_REPO_DIR}/${encodeURIComponent(file)}`;
      try {
        const r = await requestUrl({ url, throw: false });
        if (r.status === 200) return { text: r.text, ref };
        last = `HTTP ${r.status}`;
      } catch (e) { last = String((e && e.message) || e); }
    }
    throw new Error(`Couldn't download ${file} from GitHub (${last}).`);
  }

  /*
   * Download every table file listed in generators/index.json and write it into the vault.
   * - New file: added, unless its tables already exist in another file (two copies would make Randomness guess).
   * - File you haven't touched since it was installed: replaced by the new version.
   * - File you've edited: left alone; the new version is saved next to it as "<name> (update <version>).txt",
   *   which Randomness ignores, so you can copy across what you want.
   */
  async installGeneratorTables() {
    if (!this.randomness()) { new Notice('Install and enable the Randomness plugin first.'); return null; }
    const notice = new Notice('Downloading generator tables…', 0);
    try {
      const idx = await this.genDownload('index.json', [this.manifest.version, 'main']);
      let list;
      try { list = toArr(JSON.parse(idx.text).files); } catch (e) { throw new Error('generators/index.json is not valid JSON.'); }
      const folder = this.genInstallFolder();
      await this.ensureFolder(folder);
      const known = await this.genTableSources();
      const record = this.settings.generatorFiles || {};
      const rep = { added: [], updated: [], same: [], kept: [], skipped: [] };
      for (const name of list) {
        const { text } = await this.genDownload(name, [idx.ref]);
        const path = normalizePath(`${folder}/${name}`);
        const hash = await sha256(text);
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (!existing) {
          const clash = genTableNamesIn(text).map((n) => known.get(n.toLowerCase())).find((p) => p && normalizePath(p) !== path);
          if (clash) { rep.skipped.push(`${name} (you already have its tables in ${clash})`); continue; }
          await this.app.vault.create(path, text);
          record[name] = { hash, ref: idx.ref };
          rep.added.push(name);
          continue;
        }
        const cur = await this.app.vault.read(existing);
        const curHash = await sha256(cur);
        if (curHash === hash) { record[name] = { hash, ref: idx.ref }; rep.same.push(name); continue; }
        if (record[name] && record[name].hash === curHash) {
          await this.app.vault.modify(existing, text);
          record[name] = { hash, ref: idx.ref };
          rep.updated.push(name);
          continue;
        }
        const side = normalizePath(`${folder}/${name.replace(/\.rdm$/i, '')} (update ${idx.ref}).txt`);
        const sf = this.app.vault.getAbstractFileByPath(side);
        if (sf) await this.app.vault.modify(sf, text); else await this.app.vault.create(side, text);
        rep.kept.push(name);
      }
      this.settings.generatorFiles = record;
      await this.saveSettings();
      this._genScan = null;
      notice.hide();
      const parts = [];
      if (rep.added.length) parts.push(`added ${rep.added.length}`);
      if (rep.updated.length) parts.push(`updated ${rep.updated.length}`);
      if (rep.same.length) parts.push(`${rep.same.length} already current`);
      if (rep.kept.length) parts.push(`kept your edits to ${rep.kept.join(', ')} (new versions saved beside them as .txt)`);
      if (rep.skipped.length) parts.push(`skipped ${rep.skipped.join('; ')}`);
      new Notice(`Generator tables (${idx.ref}) in ${folder}: ${parts.join('; ') || 'nothing to do'}.`, 12000);
      return rep;
    } catch (e) {
      notice.hide();
      console.error('Loresmith: installing generator tables', e);
      new Notice(`Couldn't install generator tables: ${(e && e.message) || e}`, 10000);
      return null;
    }
  }

  async createStory(name, data, open) {
    const root = `${this.projectPath()}/${TYPES.story.folder}`;
    await this.ensureFolder(root);
    const folder = this.uniqueFolder(root, name);
    await this.ensureFolder(folder);
    const sname = folder.split('/').pop();
    const file = await this.app.vault.create(`${folder}/${sname}.md`, '---\ntype: story\n---\n\n## Synopsis\n\n## Themes\n');
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.status = 'Drafting';
      fm.chapters = ['Chapter 1'];
      const tag = cleanTag(data.tag);
      fm.tags = tag && tag !== 'story' ? ['story', tag] : ['story'];
    });
    await this.ensureFolder(`${folder}/Chapter 1`);
    await this.createScene(`${folder}/Chapter 1`, 'Scene 1', 1);
    if (open) await this.openChapters(file);
    return file;
  }

  async createScene(folderPath, name, order) {
    return this.app.vault.create(
      this.uniquePath(folderPath, sanitize(name) || 'Scene'),
      `---\ntype: scene\norder: ${order}\nstatus: draft\ncharacters:\n---\n\n`,
    );
  }

  /* Writes a scene's cast. An empty cast leaves a blank "characters:" line so it is easy to fill in by hand. */
  setCast(file, list) {
    return this.app.fileManager.processFrontMatter(file, (fm) => { fm.characters = list.length ? [...list] : null; });
  }

  async addCastProperty() {
    const root = this.rootPath() + '/';
    let n = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(root) || this.typeOf(f) !== 'scene') continue;
      if (Object.prototype.hasOwnProperty.call(this.fm(f), 'characters')) continue;
      await this.app.fileManager.processFrontMatter(f, (fm) => { if (!('characters' in fm)) fm.characters = null; });
      n++;
    }
    new Notice(n ? `Added a characters property to ${n} scene${n === 1 ? '' : 's'}.` : 'Every scene already has a characters property.');
  }

  /* ---------- stories ---------- */

  async storyData(file) {
    const out = { chapters: [], words: 0 };
    const folder = file.parent;
    if (!folder) return out;
    const sfm = readFm(await this.app.vault.cachedRead(file));
    const subs = folder.children.filter((c) => c instanceof TFolder);
    const ordered = [];
    for (const n of toArr(sfm.chapters)) {
      const f = subs.find((s) => s.name === n);
      if (f && !ordered.includes(f)) ordered.push(f);
    }
    subs.filter((s) => !ordered.includes(s)).sort((a, b) => natural(a.name, b.name)).forEach((s) => ordered.push(s));

    for (const ch of ordered) {
      const scenes = [];
      for (const f of ch.children) {
        if (!(f instanceof TFile) || f.extension !== 'md') continue;
        const txt = await this.app.vault.cachedRead(f);
        const fm = readFm(txt);
        scenes.push({
          file: f,
          cast: toArr(fm.characters).length,
          order: typeof fm.order === 'number' ? fm.order : Infinity,
          status: STATUSES.includes(fm.status) ? fm.status : 'draft',
          words: wordCount(txt),
        });
      }
      scenes.sort((a, b) => (a.order - b.order) || natural(a.file.basename, b.file.basename));
      const words = scenes.reduce((s, x) => s + x.words, 0);
      out.chapters.push({ name: ch.name, folder: ch, scenes, words });
      out.words += words;
    }
    return out;
  }

  async appearancesOf(file) {
    const out = [];
    const rl = this.app.metadataCache.resolvedLinks;
    for (const story of this.index().story) {
      const data = await this.storyData(story);
      for (const ch of data.chapters) {
        for (const sc of ch.scenes) {
          const explicit = toArr(this.fm(sc.file).characters).some((s) => this.resolveLink(s, sc.file) === file);
          const linked = !!(rl[sc.file.path] && rl[sc.file.path][file.path]);
          if (explicit || linked) out.push({ story, chapter: ch.name, scene: sc.file, explicit });
        }
      }
    }
    return out;
  }

  async compileStory(file) {
    const data = await this.storyData(file);
    let out = `# ${file.basename}\n\n`;
    for (const ch of data.chapters) {
      out += `## ${ch.name}\n\n`;
      for (const sc of ch.scenes) {
        const txt = splitFm(await this.app.vault.cachedRead(sc.file)).body.trim();
        out += `### ${sc.file.basename}\n\n${txt}\n\n`;
      }
    }
    const path = normalizePath(`${file.parent.path}/${file.basename} (compiled).md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    let target;
    if (existing instanceof TFile) { await this.app.vault.modify(existing, out); target = existing; }
    else target = await this.app.vault.create(path, out);
    new Notice(`Compiled ${fmtNum(data.words)} words into "${target.basename}".`);
    this.openNote(target);
  }

  /* ---------- opening views ---------- */

  async openOverview(section) {
    const ws = this.app.workspace;
    /* Always hand the section over through the view state, so it reaches the page however the tab was
       created, restored or reloaded. */
    const leaf = ws.getLeavesOfType(VIEW_OVERVIEW)[0] || ws.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_OVERVIEW, active: true, state: section ? { section } : {} });
    await ws.revealLeaf(leaf);
  }

  async openEntity(file, typeHint) {
    const type = typeHint || this.typeOf(file);
    if (type === 'outline') { const st = this.storyFor(file); return st ? this.openOutline(st) : this.openNote(file); }
    if (!type || type === 'scene' || (TYPES[type] && TYPES[type].plain)) return this.openNote(file);
    const ws = this.app.workspace;
    const existing = ws.getLeavesOfType(VIEW_ENTITY).find((l) => l.view && l.view.file === file);
    if (existing) return ws.revealLeaf(existing);
    const leaf = ws.getLeaf(this.settings.openInNewTab ? 'tab' : false);
    await leaf.setViewState({ type: VIEW_ENTITY, state: { file: file.path }, active: true });
  }

  async openChapters(storyFile) {
    const ws = this.app.workspace;
    const existing = ws.getLeavesOfType(VIEW_CHAPTERS).find((l) => l.view && l.view.file === storyFile);
    if (existing) return ws.revealLeaf(existing);
    const leaf = ws.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_CHAPTERS, state: { file: storyFile.path }, active: true });
  }

  async openOutline(storyFile) {
    const ws = this.app.workspace;
    const existing = ws.getLeavesOfType(VIEW_OUTLINE).find((l) => l.view && l.view.file === storyFile);
    if (existing) return ws.revealLeaf(existing);
    const leaf = ws.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_OUTLINE, state: { file: storyFile.path }, active: true });
  }

  async openWeb(focusFile) {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_WEB)[0];
    if (!leaf) {
      leaf = ws.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_WEB, state: focusFile ? { focus: focusFile.path } : {}, active: true });
    } else if (focusFile && leaf.view instanceof WebView) {
      leaf.view.focusOn(focusFile.path, true);
    }
    await ws.revealLeaf(leaf);
  }

  async openPanel() {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_PANEL)[0];
    if (!leaf) {
      leaf = ws.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_PANEL, active: true });
    }
    await ws.revealLeaf(leaf);
  }

  /* Opens a note in the main area, reusing the editor you were last in instead of adding a tab. */
  async openInMain(file) {
    const ws = this.app.workspace;
    const showing = ws.getLeavesOfType('markdown').find((l) => l.view && l.view.file === file && l.getRoot() === ws.rootSplit);
    if (showing) { ws.setActiveLeaf(showing, { focus: true }); await ws.revealLeaf(showing); return; }
    let leaf = ws.getMostRecentLeaf(ws.rootSplit);
    const vt = leaf && leaf.view && leaf.view.getViewType();
    const reusable = leaf && (vt === 'markdown' || vt === 'empty') && !leaf.getViewState().pinned;
    if (!reusable) leaf = ws.getLeaf('tab');
    await leaf.openFile(file);
    ws.setActiveLeaf(leaf, { focus: true });
  }

  pickStory(onPick) {
    const stories = this.index().story;
    if (!stories.length) { new Notice('Create a story first.'); return; }
    if (stories.length === 1) { onPick(stories[0]); return; }
    new FileSuggest(this.app, stories, 'Choose a story', onPick).open();
  }

  /* ---------- outlines ---------- */

  outlineFileFor(story) {
    if (!story || !story.parent) return null;
    return story.parent.children.find((c) => c instanceof TFile && c.extension === 'md' && this.typeOf(c) === 'outline') || null;
  }

  async ensureOutline(story) {
    const found = this.outlineFileFor(story);
    if (found) return found;
    const name = STRUCTURES['Three-act structure'];
    const model = {
      pre: '', plotlines: ['Main'],
      beats: name.map(([title, hint]) => ({ title, hint, notes: '', cells: {} })),
    };
    const path = this.uniquePath(story.parent.path, `${story.basename} outline`);
    const file = await this.app.vault.create(path, `---\ntype: outline\n---\n${serializeOutline(model)}`);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.story = this.linkTo(story, file);
      fm.structure = 'Three-act structure';
      fm.plotlines = ['Main'];
    });
    return file;
  }

  async readOutline(file) {
    const text = await this.app.vault.read(file);
    const fm = readFm(text);
    const model = parseOutline(splitFm(text).body, toArr(fm.plotlines));
    if (!model.plotlines.length) model.plotlines.push('Main');
    return { fm, model };
  }

  /* Plot lines can be plain names or links to plot arc entries. */
  plotlineArc(pl, source) {
    return /^\s*\[\[/.test(pl) ? this.resolveLink(pl, source) : null;
  }
  plotlineName(pl, source) {
    const f = this.plotlineArc(pl, source);
    return f ? f.basename : (/^\s*\[\[/.test(pl) ? linkText(pl) : pl);
  }

  /* Every outline card, in any story, filed under a plot line that links to this arc entry. */
  async outlineCardsFor(arcFile) {
    const out = [];
    for (const story of this.index().story) {
      const of = this.outlineFileFor(story);
      if (!of) continue;
      const { model } = await this.readOutline(of);
      const pl = model.plotlines.find((x) => this.plotlineArc(x, of) === arcFile);
      if (!pl) continue;
      for (const b of model.beats) for (const c of b.cells[pl] || []) out.push({ story, outline: of, beat: b.title, card: c });
    }
    return out;
  }

  /* ---------- timeline ---------- */

  timeline(idx, opts = {}) {
    idx = idx || this.index();
    const neg = this.negEras();
    const out = [];
    for (const f of idx.event) {
      const fm = this.fm(f);
      const year = numOrNull(fm.year) ?? parseYear(fm.date, neg);
      const pt = this.toPt(fm.date);
      out.push({
        file: f, kind: 'event', title: f.basename, year, d: pt && pt.y === year ? pt.d : null, end: numOrNull(fm.end_year),
        when: fm.date ? String(fm.date) : '', era: fm.era ? String(fm.era) : '',
        sub: fm.kind ? String(fm.kind) : '',
        where: fm.location || null,
        who: toArr(fm.participants), arcs: toArr(fm.arcs),
      });
    }
    if (opts.births) {
      for (const c of idx.character) {
        const fm = this.fm(c);
        const b = this.toPt(fm.born), dd = this.toPt(fm.died);
        if (b) out.push({ file: c, kind: 'birth', title: `${c.basename} is born`, year: b.y, d: b.d, when: String(fm.born), who: [], arcs: [], where: fm.birthplace || null });
        if (dd) out.push({ file: c, kind: 'death', title: `${c.basename} dies`, year: dd.y, d: dd.d, when: String(fm.died), who: [], arcs: [] });
      }
    }
    if (opts.foundings) {
      for (const o of idx.organization) {
        const fm = this.fm(o);
        const fd = this.toPt(fm.founded);
        if (fd) out.push({ file: o, kind: 'founding', title: `${o.basename} is founded`, year: fd.y, d: fd.d, when: String(fm.founded), who: [], arcs: [], where: fm.headquarters || null });
      }
    }
    if (opts.calendar) {
      const note = this.calNoteFile();
      for (const h of this.calendarHistory()) {
        out.push({ file: h.file || note, kind: 'calendar', title: h.title, year: h.year, d: h.d, when: h.meta || '', who: h.who || [], arcs: [], where: null, sub: '' });
      }
    }
    const rank = { birth: 0, founding: 1, calendar: 2, event: 3, death: 4 };
    out.sort((a, b) => {
      if (a.year == null || b.year == null) return (a.year == null) - (b.year == null) || natural(a.title, b.title);
      const days = a.d != null && b.d != null ? a.d - b.d : 0;
      return (a.year - b.year) || days || (rank[a.kind] - rank[b.kind]) || natural(a.title, b.title);
    });
    return out;
  }

  involves(entry, target) {
    if (entry.file === target) return true;
    const src = entry.file;
    return [...entry.who, ...entry.arcs].some((s) => this.resolveLink(s, src) === target);
  }

  openNote(file) { return this.app.workspace.getLeaf('tab').openFile(file); }

  refreshOverviews() {
    for (const l of this.app.workspace.getLeavesOfType(VIEW_OVERVIEW)) if (l.view instanceof OverviewView) l.view.goto('overview');
  }

  confirmDelete(file, label, after) {
    new ConfirmModal(this.app, {
      title: `Delete ${label}?`,
      message: `"${file.name}" will be moved to the trash.`,
      cta: 'Delete',
    }, async () => { await this.trash(file); if (after) after(); }).open();
  }
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

class OverviewView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.section = 'overview';
    this.query = '';
    this.token = 0;
    this.requestRender = debounce(() => { if (!this.genEditing()) this.render(); }, 700, true);
    this.searchRender = debounce(() => this.render(), 150, true);
  }
  getViewType() { return VIEW_OVERVIEW; }
  getDisplayText() { return this.plugin.settings.activeProject || 'Lore'; }
  getIcon() { return 'library'; }
  getState() { return { section: this.section }; }
  async setState(state, result) {
    if (state && state.section && state.section !== this.section) { this.section = state.section; this.query = ''; }
    await super.setState(state, result);
    this.render();
  }
  async onOpen() {
    this.contentEl.addClass('ls-host');
    /* The writing log's Today tab keeps itself current while it's on screen. */
    this.registerInterval(window.setInterval(() => {
      if (this.section !== 'goals' || this.plugin.settings.typing.tab !== 'today') return;
      const a = document.activeElement;
      if (!this.containerEl.isShown() || (a && this.containerEl.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      this.render();
    }, 5000));
    const req = () => this.requestRender();
    this.registerEvent(this.app.metadataCache.on('changed', req));
    this.registerEvent(this.app.vault.on('delete', req));
    this.registerEvent(this.app.vault.on('rename', req));
    this.registerEvent(this.app.vault.on('create', req));
    this.render();
  }

  goto(section) {
    this.section = section;
    this.query = '';
    this.render();
  }
  layout(key) { return this.plugin.settings.layouts[key] || 'grid'; }

  async render() {
    try {
      await this.renderInner();
    } catch (e) {
      console.error('Loresmith: could not render', this.section, e);
      this.contentEl.empty();
      const box = this.contentEl.createDiv('ls-root ls-overview').createDiv('ls-empty');
      box.createEl('strong', { text: `Loresmith couldn't open "${this.section}".` });
      box.createDiv({ text: String((e && e.message) || e) });
    }
  }

  async renderInner() {
    const token = ++this.token;
    const p = this.plugin;
    const root = document.createElement('div');
    root.addClass('ls-root', 'ls-overview');

    const projects = p.listProjects();
    if (!projects.length) {
      this.renderWelcome(root);
    } else {
      p.projectPath();
      const idx = p.index();
      const shell = root.createDiv('ls-shell');
      this.renderNav(shell.createDiv('ls-nav'), idx, projects);
      const body = shell.createDiv('ls-body');
      const s = this.section;
      try {
      if (s === 'overview') await this.renderHome(body, idx);
      else if (s === 'story') await this.renderStoryBlock(body, idx, true);
      else if (s === 'timeline') await this.renderTimeline(body, idx);
      else if (s === 'calendar') await this.renderCalendar(body, idx);
      else if (s === 'meetings') await this.renderMeetings(body, idx);
      else if (s === 'goals') await this.renderWriting(body, idx);
      else if (s.startsWith('gen:') && GENERATORS[s.slice(4)]) await this.renderGenerator(body, s.slice(4));
      else if (s.startsWith('tag:')) this.renderTag(body, idx, s.slice(4));
      else if (TYPES[s]) await this.renderCategory(body, idx, s);
      else await this.renderHome(body, idx);
      } catch (e) {
        /* Show the error instead of silently staying on the previous page. */
        console.error('Loresmith: could not render', s, e);
        body.empty();
        const box = body.createDiv('ls-empty');
        box.createEl('strong', { text: `Loresmith couldn't open "${s}".` });
        box.createDiv({ text: String((e && e.message) || e) });
      }
    }

    if (token !== this.token) return;
    const hadFocus = this.searchEl && document.activeElement === this.searchEl;
    const caret = hadFocus ? this.searchEl.selectionStart : 0;
    const oldBody = this.contentEl.querySelector('.ls-body');
    const scroll = oldBody && this.lastSection === this.section ? oldBody.scrollTop : 0;
    this.contentEl.empty();
    this.contentEl.appendChild(root);
    this.lastSection = this.section;
    const body = root.querySelector('.ls-body');
    if (body) body.scrollTop = scroll;
    this.searchEl = root.querySelector('.ls-search');
    if (hadFocus && this.searchEl) { this.searchEl.focus(); this.searchEl.setSelectionRange(caret, caret); }
  }

  renderWelcome(root) {
    const p = this.plugin;
    const w = root.createDiv('ls-welcome');
    w.createEl('h2', { text: 'Start a project' });
    w.createEl('p', {
      text: `A project is a folder inside "${p.settings.rootFolder}". Its characters, places, stories and notes are regular markdown notes, so they work everywhere else in your vault too.`,
    });
    const row = w.createDiv('ls-welcome-row');
    const inp = row.createEl('input', { type: 'text', attr: { placeholder: 'Project name' } });
    const go = async () => { if (!inp.value.trim()) return; await p.createProject(inp.value); this.goto('overview'); };
    textBtn(row, 'Create project', go, 'mod-cta');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  renderNav(nav, idx, projects) {
    const p = this.plugin;
    const top = nav.createDiv('ls-project');
    const sel = top.createEl('select', { cls: 'dropdown ls-project-select' });
    for (const n of projects) sel.createEl('option', { text: n, value: n });
    sel.value = p.settings.activeProject;
    sel.addEventListener('change', async () => {
      p.settings.activeProject = sel.value;
      await p.saveSettings();
      this.goto('overview');
    });
    iconBtn(top, 'book-marked', 'Open in sidebar', () => p.openPanel());
    iconBtn(top, 'folder-plus', 'New project', () => new NameModal(this.app,
      { title: 'New project', placeholder: 'Project name', cta: 'Create project' },
      async (n) => { await p.createProject(n); this.goto('overview'); }).open());

    const list = nav.createDiv('ls-nav-list');
    const item = (key, label, icon, count, color, onClick) => {
      const it = list.createDiv({ cls: `ls-nav-item ls-c-${color || 'base'}` + (this.section === key ? ' is-active' : '') });
      const ic = it.createSpan('ls-nav-icon');
      setIcon(ic, icon);
      it.createSpan({ cls: 'ls-nav-label', text: label });
      if (count != null) it.createSpan({ cls: 'ls-nav-count', text: String(count) });
      if (onClick) {
        it.addClass('is-action');
        setIcon(it.createSpan('ls-nav-out'), 'arrow-up-right');
      }
      it.addEventListener('click', onClick || (() => this.goto(key)));
    };
    item('overview', 'Overview', 'layout-dashboard');
    item('story', 'Stories', TYPES.story.icon, idx.story.length, TYPES.story.color);
    item('note', 'Notes', TYPES.note.icon, idx.note.length);
    item('goals', 'Writing log', 'target', null, 'green');
    list.createDiv({ cls: 'ls-nav-group', text: 'Plotting' });
    item('arc', TYPES.arc.plural, TYPES.arc.icon, idx.arc.length, TYPES.arc.color);
    item('outline', 'Story outline', 'list-ordered', null, 'cyan', () => p.pickStory((s) => p.openOutline(s)));
    item('web', 'Relations web', 'network', null, 'pink', () => p.openWeb());
    item('meetings', 'Who has met whom', 'users', null, 'red');
    list.createDiv({ cls: 'ls-nav-group', text: 'Generators' });
    for (const [k, g] of Object.entries(GENERATORS)) item(`gen:${k}`, g.label, g.icon, null, g.color);
    for (const g of GROUPS) {
      list.createDiv({ cls: 'ls-nav-group', text: g });
      if (g === 'History') {
        item('timeline', 'Timeline', 'history', null, 'yellow');
        item('calendar', 'Calendar', 'calendar-days', null, 'yellow');
      }
      for (const [k, d] of Object.entries(TYPES)) if (d.group === g) item(k, d.plural, d.icon, idx[k].length, d.color);
    }
  }

  panel(parent, o) {
    const sec = parent.createDiv({ cls: `ls-panel ls-c-${o.color || 'base'}` });
    const head = sec.createDiv('ls-panel-head');
    const title = head.createEl('h2', { cls: 'ls-panel-title', text: o.title });
    if (o.onTitle) { title.addClass('is-link'); title.addEventListener('click', o.onTitle); }
    if (o.count != null) head.createSpan({ cls: 'ls-panel-count', text: String(o.count) });
    const tools = head.createDiv('ls-panel-tools');
    if (o.badge != null) tools.createSpan({ cls: 'ls-badge', text: o.badge, attr: { 'aria-label': 'Total words' } });
    if (o.search) {
      const s = tools.createEl('input', { type: 'search', cls: 'ls-search', attr: { placeholder: `Search ${o.title.toLowerCase()}` } });
      s.value = this.query;
      s.addEventListener('input', () => { this.query = s.value; this.searchRender(); });
    }
    if (o.layoutKey) {
      const seg = tools.createDiv('ls-seg');
      for (const [m, ic, l] of [['grid', 'layout-grid', 'Grid'], ['list', 'list', 'List']]) {
        const b = iconBtn(seg, ic, l, async () => {
          this.plugin.settings.layouts[o.layoutKey] = m;
          await this.plugin.saveSettings();
          this.render();
        });
        if (this.layout(o.layoutKey) === m) b.addClass('is-active');
      }
    }
    if (o.extra) o.extra(tools);
    if (o.addType) iconBtn(tools, 'plus', `New ${TYPES[o.addType].label.toLowerCase()}`, () => this.plugin.promptCreate(o.addType), 'ls-add');
    return sec.createDiv('ls-panel-body');
  }

  empty(el, text, type) {
    const e = el.createDiv('ls-empty');
    e.createSpan({ text });
    if (type) textBtn(e, `New ${TYPES[type].label.toLowerCase()}`, () => this.plugin.promptCreate(type), 'ls-empty-cta');
  }

  /* ---------- generators ---------- */

  /* Each generator keeps its last roll while this tab is open, so switching pages and back doesn't lose it. */
  genState(kind) {
    if (!this.gens) this.gens = {};
    if (!this.gens[kind]) {
      const g = GENERATORS[kind];
      this.gens[kind] = {
        audience: 'Random', family: 'Random', ctx: null, values: {}, locked: new Set(), errors: {}, name: '', busy: false,
        cast: (g.cast || []).map((label) => ({ label, name: '', values: {}, locked: new Set(), errors: {}, save: true })),
      };
    }
    return this.gens[kind];
  }

  /* Typing in a generator box shouldn't be wiped by a re-render caused by some other note changing. */
  genEditing() {
    if (!String(this.section).startsWith('gen:')) return false;
    const a = document.activeElement;
    return !!(a && this.contentEl.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }

  genSelect(parent, label, options, value, onChange, names = {}) {
    const wrap = parent.createEl('label', { cls: 'ls-gen-ctl' });
    wrap.createSpan({ cls: 'ls-gen-ctl-label', text: label });
    const sel = wrap.createEl('select', { cls: 'dropdown' });
    for (const o of options) sel.createEl('option', { text: names[o] || o, value: o });
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  async renderGenerator(body, kind) {
    const p = this.plugin;
    const g = GENERATORS[kind];
    const st = this.genState(kind);
    const box = this.panel(body, { title: g.label, color: g.color });
    box.addClass('ls-gen');
    box.createEl('p', { cls: 'ls-gen-blurb', text: g.blurb });

    if (!p.randomness()) {
      const e = box.createDiv('ls-empty');
      e.createEl('strong', { text: 'Generators need the Randomness plugin.' });
      e.createDiv({ text: 'Install and enable Randomness, and keep your genre, character, conflict, plot and place .rdm files where it can find them (its Generator root). Loresmith rolls those tables.' });
      return;
    }

    const missing = await p.genMissingTables();
    if (missing.length) {
      const warn = box.createDiv('ls-gen-missing');
      warn.createEl('strong', { text: `${missing.length} generator table${missing.length === 1 ? ' is' : 's are'} missing.` });
      warn.createDiv({ text: `Loresmith's tables aren't where Randomness can find them (for example "${missing[0]}"). Install them, or check Randomness's Generator root.` });
      textBtn(warn, 'Install generator tables', async () => { await p.installGeneratorTables(); this.render(); }, 'mod-cta');
    }

    const ctl = box.createDiv('ls-gen-controls');
    this.genSelect(ctl, 'Audience', ['Random', ...GEN_AUDIENCES.map((a) => a.name)], st.audience, (v) => { st.audience = v; this.render(); });
    const famOpts = ['Random', ...(g.allowNoFamily ? ['None'] : []), ...genFamiliesFor(st.audience)];
    if (!famOpts.includes(st.family)) st.family = 'Random';
    this.genSelect(ctl, 'Genre', famOpts, st.family, (v) => { st.family = v; }, { None: 'No genre' });
    const roll = textBtn(ctl, st.busy ? 'Rolling…' : st.ctx ? 'Roll again' : 'Roll', () => this.genRollAll(kind), 'mod-cta ls-gen-roll');
    roll.disabled = st.busy;
    if (st.ctx) ctl.createSpan({ cls: 'ls-gen-hint', text: 'Locked fields stay put.' });

    if (!st.ctx) {
      box.createDiv({ cls: 'ls-empty', text: 'Pick an audience and a genre, or leave them on Random, then Roll.' });
      return;
    }
    box.createDiv({ cls: 'ls-gen-for', text: `Rolled for ${st.ctx.audience} · ${st.ctx.family || 'no genre'}` });

    this.genFields(box, kind, g.fields, st, null);
    if (kind === 'character') this.genInner(box, st.values);

    st.cast.forEach((c, i) => {
      const sub = box.createDiv('ls-gen-cast');
      const head = sub.createDiv('ls-gen-cast-head');
      head.createEl('h3', { text: c.label });
      const nm = head.createEl('input', { type: 'text', cls: 'ls-gen-name', attr: { placeholder: 'Name (optional)' } });
      nm.value = c.name;
      nm.addEventListener('input', () => { c.name = nm.value; });
      const lab = head.createEl('label', { cls: 'ls-gen-check' });
      const cb = lab.createEl('input', { type: 'checkbox' });
      cb.checked = c.save;
      cb.addEventListener('change', () => { c.save = cb.checked; });
      lab.createSpan({ text: 'Save as a character' });
      this.genFields(sub, kind, GEN_CHARACTER_FIELDS, c, i);
      this.genInner(sub, c.values);
    });

    const save = box.createDiv('ls-gen-save');
    const nm = save.createEl('input', { type: 'text', cls: 'ls-gen-name', attr: { placeholder: g.nameLabel } });
    nm.value = st.name;
    nm.addEventListener('input', () => { st.name = nm.value; });
    nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.genSave(kind); });
    const sb = textBtn(save, `Save as ${TYPES[g.saveAs].label.toLowerCase()}`, () => this.genSave(kind), 'mod-cta');
    sb.disabled = st.busy;
  }

  genFields(parent, kind, fields, holder, ci) {
    const grid = parent.createDiv('ls-gen-fields');
    const st = this.genState(kind);
    for (const f of fields) {
      if (f.family && !st.ctx.family) continue;
      const row = grid.createDiv('ls-gen-row');
      row.createDiv({ cls: 'ls-prop-label', text: f.label });
      const val = holder.values[f.key];
      const inp = row.createEl('input', { type: 'text', cls: 'ls-gen-value' });
      inp.value = Array.isArray(val) ? val.join('; ') : (val || '');
      if (f.count > 1) inp.setAttr('placeholder', 'Separate with ;');
      inp.addEventListener('input', () => {
        holder.values[f.key] = f.count ? inp.value.split(';').map((s) => s.trim()).filter(Boolean) : inp.value;
      });
      iconBtn(row, 'dices', `Reroll ${f.label.toLowerCase()}`, () => this.genRollField(kind, f, ci));
      const locked = holder.locked.has(f.key);
      const lb = iconBtn(row, locked ? 'lock' : 'unlock', locked ? 'Unlock' : 'Lock (Roll again keeps it)', () => {
        if (holder.locked.has(f.key)) holder.locked.delete(f.key); else holder.locked.add(f.key);
        this.render();
      });
      if (locked) { lb.addClass('is-active'); row.addClass('is-locked'); }
      if (holder.errors[f.key]) row.createDiv({ cls: 'ls-gen-err', text: holder.errors[f.key] });
    }
  }

  genInner(parent, v) {
    const line = genInnerLine(v);
    if (!line) return;
    const el = parent.createDiv('ls-gen-inner');
    el.createSpan({ cls: 'ls-prop-label', text: 'Inner conflict' });
    el.createSpan({ text: line });
  }

  async genFill(fields, holder, ctx) {
    holder.errors = {};
    for (const f of fields) {
      if (holder.locked.has(f.key)) continue;
      if (f.family && !ctx.family) { delete holder.values[f.key]; continue; }
      try { holder.values[f.key] = await this.plugin.genRoll(f, ctx); }
      catch (e) { holder.values[f.key] = f.count ? [] : ''; holder.errors[f.key] = String((e && e.message) || e); }
    }
  }

  async genRollAll(kind) {
    const g = GENERATORS[kind];
    const st = this.genState(kind);
    if (st.busy) return;
    st.ctx = genResolve(st, g);
    st.busy = true;
    this.render();
    try {
      await this.genFill(g.fields, st, st.ctx);
      for (const c of st.cast) await this.genFill(GEN_CHARACTER_FIELDS, c, st.ctx);
    } finally {
      st.busy = false;
      this.render();
    }
  }

  async genRollField(kind, f, ci) {
    const st = this.genState(kind);
    if (!st.ctx || st.busy) return;
    const holder = ci == null ? st : st.cast[ci];
    try {
      holder.values[f.key] = await this.plugin.genRoll(f, st.ctx);
      delete holder.errors[f.key];
    } catch (e) { holder.errors[f.key] = String((e && e.message) || e); }
    this.render();
  }

  async genSave(kind) {
    const st = this.genState(kind);
    if (!st.ctx || st.busy) return;
    st.busy = true;
    try {
      const file = await this.plugin.saveGenerated(kind, st);
      if (file) {
        new Notice(`Saved "${file.basename}".`);
        st.name = '';
        for (const c of st.cast) c.name = '';
        await this.plugin.openEntity(file);
      }
    } catch (e) {
      console.error('Loresmith: could not save generated entry', e);
      new Notice(`Couldn't save: ${(e && e.message) || e}`);
    } finally {
      st.busy = false;
      this.render();
    }
  }

  async renderHome(body, idx) {
    await this.renderGoals(body, idx, false);
    await this.renderStoryBlock(body, idx, false);

    const cb = this.panel(body, {
      title: 'Characters', count: idx.character.length, color: 'red',
      layoutKey: 'character', addType: 'character', onTitle: () => this.goto('character'),
    });
    await this.renderEntities(cb, idx.character, 'character');

    const wb = this.panel(body, { title: 'World', color: 'base' });
    const tiles = wb.createDiv('ls-tiles');
    for (const [k, d] of Object.entries(TYPES)) {
      if (!d.group || k === 'character') continue;
      const t = tiles.createDiv({ cls: `ls-tile ls-c-${d.color}` });
      const ic = t.createSpan('ls-tile-icon');
      setIcon(ic, d.icon);
      t.createSpan({ cls: 'ls-tile-label', text: d.plural });
      t.createSpan({ cls: 'ls-tile-count', text: String(idx[k].length) });
      t.addEventListener('click', () => this.goto(k));
    }

    this.renderTagsPanel(body, idx);
  }

  async renderStoryBlock(body, idx, full) {
    const p = this.plugin;
    const files = idx.story;
    const datas = await Promise.all(files.map((f) => p.storyData(f)));
    const total = datas.reduce((s, d) => s + d.words, 0);
    const el = this.panel(body, {
      title: 'Stories', count: files.length, color: 'cyan', badge: files.length ? fmtNum(total) : null,
      layoutKey: 'story', addType: 'story', onTitle: full ? null : () => this.goto('story'),
    });
    if (!files.length) return this.empty(el, 'No stories yet. Each story gets its own chapters board.', 'story');

    const names = (f, key) => toArr(p.fm(f)[key]).map((s) => { const d = p.resolveLink(s, f); return d ? d.basename : linkText(s); });
    const list = this.layout('story') === 'list';
    const wrap = el.createDiv(list ? 'ls-list' : 'ls-grid ls-story-grid');

    files.forEach((f, i) => {
      const d = datas[i];
      const fm = p.fm(f);
      const menu = (e) => {
        const m = new Menu();
        addMenuItem(m, 'Open chapters', 'list-tree', () => p.openChapters(f));
        addMenuItem(m, 'Open outline', 'list-ordered', () => p.openOutline(f));
        addMenuItem(m, 'Edit details', 'pencil', () => p.openEntity(f, 'story'));
        addMenuItem(m, 'Compile to one note', 'file-stack', () => p.compileStory(f));
        addMenuItem(m, 'Open as note', 'file-text', () => p.openNote(f));
        m.addSeparator();
        addMenuItem(m, 'Delete story', 'trash-2', () => new ConfirmModal(this.app, {
          title: 'Delete story?',
          message: `"${f.basename}" and all of its chapters and scenes will be moved to the trash.`,
          cta: 'Delete story',
        }, () => p.trash(f.parent)).open(), true);
        m.showAtMouseEvent(e);
      };

      if (list) {
        const row = wrap.createDiv('ls-row');
        const ic = row.createSpan('ls-row-icon'); setIcon(ic, 'book-open');
        row.createSpan({ cls: 'ls-row-name', text: f.basename });
        row.createSpan({ cls: 'ls-row-meta', text: `${d.chapters.length} chapters` });
        row.createSpan({ cls: 'ls-words', text: fmtNum(d.words) });
        iconBtn(row, 'more-vertical', 'Story options', menu);
        row.addEventListener('click', () => p.openChapters(f));
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(e); });
        return;
      }

      const card = wrap.createDiv('ls-card ls-story-card');
      const head = card.createDiv('ls-card-head');
      const ic = head.createSpan('ls-card-icon'); setIcon(ic, 'book-open');
      head.createSpan({ cls: 'ls-card-title', text: f.basename });
      if (fm.status) head.createSpan({ cls: 'ls-pill', text: String(fm.status) });
      iconBtn(head, 'more-vertical', 'Story options', menu);
      const tags = p.tagsOf(f);
      if (tags.length) { const tg = card.createDiv('ls-tags'); for (const t of tags) tg.createSpan({ cls: 'ls-tag', text: t }); }
      const stats = card.createDiv('ls-stats');
      const stat = (label, value) => {
        const s = stats.createDiv('ls-stat');
        s.createDiv({ cls: 'ls-stat-label', text: label });
        s.createDiv({ cls: 'ls-stat-value' + (value ? '' : ' is-empty'), text: value || 'None yet' });
      };
      stat('Main characters', names(f, 'mainCharacters').join(', '));
      stat('Locations', names(f, 'locations').join(', '));
      stat('Chapters', String(d.chapters.length));
      stat('Words', fmtNum(d.words));
      card.addEventListener('click', () => p.openChapters(f));
      card.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(e); });
    });
  }

  /* What "New … here" starts with for a group: its folder, or its type/classification/importance. */
  groupPreset(type, mode, g) {
    if (mode === 'folder' && g.dir) return { folder: g.dir };
    if (mode === 'kind' && g.kind) return type === 'character' ? { category: g.kind.toLowerCase() } : { kind: g.kind };
    return null;
  }

  /* Dropdown: group by folders, by type, or not at all. */
  groupPicker(tools, type) {
    const p = this.plugin;
    const modes = p.groupModes(type);
    const sel = tools.createEl('select', { cls: 'dropdown ls-group-pick', attr: { 'aria-label': 'Group by' } });
    for (const [m, label] of modes) sel.createEl('option', { text: label, value: m });
    sel.value = p.groupMode(type);
    sel.addEventListener('change', async () => { p.settings.groupBy[type] = sel.value; await p.saveSettings(); this.render(); });
  }

  async renderCategory(body, idx, type) {
    const def = TYPES[type];
    const extra = (tools) => {
      this.groupPicker(tools, type);
      if (type === 'event') textBtn(tools, 'Timeline', () => this.goto('timeline'));
      if (type === 'holiday') textBtn(tools, 'Calendar', () => this.goto('calendar'));
    };
    const el = this.panel(body, {
      title: def.plural, count: idx[type].length, color: def.color, search: true,
      layoutKey: def.plain ? null : type, addType: type, extra,
    });
    await this.renderEntities(el, idx[type], type);
  }

  async renderEntities(el, files, type, opts = {}) {
    const p = this.plugin;
    const def = TYPES[type];
    const q = this.query.toLowerCase().trim();
    /* Sections by folder or by type (species by classification), each foldable; nesting happens inside them. */
    if (!q && !opts.flat && files.length) {
      const mode = p.groupMode(type);
      const groups = p.groupEntries(files, type, mode);
      if (p.hasGroups(groups)) {
        for (const g of groups) {
          if (p.groupHidden(type, mode, g.key)) continue;
          const folded = p.groupFolded(type, mode, g.key);
          const sec = el.createDiv('ls-class-group' + (folded ? ' is-folded' : ''));
          if (g.depth) { sec.addClass('is-nested'); sec.style.setProperty('--ls-depth', String(g.depth)); }
          const h = sec.createDiv('ls-class-head is-foldable');
          setIcon(h.createSpan('ls-class-chev'), folded ? 'chevron-right' : 'chevron-down');
          const icon = mode === 'folder' ? (g.key ? 'folder' : 'folder-open') : g.key ? (TAXA.includes(type) ? 'layers' : 'tag') : 'circle-help';
          setIcon(h.createSpan('ls-class-icon'), icon);
          h.createSpan({ cls: 'ls-class-name', text: g.label });
          h.createSpan({ cls: 'ls-class-count', text: String(g.total) });
          const preset = this.groupPreset(type, mode, g);
          if (preset) {
            iconBtn(h, 'plus', `New ${def.label.toLowerCase()} in ${g.label}`, () => p.promptCreate(type, preset), 'ls-class-add');
          }
          h.addEventListener('click', async () => { await p.toggleGroup(type, mode, g.key); this.render(); });
          if (!folded && g.files.length) await this.renderEntities(sec, g.files, type, { flat: true });
        }
        return;
      }
    }
    if (q) {
      files = files.filter((f) => f.basename.toLowerCase().includes(q)
        || p.namesOf(f).some((a) => a.toLowerCase().includes(q)));
    }
    if (!files.length) {
      return this.empty(el, q ? `Nothing matches "${this.query}".` : `No ${def.plural.toLowerCase()} yet.`, q ? null : type);
    }
    const depth = new Map();
    if (!q) {
      const tree = p.entityTree(files, type);
      files = tree.map((t) => t.file);
      for (const t of tree) depth.set(t.file, t.depth);
    }

    const menu = (e, f) => {
      const m = new Menu();
      addMenuItem(m, 'Open', 'arrow-up-right', () => p.openEntity(f, type));
      if (!def.plain) addMenuItem(m, 'Open as note', 'file-text', () => p.openNote(f));
      addMenuItem(m, 'Move to folder…', 'folder-input', () => p.promptMoveToFolder(f, type));
      if (TAXA.includes(type)) addMenuItem(m, 'Move to Species, Bestiary or Flora…', 'arrow-right-left', () => p.convertMenu(e, f));
      m.addSeparator();
      addMenuItem(m, 'Delete', 'trash-2', () => p.confirmDelete(f, def.label.toLowerCase()), true);
      m.showAtMouseEvent(e);
    };
    const bind = (node, f) => {
      node.addEventListener('click', () => p.openEntity(f, type));
      node.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(e, f); });
    };

    if (def.plain || this.layout(type) === 'list') {
      const list = el.createDiv('ls-list');
      for (const f of files) {
        const row = list.createDiv('ls-row');
        if (depth.get(f)) { row.addClass('ls-sub'); row.style.setProperty('--ls-depth', String(depth.get(f))); }
        const ic = row.createSpan('ls-row-icon'); setIcon(ic, depth.get(f) ? 'corner-down-right' : def.icon);
        row.createSpan({ cls: 'ls-row-name', text: f.basename });
        const meta = this.subtitle(f, type);
        if (meta) row.createSpan({ cls: 'ls-row-meta', text: meta });
        const tags = p.tagsOf(f);
        if (tags.length) { const tg = row.createDiv('ls-tags'); for (const t of tags) tg.createSpan({ cls: 'ls-tag', text: t }); }
        bind(row, f);
      }
      return;
    }

    if (def.portrait) {
      const grid = el.createDiv('ls-grid ls-portraits');
      for (const f of files) {
        const fm = p.fm(f);
        const card = grid.createDiv('ls-card ls-portrait');
        const img = p.resolveLink(fm.image, f);
        if (img) card.createEl('img', { attr: { src: this.app.vault.getResourcePath(img), alt: '', loading: 'lazy' } });
        else card.createDiv({ cls: 'ls-portrait-initials', text: initials(f.basename) });
        const cat = String(fm.category || 'major');
        card.createSpan({ cls: `ls-cat-dot ls-cat-${cat}`, attr: { 'aria-label': cap(cat) } });
        if (p.isDead(f)) { card.addClass('is-dead'); setIcon(card.createSpan({ cls: 'ls-portrait-dead', attr: { 'aria-label': 'Deceased' } }), 'skull'); }
        const name = card.createDiv('ls-portrait-name');
        name.createDiv({ text: f.basename });
        const sub = fm.epithet || (fm.role && cap(String(fm.role)));
        if (sub) name.createDiv({ cls: 'ls-portrait-sub', text: String(sub) });
        bind(card, f);
      }
      return;
    }

    const texts = await Promise.all(files.map((f) => this.app.vault.cachedRead(f)));
    const grid = el.createDiv('ls-grid');
    files.forEach((f, i) => {
      const card = grid.createDiv('ls-card');
      if (depth.get(f)) card.addClass('ls-sub');
      const color = type === 'arc' && p.fm(f).color;
      if (COLORS.includes(color)) card.addClass(`ls-c-${color}`);
      const head = card.createDiv('ls-card-head');
      const ic = head.createSpan('ls-card-icon'); setIcon(ic, def.icon);
      head.createSpan({ cls: 'ls-card-title', text: f.basename });
      const sub = this.subtitle(f, type);
      if (sub) card.createDiv({ cls: 'ls-card-sub', text: sub });
      const snip = snippetOf(texts[i]);
      card.createDiv({ cls: 'ls-card-snippet' + (snip ? '' : ' is-empty'), text: snip || 'Nothing written yet.' });
      const tags = p.tagsOf(f);
      if (tags.length) { const tg = card.createDiv('ls-tags'); for (const t of tags) tg.createSpan({ cls: 'ls-tag', text: t }); }
      bind(card, f);
    });
  }

  subtitle(f, type) {
    const p = this.plugin;
    const fm = p.fm(f);
    const name = (s) => { const d = p.resolveLink(s, f); return d ? d.basename : linkText(s); };
    if (type === 'character') return [p.birthNameText(f), fm.epithet || (fm.role && cap(String(fm.role))), fm.category && cap(String(fm.category))].filter(Boolean).join(', ');
    if (type === 'relation') {
      const pair = [fm.from, fm.to].filter(Boolean).map(name).join(' and ');
      return [fm.kind, pair].filter(Boolean).join(': ');
    }
    if (type === 'species') {
      const par = p.parentSpecies(f);
      const cls = p.classOf(f).path.join(' › ');
      const hy = p.hybridParents(f);
      return [cls, par && `Subspecies of ${par.basename}`, hy.length && `Hybrid of ${hy.map((h) => h.basename).join(' × ')}`].filter(Boolean).map(String).join(', ');
    }
    if (type === 'creature' || type === 'plant') {
      const par = p.taxonParent(f);
      const cls = p.classOf(f).path.join(' › ');
      const extra = type === 'creature' ? fm.threat : fm.toxicity;
      return [cls, par && `Variant of ${par.basename}`, extra].filter(Boolean).map(String).join(', ');
    }
    if (type === 'organization' && fm.partOf) return [fm.kind, `part of ${name(fm.partOf)}`].filter(Boolean).map(String).join(', ');
    if (type === 'location' && fm.partOf) return [fm.kind, `in ${name(fm.partOf)}`].filter(Boolean).join(', ');
    if (type === 'arc') return [fm.kind, fm.status].filter(Boolean).map(String).join(', ');
    if (type === 'event') return [fm.date, fm.kind].filter(Boolean).map(String).join(', ');
    if (type === 'holiday') return [fm.date, fm.kind, fm.last_held != null && String(fm.last_held).trim() ? `last held ${fm.last_held}` : ''].filter(Boolean).map(String).join(', ');
    if (type === 'word') {
      const langs = p.languageNames(f).join(', ');
      const from = p.languageNames(f, 'borrowed_from').join(', ');
      return [langs, fm.meaning, fm.part_of_speech, from && `from ${from}`].filter(Boolean).map(String).join(', ');
    }
    if (type === 'language') {
      const par = fm.parent ? name(fm.parent) : '';
      return [fm.kind, fm.family, fm.status, par && `from ${par}`, fm.basis === 'real-world' && 'real-world'].filter(Boolean).map(String).join(', ');
    }
    return fm.kind ? String(fm.kind) : '';
  }

  /* ---------- timeline ---------- */

  async renderTimeline(body, idx) {
    const p = this.plugin;
    const opts = p.settings.timeline;
    let focus = this.timelineFocus ? this.app.vault.getAbstractFileByPath(this.timelineFocus) : null;
    if (!(focus instanceof TFile)) focus = null;

    const el = this.panel(body, {
      title: 'Timeline', color: 'yellow', addType: 'event',
      extra: (tools) => {
        const sel = tools.createEl('select', { cls: 'dropdown ls-tl-focus', attr: { 'aria-label': 'Show events for' } });
        sel.createEl('option', { text: 'Everyone', value: '' });
        for (const [t, label] of [['character', 'Characters'], ['organization', 'Organizations'], ['arc', 'Plot arcs']]) {
          if (!idx[t].length) continue;
          const g = sel.createEl('optgroup', { attr: { label } });
          for (const f of idx[t]) g.createEl('option', { text: f.basename, value: f.path });
        }
        sel.value = focus ? focus.path : '';
        sel.addEventListener('change', () => { this.timelineFocus = sel.value || null; this.render(); });
        const toggle = (key, label) => {
          const b = textBtn(tools, label, async () => {
            opts[key] = !opts[key];
            await p.saveSettings();
            this.render();
          }, 'ls-toggle' + (opts[key] ? ' is-active' : ''));
          b.setAttr('aria-pressed', String(!!opts[key]));
        };
        toggle('births', 'Births and deaths');
        toggle('foundings', 'Foundings');
        if (p.calendarHistory().length) toggle('calendar', 'Calendar history');
      },
    });

    let entries = p.timeline(idx, opts);
    if (focus) entries = entries.filter((e) => p.involves(e, focus));
    if (!entries.length) {
      return this.empty(el, focus
        ? `Nothing on the timeline involves ${focus.basename} yet.`
        : 'Events, plus births, deaths and foundings with a year in them, line up here.', 'event');
    }

    const texts = new Map();
    await Promise.all(entries.filter((e) => e.kind === 'event').map(async (e) => texts.set(e.file, snippetOf(await this.app.vault.cachedRead(e.file)))));
    const fmtYear = (y) => p.fmtYear(y);
    const name = (s, src) => { const d = p.resolveLink(s, src); return d ? d.basename : linkText(s); };
    const now = p.latestPresent();

    const tl = el.createDiv('ls-timeline');
    let era = null;
    let undated = false;
    let nowShown = now == null;
    const nowMarker = () => {
      nowShown = true;
      const m = tl.createDiv('ls-tl-now');
      m.createSpan({ cls: 'ls-tl-now-label', text: `Present day, ${now.raw}` });
    };
    for (const e of entries) {
      if (!nowShown && (e.year == null || p.cmpPt({ y: e.year, d: e.d }, now) > 0)) nowMarker();
      if (e.year == null && !undated) {
        undated = true;
        tl.createDiv({ cls: 'ls-tl-era is-undated', text: 'No year yet' });
      } else if (e.kind === 'event' && e.era && e.era !== era && e.year != null) {
        era = e.era;
        tl.createDiv({ cls: 'ls-tl-era', text: era });
      }
      const row = tl.createDiv(`ls-tl-item ls-tl-${e.kind}`);
      const when = row.createDiv('ls-tl-when');
      when.createDiv({ cls: 'ls-tl-year', text: e.year == null ? '?' : fmtYear(e.year) + (e.end != null ? `–${fmtYear(e.end)}` : '') });
      if (e.year != null && now) when.createDiv({ cls: 'ls-tl-ago', text: p.agoText({ y: e.year, d: e.d }, now) });
      row.createDiv('ls-tl-dot');
      const card = row.createDiv('ls-tl-card');
      const head = card.createDiv('ls-tl-head');
      head.createSpan({ cls: 'ls-tl-title', text: e.title });
      const meta = [e.when && e.when !== String(e.year) ? e.when : '', e.sub, e.where ? name(e.where, e.file) : ''].filter(Boolean);
      if (meta.length) card.createDiv({ cls: 'ls-tl-meta', text: meta.join(', ') });
      if (e.kind === 'event') {
        const snip = texts.get(e.file);
        if (snip) card.createDiv({ cls: 'ls-tl-snippet', text: snip });
        if (e.who.length) {
          const chips = card.createDiv('ls-chips');
          for (const s of e.who) {
            const d = p.resolveLink(s, e.file);
            const chip = chips.createDiv({ cls: 'ls-chip' + (d ? '' : ' is-unresolved'), text: d ? d.basename : linkText(s) });
            if (d) chip.addEventListener('click', (ev) => { ev.stopPropagation(); p.openEntity(d); });
          }
        }
      }
      card.addEventListener('click', () => (e.kind === 'calendar' && !(e.file && p.typeOf(e.file) === 'holiday') ? p.openCalendarNote() : p.openEntity(e.file)));
    }
    if (!nowShown && entries.length) nowMarker();
  }

  /* ---------- calendar ---------- */

  /* Everything that lands on a day of `year`, keyed by day of the year. Recurring items (birthdays,
     anniversaries) repeat on the same day every later year. Scenes without their own date ride along
     on their chapter's or story's date. */
  calItems(idx, year) {
    const p = this.plugin;
    const byDay = new Map();
    const put = (d, it) => { if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(it); };
    const exact = (v) => { const pt = p.toPt(v); return pt && pt.d != null ? pt : null; };
    const on = (v, it) => { const pt = exact(v); if (pt && pt.y === year) put(pt.d, it); };
    const yrs = (n) => `${n} yr${n === 1 ? '' : 's'}`;
    const yearly = (v, make, until) => {
      const pt = exact(v);
      if (!pt || year <= pt.y) return;
      if (until && p.cmpPt({ y: year, d: pt.d }, until) > 0) return;
      const n = p.yearsBetween(pt.y, year);
      if (n > 0) put(pt.d, Object.assign({ recurring: true, round: n % 10 === 0 }, make(n)));
    };

    for (const f of idx.event) {
      const date = p.fm(f).date;
      const open = () => p.openEntity(f);
      on(date, { key: 'event', kind: 'event', label: f.basename, open });
      yearly(date, (n) => ({ key: 'anniversary', kind: 'event', label: `${f.basename} · ${yrs(n)}`, note: `${n} year${n === 1 ? '' : 's'} since`, open }));
    }
    for (const c of idx.character) {
      const fm = p.fm(c);
      const open = () => p.openEntity(c);
      on(fm.born, { key: 'birth', kind: 'birth', label: `${c.basename} born`, open });
      on(fm.died, { key: 'death', kind: 'death', label: `${c.basename} dies`, open });
      yearly(fm.born, (n) => ({ key: 'birthday', kind: 'birth', label: `${c.basename} turns ${n}`, note: 'Birthday', open }), p.toPt(fm.died));
      yearly(fm.died, (n) => ({ key: 'anniversary', kind: 'death', label: `† ${c.basename} · ${yrs(n)}`, note: `Died ${n} year${n === 1 ? '' : 's'} ago`, open }));
    }
    for (const o of idx.organization) {
      const founded = p.fm(o).founded;
      const open = () => p.openEntity(o);
      on(founded, { key: 'founding', kind: 'founding', label: `${o.basename} founded`, open });
      yearly(founded, (n) => ({ key: 'anniversary', kind: 'founding', label: `${o.basename} · ${yrs(n)}`, note: `Founded ${n} year${n === 1 ? '' : 's'} ago`, open }));
    }

    /* Story and chapter dates. `hosts` remembers every story or chapter that has a date at all, so a scene
       inherits from the nearest one even when that date is in another year (then it is simply not shown). */
    const hosts = new Map();
    for (const s of idx.story) {
      const fm = p.fm(s);
      const open = () => p.openChapters(s);
      if (p.toPt(fm.present_year)) {
        const sp = exact(fm.present_year);
        const it = sp && sp.y === year ? { key: 'story', kind: 'story', label: s.basename, note: 'Story date', open, scenes: [] } : null;
        if (it) put(sp.d, it);
        hosts.set(s.path, it);
      }
      if (fm.chapter_years && typeof fm.chapter_years === 'object') {
        for (const [ch, v] of Object.entries(fm.chapter_years)) {
          if (!p.toPt(v)) continue;
          const cp = exact(v);
          const it = cp && cp.y === year ? { key: 'story', kind: 'story', label: `${s.basename}: ${ch}`, note: 'Chapter date', open, scenes: [] } : null;
          if (it) put(cp.d, it);
          hosts.set(`${s.path}#${ch}`, it);
        }
      }
    }
    for (const sc of idx.scene) {
      const fm = p.fm(sc);
      const st = p.storyFor(sc);
      const chapter = st && sc.parent && sc.parent.parent === st.parent ? sc.parent.name : null;
      if (p.toPt(fm.present_year)) {
        on(fm.present_year, { key: 'scene', kind: 'scene', label: sc.basename, note: st ? [st.basename, chapter].filter(Boolean).join(' · ') : '', open: () => p.openNote(sc) });
        continue;
      }
      if (!st) continue;
      const chKey = chapter ? `${st.path}#${chapter}` : null;
      const host = chKey && hosts.has(chKey) ? hosts.get(chKey) : hosts.get(st.path);
      if (host) host.scenes.push(sc);
    }

    for (const h of p.calendarHistory()) {
      if (h.year === year && h.d != null) put(h.d, { key: 'history', kind: 'calendar', label: h.title, note: 'Calendar history', open: () => p.openCalendarNote() });
    }

    const order = ['history', 'event', 'founding', 'birth', 'death', 'story', 'scene', 'birthday', 'anniversary'];
    for (const list of byDay.values()) {
      list.sort((a, b) => (a.recurring ? 1 : 0) - (b.recurring ? 1 : 0) || order.indexOf(a.key) - order.indexOf(b.key) || natural(a.label, b.label));
    }
    return byDay;
  }

  calShown(key) { return this.plugin.settings.calendarView.show[key] !== false; }
  async calSetMode(mode) {
    this.plugin.settings.calendarView.mode = mode;
    await this.plugin.saveSettings();
    this.render();
  }
  calMonthOf(cal, d) {
    const m = cal.months.find((x) => d > x.start && d <= x.start + x.days);
    return m ? m.index : 0;
  }
  calDateText(cal, pt) { return this.plugin.dateText(pt); }

  /* A holiday's name on the calendar; opens its entry (or the calendar note, for one written there). */
  calHoliday(parent, h) {
    const p = this.plugin;
    const el = parent.createDiv({ cls: 'ls-cal-holiday is-link', text: h.name, attr: { 'aria-label': [h.name, h.note].filter(Boolean).join(' · ') } });
    el.addEventListener('click', (e) => { e.stopPropagation(); if (h.file) p.openEntity(h.file); else p.openCalendarNote(); });
    return el;
  }

  calChip(parent, it) {
    const n = it.scenes ? it.scenes.length : 0;
    const chip = parent.createDiv({ cls: `ls-cal-item ls-tl-${it.kind}`, text: n ? `${it.label} (${n})` : it.label });
    if (it.recurring) chip.addClass('is-recurring');
    if (it.round) chip.addClass('is-round');
    const tip = [it.label, it.note, n ? `${n} scene${n === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    chip.setAttr('aria-label', tip);
    chip.addEventListener('click', (e) => { e.stopPropagation(); it.open(); });
    return chip;
  }

  /* One month as a grid of days. `big` is the month view; otherwise the compact year view. */
  calGrid(parent, cal, m, byDay, big, onDay) {
    const p = this.plugin;
    const year = this.calYear;
    const now = this.calNow;
    const grid = parent.createDiv('ls-cal-grid');
    const cols = cal.weekdays.length || 7;
    grid.style.setProperty('--ls-cal-cols', String(cols));
    if (cal.weekdays.length) {
      const names = big ? cal.weekdays : shortNames(cal.weekdays);
      cal.weekdays.forEach((w, i) => grid.createDiv({ cls: 'ls-cal-wd', text: names[i], attr: { 'aria-label': w } }));
    }
    const first = p.weekdayOf({ y: year, d: m.start + 1 });
    const lead = cal.weekdays.length ? Math.max(0, cal.weekdays.indexOf(first)) : 0;
    for (let i = 0; i < lead; i++) grid.createDiv('ls-cal-day is-blank');
    const limit = big ? 5 : 3;
    const showMoons = this.calShown('moon');
    for (let day = 1; day <= m.days; day++) {
      const pt = { y: year, d: m.start + day };
      const cell = grid.createDiv('ls-cal-day');
      if (now && now.y === year && now.d === pt.d) cell.addClass('is-now');
      if (this.calSel && this.calSel.y === year && this.calSel.d === pt.d) cell.addClass('is-selected');
      const holidays = p.holidayInfoOf(pt);
      if (holidays.length && this.calShown('holiday')) cell.addClass('has-holiday');
      const top = cell.createDiv('ls-cal-num');
      top.createSpan({ text: String(day) });
      if (showMoons) {
        const moons = top.createSpan('ls-cal-moons');
        for (const mo of p.moonsOf(pt)) {
          if (mo.exact != null) moonSvg(moons, mo.exact / 8, `${mo.name}: ${MOON_PHASES[mo.exact].toLowerCase()} moon`, 'is-exact');
          else moonSvg(moons, mo.frac, `${mo.name}: ${mo.phase.toLowerCase()}`);
        }
      }
      if (this.calShown('holiday')) for (const h of holidays) this.calHoliday(cell, h);
      const items = (byDay.get(pt.d) || []).filter((it) => this.calShown(it.key));
      items.slice(0, limit).forEach((it) => this.calChip(cell, it));
      if (items.length > limit) cell.createDiv({ cls: 'ls-cal-more', text: `+${items.length - limit} more` });
      cell.addEventListener('click', () => onDay(pt.d));
    }
  }

  async renderCalendar(body, idx) {
    const p = this.plugin;
    const cv = p.settings.calendarView;
    const mode = cv.mode;
    const now = p.latestPresent();
    this.calNow = now;
    if (this.calYear == null) {
      this.calYear = now ? now.y : 1;
      const c0 = p.calendar(this.calYear);
      if (c0 && now && now.d != null) this.calMonth = this.calMonthOf(c0, now.d);
    }
    /* Each year gets the calendar in force that year, so a calendar change shows up as you page through. */
    const cal = p.calendar(this.calYear);
    if (this.calMonth == null || (cal && this.calMonth >= cal.months.length)) this.calMonth = 0;
    const skipZero = (y, dir) => (y === 0 && !p.eras().zero ? y + dir : y);
    const stepYear = (dir) => { this.calYear = skipZero(this.calYear + dir, dir); this.calSel = null; this.render(); };
    const stepMonth = (dir) => {
      let mo = this.calMonth + dir;
      if (mo < 0) {
        this.calYear = skipZero(this.calYear - 1, -1);
        const c = p.calendar(this.calYear);
        mo = c ? c.months.length - 1 : 0;
      } else if (mo >= cal.months.length) { mo = 0; this.calYear = skipZero(this.calYear + 1, 1); }
      this.calMonth = mo;
      this.render();
    };
    const goNow = () => {
      this.calYear = now.y;
      const c = p.calendar(now.y);
      if (now.d != null && c) { this.calMonth = this.calMonthOf(c, now.d); this.calSel = { y: now.y, d: now.d }; }
      this.render();
    };
    const atNow = now && now.y === this.calYear && (mode === 'year' || now.d == null || !cal || this.calMonthOf(cal, now.d) === this.calMonth);

    const el = this.panel(body, {
      title: 'Calendar', color: 'yellow',
      extra: (tools) => {
        if (cal) {
          const seg = tools.createDiv('ls-seg');
          for (const [m, ic, l] of [['year', 'calendar-range', 'Year'], ['month', 'calendar-days', 'Month']]) {
            const b = iconBtn(seg, ic, l, () => this.calSetMode(m));
            if (mode === m) b.addClass('is-active');
          }
        }
        const month = mode === 'month' && cal;
        iconBtn(tools, 'chevron-left', month ? 'Previous month' : 'Previous year', () => (month ? stepMonth(-1) : stepYear(-1)));
        if (month) {
          const sel = tools.createEl('select', { cls: 'dropdown ls-cal-monthsel', attr: { 'aria-label': 'Month' } });
          for (const m of cal.months) sel.createEl('option', { text: m.name, value: String(m.index) });
          sel.value = String(this.calMonth);
          sel.addEventListener('change', () => { this.calMonth = Number(sel.value); this.render(); });
        }
        const yr = tools.createEl('input', { type: 'text', cls: 'ls-input ls-cal-year', attr: { 'aria-label': 'Year' } });
        yr.value = p.fmtYear(this.calYear);
        yr.addEventListener('change', () => { const y = parseYear(yr.value, p.negEras()); if (y != null) { this.calYear = y; this.render(); } });
        iconBtn(tools, 'chevron-right', month ? 'Next month' : 'Next year', () => (month ? stepMonth(1) : stepYear(1)));
        if (now && !atNow) textBtn(tools, 'Present', goNow);
        iconBtn(tools, 'pencil', 'Edit calendar note: months, holidays and history', () => p.openCalendarNote());
      },
    });
    if (!cal) {
      const box = el.createDiv('ls-empty');
      box.createDiv({ text: 'Your custom calendar has no months yet. Add them to the Months section of the calendar note (one per line: name, number of days), or switch custom_calendar off to use the modern calendar.' });
      textBtn(box, 'Open calendar note', () => p.openCalendarNote(), 'mod-cta');
      return;
    }

    this.renderCalLegend(el, cal);
    const byDay = this.calItems(idx, this.calYear);

    if (mode === 'year') {
      const months = el.createDiv('ls-cal');
      for (const m of cal.months) {
        const box = months.createDiv('ls-cal-month');
        const title = box.createDiv({ cls: 'ls-cal-title is-link', text: m.name, attr: { 'aria-label': `Open ${m.name}` } });
        title.addEventListener('click', () => { this.calMonth = m.index; this.calSel = null; this.calSetMode('month'); });
        this.calGrid(box, cal, m, byDay, false, (d) => {
          this.calMonth = m.index;
          this.calSel = { y: this.calYear, d };
          this.calSetMode('month');
        });
      }
      return;
    }

    const m = cal.months[this.calMonth];
    const wrap = el.createDiv('ls-cal-mv');
    this.calGrid(wrap.createDiv('ls-cal-mv-grid'), cal, m, byDay, true, (d) => {
      const same = this.calSel && this.calSel.y === this.calYear && this.calSel.d === d;
      this.calSel = same ? null : { y: this.calYear, d };
      this.render();
    });
    const side = wrap.createDiv('ls-cal-detail');
    const sel = this.calSel;
    if (sel && sel.y === this.calYear && sel.d > m.start && sel.d <= m.start + m.days) this.renderCalDay(side, cal, sel, byDay);
    else this.renderCalAgenda(side, cal, m, byDay);
  }

  renderCalLegend(el, cal) {
    const p = this.plugin;
    const row = el.createDiv('ls-cal-legend');
    const kinds = [
      ['event', 'Events', 'event'], ['birth', 'Births', 'birth'], ['death', 'Deaths', 'death'],
      ['founding', 'Foundings', 'founding'], ['story', 'Stories & chapters', 'story'], ['scene', 'Scenes', 'scene'],
      ['birthday', 'Birthdays', 'birth', true], ['anniversary', 'Anniversaries', 'event', true],
    ];
    if (p.calModel().holidays.length) kinds.push(['holiday', 'Holidays', 'holiday']);
    if (p.calendarHistory().some((h) => h.d != null)) kinds.push(['history', 'Calendar history', 'calendar']);
    if (cal.moons.length) kinds.push(['moon', 'Moons', 'moon']);
    for (const [key, label, kind, recurring] of kinds) {
      const b = row.createEl('button', { cls: `ls-cal-key ls-tl-${kind}`, attr: { 'aria-pressed': String(this.calShown(key)) } });
      if (recurring) b.addClass('is-recurring');
      if (!this.calShown(key)) b.addClass('is-off');
      b.createSpan('ls-cal-swatch');
      b.createSpan({ text: label });
      b.addEventListener('click', async () => {
        const show = p.settings.calendarView.show;
        if (this.calShown(key)) show[key] = false; else delete show[key];
        await p.saveSettings();
        this.render();
      });
    }
  }

  renderCalDay(side, cal, pt, byDay) {
    const p = this.plugin;
    const dateText = this.calDateText(cal, pt);
    const head = side.createDiv('ls-cal-detail-head');
    const t = head.createDiv('ls-cal-detail-titles');
    t.createDiv({ cls: 'ls-cal-detail-title', text: dateText });
    const sub = [p.weekdayOf(pt), ...p.holidaysOf(pt)].filter(Boolean);
    if (this.calNow && this.calNow.y === pt.y && this.calNow.d === pt.d) sub.push('Present');
    if (sub.length) t.createDiv({ cls: 'ls-muted', text: sub.join(' · ') });
    iconBtn(head, 'copy', 'Copy date', () => {
      navigator.clipboard.writeText(dateText).then(() => new Notice(`Copied "${dateText}"`), () => new Notice('Could not copy the date.'));
    });
    iconBtn(head, 'x', 'Back to the month', () => { this.calSel = null; this.render(); });

    const hols = this.calShown('holiday') ? p.holidayInfoOf(pt) : [];
    if (hols.length) {
      const box = side.createDiv('ls-cal-detail-holidays');
      for (const h of hols) {
        const r = box.createDiv('ls-cal-detail-holiday');
        setIcon(r.createSpan('ls-cal-detail-holiday-icon'), 'party-popper');
        r.createSpan({ cls: 'ls-cal-holiday', text: h.name });
        const extra = [h.note, h.from === pt.y ? 'first held this year' : '', h.to != null && h.to === pt.y + 1 ? 'last held this year' : '', h.of > 1 && h.part === 1 ? `${h.of} days` : ''].filter(Boolean).join(' · ');
        if (extra) r.createSpan({ cls: 'ls-muted', text: extra });
        r.addEventListener('click', () => (h.file ? p.openEntity(h.file) : p.openCalendarNote()));
      }
    }

    const moons = p.moonsOf(pt);
    if (moons.length) {
      const box = side.createDiv('ls-cal-detail-moons');
      for (const mo of moons) {
        const r = box.createDiv('ls-cal-detail-moon');
        moonSvg(r, mo.frac, mo.phase, 'is-big');
        r.createSpan({ text: `${mo.name}: ${mo.phase.toLowerCase()}` });
        if (mo.index !== 4) r.createSpan({ cls: 'ls-muted', text: mo.toFull ? `full in ${mo.toFull} day${mo.toFull === 1 ? '' : 's'}` : 'full tonight' });
      }
    }

    const items = (byDay.get(pt.d) || []).filter((it) => this.calShown(it.key));
    const list = side.createDiv('ls-cal-detail-list');
    if (!items.length) list.createDiv({ cls: 'ls-muted', text: 'Nothing on this day yet.' });
    for (const it of items) {
      const row = list.createDiv(`ls-cal-detail-item ls-tl-${it.kind}`);
      if (it.recurring) row.addClass('is-recurring');
      const line = row.createDiv('ls-cal-detail-line');
      line.createSpan({ cls: 'ls-cal-detail-name', text: it.label });
      if (it.note) line.createSpan({ cls: 'ls-muted', text: it.note });
      line.addEventListener('click', () => it.open());
      if (it.scenes && it.scenes.length && this.calShown('scene')) {
        const sl = row.createDiv('ls-cal-detail-scenes');
        for (const sc of it.scenes) {
          const s = sl.createDiv({ cls: 'ls-cal-detail-scene', text: sc.basename });
          s.addEventListener('click', () => p.openNote(sc));
        }
      }
    }

    const act = side.createDiv('ls-cal-detail-actions');
    textBtn(act, 'New holiday on this day', () => new NameModal(this.app, { title: 'New holiday', placeholder: 'Holiday name', cta: 'Create' }, async (name) => {
      const m = cal.months[this.calMonthOf(cal, pt.d)];
      const f = await p.createEntity('holiday', { name }, false);
      if (!f) return;
      await this.app.fileManager.processFrontMatter(f, (fm) => { fm.date = `${pt.d - m.start} ${m.name}`; });
      await p.openEntity(f);
    }).open());
    textBtn(act, 'New event on this day', () => new NameModal(this.app, { title: `New event on ${dateText}`, placeholder: 'Event name', cta: 'Create' }, async (name) => {
      const f = await p.createEntity('event', { name }, false);
      if (!f) return;
      await this.app.fileManager.processFrontMatter(f, (fm) => { fm.date = dateText; });
      await p.openEntity(f);
    }).open());
  }

  /* With no day picked, the side panel lists the month's days that have something on them. */
  renderCalAgenda(side, cal, m, byDay) {
    const p = this.plugin;
    const head = side.createDiv('ls-cal-detail-head');
    const t = head.createDiv('ls-cal-detail-titles');
    t.createDiv({ cls: 'ls-cal-detail-title', text: `${m.name}, ${p.fmtYear(this.calYear)}` });
    t.createDiv({ cls: 'ls-muted', text: 'Tap a day for details.' });
    const list = side.createDiv('ls-cal-agenda');
    let any = false;
    for (let day = 1; day <= m.days; day++) {
      const pt = { y: this.calYear, d: m.start + day };
      const items = (byDay.get(pt.d) || []).filter((it) => this.calShown(it.key));
      const holidays = this.calShown('holiday') ? p.holidayInfoOf(pt) : [];
      const moons = this.calShown('moon') ? p.moonsOf(pt).filter((mo) => mo.exact != null) : [];
      if (!items.length && !holidays.length && !moons.length) continue;
      any = true;
      const row = list.createDiv('ls-cal-agenda-day');
      const when = row.createDiv('ls-cal-agenda-when');
      when.createSpan({ cls: 'ls-cal-agenda-num', text: String(day) });
      const wd = p.weekdayOf(pt);
      if (wd) when.createSpan({ cls: 'ls-muted', text: wd });
      when.addEventListener('click', () => { this.calSel = pt; this.render(); });
      const what = row.createDiv('ls-cal-agenda-what');
      for (const h of holidays) this.calHoliday(what, h);
      for (const mo of moons) {
        const r = what.createDiv('ls-cal-agenda-moon');
        moonSvg(r, mo.exact / 8, '', 'is-exact');
        r.createSpan({ text: `${mo.name} ${MOON_PHASES[mo.exact].toLowerCase()}` });
      }
      for (const it of items) this.calChip(what, it);
    }
    if (!any) list.createDiv({ cls: 'ls-muted', text: 'Nothing dated this month.' });
  }


  /* ---------- who has met whom ---------- */

  async renderMeetings(body, idx) {
    const p = this.plugin;
    const ms = p.settings.meet;
    const { pairs, counts } = await p.meetings();
    const save = () => { p.saveSoon(); this.render(); };
    const el = this.panel(body, {
      title: 'Who has met whom', color: 'red',
      extra: (tools) => {
        const sel = tools.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Which characters' } });
        for (const [v, l] of [['all', 'Everyone in a scene'], ['main', 'Main characters'], ['major', 'Main and major']]) sel.createEl('option', { text: l, value: v });
        sel.value = ms.filter;
        sel.addEventListener('change', () => { ms.filter = sel.value; this.meetSel = null; save(); });
        const seg = tools.createDiv('ls-seg');
        for (const [m, ic, l] of [['people', 'users', 'One character at a time'], ['grid', 'grid-3x3', 'Grid of everyone']]) {
          const b = iconBtn(seg, ic, l, () => { ms.mode = m; this.meetSel = null; save(); });
          if (ms.mode === m) b.addClass('is-active');
        }
      },
    });
    const cat = (c) => String(p.fm(c).category || 'major');
    const people = [...counts.keys()]
      .filter((c) => ms.filter === 'all' || (ms.filter === 'main' ? cat(c) === 'main' : cat(c) !== 'minor'))
      .sort((a, b) => (counts.get(b) - counts.get(a)) || natural(a.basename, b.basename));
    const scenesWith = (a, b) => pairs.get(pairKey(a, b)) || [];
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

    if (people.length < 2) {
      const e = el.createDiv('ls-empty');
      setIcon(e.createSpan('ls-empty-icon'), 'users');
      e.createSpan({ text: 'Once two characters share a scene (through the scene\'s cast), this page shows who has met whom and how often.' });
    } else if (ms.mode === 'grid') {
      this.renderMeetGrid(el, people, pairs, counts);
    } else {
      /* Pick a character from the strip; see everyone they have met, closest first. */
      if (!people.includes(this.meetWho)) this.meetWho = people[0];
      const who = this.meetWho;
      const strip = el.createDiv({ cls: 'ls-meet-strip', attr: { role: 'tablist', 'aria-label': 'Characters' } });
      for (const c of people) {
        const b = strip.createDiv({ cls: 'ls-meet-pick' + (c === who ? ' is-active' : ''), attr: { role: 'tab', tabindex: '0', 'aria-selected': String(c === who) } });
        avatarEl(b, p, c, 'is-medium');
        b.createDiv({ cls: 'ls-meet-pick-name', text: c.basename.split(/\s+/)[0] });
        b.createDiv({ cls: 'ls-meet-pick-count', text: plural(counts.get(c), 'scene') });
        b.setAttr('aria-label', `${c.basename}, ${plural(counts.get(c), 'scene')}`);
        const pick = () => { this.meetWho = c; this.meetSel = null; this.render(); };
        b.addEventListener('click', pick);
        b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      }

      const met = people.filter((c) => c !== who && scenesWith(who, c).length)
        .sort((a, b) => (scenesWith(who, b).length - scenesWith(who, a).length) || natural(a.basename, b.basename));
      const unmet = people.filter((c) => c !== who && !scenesWith(who, c).length);
      const card = el.createDiv('ls-meet-focus');
      const head = card.createDiv('ls-meet-focus-head');
      avatarEl(head, p, who, 'is-large');
      const ht = head.createDiv('ls-meet-focus-text');
      const nm = ht.createDiv({ cls: 'ls-meet-focus-name', text: who.basename });
      nm.addEventListener('click', () => p.openEntity(who, 'character'));
      ht.createDiv({ cls: 'ls-muted', text: `In ${plural(counts.get(who), 'scene')}. Has met ${met.length} of ${people.length - 1}.` });

      const max = met.length ? scenesWith(who, met[0]).length : 1;
      const list = card.createDiv('ls-meet-list');
      for (const c of met) {
        const sc = scenesWith(who, c);
        const k = pairKey(who, c);
        const row = list.createDiv({ cls: 'ls-meet-row' + (this.meetSel === k ? ' is-open' : ''), attr: { tabindex: '0', 'aria-expanded': String(this.meetSel === k) } });
        avatarEl(row, p, c);
        const t = row.createDiv('ls-meet-row-text');
        const top = t.createDiv('ls-meet-row-top');
        top.createSpan({ cls: 'ls-meet-row-name', text: c.basename });
        const rel = p.relationBetween(who, c);
        if (rel) iconText(top, REL[rel.kind].icon, rel.label, 'ls-meet-rel');
        const bar = t.createDiv('ls-meet-bar');
        bar.createDiv('ls-meet-bar-fill').style.width = `${Math.max(6, (sc.length / max) * 100)}%`;
        t.createDiv({ cls: 'ls-meet-row-first', text: `First together: ${sc[0].scene.basename}, ${sc[0].chapter}` });
        row.createDiv({ cls: 'ls-meet-row-count', text: String(sc.length) });
        const toggle = () => { this.meetSel = this.meetSel === k ? null : k; this.render(); };
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        if (this.meetSel === k) this.meetScenes(list, sc);
      }
      if (unmet.length) {
        const nb = card.createDiv('ls-meet-never');
        nb.createDiv({ cls: 'ls-meet-sub', text: `Never in a scene with ${who.basename.split(/\s+/)[0]}` });
        const box = nb.createDiv('ls-chips');
        for (const c of unmet) {
          const rel = p.relationBetween(who, c);
          const chip = box.createDiv('ls-chip ls-person-chip' + (rel ? ' is-tied' : ''));
          avatarEl(chip, p, c, 'is-tiny');
          chip.createSpan({ text: c.basename });
          if (rel) { chip.createSpan({ cls: 'ls-chip-note', text: rel.label }); chip.setAttr('aria-label', `${c.basename} is ${who.basename}'s ${rel.label.toLowerCase()}, but they never share a scene`); }
          chip.addEventListener('click', () => { this.meetWho = c; this.render(); });
        }
      }
    }

    // Ties in the notes between people who never appear together
    const ties = [];
    const seen = new Set();
    for (const c of people.length ? people : idx.character) {
      for (const r of p.relationsOf(c)) {
        if (!CLOSE_KINDS.has(r.kind) || r.former) continue;
        const key = pairKey(c, r.file);
        if (seen.has(key) || pairs.has(key)) continue;
        seen.add(key);
        ties.push({ a: c, b: r.file, rel: r });
      }
    }
    const order = Object.keys(REL);
    ties.sort((x, y) => (order.indexOf(x.rel.kind) - order.indexOf(y.rel.kind)) || natural(x.a.basename, y.a.basename));
    const tb = this.panel(body, { title: 'Tied but never together', color: 'red', count: ties.length });
    if (!ties.length) {
      tb.createDiv({ cls: 'ls-muted', text: 'Everyone with a family tie, friend, ally or rival shares at least one scene with them.' });
      return;
    }
    tb.createDiv({ cls: 'ls-hint', text: 'These characters are connected in your notes but have never shared a scene. Any of them could be a scene worth writing.' });
    const list = tb.createDiv('ls-tie-list');
    for (const t of ties.slice(0, 80)) {
      const row = list.createDiv({ cls: 'ls-tie-row', attr: { tabindex: '0' } });
      const pair = row.createDiv('ls-tie-pair');
      avatarEl(pair, p, t.a);
      const link = pair.createSpan({ cls: `ls-tie-link ls-c-${EDGE_KINDS[REL[t.rel.kind].edge].color}` });
      setIcon(link, REL[t.rel.kind].icon);
      avatarEl(pair, p, t.b);
      const txt = row.createDiv('ls-tie-text');
      txt.createDiv({ cls: 'ls-tie-names', text: `${t.a.basename} and ${t.b.basename}` });
      txt.createDiv({ cls: 'ls-muted', text: `${t.b.basename} is ${t.a.basename}'s ${t.rel.label.toLowerCase()}` });
      const go = () => { ms.mode = 'people'; this.meetWho = t.a; this.meetSel = null; save(); };
      row.addEventListener('click', go);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    }
    if (ties.length > 80) tb.createDiv({ cls: 'ls-muted', text: `And ${ties.length - 80} more.` });
  }

  meetScenes(parent, scenes) {
    const p = this.plugin;
    const box = parent.createDiv('ls-meet-scenes');
    for (const h of scenes) {
      const row = box.createDiv('ls-row');
      setIcon(row.createSpan('ls-row-icon'), 'clapperboard');
      row.createSpan({ cls: 'ls-row-name', text: h.scene.basename });
      row.createSpan({ cls: 'ls-row-meta', text: `${h.story.basename}, ${h.chapter}` });
      row.addEventListener('click', (e) => { e.stopPropagation(); p.openNote(h.scene); });
    }
  }

  renderMeetGrid(el, people, pairs, counts) {
    const p = this.plugin;
    const shown = people.slice(0, 40);
    if (people.length > shown.length) el.createDiv({ cls: 'ls-hint', text: `Showing the ${shown.length} characters with the most scenes.` });
    let max = 1;
    for (const v of pairs.values()) max = Math.max(max, v.length);
    const wrap = el.createDiv('ls-meet-wrap');
    const table = wrap.createEl('table', { cls: 'ls-meet' });
    const hr = table.createEl('tr');
    hr.createEl('th', { cls: 'ls-meet-corner' });
    for (const c of shown) {
      const th = hr.createEl('th', { cls: 'ls-meet-col', attr: { 'aria-label': c.basename, title: c.basename } });
      avatarEl(th, p, c, 'is-small');
      th.addEventListener('click', () => p.openEntity(c, 'character'));
    }
    for (const a of shown) {
      const tr = table.createEl('tr');
      const th = tr.createEl('th', { cls: 'ls-meet-rowhead' });
      const inner = th.createDiv('ls-meet-rowhead-inner');
      avatarEl(inner, p, a, 'is-small');
      inner.createSpan({ text: a.basename });
      th.addEventListener('click', () => p.openEntity(a, 'character'));
      for (const b of shown) {
        const td = tr.createEl('td');
        if (a === b) { td.addClass('is-self'); td.setText(String(counts.get(a))); td.setAttr('aria-label', `${a.basename} is in ${counts.get(a)} scenes`); continue; }
        const k = pairKey(a, b);
        const n = (pairs.get(k) || []).length;
        if (n) { td.setText(String(n)); td.style.setProperty('--ls-heat', String(0.15 + 0.85 * (n / max))); td.addClass('is-met'); }
        else if (p.relationBetween(a, b)) td.addClass('is-tied');
        td.setAttr('aria-label', `${a.basename} and ${b.basename}: ${n ? `${n} scene${n === 1 ? '' : 's'} together` : 'never shared a scene'}`);
        if (this.meetSel === k) td.addClass('is-selected');
        td.addEventListener('click', () => { this.meetSel = this.meetSel === k ? null : k; this.render(); });
      }
    }
    const key = el.createDiv('ls-meet-key');
    const sw = (cls, text) => { const i = key.createSpan('ls-meet-key-item'); i.createSpan(`ls-meet-key-swatch ${cls}`); i.createSpan({ text }); };
    sw('is-met', 'Scenes together');
    sw('is-tied', 'Related, never together');
    if (this.meetSel) {
      const [pa, pb] = this.meetSel.split('|').map((x) => this.app.vault.getAbstractFileByPath(x));
      const scenes = pairs.get(this.meetSel) || [];
      const box = el.createDiv('ls-meet-detail');
      const h = box.createDiv('ls-meet-detail-head');
      if (pa instanceof TFile) avatarEl(h, p, pa);
      if (pb instanceof TFile) avatarEl(h, p, pb);
      h.createSpan({ cls: 'ls-meet-detail-title', text: `${pa ? pa.basename : '?'} and ${pb ? pb.basename : '?'}` });
      const rel = pa instanceof TFile && pb instanceof TFile ? p.relationBetween(pa, pb) : null;
      if (rel) iconText(h, REL[rel.kind].icon, `${rel.file.basename} is ${pa.basename}'s ${rel.label.toLowerCase()}`, 'ls-meet-rel');
      if (!scenes.length) box.createDiv({ cls: 'ls-muted', text: 'They have never shared a scene. Could be a scene worth writing.' });
      else this.meetScenes(box, scenes);
    }
  }

  /* ---------- writing goals ---------- */

  async renderGoals(body, idx, full) {
    const p = this.plugin;
    const s = p.settings;
    const goal = Number(s.dailyGoal) || 0;
    const today = p.wordsOn(dayKey());
    const streak = p.streak();
    const el = this.panel(body, {
      title: 'Writing goals', color: 'green', onTitle: full ? null : () => this.goto('goals'),
      extra: full ? null : (tools) => tools.createSpan({ cls: 'ls-badge', text: streak ? `${streak}-day streak` : 'No streak yet' }),
    });

    const top = el.createDiv('ls-goal-today');
    const meter = top.createDiv('ls-goal-meter');
    const label = meter.createDiv('ls-goal-label');
    label.createSpan({ cls: 'ls-goal-num', text: fmtNum(today) });
    label.createSpan({ cls: 'ls-muted', text: goal ? ` of ${fmtNum(goal)} words today` : ' words today' });
    if (goal) this.bar(meter, today / goal, today >= goal);

    if (full) {
      const set = top.createDiv('ls-goal-set');
      set.createSpan({ cls: 'ls-prop-label', text: 'Daily goal' });
      const inp = set.createEl('input', { type: 'number', cls: 'ls-input', attr: { min: '0', step: '50' } });
      inp.value = String(goal || '');
      inp.addEventListener('change', async () => { s.dailyGoal = Math.max(0, Number(inp.value) || 0); await p.saveSettings(); this.render(); });

      const stats = el.createDiv('ls-stats ls-goal-stats');
      const stat = (l, v) => { const d = stats.createDiv('ls-stat'); d.createDiv({ cls: 'ls-stat-label', text: l }); d.createDiv({ cls: 'ls-stat-value', text: v }); };
      let week = 0, best = 0, bestDay = '';
      for (let i = 0; i < 7; i++) week += p.wordsOn(dayKey(addDays(new Date(), -i)));
      for (const [d, n] of Object.entries(s.wordLog[s.activeProject] || {})) if (n > best) { best = n; bestDay = d; }
      stat('Streak', streak ? `${streak} day${streak === 1 ? '' : 's'}` : 'None yet');
      stat('Last 7 days', fmtNum(week));
      stat('Best day', best ? `${fmtNum(best)} (${bestDay})` : 'None yet');
      stat('Today', fmtNum(today));
      this.heatmap(el, goal);
      el.createDiv({ cls: 'ls-muted ls-goal-note', text: 'Counts net words added to scene notes in this project, wherever you write them.' });
    }

    // story targets
    const withGoals = idx.story.filter((f) => numOrNull(p.fm(f).word_goal));
    if (!full && !withGoals.length) return;
    const stories = full ? idx.story : withGoals;
    if (!stories.length) return;
    const datas = await Promise.all(stories.map((f) => p.storyData(f)));
    const list = el.createDiv('ls-goal-stories');
    stories.forEach((f, i) => {
      const fm = p.fm(f);
      const target = numOrNull(fm.word_goal);
      const words = datas[i].words;
      const row = list.createDiv('ls-goal-story');
      const head = row.createDiv('ls-goal-story-head');
      const t = head.createSpan({ cls: 'ls-goal-story-name', text: f.basename });
      t.addEventListener('click', () => p.openChapters(f));
      head.createSpan({ cls: 'ls-words', text: target ? `${fmtNum(words)} / ${fmtNum(target)}` : fmtNum(words) });
      if (target) this.bar(row, words / target, words >= target);

      const left = target ? Math.max(0, target - words) : 0;
      const days = daysUntil(fm.deadline);
      const note = [];
      if (target && left === 0) note.push('Goal reached');
      else if (target && days != null && days > 0) note.push(`${fmtNum(Math.ceil(left / days))} words a day to finish by ${isoDate(fm.deadline)}`);
      else if (target && days === 0) note.push(`${fmtNum(left)} words left, due today`);
      else if (target && days != null && days < 0) note.push(`${fmtNum(left)} words left, ${-days} day${days === -1 ? '' : 's'} past the deadline`);
      else if (target) note.push(`${fmtNum(left)} words to go`);
      if (note.length) row.createDiv({ cls: 'ls-muted', text: note.join('') });

      if (full) {
        const edit = row.createDiv('ls-goal-edit');
        edit.createSpan({ cls: 'ls-prop-label', text: 'Word goal' });
        const g = edit.createEl('input', { type: 'number', cls: 'ls-input', attr: { min: '0', step: '1000', placeholder: '80000' } });
        g.value = target ? String(target) : '';
        g.addEventListener('change', () => this.app.fileManager.processFrontMatter(f, (x) => {
          const n = Number(g.value);
          if (n > 0) x.word_goal = n; else delete x.word_goal;
        }));
        edit.createSpan({ cls: 'ls-prop-label', text: 'Deadline' });
        const dl = edit.createEl('input', { type: 'date', cls: 'ls-input' });
        dl.value = isoDate(fm.deadline);
        dl.addEventListener('change', () => this.app.fileManager.processFrontMatter(f, (x) => {
          if (dl.value) x.deadline = dl.value; else delete x.deadline;
        }));
      }
    });
  }

  /* ---------- writing log: today, trend, goals, authorship ---------- */

  async renderWriting(body, idx) {
    const p = this.plugin;
    const ts = p.settings.typing;
    const tabs = [['today', 'Today'], ['trend', 'Trend'], ['goals', 'Goals'], ['authorship', 'Authorship']];
    if (!tabs.some(([k]) => k === ts.tab)) ts.tab = 'today';
    const bar = body.createDiv('ls-tabs');
    for (const [k, l] of tabs) {
      const b = bar.createEl('button', { cls: 'ls-tab' + (ts.tab === k ? ' is-active' : ''), text: l });
      b.addEventListener('click', () => { ts.tab = k; p.saveSoon(); this.render(); });
    }
    if (ts.tab === 'goals') return this.renderGoals(body, idx, true);
    const all = await p.typing.all();
    if (ts.tab === 'today') return this.renderToday(body, all);
    if (ts.tab === 'trend') return this.renderTrend(body, all);
    return this.renderAuthorship(body, idx);
  }

  /* Toggle chips for which kinds of writing to count. */
  kindChips(parent) {
    const p = this.plugin;
    const ts = p.settings.typing;
    const row = parent.createDiv('ls-chip-row');
    row.createSpan({ cls: 'ls-muted', text: 'Counting' });
    for (const [k, label] of Object.entries(TYPING_KINDS)) {
      if (k === 'other' && !ts.outside) continue;
      const on = ts.kinds.includes(k);
      const b = textBtn(row, label, () => {
        const next = on ? ts.kinds.filter((x) => x !== k) : [...ts.kinds, k];
        if (!next.length) return;
        ts.kinds = next;
        p.saveSoon();
        this.render();
      }, `ls-toggle ls-kind-${k}` + (on ? ' is-active' : ''));
      b.setAttr('aria-pressed', String(on));
    }
  }
  statGrid(parent, items) {
    const grid = parent.createDiv('ls-stats ls-tl-stats');
    for (const [label, value, tip] of items) {
      const d = grid.createDiv('ls-stat');
      d.createDiv({ cls: 'ls-stat-value', text: value });
      d.createDiv({ cls: 'ls-stat-label', text: label });
      if (tip) d.setAttr('aria-label', tip);
    }
    return grid;
  }
  ring(parent, ratio, title, sub) {
    const box = parent.createDiv('ls-ring');
    const svg = svgEl('svg', { viewBox: '0 0 80 80', class: 'ls-ring-svg' }, box);
    const r = 34, c = 2 * Math.PI * r;
    svgEl('circle', { cx: 40, cy: 40, r, class: 'ls-ring-track' }, svg);
    const v = Math.max(0, Math.min(1, ratio));
    svgEl('circle', { cx: 40, cy: 40, r, class: 'ls-ring-fill' + (ratio >= 1 ? ' is-met' : ''), 'stroke-dasharray': `${c * v} ${c}`, transform: 'rotate(-90 40 40)' }, svg);
    const mid = box.createDiv('ls-ring-mid');
    mid.createDiv({ cls: 'ls-ring-pct', text: `${Math.round(Math.max(0, ratio) * 100)}%` });
    mid.createDiv({ cls: 'ls-ring-title', text: title });
    box.createDiv({ cls: 'ls-ring-sub', text: sub });
  }

  renderToday(body, all) {
    const p = this.plugin;
    const t = p.typing;
    const ts = p.settings.typing;
    const el = this.panel(body, { title: 'Today', color: 'green' });
    if (!t.loaded) { el.createDiv({ cls: 'ls-muted', text: 'Loading the typing log…' }); return; }
    this.kindChips(el);
    const key = dayKey();
    const d = t.dayStats(all, key, ts.kinds);
    this.statGrid(el, [
      ['Active today', fmtDur(d.active), 'Time spent typing, not counting pauses longer than the idle limit in settings'],
      ['Typed', fmtNum(d.typed), 'Characters typed (including autocorrect and autocomplete)'],
      ['Pasted', fmtNum(d.pasted), 'Characters pasted or dropped in'],
      ['Deleted', fmtNum(d.deleted)],
      ['Net words', fmtNum(d.words)],
      ['Peak speed', `${fmtNum(d.peak)} CPM`, 'Most characters typed in one minute today'],
      ['Right now', `${fmtNum(t.cpm())} CPM`, 'Characters typed in the last minute'],
    ]);

    const rings = el.createDiv('ls-rings');
    const goal = Number(p.settings.dailyGoal) || 0;
    const words = p.wordsOn(key);
    if (goal) this.ring(rings, words / goal, 'Word goal', `${fmtNum(words)} / ${fmtNum(goal)} words`);
    const tg = Number(ts.timeGoal) || 0;
    if (tg) this.ring(rings, d.active / (tg * 60000), 'Time goal', `${fmtDur(d.active)} / ${tg} min`);
    if (!rings.childElementCount) rings.remove();

    /* The three kinds side by side, whatever the chips say. */
    const split = el.createDiv('ls-kind-split');
    const head = split.createDiv('ls-kind-row is-head');
    for (const h of ['', 'Active', 'Typed', 'Pasted', 'Words']) head.createSpan({ text: h });
    for (const [k, label] of Object.entries(TYPING_KINDS)) {
      if (k === 'other' && !ts.outside) continue;
      const s = t.dayStats(all, key, [k]);
      const row = split.createDiv(`ls-kind-row ls-kind-${k}`);
      row.createSpan({ cls: 'ls-kind-name', text: label });
      for (const v of [fmtDur(s.active), fmtNum(s.typed), fmtNum(s.pasted), fmtNum(s.words)]) row.createSpan({ text: v });
    }

    /* Pomodoro: counts typing time, so it pauses whenever you do. */
    const pb = this.panel(body, { title: 'Pomodoro', color: 'red' });
    const pm = t.pomo;
    const box = pb.createDiv('ls-pomo');
    const target = pm ? pm.target : Math.max(1, Number(ts.pomodoro) || 25) * 60000;
    const left = pm ? Math.max(0, pm.target - pm.active) : target;
    box.createDiv({ cls: 'ls-pomo-state', text: !pm ? 'Not started' : pm.done ? 'Done. Take a break.' : 'Writing' });
    box.createDiv({ cls: 'ls-muted', text: 'Counts typing time only, so it waits while you think.' });
    const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
    box.createDiv({ cls: 'ls-pomo-time', text: `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` });
    this.bar(box, pm ? pm.active / pm.target : 0, pm && pm.done);
    const acts = box.createDiv('ls-pomo-actions');
    textBtn(acts, pm ? 'Restart' : 'Start pomodoro', () => { t.startPomodoro(); this.render(); }, 'mod-cta');
    if (pm) textBtn(acts, 'Stop', () => { t.stopPomodoro(); this.render(); }, 'mod-warning');

    /* The note typed in most recently on this device. */
    const path = t.lastPath;
    const f = path && this.app.vault.getAbstractFileByPath(path);
    const cb = this.panel(body, { title: 'Current file', color: 'cyan' });
    if (!(f instanceof TFile)) { cb.createDiv({ cls: 'ls-muted', text: 'Start typing in a note and its numbers show up here.' }); return; }
    const kind = t.kindOf(f);
    const name = cb.createDiv({ cls: 'ls-cur-file is-link', text: `${f.basename}` });
    name.createSpan({ cls: 'ls-pill', text: TYPING_KINDS[kind] || '' });
    name.addEventListener('click', () => p.openNote(f));
    const rec = t.fileRecord(all, path);
    const lv = t.live.get(path);
    const s = lv && lv.session;
    if (s) {
      this.statGrid(cb, [
        ['Net words this session', fmtNum((s.endWords || 0) - (s.startWords || 0))],
        ['Typed', fmtNum(s.typed)], ['Pasted', fmtNum(s.pasted)], ['Deleted', fmtNum(s.deleted)],
        ['Active this session', fmtDur(s.active)],
      ]);
    }
    if (rec) {
      cb.createDiv({ cls: 'ls-muted ls-cur-total', text: `All time: ${fmtDur(rec.totals.active)} typing over ${rec.sessions.length} session${rec.sessions.length === 1 ? '' : 's'}, ${fmtNum(rec.totals.typed)} typed, ${fmtNum(rec.totals.pasted)} pasted.` });
    }
    if (lv && lv.growth.length > 1) {
      cb.createDiv({ cls: 'ls-prop-label', text: 'Words this session' });
      this.lineChart(cb, lv.growth.map(([ms, w]) => [ms / 60000, w]));
    }
  }

  /* A small line chart: points [x minutes, y]. */
  lineChart(parent, pts) {
    const W = 320, H = 110, L = 34, B = 18, T = 8, R = 8;
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const X = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
    const Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ls-line-chart' }, parent.createDiv('ls-chart-wrap'));
    for (let i = 0; i <= 3; i++) {
      const v = y0 + ((y1 - y0) * i) / 3;
      svgEl('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'ls-chart-grid' }, svg);
      svgEl('text', { x: L - 4, y: Y(v) + 3, class: 'ls-chart-label', 'text-anchor': 'end' }, svg).textContent = String(Math.round(v));
    }
    const line = pts.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join(' ');
    svgEl('path', { d: `${line} L${X(pts[pts.length - 1][0]).toFixed(1)},${H - B} L${X(pts[0][0]).toFixed(1)},${H - B}Z`, class: 'ls-chart-area' }, svg);
    svgEl('path', { d: line, class: 'ls-chart-line' }, svg);
    svgEl('text', { x: L, y: H - 4, class: 'ls-chart-label' }, svg).textContent = `${Math.round(x0)}m`;
    svgEl('text', { x: W - R, y: H - 4, class: 'ls-chart-label', 'text-anchor': 'end' }, svg).textContent = `${Math.round(x1)}m`;
  }

  renderTrend(body, all) {
    const p = this.plugin;
    const t = p.typing;
    const ts = p.settings.typing;
    const el = this.panel(body, { title: 'Daily trend', color: 'green' });
    this.kindChips(el);
    const chips = (label, key, opts) => {
      const row = el.createDiv('ls-chip-row');
      row.createSpan({ cls: 'ls-muted', text: label });
      for (const [v, l] of opts) {
        textBtn(row, l, () => { ts[key] = v; p.saveSoon(); this.render(); }, 'ls-toggle' + (ts[key] === v ? ' is-active' : ''));
      }
    };
    chips('Range', 'range', [[7, '7 days'], [30, '30 days'], [90, '90 days']]);
    chips('Metric', 'metric', [['typed', 'Typed'], ['active', 'Active time'], ['words', 'Net words'], ['pasted', 'Pasted'], ['peak', 'Peak speed']]);
    const metric = ts.metric;
    const fmt = (v) => (metric === 'active' ? fmtDur(v) : metric === 'peak' ? `${fmtNum(v)} CPM` : fmtNum(v));
    const kinds = Object.keys(TYPING_KINDS).filter((k) => ts.kinds.includes(k) && (k !== 'other' || ts.outside));
    const days = [];
    for (let i = ts.range - 1; i >= 0; i--) {
      const key = dayKey(addDays(new Date(), -i));
      const parts = kinds.map((k) => Math.max(0, t.dayStats(all, key, [k])[metric] || 0));
      const total = metric === 'peak' ? t.dayStats(all, key, kinds).peak : parts.reduce((a, b) => a + b, 0);
      days.push({ key, parts: metric === 'peak' ? [total] : parts, total });
    }
    const max = Math.max(1, ...days.map((d) => d.total));
    const W = this.compact ? 320 : 640, H = this.compact ? 150 : 180, L = 40, B = 22, T = 14, R = 6;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ls-bar-chart' }, el.createDiv('ls-chart-wrap'));
    for (let i = 0; i <= 4; i++) {
      const v = (max * i) / 4, y = T + (1 - i / 4) * (H - T - B);
      svgEl('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'ls-chart-grid' }, svg);
      svgEl('text', { x: L - 4, y: y + 3, class: 'ls-chart-label', 'text-anchor': 'end' }, svg).textContent = metric === 'active' ? `${Math.round(v / 60000)}m` : fmtNum(Math.round(v));
    }
    const slot = (W - L - R) / days.length;
    const bw = Math.max(2, Math.min(36, slot * 0.7));
    const every = Math.ceil(days.length / (this.compact ? 5 : 10));
    days.forEach((d, i) => {
      const x = L + i * slot + (slot - bw) / 2;
      let y = H - B;
      d.parts.forEach((v, j) => {
        const h = (v / max) * (H - T - B);
        if (h <= 0) return;
        y -= h;
        const r = svgEl('rect', { x, y, width: bw, height: h, rx: 2, class: `ls-bar-seg ls-kind-${metric === 'peak' ? 'all' : kinds[j]}` }, svg);
        svgEl('title', {}, r).textContent = `${d.key}${metric === 'peak' ? '' : ` · ${TYPING_KINDS[kinds[j]]}`}: ${fmt(v)}`;
      });
      if (i % every === 0 || i === days.length - 1) svgEl('text', { x: x + bw / 2, y: H - 6, class: 'ls-chart-label', 'text-anchor': 'middle' }, svg).textContent = d.key.slice(5);
    });
    if (metric !== 'peak' && kinds.length > 1) {
      const legend = el.createDiv('ls-kind-legend');
      for (const k of kinds) { const s = legend.createSpan(`ls-kind-key ls-kind-${k}`); s.createSpan('ls-kind-swatch'); s.createSpan({ text: TYPING_KINDS[k] }); }
    }
    const sum = days.reduce((a, d) => a + d.total, 0);
    el.createDiv({ cls: 'ls-muted', text: metric === 'peak' ? `Fastest minute in this range: ${fmt(max === 1 && !sum ? 0 : max)}.` : `Total over ${ts.range} days: ${fmt(sum)}.` });

    /* Heatmap: 18 weeks of active time or words. */
    const hb = this.panel(body, { title: 'Typing heatmap', color: 'green' });
    const hrow = hb.createDiv('ls-chip-row');
    for (const [v, l] of [['active', 'Active time'], ['typed', 'Typed'], ['words', 'Net words']]) {
      textBtn(hrow, l, () => { ts.heat = v; p.saveSoon(); this.render(); }, 'ls-toggle' + (ts.heat === v ? ' is-active' : ''));
    }
    const weeks = this.compact ? 14 : 18;
    const wrap = hb.createDiv('ls-heat-wrap');
    const grid = wrap.createDiv('ls-heat');
    const end = new Date();
    const start = addDays(end, -(weeks * 7 - 1) - end.getDay());
    const vals = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) vals.push([dayKey(d), Math.max(0, t.dayStats(all, dayKey(d), kinds)[ts.heat] || 0)]);
    const top = Math.max(1, ...vals.map((v) => v[1]));
    for (const [key, n] of vals) {
      const lvl = n <= 0 ? 0 : n >= top * 0.75 ? 4 : n >= top * 0.5 ? 3 : n >= top * 0.25 ? 2 : 1;
      grid.createDiv({ cls: `ls-heat-cell ls-heat-${lvl}`, attr: { 'aria-label': `${key}: ${ts.heat === 'active' ? fmtDur(n) : fmtNum(n)}` } });
    }
    const k = wrap.createDiv('ls-heat-key');
    k.createSpan({ cls: 'ls-muted', text: 'Less' });
    for (let i = 0; i <= 4; i++) k.createDiv(`ls-heat-cell ls-heat-${i}`);
    k.createSpan({ cls: 'ls-muted', text: 'More' });
  }

  async renderAuthorship(body, idx) {
    const p = this.plugin;
    const ts = p.settings.typing;
    const el = this.panel(body, { title: 'Authorship', color: 'purple' });
    if (!idx.story.length) { el.createDiv({ cls: 'ls-muted', text: 'Authorship is worked out per story. Create a story and write its scenes here to start a record.' }); return; }
    let story = idx.story.find((s) => s.path === ts.story) || idx.story[0];
    const row = el.createDiv('ls-chip-row');
    const sel = row.createEl('select', { cls: 'dropdown' });
    for (const s of idx.story) sel.createEl('option', { text: s.basename, value: s.path });
    sel.value = story.path;
    sel.addEventListener('change', () => { ts.story = sel.value; p.saveSoon(); this.render(); });
    textBtn(row, 'Export report', async () => { const f = await p.exportAuthorship(story); if (f) p.openNote(f); }, 'mod-cta');

    const box = el.createDiv();
    box.createDiv({ cls: 'ls-muted', text: 'Checking fingerprints…' });
    const a = await p.authorship(story);
    box.empty();
    const pct = a.totals.typed + a.totals.pasted ? (a.totals.pasted / (a.totals.typed + a.totals.pasted)) * 100 : 0;
    this.statGrid(box, [
      ['Words now', fmtNum(a.words)],
      ['Writing time', fmtDur(a.totals.active)],
      ['Sessions', fmtNum(a.sessions.length)],
      ['Typed', fmtNum(a.totals.typed)],
      ['Pasted', `${fmtNum(a.totals.pasted)} (${pct.toFixed(1)}%)`],
      ['Scenes tracked', `${a.scenes.filter((s) => s.rec).length} of ${a.scenes.length}`],
    ]);
    const verdicts = box.createDiv('ls-auth-verdicts');
    for (const v of a.verdicts) verdicts.createDiv({ cls: `ls-auth-verdict is-${v.level}`, text: v.text });

    const table = box.createDiv('ls-auth-table');
    const head = table.createDiv('ls-auth-row is-head');
    for (const h of ['Scene', 'Words', 'Time', 'Typed', 'Pasted', 'Status']) head.createSpan({ text: h });
    for (const s of a.scenes) {
      const r = table.createDiv('ls-auth-row');
      const n = r.createSpan({ cls: 'is-link', text: s.file.basename });
      n.setAttr('aria-label', s.chapter);
      n.addEventListener('click', () => p.openNote(s.file));
      r.createSpan({ text: fmtNum(s.words) });
      r.createSpan({ text: s.rec ? fmtDur(s.rec.totals.active) : '–' });
      r.createSpan({ text: s.rec ? fmtNum(s.rec.totals.typed) : '–' });
      r.createSpan({ text: s.rec ? fmtNum(s.rec.totals.pasted) : '–' });
      r.createSpan({ cls: `ls-auth-status is-${s.status}`, text: s.statusText });
    }
    box.createDiv({ cls: 'ls-muted ls-auth-note', text: 'Typing is tracked from the day this version was installed, on each device where Loresmith is running. Export the report for the full session list with fingerprints.' });
  }

  bar(parent, ratio, met) {
    const b = parent.createDiv({ cls: 'ls-bar' + (met ? ' is-met' : ''), attr: { role: 'progressbar', 'aria-valuenow': String(Math.round(Math.min(1, ratio) * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100' } });
    b.createDiv('ls-bar-fill').style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }

  heatmap(parent, goal) {
    const p = this.plugin;
    const weeks = this.compact ? 14 : 18;
    const wrap = parent.createDiv('ls-heat-wrap');
    const grid = wrap.createDiv('ls-heat');
    const end = new Date();
    const start = addDays(end, -(weeks * 7 - 1) - end.getDay());
    const scale = goal || Math.max(1, ...Object.values(p.settings.wordLog[p.settings.activeProject] || {}));
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const key = dayKey(d);
      const n = p.wordsOn(key);
      const lvl = n <= 0 ? 0 : n >= scale ? 4 : n >= scale * 0.66 ? 3 : n >= scale * 0.33 ? 2 : 1;
      grid.createDiv({ cls: `ls-heat-cell ls-heat-${lvl}`, attr: { 'aria-label': `${key}: ${fmtNum(n)} words` } });
    }
    const key = wrap.createDiv('ls-heat-key');
    key.createSpan({ cls: 'ls-muted', text: 'Less' });
    for (let i = 0; i <= 4; i++) key.createDiv(`ls-heat-cell ls-heat-${i}`);
    key.createSpan({ cls: 'ls-muted', text: goal ? 'Goal met' : 'More' });
  }

  renderTagsPanel(body, idx) {
    const counts = this.plugin.allTags(idx);
    const el = this.panel(body, { title: 'Tags', count: counts.size, color: 'purple' });
    if (!counts.size) return this.empty(el, 'Tags you add to entries collect here.');
    const wrap = el.createDiv('ls-tags ls-tag-cloud');
    for (const t of [...counts.keys()].sort(natural)) {
      const tag = wrap.createSpan({ cls: 'ls-tag' });
      tag.createSpan({ text: t });
      tag.createSpan({ cls: 'ls-tag-count', text: String(counts.get(t)) });
      tag.addEventListener('click', () => this.goto('tag:' + t));
    }
  }

  renderTag(body, idx, tag) {
    const p = this.plugin;
    const hits = [];
    for (const [k, files] of Object.entries(idx)) {
      if (!TYPES[k]) continue;
      for (const f of files) if (p.tagsOf(f).includes(tag)) hits.push([f, k]);
    }
    const el = this.panel(body, { title: `#${tag}`, count: hits.length, color: 'purple' });
    if (!hits.length) return this.empty(el, 'Nothing uses this tag anymore.');
    const list = el.createDiv('ls-list');
    for (const [f, k] of hits) {
      const row = list.createDiv(`ls-row ls-c-${TYPES[k].color}`);
      const ic = row.createSpan('ls-row-icon'); setIcon(ic, TYPES[k].icon);
      row.createSpan({ cls: 'ls-row-name', text: f.basename });
      row.createSpan({ cls: 'ls-row-meta', text: TYPES[k].label });
      row.addEventListener('click', () => (k === 'story' ? p.openChapters(f) : p.openEntity(f, k)));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Entity editor                                                       */
/* ------------------------------------------------------------------ */

class EntityView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.file = null;
    this.token = 0;
    this.selfWrite = 0;
    this.savers = [];
    this.collapsed = new Set();
    this.activeDetail = null;
  }
  getViewType() { return VIEW_ENTITY; }
  getDisplayText() { return this.file ? this.file.basename : 'Lore entry'; }
  getIcon() {
    const t = this.file && this.plugin.typeOf(this.file);
    return (t && TYPES[t] && TYPES[t].icon) || 'library';
  }
  getState() { return { file: this.file ? this.file.path : null }; }
  async setState(state, result) {
    if (state && state.file) {
      const f = this.app.vault.getAbstractFileByPath(state.file);
      this.file = f instanceof TFile ? f : null;
    }
    await super.setState(state, result);
    this.render();
  }
  async onOpen() {
    this.contentEl.addClass('ls-host');
    this.registerEvent(this.app.metadataCache.on('changed', (f) => {
      if (this.file && f === this.file && Date.now() > this.selfWrite) this.softRefresh();
    }));
    this.registerEvent(this.app.vault.on('rename', (f) => {
      if (f === this.file && this.nameEl) this.nameEl.setText(f.basename);
    }));
    this.registerEvent(this.app.vault.on('delete', (f) => { if (f === this.file) this.leaf.detach(); }));
    /* Another note that links here (or that this note links to) changed: relationships may have moved. */
    this.registerEvent(this.app.metadataCache.on('changed', (f) => {
      if (!this.file || f === this.file || Date.now() < this.selfWrite) return;
      const t = this.plugin.typeOf(f);
      if (!t || t === 'scene') return;
      const rl = this.app.metadataCache.resolvedLinks;
      if ((rl[f.path] && rl[f.path][this.file.path]) || (rl[this.file.path] && rl[this.file.path][f.path])) this.refreshSoon();
    }));
  }
  async onClose() { await this.flushAll(); window.clearTimeout(this._refreshT); }

  softRefresh() {
    /* Don't pull the page out from under someone typing; a focused card or button is fine. */
    const a = document.activeElement;
    if (a && this.contentEl.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    this.render();
  }

  saver(fn) {
    let timer = null, val = null, pending = false;
    const s = {
      schedule: (v) => {
        val = v; pending = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => s.flush(), 700);
      },
      flush: async () => {
        if (!pending) return;
        pending = false;
        window.clearTimeout(timer);
        await fn(val);
      },
    };
    this.savers.push(s);
    return s;
  }
  async flushAll() { for (const s of this.savers) await s.flush(); }

  async setFm(mutate, rerender) {
    this.selfWrite = Date.now() + 1500;
    await this.app.fileManager.processFrontMatter(this.file, mutate);
    if (rerender) await this.render();
  }
  async editBodyOf(fn) {
    this.selfWrite = Date.now() + 1500;
    await this.app.vault.process(this.file, (d) => {
      const s = splitFm(d);
      return s.fm + editBody(s.body, fn);
    });
  }
  saveSection(name, text) {
    return this.editBodyOf((p) => {
      const s = findSec(p, name);
      if (s) s.lines = text.split('\n');
      else p.sections.push({ name, lines: text.split('\n') });
    });
  }

  swap(root, token) {
    if (token !== this.token) return;
    const old = this.contentEl.querySelector('.ls-entity');
    const scroll = old ? old.scrollTop : 0;
    this.contentEl.empty();
    this.contentEl.appendChild(root);
    root.scrollTop = scroll;
    root.querySelectorAll('textarea.ls-textarea').forEach((t) => {
      t.style.height = 'auto';
      t.style.height = Math.max(t.scrollHeight, 96) + 'px';
    });
  }

  async render() {
    const token = ++this.token;
    await this.flushAll();
    this.savers = [];
    const p = this.plugin;
    const root = document.createElement('div');
    root.addClass('ls-root', 'ls-entity');

    if (!this.file) {
      root.createDiv({ cls: 'ls-empty', text: 'Open an entry from the overview.' });
      return this.swap(root, token);
    }
    const content = await this.app.vault.read(this.file);
    const fm = readFm(content);
    const type = String(fm.lore || fm.type || '').toLowerCase();
    const def = TYPES[type];
    if (!def || def.plain) {
      const e = root.createDiv('ls-empty');
      e.createSpan({ text: 'This note is not a lore entry.' });
      textBtn(e, 'Open as note', () => p.openNote(this.file));
      return this.swap(root, token);
    }
    root.addClass(`ls-c-${type === 'arc' && COLORS.includes(fm.color) ? fm.color : def.color}`);
    const parsed = parseSections(splitFm(content).body);
    this.parsed = parsed;
    this.rawBody = splitFm(content).body;

    // header
    const head = root.createDiv('ls-entity-head');
    iconBtn(head, 'arrow-left', 'Back to overview', () => p.openOverview(type));
    const title = head.createDiv('ls-entity-title');
    this.nameEl = title.createSpan({ cls: 'ls-entity-name', text: this.file.basename });
    title.createSpan({ cls: 'ls-entity-kind', text: def.label });
    if (type === 'character') title.addClass('is-quiet');
    const actions = head.createDiv('ls-entity-actions');
    if (type === 'story') {
      iconBtn(actions, 'list-tree', 'Chapters board', () => p.openChapters(this.file));
      iconBtn(actions, 'list-ordered', 'Outline', () => p.openOutline(this.file));
    }
    if (type !== 'story' && type !== 'relation' && type !== 'arc') {
      iconBtn(actions, 'network', 'Show in relations web', () => p.openWeb(this.file));
    }
    if (type === 'culture') iconBtn(actions, 'dices', 'Name builder', () => new NameBuilderModal(this.app, p, { culture: this.file }).open());
    if (TAXA.includes(type)) iconBtn(actions, 'arrow-right-left', 'Move to Species, Bestiary or Flora', (e) => p.convertMenu(e, this.file, () => this.leaf.detach()));
    iconBtn(actions, 'file-text', 'Open as note', () => p.openNote(this.file));
    iconBtn(actions, 'trash-2', `Delete ${def.label.toLowerCase()}`, () => {
      p.confirmDelete(this.file, def.label.toLowerCase(), () => this.leaf.detach());
    }, 'ls-danger');

    if (type === 'character') this.renderHero(root, fm);
    else if (fm.epithet || fm.quote) {
      const lede = root.createDiv('ls-lede');
      if (fm.epithet) lede.createDiv({ cls: 'ls-epithet', text: String(fm.epithet) });
      if (fm.quote) lede.createEl('blockquote', { cls: 'ls-quote', text: String(fm.quote) });
    }

    const grid = root.createDiv('ls-entity-grid');
    const main = grid.createDiv('ls-entity-main');
    const side = grid.createDiv('ls-side');

    const secGrid = main.createDiv('ls-section-grid');
    for (const name of def.sections) {
      /* Notes from before 0.7.3 call it "Powers & Abilities": keep using their heading. */
      const old = SECTION_OLD_NAMES[name];
      const real = old && !findSec(parsed, name) && findSec(parsed, old) ? old : name;
      const body = this.block(secGrid, real);
      this.editor(body, secText(findSec(parsed, real)), (def.hints && def.hints[name]) || '', (v) => this.saveSection(real, v));
    }
    this.renderDetails(main, fm, parsed);
    if (def.computed && type === 'arc') await this.renderArcComputed(main, fm);
    else if (def.computed) await this.renderComputed(main, fm);
    if (type === 'organization') this.renderPeople(main);
    if (type === 'species') this.renderSpeciesMembers(main);
    if (type === 'creature' || type === 'plant') this.renderNatureFacts(secGrid, fm, type);
    if (type === 'language') this.renderLanguageWords(main);
    if (type !== 'character' && type !== 'story') this.renderConnections(main);
    if (def.notesKeys) this.renderAuthorNotes(main, splitFm(content).body, def.notesKeys);
    if (type !== 'word') {
      const mood = toArr(fm.moodboard);
      const mb = this.block(main, mood.length ? `Moodboard (${mood.length})` : 'Moodboard', '__mood');
      renderMoodboard(mb, p, mood, this.file, (links) => p.setMoodboard(this.file, links));
    }
    this.renderSide(side, fm, def, type);

    this.swap(root, token);
  }

  block(parent, name, key) {
    const wrap = parent.createDiv('ls-block');
    const head = wrap.createDiv('ls-block-head');
    const chev = head.createSpan('ls-chevron');
    setIcon(chev, 'chevron-down');
    head.createSpan({ cls: 'ls-block-title', text: name });
    const body = wrap.createDiv('ls-block-body');
    const k = key || name;
    if (this.collapsed.has(k)) wrap.addClass('is-collapsed');
    head.addEventListener('click', () => {
      const c = !wrap.hasClass('is-collapsed');
      wrap.toggleClass('is-collapsed', c);
      if (c) this.collapsed.add(k); else this.collapsed.delete(k);
    });
    return body;
  }

  editor(parent, text, placeholder, onSave) {
    const wrap = parent.createDiv('ls-editor');
    const bar = wrap.createDiv('ls-toolbar');
    const ta = wrap.createEl('textarea', { cls: 'ls-textarea', attr: { placeholder, rows: '4', spellcheck: 'true' } });
    ta.value = text;
    this.plugin.typing.trackInput(ta, () => this.file);
    const preview = wrap.createDiv('ls-preview markdown-rendered');
    preview.hide();
    const status = wrap.createDiv({ cls: 'ls-save-status' });

    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 96) + 'px'; };
    const saver = this.saver(async (v) => { await onSave(v); status.setText('Saved'); });
    ta.addEventListener('input', () => { fit(); status.setText('Editing'); saver.schedule(ta.value); });
    ta.addEventListener('blur', () => saver.flush());

    const tools = [
      ['bold', 'Bold', () => wrapSel(ta, '**', '**')],
      ['italic', 'Italic', () => wrapSel(ta, '*', '*')],
      ['strikethrough', 'Strikethrough', () => wrapSel(ta, '~~', '~~')],
      ['list', 'Bulleted list', () => prefixLines(ta, '- ')],
      ['heading', 'Subheading', () => prefixLines(ta, '### ')],
      ['link', 'Link to a note', () => wrapSel(ta, '[[', ']]')],
    ];
    for (const [icon, label, fn] of tools) {
      iconBtn(bar, icon, label, () => { fn(); ta.dispatchEvent(new Event('input')); ta.focus(); }, 'ls-tool');
    }
    bar.createDiv('ls-toolbar-spacer');
    iconBtn(bar, 'eye', 'Toggle preview', async () => {
      const on = !wrap.hasClass('is-preview');
      wrap.toggleClass('is-preview', on);
      if (on) {
        await saver.flush();
        preview.empty();
        preview.show();
        ta.hide();
        await MarkdownRenderer.render(this.app, ta.value || '*Nothing written yet.*', preview, this.file.path, this);
      } else {
        preview.hide();
        ta.show();
        fit();
      }
    });
    preview.addEventListener('click', (e) => {
      const a = e.target.closest('a.internal-link');
      if (!a) return;
      e.preventDefault();
      this.app.workspace.openLinkText(a.getAttribute('data-href') || a.getAttribute('href'), this.file.path, true);
    });
    return ta;
  }

  renderDetails(main, fm, parsed) {
    const body = this.block(main, 'Details', '__details');
    const list = toArr(fm.details);
    if (!list.includes(this.activeDetail)) this.activeDetail = list[0] || null;

    const row = body.createDiv('ls-details');
    const tabs = row.createDiv('ls-detail-tabs');
    const pane = row.createDiv('ls-detail-pane');

    const writeList = (next) => this.setFm((f) => { if (next.length) f.details = next; else delete f.details; }, true);

    list.forEach((name, i) => {
      const t = tabs.createDiv({ cls: 'ls-detail-tab' + (name === this.activeDetail ? ' is-active' : '') });
      t.createSpan({ text: name });
      const menu = (e) => {
        const m = new Menu();
        addMenuItem(m, 'Rename', 'pencil', () => new NameModal(this.app,
          { title: 'Rename section', placeholder: 'Section name', initial: name, cta: 'Rename' },
          async (n) => {
            n = n.trim();
            if (!n || n === name) return;
            if (list.some((x) => x.toLowerCase() === n.toLowerCase())) { new Notice(`"${n}" already exists.`); return; }
            await this.editBodyOf((p) => { const s = findSec(p, name); if (s) s.name = n; });
            if (this.activeDetail === name) this.activeDetail = n;
            await writeList(list.map((x) => (x === name ? n : x)));
          }).open());
        if (i > 0) addMenuItem(m, 'Move up', 'arrow-up', () => {
          const n = list.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; writeList(n);
        });
        if (i < list.length - 1) addMenuItem(m, 'Move down', 'arrow-down', () => {
          const n = list.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; writeList(n);
        });
        m.addSeparator();
        addMenuItem(m, 'Delete section', 'trash-2', () => new ConfirmModal(this.app, {
          title: `Delete "${name}"?`, message: 'The section and everything written in it will be removed from this note.', cta: 'Delete section',
        }, async () => {
          await this.editBodyOf((p) => { p.sections = p.sections.filter((s) => s.name.toLowerCase() !== name.toLowerCase()); });
          await writeList(list.filter((x) => x !== name));
        }).open(), true);
        m.showAtMouseEvent(e);
      };
      iconBtn(t, 'more-vertical', `${name} options`, menu);
      t.addEventListener('click', () => { this.activeDetail = name; this.render(); });
      t.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(e); });
    });

    const add = tabs.createDiv('ls-detail-add');
    setIcon(add.createSpan(), 'plus');
    add.createSpan({ text: 'Add section' });
    add.addEventListener('click', () => new NameModal(this.app,
      { title: 'New detail section', placeholder: 'e.g. Combat style', cta: 'Add section' },
      async (n) => {
        n = n.trim().replace(/^#+\s*/, '');
        if (!n) return;
        if (list.some((x) => x.toLowerCase() === n.toLowerCase())) { new Notice(`"${n}" already exists.`); return; }
        await this.editBodyOf((p) => { if (!findSec(p, n)) p.sections.push({ name: n, lines: [''] }); });
        this.activeDetail = n;
        await writeList([...list, n]);
      }).open());

    if (this.activeDetail) {
      const name = this.activeDetail;
      this.editor(pane, secText(findSec(parsed, name)), DETAIL_HINTS[name] || `Write about ${name.toLowerCase()}.`, (v) => this.saveSection(name, v));
    } else {
      pane.createDiv({ cls: 'ls-muted', text: 'Add a section for anything that does not fit above.' });
    }
  }

  /* Portrait, name and the facts you reach for most, above everything else on a character sheet. */
  renderHero(root, fm) {
    const p = this.plugin;
    const me = this.file;
    const hero = root.createDiv('ls-hero');
    const dead = p.isDead(me);
    if (dead) hero.addClass('is-dead');

    const pic = hero.createDiv({ cls: 'ls-hero-portrait', attr: { role: 'button', tabindex: '0' } });
    const img = p.resolveLink(fm.image, me);
    if (img) pic.createEl('img', { attr: { src: this.app.vault.getResourcePath(img), alt: '' } });
    else {
      pic.createDiv({ cls: 'ls-hero-initials', text: initials(me.basename) });
      setIcon(pic.createDiv('ls-hero-add'), 'image-plus');
    }
    pic.setAttr('aria-label', img ? 'Change or remove portrait' : 'Add a portrait');
    const choose = () => new ImageSuggest(this.app, (f) => this.setFm((x) => { x.image = p.linkTo(f, me); }, true)).open();
    const picMenu = (e) => {
      if (!img) { choose(); return; }
      const m = new Menu();
      addMenuItem(m, 'Change portrait', 'image', choose);
      addMenuItem(m, 'Remove portrait', 'x', () => this.setFm((x) => { delete x.image; }, true), true);
      m.showAtMouseEvent(e);
    };
    pic.addEventListener('click', picMenu);
    pic.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });

    const txt = hero.createDiv('ls-hero-text');
    this.nameEl = txt.createEl('h1', { cls: 'ls-hero-name', text: me.basename });
    const sub = [];
    if (fm.full_name && String(fm.full_name).trim() !== me.basename) sub.push(String(fm.full_name));
    const nee = p.birthNameText(me);
    if (nee) sub.push(nee);
    const titles = toArr(fm.titles);
    if (titles.length) sub.push(titles.join(', '));
    if (sub.length) txt.createDiv({ cls: 'ls-hero-sub', text: sub.join(' · ') });
    if (fm.epithet) txt.createDiv({ cls: 'ls-epithet', text: String(fm.epithet) });

    const facts = txt.createDiv('ls-hero-facts');
    const fact = (icon, text, cls, onClick) => {
      const f = iconText(facts, icon, text, 'ls-fact' + (cls ? ' ' + cls : ''));
      if (onClick) { f.addClass('is-link'); f.addEventListener('click', onClick); }
      return f;
    };
    const cat = String(fm.category || 'major');
    fact(cat === 'main' ? 'star' : cat === 'minor' ? 'circle' : 'circle-dot', `${cap(cat)} character`, `ls-fact-cat is-${cat}`);
    if (dead) fact('skull', fm.status && !/^alive$/i.test(String(fm.status)) ? String(fm.status) : 'Deceased', 'is-dead');
    else if (fm.status) fact('heart-pulse', String(fm.status), 'is-alive');
    const age = p.ageText(fm, p.latestPresent());
    if (age) fact('cake', age);
    if (fm.pronouns) fact('user', String(fm.pronouns));
    for (const s of toArr(fm.species)) {
      const d = p.resolveLink(s, me);
      fact('dna', d ? p.speciesLine(d) : linkText(s), '', d ? () => p.openEntity(d) : null);
    }
    const anc = p.ancestrySummary(me);
    if (anc.fromParents && anc.mismatch) {
      fact('alert-triangle', `Parents: ${anc.text}`, 'is-mismatch').setAttr('aria-label',
        "Their Species doesn't match their parents'. Fine if they were turned, cursed or changed; otherwise check Species.");
    } else if (anc.fromParents && anc.mixed) {
      fact('git-merge', `Ancestry: ${anc.text}`).setAttr('aria-label', 'Worked out from their parents\' species');
    }
    if (fm.heritage) fact('scroll-text', String(fm.heritage));
    if (fm.role) fact('flag', cap(String(fm.role)));
    if (fm.occupation) fact('briefcase', String(fm.occupation));
    const es = p.roleEntriesOf(me);
    const act = es.filter((e) => e.status === 'active');
    for (const e of act.slice(0, 3)) fact('id-card', `${e.title || 'Member'}, ${e.org.basename}`, '', () => p.openEntity(e.org, 'organization'));
    if (!act.length) {
      const last = es.filter((e) => e.status === 'former').pop();
      if (last) fact('history', `${p.roleText(last)}, ${last.org.basename}`, 'is-former', () => p.openEntity(last.org, 'organization'));
    }
    for (const s of toArr(fm.residence).slice(0, 2)) {
      const d = p.resolveLink(s, me);
      fact('home', d ? d.basename : linkText(s), '', d ? () => p.openEntity(d) : null);
    }

    /* "5'9\", wiry, black hair, grey eyes" without opening the sidebar. */
    const looks = [];
    const say = (v, suffix) => { v = String(v || '').trim(); if (v) looks.push(suffix && !new RegExp(suffix + '$', 'i').test(v) ? `${v} ${suffix}` : v); };
    say(fm.apparent_age && `looks ${String(fm.apparent_age).replace(/^looks\s+/i, '')}`);
    say(fm.height); say(fm.build); say(fm.hair_color, 'hair'); say(fm.eye_color, 'eyes'); say(fm.skin, 'skin');
    if (looks.length) {
      const l = txt.createDiv('ls-hero-looks');
      setIcon(l.createSpan('ls-hero-looks-icon'), 'scan-face');
      const tidy = looks.map((x, i) => (i ? x.charAt(0).toLowerCase() : x.charAt(0).toUpperCase()) + x.slice(1).replace(/^(ooks )(.)/, (m, a, c) => a + c.toLowerCase()));
      l.createSpan({ text: tidy.join(', ') });
    }

    const traits = toArr(fm.traits), flaws = toArr(fm.flaws);
    if (traits.length || flaws.length) {
      const tr = txt.createDiv('ls-hero-traits');
      for (const t of traits) tr.createSpan({ cls: 'ls-trait', text: t });
      for (const t of flaws) tr.createSpan({ cls: 'ls-trait is-flaw', text: t, attr: { 'aria-label': 'Flaw' } });
    }
    if (fm.quote) txt.createEl('blockquote', { cls: 'ls-quote', text: String(fm.quote) });
  }

  async renderComputed(main, fm) {
    const p = this.plugin;
    const me = this.file;
    const idx = p.index();
    const hits = await p.appearancesOf(me);
    const explicit = hits.filter((h) => h.explicit);
    this.firstSeen = explicit[0] || hits[0] || null;

    // At a glance
    const gl = this.block(main, 'At a glance', '__glance');
    if (!hits.length) {
      gl.createDiv({ cls: 'ls-muted', text: 'Add this character to a scene\'s cast (the people icon on the chapters board) and their scene count, first appearance and closest companions show up here.' });
    } else {
      const stats = gl.createDiv('ls-glance');
      const stat = (n, label, sub) => {
        const s = stats.createDiv('ls-glance-stat');
        s.createDiv({ cls: 'ls-glance-num', text: String(n) });
        s.createDiv({ cls: 'ls-glance-label', text: label });
        if (sub) s.createDiv({ cls: 'ls-glance-sub', text: sub });
        return s;
      };
      const mentions = hits.length - explicit.length;
      stat(explicit.length, explicit.length === 1 ? 'Scene' : 'Scenes', mentions ? `+${mentions} mention${mentions === 1 ? '' : 's'}` : '');
      const chapters = new Set(hits.map((h) => `${h.story.path}|${h.chapter}`));
      const stories = new Set(hits.map((h) => h.story));
      stat(chapters.size, chapters.size === 1 ? 'Chapter' : 'Chapters', stories.size > 1 ? `in ${stories.size} stories` : hits[0].story.basename);
      const where = (h, label) => {
        const s = stats.createDiv('ls-glance-stat is-link');
        s.createDiv({ cls: 'ls-glance-label', text: label });
        s.createDiv({ cls: 'ls-glance-scene', text: h.scene.basename });
        s.createDiv({ cls: 'ls-glance-sub', text: h.chapter });
        s.addEventListener('click', () => p.openNote(h.scene));
      };
      where(this.firstSeen, 'First appears');
      const last = explicit[explicit.length - 1];
      if (last && last !== this.firstSeen) where(last, 'Last seen');

      const together = new Map();
      for (const h of explicit) {
        for (const s of toArr(p.fm(h.scene).characters)) {
          const c = p.resolveLink(s, h.scene);
          if (c && c !== me && p.typeOf(c) === 'character') together.set(c, (together.get(c) || 0) + 1);
        }
      }
      const top = [...together.entries()].sort((a, b) => (b[1] - a[1]) || natural(a[0].basename, b[0].basename)).slice(0, 6);
      if (top.length) {
        const ow = gl.createDiv('ls-often');
        ow.createDiv({ cls: 'ls-glance-label', text: 'Most often with' });
        const row = ow.createDiv('ls-often-row');
        for (const [c, n] of top) {
          const it = row.createDiv({ cls: 'ls-often-item', attr: { 'aria-label': `${c.basename}: ${n} scene${n === 1 ? '' : 's'} together` } });
          avatarEl(it, p, c);
          const t = it.createDiv('ls-often-text');
          t.createDiv({ cls: 'ls-often-name', text: c.basename });
          const rel = p.relationBetween(me, c);
          t.createDiv({ cls: 'ls-often-meta', text: [rel && rel.label, `${n} scene${n === 1 ? '' : 's'}`].filter(Boolean).join(' · ') });
          it.addEventListener('click', () => p.openEntity(c, 'character'));
        }
      }
    }

    // Where they appear: every scene of the book, filled in where they're present, so long absences stand out
    if (hits.length) {
      const stories = [...new Set(hits.map((h) => h.story))];
      const state = new Map(hits.map((h) => [h.scene, h.explicit ? 'in' : 'mention']));
      const pb = gl.createDiv('ls-presence');
      for (const story of stories) {
        const data = await p.storyData(story);
        pb.createDiv({ cls: 'ls-glance-label', text: stories.length > 1 ? story.basename : 'Where they appear' });
        const strip = pb.createDiv({ cls: 'ls-presence-strip', attr: { 'aria-label': `Scenes in ${story.basename}` } });
        const chIn = [];
        for (const ch of data.chapters) {
          const g = strip.createDiv({ cls: 'ls-presence-ch', attr: { 'aria-label': ch.name } });
          let any = false;
          for (const sc of ch.scenes) {
            const st = state.get(sc.file);
            if (st === 'in') any = true;
            const cell = g.createDiv({
              cls: 'ls-presence-cell' + (st ? ` is-${st}` : ''),
              attr: { 'aria-label': `${ch.name}, ${sc.file.basename}${st === 'mention' ? ' (mentioned)' : st ? '' : ' (not in it)'}` },
            });
            const file = sc.file;
            cell.addEventListener('click', () => p.openNote(file));
          }
          if (!ch.scenes.length) g.createDiv('ls-presence-cell is-none');
          chIn.push(any);
        }
        const first = chIn.indexOf(true), last = chIn.lastIndexOf(true);
        let best = null, run = null;
        for (let i = first; first >= 0 && i <= last; i++) {
          if (!chIn[i]) { if (run == null) run = i; }
          else if (run != null) { if (!best || i - run > best[1] - best[0]) best = [run, i]; run = null; }
        }
        if (best && best[1] - best[0] >= 3) {
          pb.createDiv({ cls: 'ls-hint ls-presence-gap', text: `Off the page for ${best[1] - best[0]} chapters, from ${data.chapters[best[0]].name} to ${data.chapters[best[1] - 1].name}.` });
        }
      }
    }

    this.renderProfileCheck(gl, fm, hits);

    this.renderRelationships(main);
    this.renderFamilyTree(main);
    this.renderPositions(main);
    this.renderConnections(main);

    // Timeline: events this character is part of, plus their own birth and death
    const evBody = this.block(main, 'Timeline', '__events');
    const evs = p.timeline(idx, { births: true }).filter((e) => p.involves(e, me));
    if (!evs.length) {
      evBody.createDiv({ cls: 'ls-muted', text: 'Give them a birth year, or add them to an event, and their history lines up here.' });
    } else {
      this.timelineList(evBody, evs);
    }

    // Appearances: scenes that list this character, then scenes that only link to them
    const apBody = this.block(main, hits.length ? `Appearances (${explicit.length})` : 'Appearances', '__app');
    if (!hits.length) {
      apBody.createDiv({ cls: 'ls-muted', text: 'Add this character to scenes from the chapters board, or link them in a scene\'s text.' });
      return;
    }
    let curStory = null, list = null, first = false;
    for (const h of hits) {
      if (h.story !== curStory) {
        curStory = h.story;
        const story = h.story;
        const sh = apBody.createDiv({ cls: 'ls-app-story', text: story.basename });
        sh.addEventListener('click', () => p.openChapters(story));
        list = apBody.createDiv('ls-list');
        first = true;
      }
      const row = list.createDiv('ls-row');
      row.createSpan({ cls: 'ls-row-meta ls-app-chapter', text: h.chapter });
      row.createSpan({ cls: 'ls-row-name', text: h.scene.basename });
      if (first) row.createSpan({ cls: 'ls-pill', text: 'First' });
      if (!h.explicit) row.createSpan({ cls: 'ls-pill is-faint', text: 'Mentioned' });
      const age = p.ageShort(fm, p.presentOf(h.scene));
      if (age) row.createSpan({ cls: 'ls-pill ls-age-pill' + (age.warn ? ' is-warn' : ''), text: age.text });
      const scene = h.scene;
      row.addEventListener('click', () => p.openNote(scene));
      first = false;
    }
  }

  /* What's still blank on the sheet, with a click to jump straight to it. */
  renderProfileCheck(parent, fm, hits) {
    const p = this.plugin;
    const body = this.rawBody || '';
    const parsed = this.parsed || { sections: [] };
    const has = (k) => toArr(fm[k]).length > 0;
    const sec = (n) => !!secText(findSec(parsed, n)).trim();
    const note = (k) => { const m = body.match(noteRe(k)); return !!(m && m[2].trim()); };
    const checks = [
      { label: 'Portrait', done: has('image'), go: () => new ImageSuggest(this.app, (f) => this.setFm((x) => { x.image = p.linkTo(f, this.file); }, true)).open() },
      { label: 'Birth date', done: has('born'), key: 'born' },
      ...(p.index().species.length ? [{ label: 'Species', done: has('species'), key: 'species' }] : []),
      { label: 'Pronouns or gender', done: has('pronouns') || has('gender'), key: 'pronouns' },
      { label: 'Occupation or role', done: has('occupation') || has('role'), key: 'occupation' },
      { label: 'Traits', done: has('traits'), key: 'traits' },
      { label: 'Flaws', done: has('flaws'), key: 'flaws' },
      { label: 'Biography', done: sec('Biography'), section: 'Biography' },
      { label: 'Personality', done: sec('Personality'), section: 'Personality' },
      { label: 'Physical description', done: sec('Physical Description'), section: 'Physical Description' },
      { label: 'Want', done: note('Want'), section: "Author's notes" },
      { label: 'Need', done: note('Need'), section: "Author's notes" },
      { label: 'Wound', done: note('Wound'), section: "Author's notes" },
      { label: 'A relationship', done: p.relationsOf(this.file).length > 0, go: (e) => this.relMenu(e) },
      { label: 'A scene', done: hits.some((h) => h.explicit) },
    ];
    const done = checks.filter((c) => c.done).length;
    const box = parent.createDiv('ls-profile');
    const head = box.createDiv('ls-profile-head');
    head.createSpan({ cls: 'ls-glance-label', text: done === checks.length ? 'Profile complete' : `Profile ${done} of ${checks.length}` });
    const meter = head.createDiv({ cls: 'ls-profile-meter', attr: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(checks.length), 'aria-valuenow': String(done) } });
    meter.createDiv('ls-profile-fill').style.width = `${(done / checks.length) * 100}%`;
    const missing = checks.filter((c) => !c.done);
    if (!missing.length) return;
    const chips = box.createDiv('ls-chips ls-profile-missing');
    for (const c of missing) {
      const act = c.go || c.key || c.section;
      const chip = chips.createEl(act ? 'button' : 'span', { cls: 'ls-chip-add ls-profile-todo', text: c.label });
      if (!act) continue;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (c.go) return c.go(e);
        if (c.key) return this.jumpToField(c.key);
        this.jumpToBlock(c.section);
      });
    }
  }

  /* Opens the sidebar group holding a field, then scrolls to it and puts the cursor in it. */
  async jumpToField(key) {
    const p = this.plugin;
    const type = p.typeOf(this.file);
    const fd = TYPES[type].fields.find((f) => f.key === key);
    if (fd && fd.group) {
      const closed = toArr(p.settings.sheetGroups[type]);
      if (closed.includes(fd.group)) { p.settings.sheetGroups[type] = closed.filter((g) => g !== fd.group); p.saveSoon(); await this.render(); }
    }
    const el = this.contentEl.querySelector(`[data-ls-key="${key}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const target = el.matches('input, textarea, select') ? el : el.querySelector('button, input');
    if (target) target.focus();
  }
  jumpToBlock(name) {
    const title = [...this.contentEl.querySelectorAll('.ls-block-title')].find((t) => t.textContent === name);
    const block = title && title.closest('.ls-block');
    if (!block) return;
    if (block.hasClass('is-collapsed')) title.parentElement.click();
    block.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const ta = block.querySelector('textarea');
    if (ta) ta.focus();
  }

  /* Everyone this character is tied to, found from both notes and through the family. */
  renderRelationships(main) {
    const p = this.plugin;
    const me = this.file;
    const rels = p.relationsOf(me);
    const body = this.block(main, rels.length ? `Relationships (${new Set(rels.map((r) => r.file)).size})` : 'Relationships', '__rel');
    const bar = body.createDiv('ls-rel-bar');
    const addBtn = textBtn(bar, 'Add relationship', (e) => this.relMenu(e), 'ls-chip-add');
    setIcon(addBtn.createSpan({ cls: 'ls-btn-icon' }), 'plus');
    addBtn.prepend(addBtn.lastChild);
    if (rels.some((r) => r.auto)) {
      const k = bar.createDiv('ls-rel-key');
      setIcon(k.createSpan('ls-rel-auto-icon'), 'sparkles');
      k.createSpan({ text: 'Found from other notes' });
    }
    if (!rels.length) {
      body.createDiv({ cls: 'ls-muted', text: 'Add a parent, sibling, friend or rival. Brothers, cousins, in-laws and step-family are worked out on their own, and both characters\' pages stay in step.' });
      return;
    }
    const order = Object.keys(REL);
    for (const group of REL_GROUPS) {
      const items = rels.filter((r) => (r.group || REL[r.kind].group) === group)
        .sort((a, b) => (order.indexOf(a.kind) - order.indexOf(b.kind)) || natural(a.file.basename, b.file.basename));
      if (!items.length) continue;
      body.createDiv({ cls: 'ls-rel-group', text: group === 'Past' ? 'Past ties' : group });
      const grid = body.createDiv('ls-rel-cards');
      for (const r of items) this.relCard(grid, r);
    }
  }

  relCard(grid, r) {
    const p = this.plugin;
    const me = this.file;
    const card = grid.createDiv({ cls: `ls-rel-card ls-rk-${r.kind}` + (r.auto ? ' is-auto' : '') + (r.former ? ' is-former' : '') + (r.future ? ' is-future' : ''), attr: { tabindex: '0' } });
    avatarEl(card, p, r.file);
    const t = card.createDiv('ls-rel-text');
    t.createDiv({ cls: 'ls-rel-name', text: r.file.basename });
    const nee = p.birthNameText(r.file);
    if (nee) t.createDiv({ cls: 'ls-rel-nee', text: nee });
    const lab = t.createDiv('ls-rel-label');
    iconText(lab, r.former ? 'history' : REL[r.kind].icon, [r.label, r.note].filter(Boolean).join(', '));
    if (r.years || r.future) lab.createSpan({ cls: 'ls-rel-years', text: [r.future && 'not yet', r.years].filter(Boolean).join(', ') });
    if (r.history && r.history.length) t.createDiv({ cls: 'ls-rel-history', text: `Before: ${r.history.join('; ')}` });
    if (r.auto) {
      const a = card.createSpan({ cls: 'ls-rel-auto', attr: { 'aria-label': r.via || 'Found from other notes' } });
      setIcon(a, 'sparkles');
      if (r.via) t.createDiv({ cls: 'ls-rel-via', text: r.via });
    }
    iconBtn(card, 'history', `How ${me.basename} and ${r.file.basename} changed over time`, () => this.editTie(r.file), 'ls-card-edit');
    const open = () => p.openEntity(r.file, 'character');
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const m = new Menu();
      addMenuItem(m, 'Open', 'arrow-up-right', open);
      addMenuItem(m, 'Edit history over time', 'history', () => this.editTie(r.file));
      addMenuItem(m, 'Show in relations web', 'network', () => p.openWeb(r.file));
      if (r.relFile) addMenuItem(m, 'Open relation entry', 'git-fork', () => p.openEntity(r.relFile, 'relation'));
      const spec = KIND_FIELDS[r.kind];
      const direct = spec && !r.fromTies && (!r.auto || /^Listed on/.test(r.via));
      if (direct && r.auto && !p.settings.mirrorLinks) {
        let field = spec[0][0];
        if (r.kind === 'parent') { const gnd = p.genderOf(r.file); field = gnd === 1 ? 'father' : 'mother'; }
        addMenuItem(m, 'Write it on this page too', 'pen-line', async () => { await p.addLink(me, field, r.file); this.refreshSoon(); });
      }
      if (direct) {
        m.addSeparator();
        addMenuItem(m, `Remove ${r.label.toLowerCase()}`, 'trash-2', () => new ConfirmModal(this.app, {
          title: `Remove ${r.file.basename} as ${r.label.toLowerCase()}?`,
          message: `The link is removed from both ${me.basename}'s and ${r.file.basename}'s notes. Neither note is deleted.`,
          cta: 'Remove',
        }, async () => { this.selfWrite = Date.now() + 1500; await p.removeTie(me, r.file, r.kind); this.refreshSoon(); }).open(), true);
      }
      m.showAtMouseEvent(e);
    });
  }

  relMenu(e) {
    const p = this.plugin;
    const m = new Menu();
    addMenuItem(m, 'A tie that changed over time...', 'history', () => new EntitySuggest(this.app, p, ['character'], (f) => this.editTie(f), this.file).open());
    m.addSeparator();
    for (const it of ADD_REL) {
      if (!it) { m.addSeparator(); continue; }
      const [label, field, icon] = it;
      addMenuItem(m, label, icon, () => new EntitySuggest(this.app, p, ['character'], async (f) => {
        this.selfWrite = Date.now() + 1500;
        await p.addLink(this.file, field, f);
        this.refreshSoon();
      }, this.file).open());
    }
    m.showAtMouseEvent(e);
  }

  /* Three to five generations around this character, with half and step family marked. */
  renderFamilyTree(main) {
    const p = this.plugin;
    const me = this.file;
    const rels = p.relationsOf(me);
    const of = (...kinds) => rels.filter((r) => kinds.includes(r.kind));
    const body = this.block(main, 'Family tree', '__tree');
    const tiers = [
      ['Grandparents', of('grandparent')],
      ['Parents', of('parent', 'stepparent')],
      ['self'],
      ['Children', of('child', 'stepchild')],
      ['Grandchildren', of('grandchild')],
    ];
    const sibs = of('sibling', 'halfsibling', 'stepsibling');
    const mates = of('spouse', 'partner');
    if (!tiers.some((t) => t[1] && t[1].length) && !sibs.length && !mates.length) {
      body.createDiv({ cls: 'ls-muted', text: 'Set a mother, father, sibling or spouse with "Add relationship". Siblings, half-siblings, grandparents and children fill in on their own.' });
      return;
    }
    const tree = body.createDiv('ls-ftree');
    const node = (parent, r, cls) => {
      const f = r ? r.file : me;
      const n = parent.createDiv({ cls: 'ls-fnode' + (cls ? ' ' + cls : '') + (r ? '' : ' is-self') });
      avatarEl(n, p, f);
      const t = n.createDiv('ls-fnode-text');
      t.createDiv({ cls: 'ls-fnode-name', text: f.basename });
      if (r) t.createDiv({ cls: 'ls-fnode-rel', text: r.label });
      const nee = p.birthNameText(f);
      if (nee) t.createDiv({ cls: 'ls-fnode-nee', text: nee });
      const born = p.toPt(p.fm(f).born);
      if (born) t.createDiv({ cls: 'ls-fnode-dates', text: [p.fmtYear(born.y), p.toPt(p.fm(f).died) ? p.fmtYear(p.toPt(p.fm(f).died).y) : ''].filter(Boolean).join('–') });
      if (r) {
        n.setAttr('tabindex', '0');
        n.addEventListener('click', () => p.openEntity(f, 'character'));
        n.addEventListener('keydown', (e) => { if (e.key === 'Enter') p.openEntity(f, 'character'); });
      }
      return n;
    };
    for (const [label, list] of tiers) {
      if (label === 'self') {
        const tier = tree.createDiv('ls-ftier is-self-tier');
        const row = tier.createDiv('ls-ftier-nodes');
        const couple = row.createDiv('ls-fcouple');
        node(couple, null);
        for (const r of mates) node(couple, r, r.former ? 'is-ex' : r.kind === 'spouse' ? 'is-spouse' : 'is-partner');
        for (const r of sibs) node(row, r, r.kind === 'sibling' ? 'is-sib' : r.kind === 'halfsibling' ? 'is-half' : 'is-step');
        continue;
      }
      if (!list.length) continue;
      const tier = tree.createDiv('ls-ftier');
      tier.createDiv({ cls: 'ls-ftier-label', text: label });
      const row = tier.createDiv('ls-ftier-nodes');
      for (const r of list) node(row, r, /^step/.test(r.kind) ? 'is-step' : '');
    }
    const legend = body.createDiv('ls-flegend');
    for (const [cls, text] of [['is-spouse', 'Married'], ['is-partner', 'Partner'], ['is-ex', 'Former'], ['is-half', 'Half'], ['is-step', 'Step']]) {
      const it = legend.createSpan('ls-flegend-item');
      it.createSpan(`ls-flegend-swatch ${cls}`);
      it.createSpan({ text });
    }
  }

  /* Everyone in an organization: current people grouped by role or by subdivision (house, department),
     then former members, with every title they've held acknowledged. */
  renderPeople(main) {
    const p = this.plugin;
    const me = this.file;
    const people = p.peopleOf(me);
    const subs = p.subdivisionsOf(me);
    const word = p.subdivisionWord(me);
    const view = p.settings.peopleView[me.path] || {};
    const by = subs.length && view.by === 'sub' ? 'sub' : 'role';
    const showFormer = view.former !== false;
    const setView = (k, v) => { p.settings.peopleView[me.path] = Object.assign({}, view, { [k]: v }); p.saveSoon(); this.render(); };
    const current = people.filter((r) => r.status !== 'former');
    const former = people.filter((r) => r.status === 'former');
    const body = this.block(main, people.length ? `People (${current.length}${former.length ? `, ${former.length} former` : ''})` : 'People', '__people');

    const bar = body.createDiv('ls-rel-bar');
    const add = textBtn(bar, 'Add person', () => new EntitySuggest(this.app, p, ['character'], async (c) => {
      this.selfWrite = Date.now() + 1500;
      await p.addLink(me, 'members', c);
      this.editRole(c, me, true);
    }, me).open(), 'ls-chip-add');
    setIcon(add.createSpan({ cls: 'ls-btn-icon' }), 'plus');
    add.prepend(add.lastChild);
    if (subs.length) {
      const seg = bar.createDiv('ls-seg ls-seg-text');
      for (const [k, l] of [['role', 'By role'], ['sub', `By ${word}`]]) {
        const b = textBtn(seg, l, () => setView('by', k), by === k ? 'is-active' : '');
        b.setAttr('aria-pressed', String(by === k));
      }
    }
    if (former.length) {
      const t = textBtn(bar, `Show former (${former.length})`, () => setView('former', !showFormer), 'ls-toggle' + (showFormer ? ' is-active' : ''));
      t.setAttr('aria-pressed', String(showFormer));
    }
    if (!people.length) {
      body.createDiv({ cls: 'ls-muted', text: subs.length
        ? `Add people here, or to its ${word === 'subgroup' ? 'subgroups' : word + 's'} (${subs.map((s) => s.basename).join(', ')}). Give each a role, like "Professor, Potions" or "Student, 5th year".`
        : 'Add members, staff, students or crew. Give each a role, like "Teacher" or "Student, Class of \'24", and they group by it here.' });
      return;
    }

    const subsOf = (r, all) => [...new Set(r.subs.filter((s) => all || s.status !== 'former').map((s) => s.org))];
    const grouped = (list, isFormer) => {
      const groups = new Map();
      const put = (k, r) => { if (!groups.has(k)) groups.set(k, []); if (!groups.get(k).includes(r)) groups.get(k).push(r); };
      for (const r of list) {
        if (by === 'sub') {
          const ss = subsOf(r, isFormer);
          if (!ss.length) put(`Not in a ${word}`, r);
          for (const s of ss) put(s.basename, r);
        } else put(r.head, r);
      }
      const order = by === 'sub' ? subs.map((s) => s.basename) : [];
      return [...groups.entries()].sort(([a, la], [b, lb]) => {
        if (by === 'sub') return (order.indexOf(a) < 0) - (order.indexOf(b) < 0) || order.indexOf(a) - order.indexOf(b);
        return (b === 'Leader') - (a === 'Leader') || (a === 'Member') - (b === 'Member') || (lb.length - la.length) || natural(a, b);
      });
    };
    const card = (grid, r, isFormer) => {
      const c = grid.createDiv({ cls: 'ls-rel-card ls-person-card' + (isFormer ? ' is-former' : '') + (r.status === 'future' ? ' is-future' : ''), attr: { tabindex: '0' } });
      avatarEl(c, p, r.file);
      const t = c.createDiv('ls-rel-text');
      t.createDiv({ cls: 'ls-rel-name', text: r.file.basename });
      const e = r.entry;
      const parts = [];
      if (isFormer) parts.push(e ? p.roleText(e) : r.founder && !r.direct ? 'Founder' : 'Former member');
      else if (by === 'sub') parts.push(e && e.title ? e.title : r.head);
      else if (e && e.title && e.title.includes(',')) parts.push(e.title.slice(e.title.indexOf(',') + 1).trim());
      if (r.status === 'future') parts.push('not yet');
      if (by === 'role') { const ss = subsOf(r, isFormer); if (ss.length) parts.push(ss.map((s) => s.basename).join(', ')); }
      if (e && p.roleYears(e)) parts.push(p.roleYears(e));
      if (parts.length) t.createDiv({ cls: 'ls-rel-label', text: parts.join(' · ') });
      /* Titles they held before, still acknowledged: "Formerly Student (1971–1978)". */
      const past = r.entries.filter((x) => x !== e && x.status === 'former');
      if (past.length) t.createDiv({ cls: 'ls-rel-via', text: `Formerly ${past.map((x) => [x.title || 'member', p.roleYears(x) && `(${p.roleYears(x)})`].filter(Boolean).join(' ')).join('; ')}` });
      iconBtn(c, 'pencil', 'Edit roles', () => this.editRole(r.file, me), 'ls-card-edit');
      const open = () => p.openEntity(r.file, 'character');
      c.addEventListener('click', open);
      c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
    };
    const section = (list, isFormer) => {
      for (const [k, items] of grouped(list, isFormer)) {
        body.createDiv({ cls: 'ls-rel-group', text: `${k} (${items.length})` });
        const grid = body.createDiv('ls-rel-cards');
        for (const r of items.sort((a, b) => natural(a.file.basename, b.file.basename))) card(grid, r, isFormer);
      }
    };
    if (current.length) section(current, false);
    else body.createDiv({ cls: 'ls-muted', text: 'Nobody is active here right now.' });
    if (former.length && showFormer) {
      const h = body.createDiv('ls-people-former-head');
      setIcon(h.createSpan('ls-people-former-icon'), 'history');
      h.createSpan({ text: `Former members (${former.length})` });
      section(former, true);
    }
  }

  /* The facts you reach for about a creature or plant, above its writing: what it is, how dangerous, where it lives. */
  renderNatureFacts(before, fm, type) {
    const p = this.plugin;
    const me = this.file;
    const box = createDiv('ls-hero-facts ls-nature-facts');
    before.parentElement.insertBefore(box, before);
    const fact = (icon, text, cls, onClick) => {
      const f = iconText(box, icon, text, 'ls-fact' + (cls ? ' ' + cls : ''));
      if (onClick) { f.addClass('is-link'); f.addEventListener('click', onClick); }
      return f;
    };
    const cls = p.classOf(me);
    if (cls.path.length) fact('layers', cls.path.join(' › ') + (cls.from ? ` (from ${cls.from.basename})` : ''), '', cls.from ? () => p.openEntity(cls.from, type) : null);
    const par = p.taxonParent(me);
    if (par) fact('corner-left-up', `Variant of ${par.basename}`, '', () => p.openEntity(par, type));
    const say = (icon, key, extra) => { if (fm[key] != null && String(fm[key]).trim()) fact(icon, String(fm[key]), extra && extra(String(fm[key]))); };
    const danger = (v) => (/deadly|lethal|extreme|apex|fatal/i.test(v) ? 'is-danger' : /danger|hostile|toxic|poison|venom/i.test(v) ? 'is-warn' : /harmless|docile|edible|safe/i.test(v) ? 'is-safe' : '');
    if (type === 'creature') {
      say('skull', 'threat', danger);
      say('brain', 'mind');
      say('activity', 'temperament');
      say('ruler', 'size');
      say('utensils', 'diet');
      say('moon', 'active');
    } else {
      say('flask-conical', 'toxicity', danger);
      say('sun', 'season');
      say('cloud-sun', 'climate');
    }
    say('sparkles', 'rarity');
    for (const s of toArr(fm.habitat).slice(0, 3)) {
      const d = p.resolveLink(s, me);
      fact('map-pin', d ? d.basename : linkText(s), '', d ? () => p.openEntity(d) : null);
    }
    if (!box.childElementCount) box.remove();
  }

  /* Characters of this species and of every subspecies below it, grouped by exact species. */
  renderSpeciesMembers(main) {
    const p = this.plugin;
    const me = this.file;
    const idx = p.index();
    const tree = [{ file: me, depth: -1 }, ...p.descendantSpecies(me, idx)];
    const inTree = new Set(tree.map((t) => t.file));
    const by = new Map(tree.map((t) => [t.file, []]));
    for (const c of idx.character) {
      for (const s of toArr(p.fm(c).species)) {
        const sp = p.resolveLink(s, c);
        if (sp && inTree.has(sp) && !by.get(sp).includes(c)) by.get(sp).push(c);
      }
    }
    /* Hybrids of this species (or of any subspecies) and their characters, listed after the subspecies. */
    for (const t of [...tree]) for (const h of p.hybridSpecies(t.file, idx)) {
      if (inTree.has(h)) continue;
      inTree.add(h);
      tree.push({ file: h, depth: 0, hybrid: true });
      by.set(h, idx.character.filter((c) => p.ownSpecies(c).includes(h)));
    }
    const total = new Set([...by.values()].flat()).size;
    const cls = p.classOf(me);
    const body = this.block(main, total ? `Characters (${total})` : 'Characters', '__speciesmembers');
    const info = body.createDiv('ls-class-line');
    if (cls.path.length) {
      setIcon(info.createSpan('ls-class-icon'), 'layers');
      info.createSpan({ text: cls.path.join(' › ') });
      if (cls.from) {
        const from = info.createSpan({ cls: 'ls-muted is-link', text: ` (from ${cls.from.basename})` });
        from.addEventListener('click', () => p.openEntity(cls.from, 'species'));
      }
    } else info.createSpan({ cls: 'ls-muted', text: 'No classification yet. Set one in the sidebar, like "Being" or "Beast › Dragon". Subspecies inherit it.' });
    if (!total) {
      body.createDiv({ cls: 'ls-muted', text: 'Characters whose Species is this one, or any of its subspecies, gather here.' });
      return;
    }
    for (const t of tree) {
      const list = by.get(t.file);
      if (!list.length) continue;
      const head = body.createDiv({ cls: 'ls-rel-group ls-species-sub', text: t.file === me ? `${me.basename} (${list.length})` : `${t.file.basename}${t.hybrid ? ' (hybrid)' : ''} (${list.length})` });
      if (t.depth > 0) head.style.paddingLeft = `${t.depth * 14}px`;
      if (t.file !== me) { head.addClass('is-link'); head.addEventListener('click', () => p.openEntity(t.file, 'species')); }
      const box = body.createDiv('ls-chips');
      for (const c of list.sort((a, b) => natural(a.basename, b.basename))) {
        const chip = box.createDiv('ls-chip ls-person-chip');
        avatarEl(chip, p, c, 'is-tiny');
        chip.createSpan({ text: c.basename });
        chip.addEventListener('click', () => p.openEntity(c, 'character'));
      }
    }
  }

  /* A language page: its own dictionary, words it lent to others, and the languages that came from it. */
  renderLanguageWords(main) {
    const p = this.plugin;
    const me = this.file;
    const idx = p.index();
    const links = (f, key) => toArr(p.fm(f)[key]).some((s) => p.resolveLink(s, f) === me);
    const mine = idx.word.filter((w) => links(w, 'language'));
    const lent = idx.word.filter((w) => links(w, 'borrowed_from') && !mine.includes(w));
    const kids = idx.language.filter((l) => links(l, 'parent'));
    const body = this.block(main, mine.length ? `Dictionary (${mine.length})` : 'Dictionary', '__langwords');
    const bar = body.createDiv('ls-lang-bar');
    textBtn(bar, 'New word in this language', () => new NameModal(this.app, { title: `New ${me.basename} word`, placeholder: 'Word', cta: 'Create word' }, async (n) => {
      const f = await p.createEntity('word', { name: n }, false);
      if (!f) return;
      await this.app.fileManager.processFrontMatter(f, (fm) => { fm.language = [p.linkTo(me, f)]; });
      p.dropGraph();
      p.openEntity(f, 'word');
    }).open(), 'ls-chip-add');
    const rows = (parent, files, note) => {
      const list = parent.createDiv('ls-list ls-lang-words');
      for (const w of files.slice(0, 300)) {
        const fm = p.fm(w);
        const row = list.createDiv('ls-row');
        row.createSpan({ cls: 'ls-row-name', text: w.basename });
        if (fm.pronunciation) row.createSpan({ cls: 'ls-row-meta ls-lang-say', text: `/${fm.pronunciation}/` });
        if (fm.part_of_speech) row.createSpan({ cls: 'ls-pill', text: String(fm.part_of_speech) });
        const extra = note ? note(w) : '';
        const text = [fm.meaning, extra].filter(Boolean).map(String).join(' · ');
        if (text) row.createSpan({ cls: 'ls-row-meta ls-lang-meaning', text });
        row.addEventListener('click', () => p.openEntity(w, 'word'));
      }
      if (files.length > 300) parent.createDiv({ cls: 'ls-muted', text: `${files.length - 300} more in the Dictionary.` });
    };
    if (mine.length) rows(body, mine, (w) => { const from = p.languageNames(w, 'borrowed_from').join(', '); return from && `borrowed from ${from}`; });
    else body.createDiv({ cls: 'ls-muted', text: 'Words whose Language is this one gather here, with their meanings. Create them from here or from the Dictionary.' });
    if (lent.length) {
      body.createDiv({ cls: 'ls-rel-group ls-species-sub', text: `Lent to other languages (${lent.length})` });
      rows(body, lent, (w) => { const l = p.languageNames(w).join(', '); return l && `now in ${l}`; });
    }
    if (kids.length) {
      body.createDiv({ cls: 'ls-rel-group ls-species-sub', text: `Daughter languages (${kids.length})` });
      const box = body.createDiv('ls-chips');
      for (const k of kids) {
        const chip = box.createDiv('ls-chip ls-conn-chip ls-c-purple');
        setIcon(chip.createSpan('ls-chip-icon'), TYPES.language.icon);
        chip.createSpan({ text: k.basename });
        chip.addEventListener('click', () => p.openEntity(k, 'language'));
      }
    }
  }

  /* Every group this character belongs or belonged to, with each title they've held there. */
  renderPositions(main) {
    const p = this.plugin;
    const me = this.file;
    const g = p.graph();
    const orgs = new Set();
    for (const e of g.out.get(me) || []) if (ROLE_FIELDS.includes(e.field) && g.types.get(e.dest) === 'organization') orgs.add(e.dest);
    for (const e of g.inn.get(me) || []) if (e.srcType === 'organization' && ['members', 'leaders', 'founders'].includes(e.field)) orgs.add(e.src);
    const entries = p.roleEntriesOf(me);
    for (const e of entries) if (p.typeOf(e.org) === 'organization') orgs.add(e.org);
    if (!orgs.size) return;
    const list = [...orgs].map((o) => ({ org: o, status: p.memberStatus(me, o), es: entries.filter((e) => e.org === o) }))
      .sort((a, b) => (a.status === 'former') - (b.status === 'former') || natural(a.org.basename, b.org.basename));
    const body = this.block(main, `Groups and positions (${list.length})`, '__positions');
    const box = body.createDiv('ls-positions');
    for (const it of list) {
      const row = box.createDiv('ls-position' + (it.status === 'former' ? ' is-former' : ''));
      const head = row.createDiv('ls-position-head');
      setIcon(head.createSpan('ls-position-icon'), TYPES.organization.icon);
      const name = head.createSpan({ cls: 'ls-position-name', text: it.org.basename });
      name.addEventListener('click', () => p.openEntity(it.org, 'organization'));
      const ofm = p.fm(it.org);
      const parent = p.resolveLink(ofm.partOf, it.org);
      const meta = [ofm.kind && String(ofm.kind), parent && `part of ${parent.basename}`].filter(Boolean).join(', ');
      if (meta) head.createSpan({ cls: 'ls-position-meta', text: meta });
      head.createSpan({ cls: `ls-pill ls-status-pill is-${it.status}`, text: it.status === 'former' ? 'Former' : it.status === 'future' ? 'Not yet' : 'Active' });
      iconBtn(head, 'pencil', `Edit roles at ${it.org.basename}`, () => this.editRole(me, it.org), 'ls-position-edit');
      const lines = row.createDiv('ls-position-roles');
      if (!it.es.length) lines.createDiv({ cls: 'ls-position-role is-empty', text: it.status === 'former' ? 'Former member' : 'Member, no title set' });
      for (const e of it.es) {
        const l = lines.createDiv({ cls: `ls-position-role is-${e.status}` });
        l.createSpan({ cls: 'ls-position-title', text: e.status === 'former' ? `${e.title || 'Member'}` : (e.title || 'Member') });
        const y = p.roleYears(e);
        if (y) l.createSpan({ cls: 'ls-position-years', text: y });
        if (e.status !== 'active') l.createSpan({ cls: 'ls-position-state', text: e.status === 'former' ? 'former' : 'not yet' });
      }
    }
  }

  editTie(other) {
    new RolesModal(this.app, this.plugin, this.file, other, () => { this.selfWrite = Date.now() + 1500; this.refreshSoon(); }, { field: 'ties' }).open();
  }

  editRole(ch, org, justAdded) {
    new RolesModal(this.app, this.plugin, ch, org, () => { this.selfWrite = Date.now() + 1500; this.refreshSoon(); }).open();
    if (justAdded) this.refreshSoon();
  }

  /* Places, groups, things and stories linked to this entry, from its own fields and from other notes. */
  renderConnections(main) {
    const p = this.plugin;
    const me = this.file;
    const isOrg = p.typeOf(me) === 'organization';
    const groups = p.connectionsOf(me, { skipPeople: isOrg, skipGroups: p.typeOf(me) === 'character' });
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    const body = this.block(main, total ? `Connections (${total})` : 'Connections', '__conn');
    if (!groups.length) {
      body.createDiv({ cls: 'ls-muted', text: 'Link this entry to places, groups and things from the sidebar. Anything that links back here also shows up, so both sides stay connected.' });
      return;
    }
    const grid = body.createDiv('ls-rel-grid');
    for (const g of groups) {
      grid.createDiv({ cls: 'ls-prop-label', text: g.label });
      const box = grid.createDiv('ls-chips');
      for (const it of g.items) {
        const t = p.typeOf(it.file);
        const def = TYPES[t];
        const chip = box.createDiv({ cls: `ls-chip ls-conn-chip ls-c-${(def && def.color) || 'base'}` + (it.auto ? ' is-auto' : '') + (it.former ? ' is-former' : '') });
        if (def && def.portrait) avatarEl(chip, p, it.file, 'is-tiny');
        else setIcon(chip.createSpan('ls-chip-icon'), (def && def.icon) || 'file-text');
        chip.createSpan({ text: it.file.basename });
        if (it.role) chip.createSpan({ cls: 'ls-chip-note', text: it.role });
        if (it.auto) chip.setAttr('aria-label', `Listed on ${it.file.basename}'s page`);
        chip.addEventListener('click', () => p.openEntity(it.file, t));
        if (p.typeOf(me) === 'character' && t === 'organization') {
          iconBtn(chip, 'pencil', it.role ? `Change role at ${it.file.basename}` : `Set role at ${it.file.basename}`, () => this.editRole(me, it.file));
        }
      }
    }
  }

  refreshSoon() {
    window.clearTimeout(this._refreshT);
    this._refreshT = window.setTimeout(() => { this.plugin.dropGraph(); this.softRefresh(); }, 500);
  }

  timelineList(parent, evs) {
    const p = this.plugin;
    const now = p.latestPresent();
    const list = parent.createDiv('ls-list');
    for (const e of evs) {
      const row = list.createDiv(`ls-row ls-tl-${e.kind}`);
      row.createSpan({ cls: 'ls-row-meta ls-app-chapter', text: e.year == null ? '?' : p.fmtYear(e.year) });
      row.createSpan({ cls: 'ls-row-name', text: e.title });
      if (e.sub) row.createSpan({ cls: 'ls-pill', text: e.sub });
      if (e.year != null && now) row.createSpan({ cls: 'ls-row-meta ls-ago', text: p.agoText({ y: e.year, d: e.d }, now) });
      if (e.file !== this.file) row.addEventListener('click', () => p.openEntity(e.file));
      else row.addClass('is-self');
    }
  }

  async renderArcComputed(main, fm) {
    const p = this.plugin;
    const me = this.file;
    const box = this.block(main, 'In the outline', '__arcoutline');
    const hits = await p.outlineCardsFor(me);
    if (!hits.length) {
      box.createDiv({ cls: 'ls-muted', text: 'In a story outline, open a plot line\'s menu and link it to this arc. Its cards show up here.' });
    } else {
      let cur = null, list = null;
      for (const h of hits) {
        if (h.story !== cur) {
          cur = h.story;
          const story = h.story;
          const sh = box.createDiv({ cls: 'ls-app-story', text: story.basename });
          sh.addEventListener('click', () => p.openOutline(story));
          list = box.createDiv('ls-list ls-arc-beats');
        }
        const row = list.createDiv('ls-row ls-beat-row');
        row.createSpan({ cls: 'ls-row-meta ls-app-chapter', text: splitBeatTitle(h.beat).name });
        const n = row.createDiv('ls-beat-main');
        n.createDiv({ cls: 'ls-beat-text' + (h.card.text ? '' : ' is-empty'), text: h.card.text || 'Empty card' });
        const story = h.story;
        row.addEventListener('click', () => p.openOutline(story));
      }
    }

    const evBody = this.block(main, 'Events', '__arcevents');
    const evs = p.timeline(p.index()).filter((e) => p.involves(e, me));
    if (!evs.length) evBody.createDiv({ cls: 'ls-muted', text: 'Events that list this arc show up here, in historical order.' });
    else this.timelineList(evBody, evs);
  }

  renderAuthorNotes(main, body, keys) {
    const box = this.block(main, "Author's notes", '__notes');
    const grid = box.createDiv('ls-notes-grid');
    for (const k of keys) {
      const m = body.match(noteRe(k));
      grid.createDiv({ cls: 'ls-prop-label', text: k });
      const ta = grid.createEl('textarea', { cls: 'ls-note-input', attr: { rows: '1', placeholder: NOTE_HINTS[k] || '' } });
      ta.value = m ? m[2].trim() : '';
      this.plugin.typing.trackInput(ta, () => this.file);
      const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      const saver = this.saver((v) => this.saveNoteKey(k, v));
      ta.addEventListener('input', () => { fit(); saver.schedule(ta.value); });
      ta.addEventListener('blur', () => saver.flush());
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ta.blur(); } });
    }
  }

  saveNoteKey(k, v) {
    v = String(v).replace(/\s*\n\s*/g, ' ').trim();
    this.selfWrite = Date.now() + 1500;
    return this.app.vault.process(this.file, (d) => {
      const s = splitFm(d);
      const re = noteRe(k);
      if (re.test(s.body)) return s.fm + s.body.replace(re, (all, pre) => (/\s$/.test(pre) || !v ? pre : pre + ' ') + v);
      return s.fm + editBody(s.body, (p) => {
        let sec = findSec(p, "Author's notes");
        if (!sec) { sec = { name: "Author's notes", lines: [] }; p.sections.push(sec); }
        const t = secText(sec);
        sec.lines = [...(t ? t.split('\n') : []), `${k}: ${v}`];
      });
    });
  }

  renderSide(side, fm, def, type) {
    const p = this.plugin;

    // image (characters show theirs in the header)
    if (type !== 'character') {
      const img = p.resolveLink(fm.image, this.file);
      if (img) {
        const box = side.createDiv('ls-image');
        box.createEl('img', { attr: { src: this.app.vault.getResourcePath(img), alt: '' } });
      }
      const imgRow = side.createDiv('ls-image-actions');
      textBtn(imgRow, img ? 'Change image' : 'Add image', () => new ImageSuggest(this.app, (f) => {
        this.setFm((x) => { x.image = p.linkTo(f, this.file); }, true);
      }).open(), img ? '' : 'mod-cta');
      if (img) textBtn(imgRow, 'Remove', () => this.setFm((x) => { delete x.image; }, true));
    }

    const props = side.createDiv('ls-props');
    const label = (t) => props.createDiv({ cls: 'ls-prop-label', text: t });

    if (type === 'character') {
      label('Category');
      const r = props.createDiv('ls-radio');
      const current = String(fm.category || 'major');
      for (const c of ['main', 'major', 'minor']) {
        const b = r.createEl('button', { text: cap(c), cls: current === c ? 'is-active' : '' });
        b.addEventListener('click', () => this.setFm((f) => { f.category = c; }, true));
      }
      props.createDiv({ cls: 'ls-hint', text: CATEGORY_INFO[current] || '' });
    }

    label('Note name');
    const nameInp = props.createEl('input', { type: 'text', cls: 'ls-input' });
    nameInp.value = this.file.basename;
    nameInp.addEventListener('change', () => p.renameEntity(this.file, nameInp.value));

    this.nameInputs = {};
    const yearInputs = {};
    const hintAfter = { character: 'died', organization: 'founded', event: 'end_year', holiday: 'last_held' }[type];
    const closed = new Set(toArr(p.settings.sheetGroups[type]));
    let group = null;
    let box = props;
    for (const field of def.fields) {
      if (field.group && field.group !== group) {
        group = field.group;
        const g = group;
        const filled = def.fields.filter((f) => f.group === g && toArr(fm[f.key]).length).length;
        const head = props.createDiv({ cls: 'ls-prop-group is-toggle', attr: { role: 'button', tabindex: '0', 'aria-expanded': String(!closed.has(g)) } });
        setIcon(head.createSpan('ls-chevron'), 'chevron-down');
        head.createSpan({ cls: 'ls-prop-group-name', text: g });
        if (filled) head.createSpan({ cls: 'ls-prop-group-count', text: String(filled) });
        box = props.createDiv('ls-prop-group-body');
        if (closed.has(g)) { head.addClass('is-collapsed'); box.addClass('is-collapsed'); }
        const body = box;
        const toggle = async () => {
          const c = !body.hasClass('is-collapsed');
          body.toggleClass('is-collapsed', c);
          head.toggleClass('is-collapsed', c);
          head.setAttr('aria-expanded', String(!c));
          const set = new Set(toArr(p.settings.sheetGroups[type]));
          if (c) set.add(g); else set.delete(g);
          p.settings.sheetGroups[type] = [...set];
          p.saveSoon();
        };
        head.addEventListener('click', toggle);
        head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      }
      box.createDiv({ cls: 'ls-prop-label', text: field.label });
      this.fieldControl(box, field, fm);
      if (['born', 'died', 'founded', 'date', 'year', 'days', 'first_held', 'last_held'].includes(field.key) && box.lastElementChild instanceof HTMLInputElement) {
        yearInputs[field.key] = box.lastElementChild;
      }
      if (field.key === hintAfter) this.yearHint(box, type, fm, yearInputs);
      if (TAXA.includes(type) && field.key === 'classification' && !fm.classification) {
        const c = p.classOf(this.file);
        if (c.from) box.createDiv({ cls: 'ls-hint', text: `Inherits "${c.path.join(' › ')}" from ${c.from.basename}. Type one to override.` });
      }
      if (field.key === 'first_appearance' && this.firstSeen && !fm.first_appearance) {
        const h = this.firstSeen;
        const hint = box.createDiv({ cls: 'ls-hint ls-year-hint is-link', text: `From your scenes: ${h.scene.basename}, ${h.chapter}` });
        hint.addEventListener('click', () => p.openNote(h.scene));
      }
    }

    // attributes
    side.createDiv({ cls: 'ls-side-title', text: 'Attributes' });
    const attrs = props.cloneNode(false);
    side.appendChild(attrs);
    for (const a of toArr(fm.attributes)) {
      attrs.createDiv({ cls: 'ls-prop-label', text: a });
      const cell = attrs.createDiv('ls-attr-cell');
      const inp = cell.createEl('input', { type: 'text', cls: 'ls-input' });
      inp.value = fm[a] == null ? '' : String(fm[a]);
      inp.addEventListener('change', () => this.setFm((f) => { f[a] = inp.value.trim() || null; }));
      iconBtn(cell, 'x', `Remove ${a}`, () => this.setFm((f) => {
        const rest = toArr(f.attributes).filter((x) => x !== a);
        if (rest.length) f.attributes = rest; else delete f.attributes;
        delete f[a];
      }, true));
    }
    const nrow = side.createDiv('ls-attr-new');
    const nk = nrow.createEl('input', { type: 'text', cls: 'ls-input', attr: { placeholder: 'Attribute' } });
    const nv = nrow.createEl('input', { type: 'text', cls: 'ls-input', attr: { placeholder: 'Value' } });
    const addAttr = () => {
      const k = nk.value.trim();
      if (!k) return;
      if (RESERVED.has(k.toLowerCase()) || toArr(fm.attributes).some((x) => x.toLowerCase() === k.toLowerCase())) {
        new Notice(`"${k}" is already used on this entry.`);
        return;
      }
      this.setFm((f) => { f.attributes = [...toArr(f.attributes), k]; f[k] = nv.value.trim() || null; }, true);
    };
    textBtn(nrow, 'Add', addAttr);
    nv.addEventListener('keydown', (e) => { if (e.key === 'Enter') addAttr(); });

    // tags
    side.createDiv({ cls: 'ls-side-title', text: 'Tags' });
    const tagBox = side.createDiv('ls-chips');
    for (const t of toArr(fm.tags)) {
      const chip = tagBox.createDiv('ls-chip ls-chip-tag');
      chip.createSpan({ text: cleanTag(t) });
      iconBtn(chip, 'x', `Remove tag ${t}`, () => this.setFm((f) => {
        const rest = toArr(f.tags).filter((x) => x !== t);
        if (rest.length) f.tags = rest; else delete f.tags;
      }, true));
    }
    textBtn(tagBox, 'Add tag', () => new TagSuggest(this.app, p, (tag) => this.setFm((f) => {
      const tags = toArr(f.tags);
      if (!tags.map(cleanTag).includes(tag)) tags.push(tag);
      f.tags = tags;
    }, true)).open(), 'ls-chip-add');

    // subspecies, or variants of a creature or plant
    const kids = TAXA.includes(type) ? p.childTaxa(this.file) : [];
    if (TAXA.includes(type)) {
      const word = p.childWord(type, 2);
      side.createDiv({ cls: 'ls-side-title', text: cap(word) });
      if (kids.length) {
        const list = side.createDiv('ls-list ls-refs');
        for (const f of kids) {
          const row = list.createDiv(`ls-row ls-c-${def.color}`);
          setIcon(row.createSpan('ls-row-icon'), 'corner-down-right');
          row.createSpan({ cls: 'ls-row-name', text: f.basename });
          const n = p.childTaxa(f).length;
          if (n) row.createSpan({ cls: 'ls-row-meta', text: `${n} ${p.childWord(type, n)}` });
          row.addEventListener('click', () => p.openEntity(f, type));
        }
      }
      const one = p.childWord(type, 1);
      const eg = { species: `Seelie ${this.file.basename.toLowerCase()}`, creature: `Frost ${this.file.basename.toLowerCase()}`, plant: `Black ${this.file.basename.toLowerCase()}` }[type];
      textBtn(side, `Add ${one}`, () => new NameModal(this.app, {
        title: `New ${one} of ${this.file.basename}`, placeholder: `e.g. ${eg}`, cta: 'Create',
      }, async (n) => {
        const f = await p.createVariant(this.file, n);
        if (f) p.openEntity(f, type);
      }).open(), 'ls-chip-add');
    }

    // backlinks
    const refs = [];
    const rl = this.app.metadataCache.resolvedLinks;
    for (const src of Object.keys(rl)) {
      if (src === this.file.path || !rl[src][this.file.path]) continue;
      if (kids.some((k) => k.path === src)) continue;
      const f = this.app.vault.getAbstractFileByPath(src);
      if (f instanceof TFile) refs.push(f);
    }
    if (refs.length) {
      side.createDiv({ cls: 'ls-side-title', text: 'Linked from' });
      const list = side.createDiv('ls-list ls-refs');
      for (const f of refs.sort((a, b) => natural(a.basename, b.basename))) {
        const t = p.typeOf(f);
        const row = list.createDiv(`ls-row ls-c-${(TYPES[t] && TYPES[t].color) || 'base'}`);
        const ic = row.createSpan('ls-row-icon'); setIcon(ic, (TYPES[t] && TYPES[t].icon) || 'file-text');
        row.createSpan({ cls: 'ls-row-name', text: f.basename });
        if (TYPES[t]) row.createSpan({ cls: 'ls-row-meta', text: TYPES[t].label });
        else if (t === 'scene') row.createSpan({ cls: 'ls-row-meta', text: 'Scene' });
        row.addEventListener('click', () => p.openEntity(f, t));
      }
    }
  }

  /* Age under a character's dates, "N years ago" under a founding or an event. Updates as you type. */
  yearHint(props, type, fm, inputs) {
    const p = this.plugin;
    const now = p.latestPresent();
    const stories = type === 'character' ? p.index().story.filter((s) => p.storyPresent(s)) : [];
    const hint = props.createDiv('ls-hint ls-year-hint');
    const val = (k) => (inputs[k] ? inputs[k].value.trim() : fm[k]);
    const update = () => {
      hint.empty();
      const neg = p.negEras();
      const lines = [];
      if (type === 'character') {
        const life = { born: val('born'), died: val('died') };
        const main = p.ageText(life, now);
        if (main) lines.push(main);
        else if (p.toPt(life.born)) lines.push('Set a present date on a story, chapter or scene, or in the calendar note, to see their age.');
        for (const s of stories) {
          const y = p.storyPresent(s);
          if (now && p.cmpPt(y, now) === 0 && y.y === now.y) continue;
          const a = p.ageShort(life, y);
          if (a) lines.push(`${s.basename} (${y.raw}): ${a.text}`);
        }
      } else if (type === 'organization') {
        const y = p.toPt(val('founded'));
        if (y && now) lines.push(`Founded ${p.agoText(y, now)}, as of ${now.raw}`);
      } else if (type === 'event') {
        const sort = numOrNull(val('year'));
        const y = sort != null ? { y: sort, d: null } : p.toPt(val('date'));
        if (y && now) lines.push(`${cap(p.agoText(y, now))}, as of ${now.raw}`);
      } else if (type === 'holiday') {
        lines.push(...p.holidaySummary({ date: val('date'), days: val('days'), first_held: val('first_held'), last_held: val('last_held') }, this.file));
      }
      for (const l of lines) hint.createDiv({ text: l });
      hint.style.display = lines.length ? '' : 'none';
    };
    for (const inp of Object.values(inputs)) inp.addEventListener('input', update);
    update();
  }

  fieldControl(parent, field, fm) {
    const p = this.plugin;
    const key = field.key;
    const v = fm[key];
    const mark = (el) => { el.setAttr('data-ls-key', key); return el; };

    if (field.kind === 'text' || field.kind === 'number') {
      const inp = mark(parent.createEl('input', {
        type: field.kind === 'number' ? 'number' : 'text', cls: 'ls-input',
        attr: { placeholder: field.placeholder || field.label },
      }));
      inp.value = v == null ? '' : String(v);
      if (field.suggest) {
        const id = `ls-dl-${key}-${Math.random().toString(36).slice(2, 7)}`;
        const dl = parent.createEl('datalist', { attr: { id } });
        for (const o of p.usedValues(key).slice(0, 60)) dl.createEl('option', { value: o });
        inp.setAttr('list', id);
      }
      if (field.name) this.nameInputs[key] = inp;
      inp.addEventListener('change', async () => {
        const val = inp.value.trim();
        await this.setFm((f) => {
          if (!val) delete f[key];
          else f[key] = field.kind === 'number' && !isNaN(Number(val)) ? Number(val) : val;
        });
        if (field.name) {
          const n = ['first', 'middle', 'last'].map((k) => (this.nameInputs[k] ? this.nameInputs[k].value.trim() : '')).filter(Boolean).join(' ');
          if (n) await p.renameEntity(this.file, n);
        }
      });
      return;
    }

    if (field.kind === 'date') {
      const inp = parent.createEl('input', { type: 'date', cls: 'ls-input' });
      inp.value = isoDate(v);
      inp.addEventListener('change', () => this.setFm((f) => { if (inp.value) f[key] = inp.value; else delete f[key]; }));
      return;
    }

    if (field.kind === 'select') {
      const sel = parent.createEl('select', { cls: 'dropdown ls-input' });
      sel.createEl('option', { text: 'None', value: '' });
      for (const o of field.options) sel.createEl('option', { text: cap(o), value: o });
      sel.value = field.options.includes(String(v)) ? String(v) : '';
      sel.addEventListener('change', () => this.setFm((f) => { if (sel.value) f[key] = sel.value; else delete f[key]; }, true));
      return;
    }

    if (field.kind === 'list') {
      const inp = mark(parent.createEl('input', { type: 'text', cls: 'ls-input', attr: { placeholder: field.placeholder || field.label } }));
      inp.value = toArr(v).join(', ');
      inp.addEventListener('change', () => {
        const arr = inp.value.split(',').map((s) => s.trim()).filter(Boolean);
        this.setFm((f) => { if (arr.length) f[key] = arr; else delete f[key]; });
      });
      return;
    }

    // link / links
    const box = mark(parent.createDiv('ls-chips'));
    const arr = toArr(v);
    for (const s of arr) {
      const dest = p.resolveLink(s, this.file);
      const chip = box.createDiv('ls-chip' + (dest ? '' : ' is-unresolved'));
      chip.createSpan({ text: dest ? dest.basename : linkText(s) });
      if (dest) chip.addEventListener('click', () => p.openEntity(dest));
      const roleable = dest && ROLE_FIELDS.includes(key) && p.typeOf(this.file) === 'character' && p.typeOf(dest) === 'organization';
      if (roleable) {
        const role = p.roleOf(this.file, dest);
        if (role) chip.createSpan({ cls: 'ls-chip-note', text: role });
        if (p.memberStatus(this.file, dest) === 'former') chip.addClass('is-former');
        iconBtn(chip, 'pencil', role ? 'Edit roles' : 'Set role', () => this.editRole(this.file, dest));
      }
      iconBtn(chip, 'x', 'Remove link', async () => {
        let after = null;
        await this.setFm((f) => {
          const rest = toArr(f[key]).filter((x) => x !== s);
          if (field.kind === 'links' && rest.length) f[key] = rest; else delete f[key];
          after = Object.assign({}, f);
        }, true);
        if (dest && await p.mirrorLink(this.file, key, dest, false, after)) this.refreshSoon();
      });
    }
    if (field.kind === 'links' || !arr.length) {
      const what = field.types.length > 2 ? 'entry' : field.types.map((t) => TYPES[t].label.toLowerCase()).join(' or ');
      textBtn(box, field.kind === 'links' && arr.length ? 'Add' : `Choose ${what}`, () => new EntitySuggest(this.app, p, field.types, async (file) => {
        let after = null;
        await this.setFm((f) => {
          const l = p.linkTo(file, this.file);
          if (field.kind === 'link') f[key] = l;
          else {
            const cur = toArr(f[key]);
            if (!cur.some((x) => linkText(x) === linkText(l))) cur.push(l);
            f[key] = cur;
          }
          after = Object.assign({}, f);
        }, true);
        if (await p.mirrorLink(this.file, key, file, true, after)) this.refreshSoon();
        if (ROLE_FIELDS.includes(key) && p.typeOf(this.file) === 'character' && p.typeOf(file) === 'organization' && (!p.roleOf(this.file, file) || p.subdivisionsOf(file).length)) {
          this.editRole(this.file, file, true);
        }
      }, this.file).open(), 'ls-chip-add');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Chapters board                                                      */
/* ------------------------------------------------------------------ */

class ChaptersView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.file = null;
    this.token = 0;
    this.requestRender = debounce(() => this.render(), 400, true);
  }
  getViewType() { return VIEW_CHAPTERS; }
  getDisplayText() { return this.file ? `${this.file.basename}: chapters` : 'Chapters'; }
  getIcon() { return 'list-tree'; }
  getState() { return { file: this.file ? this.file.path : null }; }
  async setState(state, result) {
    if (state && state.file) {
      const f = this.app.vault.getAbstractFileByPath(state.file);
      this.file = f instanceof TFile ? f : null;
    }
    await super.setState(state, result);
    this.render();
  }
  async onOpen() {
    this.contentEl.addClass('ls-host');
    const inStory = (path) => this.file && this.file.parent && path && path.startsWith(this.file.parent.path + '/');
    const req = (f, old) => { if (inStory(f.path) || inStory(old)) this.requestRender(); };
    this.registerEvent(this.app.vault.on('create', req));
    this.registerEvent(this.app.vault.on('modify', req));
    this.registerEvent(this.app.vault.on('rename', req));
    this.registerEvent(this.app.vault.on('delete', (f) => {
      if (f === this.file) this.leaf.detach();
      else req(f);
    }));
  }

  writeOrder(names) {
    return this.app.fileManager.processFrontMatter(this.file, (fm) => { fm.chapters = names; });
  }

  async render() {
    const token = ++this.token;
    const p = this.plugin;
    const root = document.createElement('div');
    root.addClass('ls-root', 'ls-chapters', 'ls-c-cyan');

    if (!this.file || !this.file.parent) {
      root.createDiv({ cls: 'ls-empty', text: 'Open a story from the overview.' });
      return this.swap(root, token);
    }
    const data = await p.storyData(this.file);
    const names = data.chapters.map((c) => c.name);

    // which outline beats point at each chapter and scene
    const beatsFor = new Map();
    const of = p.outlineFileFor(this.file);
    if (of) {
      const { model } = await p.readOutline(of);
      for (const b of model.beats) {
        for (const cards of Object.values(b.cells)) {
          for (const c of cards) {
            for (const a of c.attach) {
              const key = a.kind === 'chapter' ? `ch:${a.name}` : p.resolveLink(a.link, of);
              if (!key) continue;
              const list = beatsFor.get(key) || [];
              const n = splitBeatTitle(b.title).name;
              if (!list.includes(n)) list.push(n);
              beatsFor.set(key, list);
            }
          }
        }
      }
    }
    const beatPill = (parent, key) => {
      const list = beatsFor.get(key);
      if (!list) return;
      const pill = parent.createSpan({ cls: 'ls-pill ls-beat-pill', text: list[0] + (list.length > 1 ? ` +${list.length - 1}` : ''), attr: { 'aria-label': `Outline: ${list.join(', ')}` } });
      pill.addEventListener('click', (e) => { e.stopPropagation(); p.openOutline(this.file); });
    };

    const head = root.createDiv('ls-entity-head');
    iconBtn(head, 'arrow-left', 'Back to stories', () => p.openOverview('story'));
    const title = head.createDiv('ls-entity-title');
    title.createSpan({ cls: 'ls-entity-name', text: this.file.basename });
    title.createSpan({ cls: 'ls-entity-kind', text: 'Chapters' });
    const actions = head.createDiv('ls-entity-actions');
    actions.createSpan({ cls: 'ls-badge', text: fmtNum(data.words), attr: { 'aria-label': 'Total words' } });
    const storyYear = p.storyPresent(this.file);
    textBtn(actions, storyYear ? storyYear.raw : 'Set date', () => new NameModal(this.app, {
      title: 'When this story takes place', placeholder: '12 Frostmoon, 1023 AC', cta: 'Save', allowEmpty: true,
      initial: p.fm(this.file).present_year != null ? String(p.fm(this.file).present_year) : '',
    }, (v) => p.setPresentYear(this.file, v)).open());
    const chYears = p.fm(this.file).chapter_years || {};
    const anyTension = data.chapters.some((ch) => ch.scenes.some((sc) => numOrNull(p.fm(sc.file).tension)));
    if (this.showTension == null) this.showTension = anyTension;
    const tt = textBtn(actions, 'Tension', () => { this.showTension = !this.showTension; this.render(); }, 'ls-toggle' + (this.showTension ? ' is-active' : ''));
    tt.setAttr('aria-pressed', String(!!this.showTension));
    textBtn(actions, 'Story details', () => p.openEntity(this.file, 'story'));
    textBtn(actions, 'Outline', () => p.openOutline(this.file));
    textBtn(actions, 'Compile', () => p.compileStory(this.file));
    textBtn(actions, 'Export', (e) => p.exportMenu(e, this.file));

    const legend = root.createDiv('ls-legend');
    for (const s of STATUSES) {
      const l = legend.createSpan('ls-legend-item');
      l.createSpan({ cls: `ls-status ls-status-${s}` });
      l.createSpan({ text: cap(s) });
    }
    legend.createSpan({ cls: 'ls-muted', text: 'Click a dot to change a scene\'s status.' });

    if (this.showTension) this.renderTension(root, data);

    const grid = root.createDiv('ls-chapter-grid');
    data.chapters.forEach((ch, ci) => {
      const card = grid.createDiv('ls-card ls-chapter');
      const h = card.createDiv('ls-chapter-head');
      h.createSpan({ cls: 'ls-chapter-name', text: ch.name });
      beatPill(h, `ch:${ch.name}`);
      if (chYears[ch.name] != null && chYears[ch.name] !== '') h.createSpan({ cls: 'ls-pill ls-year-pill', text: String(chYears[ch.name]), attr: { 'aria-label': 'Chapter year' } });
      h.createSpan({ cls: 'ls-words', text: fmtNum(ch.words) });
      iconBtn(h, 'more-vertical', 'Chapter options', (e) => this.chapterMenu(e, ch, ci, data, names));

      const list = card.createDiv('ls-scenes');
      if (!ch.scenes.length) list.createDiv({ cls: 'ls-muted', text: 'No scenes yet.' });
      ch.scenes.forEach((sc, si) => {
        const row = list.createDiv('ls-scene');
        row.createSpan({ cls: 'ls-scene-name', text: sc.file.basename });
        beatPill(row, sc.file);
        const scYear = p.fm(sc.file).present_year;
        if (scYear != null && scYear !== '') row.createSpan({ cls: 'ls-pill ls-year-pill', text: String(scYear), attr: { 'aria-label': 'Scene year' } });
        row.createSpan({ cls: 'ls-words', text: fmtNum(sc.words) });
        const cast = row.createEl('button', { cls: 'ls-cast-btn clickable-icon', attr: { 'aria-label': 'Characters in this scene' } });
        setIcon(cast.createSpan(), 'users');
        if (sc.cast) cast.createSpan({ text: String(sc.cast) });
        cast.addEventListener('click', (e) => { e.stopPropagation(); new CastModal(this.app, p, sc.file).open(); });
        const tn = numOrNull(p.fm(sc.file).tension);
        const tbtn = row.createEl('button', {
          cls: 'ls-tension-btn clickable-icon' + (tn ? ` is-t${Math.min(5, Math.max(1, Math.round(tn)))}` : ''),
          text: tn ? String(tn) : '–',
          attr: { 'aria-label': `Tension: ${tn || 'not set'}. Click to raise, past 5 clears it.` },
        });
        tbtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = tn && tn >= 5 ? null : (tn || 0) + 1;
          this.app.fileManager.processFrontMatter(sc.file, (fm) => { if (next) fm.tension = next; else delete fm.tension; });
        });
        const dot = row.createEl('button', {
          cls: `ls-status ls-status-${sc.status}`,
          attr: { 'aria-label': `${cap(sc.status)}. Click to change.` },
        });
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = STATUSES[(STATUSES.indexOf(sc.status) + 1) % STATUSES.length];
          this.app.fileManager.processFrontMatter(sc.file, (fm) => { fm.status = next; });
        });
        iconBtn(row, 'more-vertical', 'Scene options', (e) => this.sceneMenu(e, sc, si, ch, data));
        row.addEventListener('click', () => p.openNote(sc.file));
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); this.sceneMenu(e, sc, si, ch, data); });
      });

      const foot = card.createDiv('ls-chapter-foot');
      textBtn(foot, 'Add scene', () => this.addScene(ch), 'ls-chip-add');
    });

    const nc = grid.createDiv('ls-chapter-new');
    textBtn(nc, 'New chapter', () => this.newChapter(names), 'ls-chip-add');

    this.swap(root, token);
  }

  swap(root, token) {
    if (token !== this.token) return;
    const old = this.contentEl.querySelector('.ls-chapters');
    const scroll = old ? old.scrollTop : 0;
    this.contentEl.empty();
    this.contentEl.appendChild(root);
    root.scrollTop = scroll;
  }

  async addScene(ch) {
    const max = ch.scenes.reduce((m, s) => (Number.isFinite(s.order) ? Math.max(m, s.order) : m), 0);
    await this.plugin.createScene(ch.folder.path, `Scene ${ch.scenes.length + 1}`, Math.max(max, ch.scenes.length) + 1);
  }

  async newChapter(names) {
    const parent = this.file.parent.path;
    const folder = this.plugin.uniqueFolder(parent, `Chapter ${names.length + 1}`);
    await this.plugin.ensureFolder(folder);
    await this.plugin.createScene(folder, 'Scene 1', 1);
    await this.writeOrder([...names, folder.split('/').pop()]);
  }

  async renumber(scenes) {
    for (let i = 0; i < scenes.length; i++) {
      await this.app.fileManager.processFrontMatter(scenes[i].file, (fm) => { fm.order = i + 1; });
    }
  }

  /* Line graph of scene tension (1 to 5) across the book, with chapter dividers. Tap a dot to open the scene. */
  renderTension(root, data) {
    const p = this.plugin;
    const pts = [];
    const starts = [];
    for (const ch of data.chapters) {
      starts.push({ i: pts.length, name: ch.name, count: ch.scenes.length });
      for (const sc of ch.scenes) pts.push({ sc, t: numOrNull(p.fm(sc.file).tension) });
    }
    const box = root.createDiv('ls-tension');
    if (!pts.length) { box.createDiv({ cls: 'ls-muted', text: 'Add scenes, then rate their tension with the number button on each scene.' }); return; }
    if (!pts.some((x) => x.t)) box.createDiv({ cls: 'ls-hint', text: 'Rate each scene\'s tension from 1 to 5 with the – button on its row. The line fills in as you go.' });
    const n = pts.length;
    const step = 30, padL = 26, padR = 16, padT = 26, padB = 12, H = 170;
    const W = padL + padR + Math.max(1, n - 1) * step;
    const x = (i) => padL + i * step;
    const y = (t) => padT + (5 - Math.min(5, Math.max(1, t))) * (H - padT - padB) / 4;
    const wrap = box.createDiv('ls-tension-scroll');
    const svg = wrap.createSvg('svg', { attr: { width: String(W), height: String(H), viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Tension across the story' } });
    for (let t = 1; t <= 5; t++) {
      svg.createSvg('line', { cls: 'ls-tension-grid', attr: { x1: String(padL - 6), x2: String(W - padR + 6), y1: String(y(t)), y2: String(y(t)) } });
      svg.createSvg('text', { cls: 'ls-tension-axis', attr: { x: '4', y: String(y(t) + 4) } }).textContent = String(t);
    }
    for (const s of starts) {
      if (!s.count) continue;
      const cx = x(s.i) - step / 2;
      if (s.i > 0) svg.createSvg('line', { cls: 'ls-tension-ch', attr: { x1: String(cx), x2: String(cx), y1: '4', y2: String(H - padB) } });
      svg.createSvg('text', { cls: 'ls-tension-chname', attr: { x: String(Math.max(cx + 4, 2)), y: '14' } }).textContent = s.name;
    }
    let d = '';
    pts.forEach((pt, i) => {
      if (!pt.t) return;
      const prev = pts[i - 1];
      d += `${prev && prev.t ? 'L' : 'M'}${x(i)},${y(pt.t)} `;
    });
    if (d) svg.createSvg('path', { cls: 'ls-tension-line', attr: { d } });
    pts.forEach((pt, i) => {
      const dot = svg.createSvg('circle', { cls: pt.t ? 'ls-tension-dot' : ['ls-tension-dot', 'is-empty'], attr: { cx: String(x(i)), cy: String(pt.t ? y(pt.t) : H - padB - 2), r: pt.t ? '5' : '3' } });
      dot.createSvg('title').textContent = `${pt.sc.file.basename}: ${pt.t ? `tension ${pt.t}` : 'not rated'}`;
      dot.addEventListener('click', () => p.openNote(pt.sc.file));
    });
  }

  chapterMenu(e, ch, ci, data, names) {
    const p = this.plugin;
    const m = new Menu();
    addMenuItem(m, 'Rename', 'pencil', () => new NameModal(this.app,
      { title: 'Rename chapter', placeholder: 'Chapter name', initial: ch.name, cta: 'Rename' },
      async (n) => {
        n = sanitize(n);
        if (!n || n === ch.name) return;
        const target = normalizePath(`${ch.folder.parent.path}/${n}`);
        if (this.app.vault.getAbstractFileByPath(target)) { new Notice(`"${n}" already exists.`); return; }
        await this.app.fileManager.renameFile(ch.folder, target);
        await this.writeOrder(names.map((x) => (x === ch.name ? n : x)));
        await p.moveChapterYear(this.file, ch.name, n);
        const mood = p.chapterMoodboard(this.file, ch.name);
        if (mood.length) { await p.setChapterMoodboard(this.file, n, mood); await p.setChapterMoodboard(this.file, ch.name, []); }
      }).open());
    const chYear = (p.fm(this.file).chapter_years || {})[ch.name];
    addMenuItem(m, 'Moodboard', 'images', () => new MoodboardModal(this.app, p, `${ch.name} moodboard`,
      () => p.chapterMoodboard(this.file, ch.name), this.file, (links) => p.setChapterMoodboard(this.file, ch.name, links)).open());
    addMenuItem(m, chYear != null ? `Date: ${chYear}` : 'Set chapter date', 'calendar', () => new NameModal(this.app, {
      title: `When ${ch.name} takes place`, placeholder: 'Leave empty to use the story\'s date', cta: 'Save', allowEmpty: true,
      initial: chYear != null ? String(chYear) : '',
    }, (v) => p.setChapterYear(this.file, ch.name, v)).open());
    if (ci > 0) addMenuItem(m, 'Move earlier', 'arrow-left', () => {
      const n = names.slice(); [n[ci - 1], n[ci]] = [n[ci], n[ci - 1]]; this.writeOrder(n);
    });
    if (ci < names.length - 1) addMenuItem(m, 'Move later', 'arrow-right', () => {
      const n = names.slice(); [n[ci + 1], n[ci]] = [n[ci], n[ci + 1]]; this.writeOrder(n);
    });
    addMenuItem(m, 'Add scene', 'plus', () => this.addScene(ch));
    m.addSeparator();
    addMenuItem(m, 'Delete chapter', 'trash-2', () => new ConfirmModal(this.app, {
      title: `Delete ${ch.name}?`,
      message: `The chapter folder and its ${ch.scenes.length} scene${ch.scenes.length === 1 ? '' : 's'} will be moved to the trash.`,
      cta: 'Delete chapter',
    }, async () => {
      await p.trash(ch.folder);
      await this.writeOrder(names.filter((x) => x !== ch.name));
      await p.moveChapterYear(this.file, ch.name, null);
    }).open(), true);
    m.showAtMouseEvent(e);
  }

  sceneMenu(e, sc, si, ch, data) {
    const p = this.plugin;
    const m = new Menu();
    addMenuItem(m, 'Open', 'file-text', () => p.openNote(sc.file));
    addMenuItem(m, 'Rename', 'pencil', () => new NameModal(this.app,
      { title: 'Rename scene', placeholder: 'Scene name', initial: sc.file.basename, cta: 'Rename' },
      (n) => p.renameEntity(sc.file, n)).open());
    const scYear = p.fm(sc.file).present_year;
    addMenuItem(m, 'Moodboard', 'images', () => new MoodboardModal(this.app, p, `${sc.file.basename} moodboard`,
      () => toArr(p.fm(sc.file).moodboard), sc.file, (links) => p.setMoodboard(sc.file, links)).open());
    addMenuItem(m, scYear != null ? `Date: ${scYear}` : 'Set scene date', 'calendar', () => new NameModal(this.app, {
      title: `When ${sc.file.basename} takes place`, placeholder: 'Leave empty to use the chapter\'s or story\'s date', cta: 'Save', allowEmpty: true,
      initial: scYear != null ? String(scYear) : '',
    }, (v) => p.setPresentYear(sc.file, v)).open());
    if (si > 0) addMenuItem(m, 'Move up', 'arrow-up', () => {
      const s = ch.scenes.slice(); [s[si - 1], s[si]] = [s[si], s[si - 1]]; this.renumber(s);
    });
    if (si < ch.scenes.length - 1) addMenuItem(m, 'Move down', 'arrow-down', () => {
      const s = ch.scenes.slice(); [s[si + 1], s[si]] = [s[si], s[si + 1]]; this.renumber(s);
    });
    const others = data.chapters.filter((c) => c !== ch);
    if (others.length) addMenuItem(m, 'Move to chapter', 'folder-input', () => new ChapterSuggest(this.app, others, async (target) => {
      const path = p.uniquePath(target.folder.path, sc.file.basename);
      const max = target.scenes.reduce((mx, s) => (Number.isFinite(s.order) ? Math.max(mx, s.order) : mx), target.scenes.length);
      await this.app.fileManager.renameFile(sc.file, path);
      await this.app.fileManager.processFrontMatter(sc.file, (fm) => { fm.order = max + 1; });
    }).open());
    m.addSeparator();
    for (const s of STATUSES) {
      m.addItem((i) => i.setTitle(`Mark ${s}`).setChecked(sc.status === s)
        .onClick(() => this.app.fileManager.processFrontMatter(sc.file, (fm) => { fm.status = s; })));
    }
    m.addSeparator();
    addMenuItem(m, 'Delete scene', 'trash-2', () => p.confirmDelete(sc.file, 'scene'), true);
    m.showAtMouseEvent(e);
  }
}

/* ------------------------------------------------------------------ */
/* Story outline                                                       */
/* ------------------------------------------------------------------ */

const PLOTLINE_COLORS = ['pink', 'cyan', 'yellow', 'green', 'orange', 'blue', 'purple', 'red'];

class OutlineView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.file = null;
    this.outline = null;
    this.model = null;
    this.fmData = {};
    this.token = 0;
    this.selfWrite = 0;
    this.stale = false;
    this.saveSoon = debounce(() => this.save(false), 700, true);
    this.saveSynopsisSoon = debounce((v) => this.saveSynopsis(v), 700, true);
  }
  getViewType() { return VIEW_OUTLINE; }
  getDisplayText() { return this.file ? `${this.file.basename}: outline` : 'Outline'; }
  getIcon() { return 'list-ordered'; }
  getState() { return { file: this.file ? this.file.path : null }; }
  async setState(state, result) {
    if (state && state.file) {
      const f = this.app.vault.getAbstractFileByPath(state.file);
      this.file = f instanceof TFile ? f : null;
      this.outline = null;
    }
    await super.setState(state, result);
    await this.reload();
  }
  async onOpen() {
    this.contentEl.addClass('ls-host');
    this.registerEvent(this.app.metadataCache.on('changed', (f) => {
      if ((f === this.outline || f === this.file) && Date.now() > this.selfWrite) this.softReload();
    }));
    this.registerEvent(this.app.vault.on('rename', (f) => {
      if (f === this.file) this.leaf.updateHeader && this.leaf.updateHeader();
      if (this.file && this.file.parent && f.path.startsWith(this.file.parent.path + '/')) this.softReload();
    }));
    this.registerEvent(this.app.vault.on('delete', (f) => {
      if (f === this.file) { this.leaf.detach(); return; }
      if (f === this.outline) this.outline = null;
      if (this.file && this.file.parent && f.path.startsWith(this.file.parent.path + '/')) this.softReload();
    }));
    this.registerDomEvent(this.contentEl, 'focusout', () => {
      window.setTimeout(() => { if (this.stale && !this.editing()) { this.stale = false; this.reload(); } }, 50);
    });
  }
  async onClose() { await this.flush(); }

  editing() {
    const a = document.activeElement;
    return !!a && this.contentEl.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT');
  }
  softReload() {
    if (this.editing()) { this.stale = true; return; }
    this.reload();
  }

  async flush() {
    if (this.saveSoon.cancel) this.saveSoon.cancel();
    if (this.model && this.outline) await this.save(false);
  }

  async reload() {
    const p = this.plugin;
    if (!this.file) return this.render();
    if (!this.outline || !this.app.vault.getAbstractFileByPath(this.outline.path)) {
      this.selfWrite = Date.now() + 2500;
      this.outline = await p.ensureOutline(this.file);
    }
    const { fm, model } = await p.readOutline(this.outline);
    this.fmData = fm;
    this.model = model;
    const story = await this.app.vault.read(this.file);
    this.synopsis = secText(findSec(parseSections(splitFm(story).body), 'Synopsis'));
    this.data = await p.storyData(this.file);
    this.render();
  }

  async save(structural) {
    if (!this.model || !this.outline) return;
    this.selfWrite = Date.now() + 2500;
    const body = serializeOutline(this.model);
    await this.app.vault.process(this.outline, (d) => splitFm(d).fm + body);
    if (structural) {
      await this.app.fileManager.processFrontMatter(this.outline, (fm) => {
        fm.plotlines = [...this.model.plotlines];
        if (this.fmData.structure) fm.structure = this.fmData.structure; else delete fm.structure;
      });
    }
  }
  async commit() {
    if (this.saveSoon.cancel) this.saveSoon.cancel();
    await this.save(true);
    this.render();
  }

  async saveSynopsis(v) {
    this.selfWrite = Date.now() + 2500;
    await this.app.vault.process(this.file, (d) => {
      const s = splitFm(d);
      return s.fm + editBody(s.body, (p) => {
        const sec = findSec(p, 'Synopsis');
        if (sec) sec.lines = v.split('\n');
        else p.sections.unshift({ name: 'Synopsis', lines: v.split('\n') });
      });
    });
  }

  structures() {
    return Object.assign({}, STRUCTURES, this.plugin.settings.customStructures);
  }
  colorOf(pl, i) {
    const arc = this.plugin.plotlineArc(pl, this.outline);
    const c = arc && this.plugin.fm(arc).color;
    return COLORS.includes(c) ? c : PLOTLINE_COLORS[i % PLOTLINE_COLORS.length];
  }
  cardCount(beat) {
    return Object.values(beat.cells).reduce((n, cs) => n + cs.length, 0);
  }

  /* ---------- render ---------- */

  render() {
    const token = ++this.token;
    const p = this.plugin;
    const root = document.createElement('div');
    root.addClass('ls-root', 'ls-outline', 'ls-c-cyan');
    if (!this.file || !this.model) {
      root.createDiv({ cls: 'ls-empty', text: 'Open a story to see its outline.' });
      return this.swap(root, token);
    }
    const m = this.model;

    const head = root.createDiv('ls-entity-head');
    iconBtn(head, 'arrow-left', 'Back to stories', () => p.openOverview('story'));
    const title = head.createDiv('ls-entity-title');
    title.createSpan({ cls: 'ls-entity-name', text: this.file.basename });
    title.createSpan({ cls: 'ls-entity-kind', text: 'Outline' });
    const actions = head.createDiv('ls-entity-actions');
    textBtn(actions, 'Chapters', () => p.openChapters(this.file));
    textBtn(actions, 'Story details', () => p.openEntity(this.file, 'story'));
    iconBtn(actions, 'file-text', 'Open outline as note', () => p.openNote(this.outline));

    // synopsis
    root.createEl('h3', { cls: 'ls-ol-h', text: 'Synopsis' });
    const syn = root.createEl('textarea', { cls: 'ls-textarea ls-ol-synopsis', attr: { rows: '2', placeholder: 'The whole story in a paragraph: who wants what, what stands in the way, how it ends.' } });
    syn.value = this.synopsis || '';
    p.typing.trackInput(syn, () => this.file);
    syn.addEventListener('input', () => { this.fit(syn, 56); this.synopsis = syn.value; this.saveSynopsisSoon(syn.value); });

    // structure picker
    const bar = root.createDiv('ls-ol-bar');
    bar.createEl('h3', { cls: 'ls-ol-h', text: 'Outline' });
    const sel = bar.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Story structure' } });
    const names = Object.keys(this.structures());
    const cur = this.fmData.structure ? String(this.fmData.structure) : '';
    if (cur && !names.includes(cur)) names.unshift(cur);
    if (!cur) sel.createEl('option', { text: 'Custom', value: '' });
    for (const n of names) sel.createEl('option', { text: n, value: n });
    sel.value = cur;
    sel.addEventListener('change', () => this.pickStructure(sel.value, sel, cur));
    iconBtn(bar, 'bookmark-plus', 'Save these beats as a reusable structure', () => this.saveAsStructure());
    const help = iconBtn(bar, 'info', 'How the outline works', () => new Notice(
      'Rows are the beats of your structure; rename, add or reorder them from each beat\'s menu. Columns are plot lines. ' +
      'Write cards first, then attach chapters or scenes from a card\'s menu, or turn a card into a new scene.', 10000));
    help.addClass('ls-ol-help');

    if (!m.beats.length) {
      const e = root.createDiv('ls-empty');
      e.createSpan({ text: 'No beats yet. Pick a structure above, or add your own beats one at a time.' });
      textBtn(e, 'Add beat', () => this.addBeat(0), 'ls-empty-cta');
      return this.swap(root, token);
    }

    const wrap = root.createDiv('ls-ol-wrap');
    const grid = wrap.createDiv('ls-ol-grid');
    grid.style.gridTemplateColumns = `var(--ls-ol-beat) repeat(${m.plotlines.length}, var(--ls-ol-col)) var(--ls-ol-add)`;

    // header row
    const corner = grid.createDiv('ls-ol-corner');
    textBtn(corner, 'Add beat', () => this.addBeat(m.beats.length), 'ls-chip-add');
    m.plotlines.forEach((pl, i) => {
      const h = grid.createDiv(`ls-ol-plhead ls-c-${this.colorOf(pl, i)}`);
      const pill = h.createDiv('ls-ol-pl');
      const arc = p.plotlineArc(pl, this.outline);
      if (arc) setIcon(pill.createSpan('ls-ol-pl-icon'), 'route');
      pill.createSpan({ cls: 'ls-ol-pl-name', text: p.plotlineName(pl, this.outline) });
      iconBtn(pill, 'more-vertical', 'Plot line options', (e) => this.plotlineMenu(e, pl, i));
      pill.addEventListener('contextmenu', (e) => { e.preventDefault(); this.plotlineMenu(e, pl, i); });
    });
    const addPl = grid.createDiv('ls-ol-addpl');
    iconBtn(addPl, 'plus', 'Add plot line', () => this.addPlotline(), 'ls-add');

    // beat rows
    m.beats.forEach((beat, bi) => {
      const bc = grid.createDiv('ls-ol-beat');
      const { act, name } = splitBeatTitle(beat.title);
      const pill = bc.createEl('button', { cls: 'ls-ol-beat-pill', attr: { 'aria-label': `${beat.title}: options` } });
      if (act) pill.createSpan({ cls: 'ls-ol-act', text: act });
      pill.createSpan({ cls: 'ls-ol-beat-name', text: name });
      pill.addEventListener('click', (e) => this.beatMenu(e, beat, bi));
      const hint = bc.createEl('textarea', { cls: 'ls-ol-hint', attr: { rows: '1', placeholder: 'What this beat should do' } });
      hint.value = beat.hint;
      this.plugin.typing.trackInput(hint, () => this.outline);
      hint.addEventListener('input', () => { this.fit(hint, 0); beat.hint = hint.value.trim(); this.saveSoon(); });

      m.plotlines.forEach((pl, pi) => {
        const cell = grid.createDiv(`ls-ol-cell ls-c-${this.colorOf(pl, pi)}`);
        const cards = beat.cells[pl] || [];
        cards.forEach((card, ci) => this.renderCard(cell, beat, pl, card, ci));
        const add = cell.createEl('button', { cls: 'ls-ol-addcard', attr: { 'aria-label': `Add a card to ${name}, ${p.plotlineName(pl, this.outline)}` } });
        setIcon(add, 'plus');
        add.addEventListener('click', () => this.addCard(beat, pl, cards.length, true));
      });
      grid.createDiv('ls-ol-spacer');
    });

    this.swap(root, token);
  }

  renderCard(cell, beat, pl, card, ci) {
    const p = this.plugin;
    const el = cell.createDiv('ls-ol-card');
    const tools = el.createDiv('ls-ol-card-tools');
    iconBtn(tools, 'paperclip', 'Attach a scene or chapter', (e) => this.attachMenu(e, card));
    iconBtn(tools, 'plus', 'Add a card below', () => this.addCard(beat, pl, ci + 1, true));
    iconBtn(tools, 'more-horizontal', 'Card options', (e) => this.cardMenu(e, beat, pl, card, ci));
    const ta = el.createEl('textarea', { cls: 'ls-ol-card-input', attr: { rows: '2', placeholder: 'What happens here?' } });
    ta.value = card.text;
    this.plugin.typing.trackInput(ta, () => this.outline);
    ta.dataset.card = `${this.model.beats.indexOf(beat)}:${pl}:${ci}`;
    ta.addEventListener('input', () => { this.fit(ta, 52); card.text = ta.value; this.saveSoon(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.addCard(beat, pl, ci + 1, true); }
    });
    if (card.attach.length) {
      const chips = el.createDiv('ls-chips ls-ol-attach');
      card.attach.forEach((a, ai) => {
        let label, onClick, ok = true;
        if (a.kind === 'chapter') {
          const ch = this.data.chapters.find((c) => c.name === a.name);
          ok = !!ch;
          label = a.name;
          onClick = () => p.openChapters(this.file);
        } else {
          const f = p.resolveLink(a.link, this.outline);
          ok = !!f;
          label = f ? `${f.parent && f.parent !== this.file.parent ? f.parent.name + ' / ' : ''}${f.basename}` : linkText(a.link);
          onClick = () => f && p.openNote(f);
        }
        const chip = chips.createDiv('ls-chip' + (ok ? '' : ' is-unresolved'));
        setIcon(chip.createSpan('ls-chip-icon'), a.kind === 'chapter' ? 'folder' : 'file-text');
        chip.createSpan({ text: label });
        if (ok) chip.addEventListener('click', onClick);
        iconBtn(chip, 'x', 'Detach', () => { card.attach.splice(ai, 1); this.commit(); });
      });
    }
  }

  fit(ta, min) { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, min || 0) + 'px'; }

  swap(root, token) {
    if (token !== this.token) return;
    const oldWrap = this.contentEl.querySelector('.ls-ol-wrap');
    const left = oldWrap ? oldWrap.scrollLeft : 0;
    const old = this.contentEl.querySelector('.ls-outline');
    const top = old ? old.scrollTop : 0;
    this.contentEl.empty();
    this.contentEl.appendChild(root);
    root.scrollTop = top;
    const wrap = root.querySelector('.ls-ol-wrap');
    if (wrap) wrap.scrollLeft = left;
    root.querySelectorAll('textarea').forEach((t) => {
      this.fit(t, t.hasClass('ls-ol-card-input') ? 52 : t.hasClass('ls-ol-synopsis') ? 56 : 0);
    });
    if (this.focusNext) {
      const el = root.querySelector(`textarea[data-card="${CSS.escape(this.focusNext)}"]`);
      this.focusNext = null;
      if (el) el.focus();
    }
  }

  /* ---------- structure ---------- */

  pickStructure(name, sel, prev) {
    const apply = () => this.applyStructure(name);
    const cards = this.model.beats.reduce((n, b) => n + this.cardCount(b), 0);
    if (!cards) { apply(); return; }
    new ConfirmModal(this.app, {
      title: `Switch to ${name}?`,
      message: 'Beats with the same name keep their cards. Beats that have cards but are not part of the new structure stay at the end, so nothing is lost. Empty beats are replaced.',
      cta: 'Switch structure',
    }, apply).open();
    sel.value = prev;
  }

  async applyStructure(name) {
    const tpl = this.structures()[name];
    if (!tpl) return;
    const m = this.model;
    const used = new Set();
    const beats = tpl.map(([t, h]) => {
      const ex = m.beats.find((b) => !used.has(b) && b.title.toLowerCase() === t.toLowerCase());
      if (ex) { used.add(ex); if (!ex.hint) ex.hint = h; return ex; }
      return { title: t, hint: h, notes: '', cells: {} };
    });
    const kept = m.beats.filter((b) => !used.has(b) && (this.cardCount(b) || b.notes));
    m.beats = [...beats, ...kept];
    this.fmData.structure = name;
    await this.commit();
    if (kept.length) new Notice(`Kept ${kept.length} beat${kept.length === 1 ? '' : 's'} with cards at the end. Move the cards where they belong, then delete those beats.`, 8000);
  }

  saveAsStructure() {
    const p = this.plugin;
    new NameModal(this.app, { title: 'Save as a structure', placeholder: 'e.g. My mystery template', cta: 'Save structure' }, async (n) => {
      n = n.trim();
      if (!n) return;
      if (STRUCTURES[n]) { new Notice(`"${n}" is a built-in structure. Pick another name.`); return; }
      p.settings.customStructures = Object.assign({}, p.settings.customStructures, { [n]: this.model.beats.map((b) => [b.title, b.hint]) });
      await p.saveSettings();
      this.fmData.structure = n;
      await this.commit();
      new Notice(`Saved "${n}". It's in the structure list for every story now.`);
    }).open();
  }

  /* ---------- beats ---------- */

  addBeat(at) {
    new NameModal(this.app, { title: 'New beat', placeholder: 'e.g. Act 2: The heist goes wrong', cta: 'Add beat' }, (n) => {
      n = n.trim().replace(/^#+\s*/, '');
      if (!n) return;
      this.model.beats.splice(at, 0, { title: n, hint: '', notes: '', cells: {} });
      this.markCustom();
      this.commit();
    }).open();
  }

  markCustom() {
    const tpl = this.structures()[this.fmData.structure];
    if (!tpl) return;
    const same = tpl.length === this.model.beats.length && tpl.every(([t], i) => t === this.model.beats[i].title);
    if (!same) delete this.fmData.structure;
  }

  beatMenu(e, beat, bi) {
    const m = this.model;
    const menu = new Menu();
    addMenuItem(menu, 'Rename', 'pencil', () => new NameModal(this.app,
      { title: 'Rename beat', placeholder: 'Beat name', initial: beat.title, cta: 'Rename' }, (n) => {
        n = n.trim().replace(/^#+\s*/, '');
        if (!n || n === beat.title) return;
        beat.title = n;
        this.markCustom();
        this.commit();
      }).open());
    addMenuItem(menu, 'Add beat below', 'plus', () => this.addBeat(bi + 1));
    if (bi > 0) addMenuItem(menu, 'Move up', 'arrow-up', () => {
      [m.beats[bi - 1], m.beats[bi]] = [m.beats[bi], m.beats[bi - 1]]; this.markCustom(); this.commit();
    });
    if (bi < m.beats.length - 1) addMenuItem(menu, 'Move down', 'arrow-down', () => {
      [m.beats[bi + 1], m.beats[bi]] = [m.beats[bi], m.beats[bi + 1]]; this.markCustom(); this.commit();
    });
    menu.addSeparator();
    addMenuItem(menu, 'Delete beat', 'trash-2', () => {
      const n = this.cardCount(beat);
      const go = () => { m.beats.splice(bi, 1); this.markCustom(); this.commit(); };
      if (!n && !beat.notes) { go(); return; }
      new ConfirmModal(this.app, {
        title: `Delete "${beat.title}"?`,
        message: `Its ${n} card${n === 1 ? '' : 's'} will be deleted with it. Move them to another beat first if you want to keep them.`,
        cta: 'Delete beat',
      }, go).open();
    }, true);
    menu.showAtMouseEvent(e);
  }

  /* ---------- plot lines ---------- */

  addPlotline() {
    new NameModal(this.app, { title: 'New plot line', placeholder: 'e.g. Romance, The heir\'s secret', cta: 'Add plot line' }, (n) => {
      n = n.trim().replace(/^#+\s*/, '');
      if (!n) return;
      if (this.model.plotlines.some((x) => this.plugin.plotlineName(x, this.outline).toLowerCase() === n.toLowerCase())) {
        new Notice(`"${n}" is already a plot line.`); return;
      }
      this.model.plotlines.push(n);
      this.commit();
    }).open();
  }

  renamePlotline(from, to) {
    const m = this.model;
    m.plotlines = m.plotlines.map((x) => (x === from ? to : x));
    for (const b of m.beats) {
      if (!b.cells[from]) continue;
      b.cells[to] = (b.cells[to] || []).concat(b.cells[from]);
      delete b.cells[from];
    }
  }

  plotlineMenu(e, pl, i) {
    const p = this.plugin;
    const m = this.model;
    const arc = p.plotlineArc(pl, this.outline);
    const menu = new Menu();
    if (arc) {
      addMenuItem(menu, 'Open plot arc', 'arrow-up-right', () => p.openEntity(arc, 'arc'));
      addMenuItem(menu, 'Unlink from plot arc', 'unlink', () => { this.renamePlotline(pl, arc.basename); this.commit(); });
    } else {
      addMenuItem(menu, 'Rename', 'pencil', () => new NameModal(this.app,
        { title: 'Rename plot line', placeholder: 'Plot line name', initial: p.plotlineName(pl, this.outline), cta: 'Rename' }, (n) => {
          n = n.trim().replace(/^#+\s*/, '');
          if (!n || n === pl) return;
          if (m.plotlines.includes(n)) { new Notice(`"${n}" is already a plot line.`); return; }
          this.renamePlotline(pl, n);
          this.commit();
        }).open());
      addMenuItem(menu, 'Link to a plot arc entry', 'route', () => new EntitySuggest(this.app, p, ['arc'], (f) => {
        const link = p.linkTo(f, this.outline);
        if (m.plotlines.includes(link)) { new Notice(`${f.basename} already has a column.`); return; }
        this.renamePlotline(pl, link);
        this.commit();
      }).open());
    }
    if (i > 0) addMenuItem(menu, 'Move left', 'arrow-left', () => {
      [m.plotlines[i - 1], m.plotlines[i]] = [m.plotlines[i], m.plotlines[i - 1]]; this.commit();
    });
    if (i < m.plotlines.length - 1) addMenuItem(menu, 'Move right', 'arrow-right', () => {
      [m.plotlines[i + 1], m.plotlines[i]] = [m.plotlines[i], m.plotlines[i + 1]]; this.commit();
    });
    menu.addSeparator();
    addMenuItem(menu, 'Delete plot line', 'trash-2', () => {
      const n = m.beats.reduce((s, b) => s + (b.cells[pl] || []).length, 0);
      const go = () => {
        m.plotlines = m.plotlines.filter((x) => x !== pl);
        for (const b of m.beats) delete b.cells[pl];
        this.commit();
      };
      if (!n) { go(); return; }
      new ConfirmModal(this.app, {
        title: `Delete "${p.plotlineName(pl, this.outline)}"?`,
        message: `Its ${n} card${n === 1 ? '' : 's'} will be deleted too.${arc ? ' The plot arc entry itself stays.' : ''}`,
        cta: 'Delete plot line',
      }, go).open();
    }, true);
    menu.showAtMouseEvent(e);
  }

  /* ---------- cards ---------- */

  addCard(beat, pl, at, focus) {
    const cards = beat.cells[pl] || (beat.cells[pl] = []);
    cards.splice(at, 0, { text: '', attach: [] });
    if (focus) this.focusNext = `${this.model.beats.indexOf(beat)}:${pl}:${at}`;
    this.commit();
  }

  cardMenu(e, beat, pl, card, ci) {
    const p = this.plugin;
    const m = this.model;
    const cards = beat.cells[pl];
    const menu = new Menu();
    const moveTo = (b2, pl2) => {
      cards.splice(cards.indexOf(card), 1);
      (b2.cells[pl2] || (b2.cells[pl2] = [])).push(card);
      this.commit();
    };
    if (ci > 0) addMenuItem(menu, 'Move up', 'arrow-up', () => { [cards[ci - 1], cards[ci]] = [cards[ci], cards[ci - 1]]; this.commit(); });
    if (ci < cards.length - 1) addMenuItem(menu, 'Move down', 'arrow-down', () => { [cards[ci + 1], cards[ci]] = [cards[ci], cards[ci + 1]]; this.commit(); });
    addMenuItem(menu, 'Move to another beat', 'list-ordered', () => new ItemSuggest(this.app,
      m.beats.filter((b) => b !== beat), (b) => b.title, 'Move card to beat', (b) => moveTo(b, pl)).open());
    if (m.plotlines.length > 1) addMenuItem(menu, 'Move to another plot line', 'columns', () => new ItemSuggest(this.app,
      m.plotlines.filter((x) => x !== pl), (x) => p.plotlineName(x, this.outline), 'Move card to plot line', (x) => moveTo(beat, x)).open());
    menu.addSeparator();
    addMenuItem(menu, 'Attach a scene', 'file-text', () => this.attachScene(card));
    addMenuItem(menu, 'Attach a chapter', 'folder', () => this.attachChapter(card));
    addMenuItem(menu, 'Write as a new scene', 'pen-line', () => this.writeScene(card));
    menu.addSeparator();
    addMenuItem(menu, 'Delete card', 'trash-2', () => {
      const go = () => { cards.splice(cards.indexOf(card), 1); this.commit(); };
      if (!card.text.trim() && !card.attach.length) { go(); return; }
      new ConfirmModal(this.app, { title: 'Delete card?', message: 'The card and its text will be removed from the outline. Attached scenes are not touched.', cta: 'Delete card' }, go).open();
    }, true);
    menu.showAtMouseEvent(e);
  }

  attachMenu(e, card) {
    const menu = new Menu();
    addMenuItem(menu, 'Attach a scene', 'file-text', () => this.attachScene(card));
    addMenuItem(menu, 'Attach a chapter', 'folder', () => this.attachChapter(card));
    addMenuItem(menu, 'Write as a new scene', 'pen-line', () => this.writeScene(card));
    menu.showAtMouseEvent(e);
  }

  attachScene(card) {
    const p = this.plugin;
    const scenes = this.data.chapters.flatMap((c) => c.scenes.map((s) => s.file));
    if (!scenes.length) { new Notice('This story has no scenes yet. Use "Write as a new scene" to make one from this card.'); return; }
    new FileSuggest(this.app, scenes, 'Attach a scene', (f) => {
      const link = p.linkTo(f, this.outline);
      if (!card.attach.some((a) => a.kind === 'scene' && p.resolveLink(a.link, this.outline) === f)) card.attach.push({ kind: 'scene', link });
      this.commit();
    }, (f) => `${f.parent ? f.parent.name + ' / ' : ''}${f.basename}`).open();
  }

  attachChapter(card) {
    if (!this.data.chapters.length) { new Notice('This story has no chapters yet.'); return; }
    new ChapterSuggest(this.app, this.data.chapters, (ch) => {
      if (!card.attach.some((a) => a.kind === 'chapter' && a.name === ch.name)) card.attach.push({ kind: 'chapter', name: ch.name });
      this.commit();
    }).open();
  }

  writeScene(card) {
    const p = this.plugin;
    const make = async (ch) => {
      const words = card.text.split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
      const name = sanitize(words.replace(/[.,;:!?]+$/, '')) || 'Scene';
      const max = ch.scenes.reduce((mx, s) => (Number.isFinite(s.order) ? Math.max(mx, s.order) : mx), ch.scenes.length);
      const f = await p.createScene(ch.folder.path, name, max + 1);
      if (card.text.trim()) {
        await this.app.vault.process(f, (d) => `${d.replace(/\s+$/, '')}\n\n%%\nOutline: ${card.text.trim()}\n%%\n\n`);
      }
      card.attach.push({ kind: 'scene', link: p.linkTo(f, this.outline) });
      await this.commit();
      p.openNote(f);
    };
    if (!this.data.chapters.length) {
      (async () => {
        const folder = p.uniqueFolder(this.file.parent.path, 'Chapter 1');
        await p.ensureFolder(folder);
        const tf = this.app.vault.getAbstractFileByPath(folder);
        await make({ name: folder.split('/').pop(), folder: tf, scenes: [] });
        this.data = await p.storyData(this.file);
      })();
      return;
    }
    new ChapterSuggest(this.app, this.data.chapters, make).open();
  }
}

/* ------------------------------------------------------------------ */
/* Sidebar panel                                                       */
/* ------------------------------------------------------------------ */

/* A compact home for a sidebar. It moves between its own pages (back / home) instead of
   opening tabs, opens scenes in the editor you were writing in, and hands detailed
   editing to the full views. */
class PanelView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.stack = [{ page: 'home' }];
    this.query = '';
    this.token = 0;
    this.current = null;
    this.chapterOpen = new Map();
    this.secOpen = new Map();
    this.requestRender = debounce(() => this.render(), 800, true);
    this.quickRender = debounce(() => this.render(), 120, true);
    this.searchRender = debounce(() => this.render(), 150, true);
  }
  getViewType() { return VIEW_PANEL; }
  getDisplayText() { return 'Loresmith'; }
  getIcon() { return 'book-marked'; }
  getState() { return { stack: this.stack.map((s) => ({ page: s.page, path: s.path, type: s.type })) }; }
  async setState(state, result) {
    if (state && Array.isArray(state.stack) && state.stack.length) this.stack = state.stack.map((s) => Object.assign({}, s));
    await super.setState(state, result);
    this.render();
  }
  async onOpen() {
    this.contentEl.addClass('ls-host');
    const p = this.plugin;
    this.current = this.app.workspace.getActiveFile();
    const inRoot = (path) => !!path && path.startsWith(p.rootPath() + '/');
    this.registerEvent(this.app.workspace.on('file-open', (f) => {
      if (!f || f === this.current) return;
      this.current = f;
      this.quickRender();
    }));
    this.registerEvent(this.app.metadataCache.on('changed', (f) => {
      if (!inRoot(f.path)) return;
      // Typing in a scene only changes what home and story pages show.
      const page = this.top().page;
      if (p.typeOf(f) === 'scene' && page !== 'home' && page !== 'story') return;
      this.requestRender();
    }));
    this.registerEvent(this.app.vault.on('rename', (f, old) => {
      for (const s of this.stack) if (s.path === old) s.path = f.path;
      if (inRoot(f.path) || inRoot(old)) this.requestRender();
    }));
    const any = (f) => { if (inRoot(f.path)) this.requestRender(); };
    this.registerEvent(this.app.vault.on('create', any));
    this.registerEvent(this.app.vault.on('delete', any));
    /* The writing log's Today tab keeps itself current while it's on screen, and the home page's
       typing time and pomodoro tick along with it. */
    this.registerInterval(window.setInterval(() => {
      const page = this.top().page;
      const live = (page === 'writing' && p.settings.typing.tab === 'today') || (page === 'home' && p.typing.pomo);
      if (!live || !this.containerEl.isShown()) return;
      const a = document.activeElement;
      if (a && this.containerEl.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      this.render();
    }, 5000));
    this.render();
  }

  /* The writing log's views are shared with the main view; they draw into sidebar sections. */
  panel(parent, o) { return this.sec(parent, o.title, { color: o.color, count: o.count, tools: o.extra }); }

  /* ---------- navigation ---------- */

  top() { return this.stack[this.stack.length - 1]; }
  keyOf(s) { return `${s.page}:${s.path || s.type || ''}`; }
  fileAt(path) {
    const f = path && this.app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? f : null;
  }
  go(entry) {
    if (this.keyOf(entry) === this.keyOf(this.top())) return;
    const body = this.contentEl.querySelector('.ls-pv-body');
    if (body) this.top().scroll = body.scrollTop;
    this.stack.push(entry);
    if (this.stack.length > 30) this.stack.splice(1, 1);
    this.query = '';
    this.app.workspace.requestSaveLayout();
    this.render();
  }
  back() {
    if (this.stack.length < 2) return;
    this.stack.pop();
    this.query = '';
    this.app.workspace.requestSaveLayout();
    this.render();
  }
  home() {
    this.stack = [{ page: 'home' }];
    this.query = '';
    this.app.workspace.requestSaveLayout();
    this.render();
  }
  /* Where a tap on a file goes: stories and lore entries stay in the panel, everything else opens in the editor. */
  show(f) {
    const t = this.plugin.typeOf(f);
    if (t === 'story') this.go({ page: 'story', path: f.path });
    else if (t && TYPES[t] && !TYPES[t].plain) this.go({ page: 'entry', path: f.path });
    else if (t === 'outline') { const st = this.plugin.storyFor(f); if (st) this.plugin.openOutline(st); }
    else this.plugin.openInMain(f);
  }
  validate() {
    const root = this.plugin.projectPath() + '/';
    this.stack = this.stack.filter((s) => {
      if (s.page === 'category') return !!TYPES[s.type];
      if (s.page === 'story' || s.page === 'entry') { const f = this.fileAt(s.path); return !!f && f.path.startsWith(root); }
      return s.page === 'home' || s.page === 'writing';
    });
    if (!this.stack.length || this.stack[0].page !== 'home') this.stack.unshift({ page: 'home' });
  }
  /* The chapters board's menus and actions, borrowed so the panel edits stories the same way. */
  board(story) {
    const b = Object.create(ChaptersView.prototype);
    b.app = this.app;
    b.plugin = this.plugin;
    b.file = story;
    return b;
  }
  subtitle(f, type) { return OverviewView.prototype.subtitle.call(this, f, type); }

  /* ---------- render ---------- */

  async render() {
    const token = ++this.token;
    const p = this.plugin;
    const root = document.createElement('div');
    root.addClass('ls-root', 'ls-pv');
    const comp = this.addChild(new Component());

    if (!p.listProjects().length) {
      const w = root.createDiv('ls-pv-body ls-pv-welcome');
      w.createEl('p', { cls: 'ls-muted', text: 'No projects yet.' });
      textBtn(w, 'Start one in the overview', () => p.openOverview(), 'mod-cta');
    } else {
      this.validate();
      const top = this.top();
      this.renderBar(root.createDiv('ls-pv-bar'), top);
      const body = root.createDiv('ls-pv-body');
      if (top.page === 'story') await this.renderStory(body, this.fileAt(top.path));
      else if (top.page === 'writing') await this.renderWriting(body, p.index());
      else if (top.page === 'category') this.renderCategory(body, top.type);
      else if (top.page === 'entry') await this.renderEntry(body, this.fileAt(top.path), comp);
      else await this.renderHome(body);
    }

    if (token !== this.token) { this.removeChild(comp); return; }
    if (this.mdComp) this.removeChild(this.mdComp);
    this.mdComp = comp;
    const hadFocus = this.searchEl && document.activeElement === this.searchEl;
    const caret = hadFocus ? this.searchEl.selectionStart : 0;
    const old = this.contentEl.querySelector('.ls-pv-body');
    const key = this.keyOf(this.top());
    const scroll = old && this.lastKey === key ? old.scrollTop : (this.top().scroll || 0);
    this.contentEl.empty();
    this.contentEl.appendChild(root);
    this.lastKey = key;
    const body = root.querySelector('.ls-pv-body');
    if (body) body.scrollTop = scroll;
    this.searchEl = root.querySelector('.ls-search');
    if (hadFocus && this.searchEl) { this.searchEl.focus(); this.searchEl.setSelectionRange(caret, caret); }
  }

  renderBar(bar, top) {
    const p = this.plugin;
    if (this.stack.length > 1) {
      iconBtn(bar, 'arrow-left', 'Back', () => this.back());
      iconBtn(bar, 'home', 'Home', () => this.home());
      const f = this.fileAt(top.path);
      bar.createSpan({ cls: 'ls-pv-crumb', text: top.page === 'category' ? TYPES[top.type].plural : top.page === 'writing' ? 'Writing log' : (f ? f.basename : '') });
    } else {
      const sel = bar.createEl('select', { cls: 'dropdown ls-pv-project' });
      for (const n of p.listProjects()) sel.createEl('option', { text: n, value: n });
      sel.value = p.settings.activeProject;
      sel.addEventListener('change', async () => {
        p.settings.activeProject = sel.value;
        await p.saveSettings();
        p.refreshOverviews();
        this.home();
      });
    }
    iconBtn(bar, 'arrow-up-right', 'Open in main area', () => {
      const f = this.fileAt(top.path);
      if (top.page === 'story' && f) p.openChapters(f);
      else if (top.page === 'entry' && f) p.openEntity(f);
      else p.openOverview(top.page === 'category' ? top.type : top.page === 'writing' ? 'goals' : undefined);
    });
  }

  sec(parent, title, o = {}) {
    const s = parent.createDiv({ cls: `ls-pv-sec ls-c-${o.color || 'base'}` });
    const h = s.createDiv('ls-pv-sec-head');
    h.createSpan({ cls: 'ls-pv-sec-title', text: title });
    if (o.count != null) h.createSpan({ cls: 'ls-pv-count', text: String(o.count) });
    const tools = h.createDiv('ls-pv-tools');
    if (o.tools) o.tools(tools);
    return s.createDiv('ls-pv-sec-body');
  }

  navRow(parent, o) {
    const row = parent.createDiv({ cls: 'ls-row ls-pv-row' + (o.color ? ` ls-c-${o.color}` : '') });
    if (o.avatar) this.avatar(row, o.avatar);
    else if (o.icon) setIcon(row.createSpan('ls-row-icon'), o.icon);
    row.createSpan({ cls: 'ls-row-name', text: o.label });
    if (o.meta != null && o.meta !== '') row.createSpan({ cls: 'ls-row-meta', text: String(o.meta) });
    setIcon(row.createSpan({ cls: 'ls-pv-go', attr: { 'aria-hidden': 'true' } }), o.out ? 'arrow-up-right' : 'chevron-right');
    row.addEventListener('click', o.onClick);
    if (o.onMenu) row.addEventListener('contextmenu', (e) => { e.preventDefault(); o.onMenu(e); });
    return row;
  }

  /* How the people in this scene are related, and which of them meet here for the first time. */
  sceneTies(card, scene, cast) {
    const p = this.plugin;
    const people = [...new Set(cast.map((s) => p.resolveLink(s, scene)).filter((c) => c && p.typeOf(c) === 'character'))];
    if (people.length < 2) return;
    const box = card.createDiv('ls-pv-ties');
    const rows = [];
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i], b = people[j];
        const rel = p.relationBetween(a, b);
        const row = { a, b, rel, el: null };
        rows.push(row);
      }
    }
    const label = box.createDiv({ cls: 'ls-pv-label', text: 'Between them' });
    const list = box.createDiv('ls-pv-tie-list');
    for (const r of rows) {
      r.el = list.createDiv('ls-pv-tie');
      const pair = r.el.createDiv('ls-tie-pair is-compact');
      avatarEl(pair, p, r.a, 'is-tiny');
      const ic = pair.createSpan('ls-tie-link');
      if (r.rel) { ic.addClass(`ls-c-${EDGE_KINDS[REL[r.rel.kind].edge].color}`); setIcon(ic, REL[r.rel.kind].icon); }
      else setIcon(ic, 'minus');
      avatarEl(pair, p, r.b, 'is-tiny');
      r.el.createSpan({ cls: 'ls-pv-tie-text', text: r.rel ? `${r.b.basename.split(/\s+/)[0]} is ${r.a.basename.split(/\s+/)[0]}'s ${r.rel.label.toLowerCase()}` : `${r.a.basename.split(/\s+/)[0]} and ${r.b.basename.split(/\s+/)[0]}` });
    }
    /* First meetings need every scene's cast, so they arrive a moment later. */
    p.meetings().then(({ pairs }) => {
      if (!box.isConnected) return;
      let any = false;
      for (const r of rows) {
        const sc = pairs.get(pairKey(r.a, r.b)) || [];
        const i = sc.findIndex((h) => h.scene === scene);
        if (i === 0) { r.el.createSpan({ cls: 'ls-pill is-first', text: 'First meeting' }); any = true; }
        else if (i > 0) r.el.createSpan({ cls: 'ls-pill is-faint', text: `${ordinal(i + 1)} scene together` });
        else if (!r.rel) r.el.remove();
      }
      if (!list.childElementCount) box.remove();
      else if (any) label.setText('Between them (some meet here first)');
    }, () => {});
  }

  avatar(parent, f, large) {
    const a = parent.createSpan('ls-pv-avatar' + (large ? ' is-large' : ''));
    const img = this.plugin.resolveLink(this.plugin.fm(f).image, f);
    if (img) a.createEl('img', { attr: { src: this.app.vault.getResourcePath(img), alt: '', loading: 'lazy' } });
    else a.setText(initials(f.basename));
    return a;
  }

  statusDot(parent, file, status) {
    const dot = parent.createEl('button', {
      cls: `ls-status ls-status-${status}`,
      attr: { 'aria-label': `${cap(status)}. Click to change.` },
    });
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = STATUSES[(STATUSES.indexOf(status) + 1) % STATUSES.length];
      this.app.fileManager.processFrontMatter(file, (fm) => { fm.status = next; });
    });
    return dot;
  }

  linkChips(parent, list, source) {
    const p = this.plugin;
    const box = parent.createDiv('ls-chips');
    for (const s of list) {
      const f = p.resolveLink(s, source);
      const chip = box.createDiv('ls-chip' + (f ? '' : ' is-unresolved'));
      chip.createSpan({ text: f ? f.basename : linkText(s) });
      if (f) chip.addEventListener('click', () => this.show(f));
    }
    return box;
  }

  /* ---------- home ---------- */

  async renderHome(body) {
    const p = this.plugin;
    const idx = p.index();

    this.renderNow(body);

    const today = p.wordsOn(dayKey());
    const goal = Number(p.settings.dailyGoal) || 0;
    const g = body.createDiv({ cls: 'ls-pv-goal ls-c-green' + (goal && today >= goal ? ' is-met' : ''), attr: { 'aria-label': 'Open writing goals' } });
    g.createSpan({ text: goal ? `${fmtNum(today)} / ${fmtNum(goal)} words today` : `${fmtNum(today)} words today` });
    if (p.typing.loaded) {
      const tt = p.typing.dayStats(p.typing.cachedAll(), dayKey(), ['scene']);
      if (tt.active) g.createSpan({ cls: 'ls-muted', text: ` · ${fmtDur(tt.active)} in scenes` });
    }
    if (goal) g.createDiv('ls-pv-meter').createDiv('ls-pv-meter-fill').style.width = `${Math.min(100, (today / goal) * 100)}%`;
    if (p.typing.pomo) {
      const pm = p.typing.pomo;
      g.createDiv({ cls: 'ls-pv-pomo', text: pm.done ? 'Pomodoro done. Take a break.' : `Pomodoro: ${Math.ceil((pm.target - pm.active) / 60000)} min of typing left` });
    }
    g.setAttr('aria-label', 'Open writing log');
    g.addEventListener('click', () => this.go({ page: 'writing' }));

    const datas = await Promise.all(idx.story.map((f) => p.storyData(f)));
    const sb = this.sec(body, 'Stories', {
      color: 'cyan', count: idx.story.length,
      tools: (t) => iconBtn(t, 'plus', 'New story', () => p.promptCreate('story'), 'ls-add'),
    });
    if (!idx.story.length) sb.createDiv({ cls: 'ls-muted ls-pv-pad', text: 'No stories yet.' });
    idx.story.forEach((f, i) => this.navRow(sb, {
      icon: 'book-open', color: 'cyan', label: f.basename, meta: fmtNum(datas[i].words),
      onClick: () => this.go({ page: 'story', path: f.path }),
    }));

    this.navRow(body.createDiv('ls-pv-sec-body ls-pv-solo'), { icon: 'target', color: 'green', label: 'Writing log', meta: 'today, trend, authorship', onClick: () => this.go({ page: 'writing' }) });

    const pb = this.sec(body, 'Plotting', { color: 'purple' });
    this.navRow(pb, { icon: TYPES.arc.icon, color: TYPES.arc.color, label: TYPES.arc.plural, meta: idx.arc.length, onClick: () => this.go({ page: 'category', type: 'arc' }) });
    this.navRow(pb, { icon: TYPES.note.icon, label: TYPES.note.plural, meta: idx.note.length, onClick: () => this.go({ page: 'category', type: 'note' }) });
    this.navRow(pb, { icon: 'list-ordered', color: 'cyan', label: 'Story outline', out: true, onClick: () => p.pickStory((s) => p.openOutline(s)) });
    this.navRow(pb, { icon: 'network', color: 'pink', label: 'Relations web', out: true, onClick: () => p.openWeb() });
    this.navRow(pb, { icon: 'users', color: 'red', label: 'Who has met whom', out: true, onClick: () => p.openOverview('meetings') });
    this.navRow(pb, { icon: 'dices', color: 'yellow', label: 'Name builder', onClick: () => new NameBuilderModal(this.app, p).open() });

    const genb = this.sec(body, 'Generators', { color: 'yellow' });
    for (const [k, g] of Object.entries(GENERATORS)) this.navRow(genb, { icon: g.icon, color: g.color, label: g.label, out: true, onClick: () => p.openOverview(`gen:${k}`) });

    for (const grp of GROUPS) {
      const gb = this.sec(body, grp);
      if (grp === 'History') {
        this.navRow(gb, { icon: 'history', color: 'yellow', label: 'Timeline', out: true, onClick: () => p.openOverview('timeline') });
        this.navRow(gb, { icon: 'calendar-days', color: 'yellow', label: 'Calendar', out: true, onClick: () => p.openOverview('calendar') });
      }
      for (const [k, d] of Object.entries(TYPES)) {
        if (d.group !== grp) continue;
        this.navRow(gb, { icon: d.icon, color: d.color, label: d.plural, meta: idx[k].length, onClick: () => this.go({ page: 'category', type: k }) });
      }
    }
  }

  /* What is open in the editor right now: a scene gets its cast, an entry gets a shortcut. */
  renderNow(body) {
    const p = this.plugin;
    const f = this.current && this.fileAt(this.current.path);
    const root = p.projectPath();
    if (!f || !root || !f.path.startsWith(root + '/')) return;
    const t = p.typeOf(f);
    if (t === 'scene') {
      this.sceneCard(this.sec(body, 'Now writing', { color: 'cyan' }), f);
    } else if (t && TYPES[t] && !TYPES[t].plain) {
      const nb = this.sec(body, 'Open now', { color: TYPES[t].color });
      this.navRow(nb, {
        icon: TYPES[t].icon, color: TYPES[t].color, avatar: TYPES[t].portrait ? f : null,
        label: f.basename, meta: TYPES[t].label, onClick: () => this.show(f),
      });
    }
  }

  sceneCard(parent, f) {
    const p = this.plugin;
    const fm = p.fm(f);
    const status = STATUSES.includes(fm.status) ? fm.status : 'draft';
    const card = parent.createDiv('ls-pv-scene-card ls-c-cyan');
    const head = card.createDiv('ls-pv-scene-head');
    this.statusDot(head, f, status);
    head.createSpan({ cls: 'ls-pv-scene-name', text: f.basename });

    const story = p.storyFor(f);
    if (story) {
      const where = card.createDiv('ls-pv-where');
      const sl = where.createSpan({ cls: 'ls-pv-link', text: story.basename });
      sl.addEventListener('click', () => this.go({ page: 'story', path: story.path }));
      if (f.parent && f.parent !== story.parent) where.createSpan({ text: ` · ${f.parent.name}` });
    }

    const when = p.presentOf(f);
    if (when) {
      const w = card.createDiv('ls-pv-when');
      setIcon(w.createSpan('ls-pv-when-icon'), 'calendar-days');
      const t = w.createDiv();
      t.createDiv({ text: when.raw });
      const day = p.describeDay(when);
      if (day) t.createDiv({ cls: 'ls-muted', text: day });
    }

    card.createDiv({ cls: 'ls-pv-label', text: 'In this scene' });
    const cast = toArr(fm.characters);
    const box = card.createDiv('ls-chips ls-c-red');
    for (const s of cast) {
      const c = p.resolveLink(s, f);
      const chip = box.createDiv('ls-chip' + (c ? '' : ' is-unresolved'));
      chip.createSpan({ text: c ? c.basename : linkText(s) });
      if (c) chip.addEventListener('click', () => this.show(c));
      iconBtn(chip, 'x', 'Remove from scene', () => p.setCast(f, cast.filter((x) => x !== s)));
    }
    const add = (c) => {
      const l = p.linkTo(c, f);
      if (!cast.some((x) => linkText(x) === linkText(l))) p.setCast(f, [...cast, l]);
    };
    textBtn(box, 'Add character', () => new EntitySuggest(this.app, p, ['character'], add).open(), 'ls-chip-add');
    this.sceneTies(card, f, cast);

    // Characters linked in the text but not in the cast: one tap adds them.
    const inCast = new Set(cast.map((s) => p.resolveLink(s, f)).filter(Boolean));
    const links = this.app.metadataCache.resolvedLinks[f.path] || {};
    const mentioned = Object.keys(links)
      .map((path) => this.fileAt(path))
      .filter((c) => c && !inCast.has(c) && p.typeOf(c) === 'character')
      .sort((a, b) => natural(a.basename, b.basename));
    if (mentioned.length) {
      card.createDiv({ cls: 'ls-pv-label', text: 'Mentioned' });
      const mb = card.createDiv('ls-chips ls-c-red');
      for (const c of mentioned) {
        const chip = mb.createDiv('ls-chip is-mentioned');
        chip.createSpan({ text: c.basename });
        chip.addEventListener('click', () => this.show(c));
        iconBtn(chip, 'plus', 'Add to scene', () => add(c));
      }
    }

    // Who is this scene for, at what age
    const ages = cast.map((s) => p.resolveLink(s, f)).filter(Boolean)
      .map((c) => ({ c, a: p.ageShort(p.fm(c), when) })).filter((x) => x.a);
    if (ages.length) {
      card.createDiv({ cls: 'ls-pv-label', text: 'Ages here' });
      const ab = card.createDiv('ls-chips');
      for (const { c, a } of ages) {
        const chip = ab.createDiv({ cls: 'ls-chip' + (a.warn ? ' is-warn' : ''), text: `${c.basename.split(/\s+/)[0]}: ${a.text}` });
        chip.addEventListener('click', () => this.show(c));
      }
    }

    // Moodboard and invented words fill in after the scene text is read.
    const mood = p.sceneMoodboard(f);
    if (mood.length) {
      card.createDiv({ cls: 'ls-pv-label', text: 'Moodboard' });
      const strip = card.createDiv('ls-mood is-strip');
      for (const m of mood.slice(0, 16)) {
        const cell = strip.createDiv({ cls: 'ls-mood-cell', attr: { 'aria-label': m.from } });
        cell.createEl('img', { attr: { src: this.app.vault.getResourcePath(m.file), alt: m.file.basename, loading: 'lazy' } });
        cell.addEventListener('click', () => this.app.workspace.getLeaf('tab').openFile(m.file));
      }
    }
    const wordsBox = card.createDiv();
    this.app.vault.cachedRead(f).then((text) => {
      const words = p.wordsIn(text);
      if (!words.length) return;
      wordsBox.createDiv({ cls: 'ls-pv-label', text: 'Words in this scene' });
      const list = wordsBox.createDiv('ls-pv-words');
      for (const w of words) {
        const wfm = p.fm(w);
        const row = list.createDiv('ls-pv-word');
        row.createSpan({ cls: 'ls-pv-word-name', text: w.basename });
        if (wfm.meaning) row.createSpan({ cls: 'ls-muted', text: String(wfm.meaning) });
        row.addEventListener('click', () => this.show(w));
      }
    });
  }

  /* ---------- story ---------- */

  async renderStory(body, story) {
    const p = this.plugin;
    const fm = p.fm(story);
    const data = await p.storyData(story);
    const board = this.board(story);
    const names = data.chapters.map((c) => c.name);

    const head = body.createDiv('ls-pv-head ls-c-cyan');
    const ht = head.createDiv('ls-pv-head-text');
    const tr = ht.createDiv('ls-pv-title-row');
    tr.createSpan({ cls: 'ls-pv-title', text: story.basename });
    if (fm.status) tr.createSpan({ cls: 'ls-pill', text: String(fm.status) });
    const goal = numOrNull(fm.word_goal);
    const n = data.chapters.length;
    ht.createDiv({ cls: 'ls-pv-sub', text: `${n} chapter${n === 1 ? '' : 's'} · ${fmtNum(data.words)}${goal ? ` / ${fmtNum(goal)}` : ''} words` });
    if (goal) ht.createDiv('ls-pv-meter').createDiv('ls-pv-meter-fill').style.width = `${Math.min(100, (data.words / goal) * 100)}%`;

    const acts = body.createDiv('ls-pv-actions');
    textBtn(acts, 'Board', () => p.openChapters(story));
    textBtn(acts, 'Outline', () => p.openOutline(story));
    textBtn(acts, 'Details', () => p.openEntity(story, 'story'));
    iconBtn(acts, 'more-horizontal', 'More', (e) => {
      const m = new Menu();
      addMenuItem(m, 'Compile to one note', 'file-stack', () => p.compileStory(story));
      addMenuItem(m, 'Open as note', 'file-text', () => p.openInMain(story));
      m.showAtMouseEvent(e);
    });

    const parsed = parseSections(splitFm(await this.app.vault.cachedRead(story)).body);
    const syn = secText(findSec(parsed, 'Synopsis')).replace(/[#*_`>~[\]]/g, '').replace(/\s+/g, ' ').trim();
    if (syn) body.createDiv({ cls: 'ls-pv-snippet', text: syn.length > 280 ? syn.slice(0, 280).trim() + '…' : syn });
    const mains = toArr(fm.mainCharacters);
    if (mains.length) this.linkChips(body.createDiv('ls-pv-pad ls-c-red'), mains, story);

    const cb = this.sec(body, 'Chapters', { color: 'cyan', count: n });
    data.chapters.forEach((ch, ci) => {
      const key = ch.folder.path;
      const hasCurrent = !!this.current && ch.scenes.some((s) => s.file === this.current);
      const isOpen = this.chapterOpen.has(key) ? this.chapterOpen.get(key) : (hasCurrent || n <= 3);
      const wrap = cb.createDiv('ls-pv-chapter' + (isOpen ? ' is-open' : ''));
      const h = wrap.createDiv('ls-pv-chapter-head');
      setIcon(h.createSpan('ls-pv-chev'), isOpen ? 'chevron-down' : 'chevron-right');
      h.createSpan({ cls: 'ls-pv-chapter-name', text: ch.name });
      if (!isOpen && hasCurrent) h.createSpan({ cls: 'ls-pv-here', attr: { 'aria-label': 'You are writing in this chapter' } });
      h.createSpan({ cls: 'ls-words', text: fmtNum(ch.words) });
      iconBtn(h, 'more-vertical', 'Chapter options', (e) => board.chapterMenu(e, ch, ci, data, names));
      h.addEventListener('click', () => { this.chapterOpen.set(key, !isOpen); this.render(); });
      h.addEventListener('contextmenu', (e) => { e.preventDefault(); board.chapterMenu(e, ch, ci, data, names); });
      if (!isOpen) return;

      const list = wrap.createDiv('ls-pv-scenes');
      ch.scenes.forEach((sc, si) => {
        const row = list.createDiv('ls-pv-scene' + (sc.file === this.current ? ' is-current' : ''));
        this.statusDot(row, sc.file, sc.status);
        row.createSpan({ cls: 'ls-scene-name', text: sc.file.basename });
        const cast = row.createEl('button', { cls: 'ls-cast-btn clickable-icon', attr: { 'aria-label': 'Characters in this scene' } });
        setIcon(cast.createSpan(), 'users');
        if (sc.cast) cast.createSpan({ text: String(sc.cast) });
        cast.addEventListener('click', (e) => { e.stopPropagation(); new CastModal(this.app, p, sc.file).open(); });
        row.createSpan({ cls: 'ls-words', text: fmtNum(sc.words) });
        iconBtn(row, 'more-vertical', 'Scene options', (e) => board.sceneMenu(e, sc, si, ch, data));
        row.addEventListener('click', () => p.openInMain(sc.file));
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); board.sceneMenu(e, sc, si, ch, data); });
      });
      textBtn(list, 'Add scene', () => board.addScene(ch), 'ls-chip-add');
    });
    textBtn(cb, 'New chapter', () => board.newChapter(names), 'ls-chip-add');
  }

  /* ---------- category ---------- */

  renderCategory(body, type) {
    const p = this.plugin;
    const def = TYPES[type];
    const row = body.createDiv(`ls-pv-searchrow ls-c-${def.color}`);
    const s = row.createEl('input', { type: 'search', cls: 'ls-search', attr: { placeholder: `Search ${def.plural.toLowerCase()}` } });
    s.value = this.query;
    s.addEventListener('input', () => { this.query = s.value; this.searchRender(); });
    iconBtn(row, 'folder-tree', 'Group by', (e) => {
      const m = new Menu();
      const cur = p.groupMode(type);
      for (const [mode, label, icon] of p.groupModes(type)) {
        m.addItem((it) => it.setTitle(label).setIcon(icon).setChecked(mode === cur).onClick(async () => {
          p.settings.groupBy[type] = mode;
          await p.saveSettings();
          this.render();
        }));
      }
      m.showAtMouseEvent(e);
    }, 'ls-pv-group-btn');
    iconBtn(row, 'plus', `New ${def.label.toLowerCase()}`, () => p.promptCreate(type), 'ls-add');

    let files = p.index()[type];
    const q = this.query.toLowerCase().trim();
    if (q) files = files.filter((f) => p.namesOf(f).some((a) => a.toLowerCase().includes(q)));
    if (!files.length) {
      body.createDiv({ cls: 'ls-muted ls-pv-pad', text: q ? `Nothing matches "${this.query}".` : `No ${def.plural.toLowerCase()} yet.` });
      return;
    }
    const mode = p.groupMode(type);
    const groups = q ? [{ key: '', files }] : p.groupEntries(files, type, mode);
    const grouped = p.hasGroups(groups);
    const list = body.createDiv(`ls-list ls-c-${def.color}`);
    for (const g of groups) {
      if (grouped) {
        if (p.groupHidden(type, mode, g.key)) continue;
        const folded = p.groupFolded(type, mode, g.key);
        const h = list.createDiv('ls-pv-group' + (folded ? ' is-folded' : ''));
        if (g.depth) h.style.setProperty('--ls-depth', String(g.depth));
        setIcon(h.createSpan('ls-pv-chev'), folded ? 'chevron-right' : 'chevron-down');
        h.createSpan({ cls: 'ls-pv-group-name', text: g.label });
        h.createSpan({ cls: 'ls-pv-group-count', text: String(g.total) });
        h.addEventListener('click', async () => { await p.toggleGroup(type, mode, g.key); this.render(); });
        if (folded) continue;
      }
      this.categoryRows(list, g.files, type, q, grouped ? g.depth + 1 : 0);
    }
  }

  /* Entry rows for one group, sub-entries nested under their parents. */
  categoryRows(list, files, type, q, base) {
    const p = this.plugin;
    const def = TYPES[type];
    const depth = new Map();
    if (!q) {
      const tree = p.entityTree(files, type);
      files = tree.map((t) => t.file);
      for (const t of tree) depth.set(t.file, t.depth);
    }
    for (const f of files) {
      const row = this.navRow(list, {
        icon: depth.get(f) ? 'corner-down-right' : def.icon, avatar: def.portrait ? f : null, label: f.basename, meta: this.subtitle(f, type),
        out: !!def.plain, onClick: () => this.show(f),
        onMenu: (e) => {
          const m = new Menu();
          if (!def.plain) addMenuItem(m, 'Open full page', 'arrow-up-right', () => p.openEntity(f, type));
          addMenuItem(m, 'Open as note', 'file-text', () => p.openInMain(f));
          if (WEB_TYPES.includes(type)) addMenuItem(m, 'Show in relations web', 'network', () => p.openWeb(f));
          addMenuItem(m, 'Move to folder…', 'folder-input', () => p.promptMoveToFolder(f, type));
          if (TAXA.includes(type)) addMenuItem(m, 'Move to Species, Bestiary or Flora…', 'arrow-right-left', () => p.convertMenu(e, f));
          m.addSeparator();
          addMenuItem(m, 'Delete', 'trash-2', () => p.confirmDelete(f, def.label.toLowerCase()), true);
          m.showAtMouseEvent(e);
        },
      });
      const d = (depth.get(f) || 0) + base;
      if (d) { row.addClass('ls-sub'); row.style.setProperty('--ls-depth', String(d)); }
      if (base && !depth.get(f)) row.addClass('is-grouped');
    }
  }

  /* ---------- entry (read-only quick reference) ---------- */

  async renderEntry(body, f, comp) {
    const p = this.plugin;
    const type = p.typeOf(f);
    const def = TYPES[type];
    if (!def) { body.createDiv({ cls: 'ls-muted ls-pv-pad', text: 'This note is no longer a lore entry.' }); return; }
    const fm = p.fm(f);

    const head = body.createDiv(`ls-pv-head ls-c-${def.color}`);
    if (def.portrait) this.avatar(head, f, true);
    else setIcon(head.createSpan('ls-pv-head-icon'), def.icon);
    const ht = head.createDiv('ls-pv-head-text');
    ht.createDiv({ cls: 'ls-pv-title', text: f.basename });
    ht.createDiv({ cls: 'ls-pv-sub', text: this.subtitle(f, type) || def.label });

    const acts = body.createDiv('ls-pv-actions');
    textBtn(acts, 'Edit', () => p.openEntity(f, type), 'mod-cta');
    textBtn(acts, 'Note', () => p.openInMain(f));
    if (WEB_TYPES.includes(type)) textBtn(acts, 'Web', () => p.openWeb(f));

    const tags = p.tagsOf(f);
    if (tags.length) {
      const tg = body.createDiv('ls-tags ls-pv-pad');
      for (const t of tags) tg.createSpan({ cls: 'ls-tag', text: t });
    }

    const filled = def.fields.filter((fd) => toArr(fm[fd.key]).length && fd.kind !== 'link' && fd.kind !== 'links');
    if (filled.length || type === 'character') {
      const fb = this.sec(body, 'Details', { color: def.color });
      const dl = fb.createDiv('ls-pv-fields');
      for (const fd of filled) {
        const r = dl.createDiv('ls-pv-field');
        r.createDiv({ cls: 'ls-pv-field-label', text: fd.label });
        const val = r.createDiv('ls-pv-field-value');
        if (fd.kind === 'link' || fd.kind === 'links') this.linkChips(val, toArr(fm[fd.key]), f);
        else val.setText(toArr(fm[fd.key]).join(', '));
      }
      const now = p.latestPresent();
      const neg = p.negEras();
      let extra = null;
      if (type === 'character') extra = ['Age', p.ageText(fm, now)];
      else if (type === 'organization' && now && p.toPt(fm.founded)) extra = ['Founded', cap(p.agoText(fm.founded, now))];
      else if (type === 'event' && now) {
        const sort = numOrNull(fm.year);
        const y = sort != null ? { y: sort, d: null } : p.toPt(fm.date);
        if (y) extra = ['When', cap(p.agoText(y, now))];
      } else if (type === 'holiday') extra = ['Calendar', p.holidaySummary(fm, f).join(' ')];
      if (extra && extra[1]) {
        const r = dl.createDiv('ls-pv-field');
        r.createDiv({ cls: 'ls-pv-field-label', text: extra[0] });
        r.createDiv({ cls: 'ls-pv-field-value', text: extra[1] });
      }
      if (!dl.childElementCount) fb.parentElement.remove();
    }

    if (type === 'character') {
      const rels = p.relationsOf(f);
      if (rels.length) {
        const rb = this.sec(body, 'Relationships', { color: 'red', count: new Set(rels.map((r) => r.file)).size });
        const order = Object.keys(REL);
        for (const group of REL_GROUPS) {
          const items = rels.filter((r) => (r.group || REL[r.kind].group) === group)
            .sort((a, b) => (order.indexOf(a.kind) - order.indexOf(b.kind)) || natural(a.file.basename, b.file.basename));
          if (!items.length) continue;
          rb.createDiv({ cls: 'ls-pv-label', text: group === 'Past' ? 'Past ties' : group });
          const list = rb.createDiv('ls-list');
          for (const r of items) {
            const row = this.navRow(list, { avatar: r.file, label: r.file.basename, meta: r.label, onClick: () => this.show(r.file) });
            if (r.history && r.history.length) row.setAttr('title', `Before: ${r.history.join('; ')}`);
            if (r.former) row.addClass('is-former');
            if (r.auto) { row.addClass('is-auto'); row.setAttr('aria-label', r.via); }
          }
        }
      }
    }
    const conns = p.connectionsOf(f);
    if (conns.length) {
      const cb = this.sec(body, 'Connections', { color: def.color, count: conns.reduce((n, g) => n + g.items.length, 0) });
      const dl = cb.createDiv('ls-pv-fields');
      for (const g of conns) {
        const r = dl.createDiv('ls-pv-field');
        r.createDiv({ cls: 'ls-pv-field-label', text: g.label });
        const val = r.createDiv('ls-pv-field-value ls-chips');
        for (const it of g.items) {
          const chip = val.createDiv('ls-chip' + (it.auto ? ' is-auto' : ''));
          chip.createSpan({ text: it.file.basename });
          if (it.role) chip.createSpan({ cls: 'ls-chip-note', text: it.role });
          chip.addEventListener('click', () => this.show(it.file));
        }
      }
    }

    const mood = toArr(fm.moodboard);
    if (mood.length) {
      const mbx = this.sec(body, 'Moodboard', { color: def.color, count: mood.length });
      renderMoodboard(mbx, p, mood, f, null, { strip: true });
    }

    if (TAXA.includes(type)) {
      const kids = p.childTaxa(f);
      if (kids.length) {
        const sb = this.sec(body, cap(p.childWord(type, 2)), { color: def.color, count: kids.length });
        const list = sb.createDiv('ls-list');
        for (const k of kids) this.navRow(list, { icon: 'corner-down-right', label: k.basename, meta: p.fm(k).classification ? String(p.fm(k).classification) : '', onClick: () => this.show(k) });
      }
    }

    // Body sections as collapsible markdown, so you can check a detail without leaving your scene.
    const parsed = parseSections(splitFm(await this.app.vault.cachedRead(f)).body);
    const secs = parsed.sections.filter((s) => secText(s).trim());
    if (secs.length) {
      const tb = this.sec(body, 'Writing', { color: def.color });
      for (let i = 0; i < secs.length; i++) {
        const sec = secs[i];
        const key = `${f.path}#${sec.name}`;
        const d = tb.createEl('details', { cls: 'ls-pv-section' });
        d.open = this.secOpen.has(key) ? this.secOpen.get(key) : i === 0;
        d.createEl('summary', { text: sec.name });
        d.addEventListener('toggle', () => this.secOpen.set(key, d.open));
        const md = d.createDiv('ls-pv-md markdown-rendered');
        await MarkdownRenderer.render(this.app, secText(sec), md, f.path, comp);
      }
    }

    if (type === 'character') {
      const hits = await p.appearancesOf(f);
      const ab = this.sec(body, 'Appearances', { color: 'red', count: hits.filter((h) => h.explicit).length });
      if (!hits.length) ab.createDiv({ cls: 'ls-muted ls-pv-pad', text: 'Not in any scene yet.' });
      const list = ab.createDiv('ls-list');
      for (const h of hits.slice(0, 20)) {
        const row = list.createDiv('ls-row ls-pv-row');
        row.createSpan({ cls: 'ls-row-meta', text: h.chapter });
        row.createSpan({ cls: 'ls-row-name', text: h.scene.basename });
        if (!h.explicit) row.createSpan({ cls: 'ls-pill is-faint', text: 'Mentioned' });
        const age = p.ageShort(fm, p.presentOf(h.scene));
        if (age) row.createSpan({ cls: 'ls-pill ls-age-pill' + (age.warn ? ' is-warn' : ''), text: age.text });
        const scene = h.scene;
        row.addEventListener('click', () => p.openInMain(scene));
      }
      if (hits.length > 20) textBtn(ab, `See all ${hits.length}`, () => p.openEntity(f, type), 'ls-chip-add');
    }
  }
}

class ItemSuggest extends FuzzySuggestModal {
  constructor(app, items, label, placeholder, onPick) { super(app); this.items = items; this.label = label; this.onPick = onPick; this.setPlaceholder(placeholder); }
  getItems() { return this.items; }
  getItemText(it) { return this.label(it); }
  onChooseItem(it) { this.onPick(it); }
}

/* ------------------------------------------------------------------ */
/* Relations web                                                       */
/* ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const WEB_TYPES = ['character', 'organization', 'culture', 'species', 'creature', 'location', 'item', 'discovery', 'event'];

class WebView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.pos = new Map();
    this.nodes = [];
    this.edges = [];
    this.byId = new Map();
    this.vp = { x: 0, y: 0, k: 1 };
    this.selected = null;
    this.alpha = 0;
    this.raf = 0;
    this.pointers = new Map();
    this.project = null;
    this.uid = 'lsw' + Math.random().toString(36).slice(2, 8);
    this.requestBuild = debounce(() => this.build(), 800, true);
  }
  getViewType() { return VIEW_WEB; }
  getDisplayText() { return 'Relations web'; }
  getIcon() { return 'network'; }
  getState() { return { focus: this.selected }; }
  async setState(state, result) {
    if (state && state.focus) this.pendingFocus = state.focus;
    await super.setState(state, result);
    if (this.svg) this.build();
  }
  async onOpen() {
    this.contentEl.addClass('ls-host');
    const req = (f, old) => {
      const r = this.plugin.projectPath();
      if (!r) return;
      if ((f && f.path && f.path.startsWith(r + '/')) || (old && old.startsWith(r + '/'))) { this.meetData = null; this.requestBuild(); }
    };
    this.registerEvent(this.app.metadataCache.on('changed', req));
    this.registerEvent(this.app.vault.on('rename', req));
    this.registerEvent(this.app.vault.on('delete', req));
    this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
      if (leaf === this.leaf && this.project !== this.plugin.settings.activeProject) this.build();
    }));
    this.renderShell();
    this.build();
  }
  async onClose() { this.stop(); }

  win() { return this.contentEl.ownerDocument.defaultView || window; }
  stop() { if (this.raf) this.win().cancelAnimationFrame(this.raf); this.raf = 0; }

  /* ---------- shell ---------- */

  renderShell() {
    const root = this.contentEl;
    root.empty();
    const wrap = root.createDiv('ls-root ls-web ls-c-pink');
    this.barEl = wrap.createDiv('ls-web-bar');
    this.canvasEl = wrap.createDiv('ls-web-canvas');
    this.svg = svgEl('svg', { class: 'ls-web-svg', role: 'application', 'aria-label': 'Relations web. Drag to move, scroll or pinch to zoom.' }, this.canvasEl);
    this.msgEl = this.canvasEl.createDiv('ls-web-msg');
    this.cardEl = this.canvasEl.createDiv('ls-web-card');
    this.legendEl = this.canvasEl.createDiv('ls-web-legend');
    this.bindPointer();
    this.renderBar();
  }

  renderBar() {
    const p = this.plugin;
    const s = p.settings.web;
    const bar = this.barEl;
    bar.empty();

    const row1 = bar.createDiv('ls-web-row');
    row1.createSpan({ cls: 'ls-web-row-label', text: 'Show' });
    for (const t of WEB_TYPES) {
      const on = s.types.includes(t);
      const b = textBtn(row1, TYPES[t].plural, async () => {
        s.types = on ? s.types.filter((x) => x !== t) : [...s.types, t];
        await p.saveSettings();
        this.renderBar();
        this.build();
      }, `ls-toggle ls-c-${TYPES[t].color}` + (on ? ' is-active' : ''));
      b.setAttr('aria-pressed', String(on));
      b.prepend(createSpan('ls-swatch'));
    }

    const row2 = bar.createDiv('ls-web-row');
    row2.createSpan({ cls: 'ls-web-row-label', text: 'Ties' });
    for (const [k, d] of Object.entries(EDGE_KINDS)) {
      const on = !!s.edges[k];
      const b = textBtn(row2, d.label, async () => {
        s.edges[k] = !on;
        await p.saveSettings();
        this.renderBar();
        this.build();
      }, `ls-toggle ls-c-${d.color}` + (on ? ' is-active' : ''));
      b.setAttr('aria-pressed', String(on));
      const ic = createSpan('ls-toggle-icon');
      setIcon(ic, d.icon);
      b.prepend(ic);
      b.prepend(createSpan(`ls-edge-swatch ls-edge-${k}`));
    }
    const iso = textBtn(row2, 'Hide unconnected', async () => {
      s.hideIsolated = !s.hideIsolated;
      await p.saveSettings();
      this.renderBar();
      this.build();
    }, 'ls-toggle' + (s.hideIsolated ? ' is-active' : ''));
    iso.setAttr('aria-pressed', String(!!s.hideIsolated));

    const tools = row2.createDiv('ls-web-tools');
    const find = tools.createEl('input', { type: 'search', cls: 'ls-search', attr: { placeholder: 'Find', 'aria-label': 'Find an entry in the web' } });
    find.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const q = find.value.toLowerCase().trim();
      if (!q) return;
      const n = this.nodes.find((x) => x.label.toLowerCase() === q) || this.nodes.find((x) => x.label.toLowerCase().includes(q));
      if (n) this.focusOn(n.id, true); else new Notice(`Nothing in the web matches "${find.value}".`);
    });
    iconBtn(tools, 'zoom-in', 'Zoom in', () => this.zoomAt(null, null, 1.25));
    iconBtn(tools, 'zoom-out', 'Zoom out', () => this.zoomAt(null, null, 0.8));
    iconBtn(tools, 'maximize', 'Fit to view', () => this.fit());
    iconBtn(tools, 'rotate-ccw', 'Unpin everything and lay out again', () => {
      p.settings.webPins[p.settings.activeProject] = {};
      p.saveSettings();
      this.pos = new Map();
      this.build();
    });
  }

  /* ---------- graph ---------- */

  build() {
    if (!this.svg) return;
    if (this.dragging) { this.requestBuild(); return; }
    const p = this.plugin;
    const s = p.settings.web;
    if (this.project !== p.settings.activeProject) { this.pos = new Map(); this.project = p.settings.activeProject; }
    if (!p.projectPath()) {
      this.nodes = []; this.edges = []; this.byId = new Map();
      this.drawGraph();
      this.msgEl.setText('Create a project from the lore overview first.');
      return;
    }
    const idx = p.index();
    const pins = p.settings.webPins[this.project] || {};

    let nodes = [];
    const byId = new Map();
    for (const t of s.types) {
      for (const f of idx[t] || []) {
        const n = { id: f.path, file: f, type: t, label: f.basename, fm: p.fm(f), deg: 0 };
        nodes.push(n);
        byId.set(n.id, n);
      }
    }
    /* One line per pair and kind. Each end keeps its own label: Aria sees "Brother", Kael sees "Sister". */
    const edges = [];
    const seen = new Map();
    const add = (a, b, kind, labA, labB, file) => {
      if (!a || !b || a === b || !s.edges[kind]) return null;
      const key = [a.id, b.id].sort().join('\u0000') + '\u0000' + kind + (kind === 'relation' && file ? '\u0000' + file.path : '');
      let e = seen.get(key);
      if (!e) {
        e = { a, b, kind, views: { [a.id]: [], [b.id]: [] }, file };
        seen.set(key, e);
        edges.push(e);
        a.deg++; b.deg++;
      }
      /* views[x] = what the other end is to x */
      if (labA && !e.views[a.id].includes(labA)) e.views[a.id].push(labA);
      if (labB && !e.views[b.id].includes(labB)) e.views[b.id].push(labB);
      return e;
    };
    const g = p.graph();
    for (const n of nodes) {
      if (n.type !== 'character') continue;
      for (const r of p.relationsOf(n.file)) {
        const o = byId.get(r.file.path);
        if (!o) continue;
        if (r.former) {
          const ed = add(n, o, 'past', r.label, null);
          if (ed) ed.orig = REL[r.kind].edge;
          continue;
        }
        const ed = add(n, o, REL[r.kind].edge, r.label, null, r.relFile);
        if (ed && r.history && r.history.length) ed.history = r.history;
      }
    }
    for (const n of nodes) {
      for (const e of g.out.get(n.file) || []) {
        const o = byId.get(e.dest.path);
        if (!o || WEB_SKIP_FIELDS.has(e.field)) continue;
        if (n.type === 'character' && o.type === 'character' && PERSON_FIELDS.has(e.field)) continue;
        /* Both sides wrote it down (Order lists Aria, Aria lists Order): draw it once. */
        const back = MIRROR[`${n.type}.${e.field}`];
        if (back && back[0] !== '@' && n.id > o.id) {
          const backs = [back, ...(MIRROR_ALSO[back] || [])];
          if ((g.out.get(o.file) || []).some((x) => x.dest === n.file && backs.includes(x.field))) continue;
        }
        const fd = TYPES[n.type].fields.find((f) => f.key === e.field);
        const inv = INVERSE[`${n.type}.${e.field}`];
        const own = fd ? (SINGULAR[fd.label] || fd.label) : e.field;
        let back2 = inv ? inv.one : `${own} of`;
        let mine = own;
        if (n.type === 'character' && o.type === 'organization' && ROLE_FIELDS.includes(e.field)) back2 = p.roleOf(n.file, o.file) || back2;
        if (n.type === 'organization' && o.type === 'character' && ['members', 'leaders', 'founders'].includes(e.field)) mine = p.roleOf(o.file, n.file) || own;
        const ed = add(n, o, FIELD_EDGE[e.field] || 'other', mine, back2);
        if (ed) {
          const chr = n.type === 'character' ? n.file : o.type === 'character' ? o.file : null;
          const grp = n.type === 'organization' ? n.file : o.type === 'organization' ? o.file : null;
          if (chr && grp) ed.former = p.memberStatus(chr, grp) === 'former';
        }
      }
    }
    for (const r of idx.relation) {
      const fm = p.fm(r);
      const a = p.resolveLink(fm.from, r);
      const b = p.resolveLink(fm.to, r);
      if (!a || !b) continue;
      const na = byId.get(a.path), nb = byId.get(b.path);
      if (na && na.type === 'character' && nb && nb.type === 'character') continue; // already added by the engine
      const lab = fm.kind ? cap(String(fm.kind)) : r.basename;
      add(na, nb, 'relation', lab, lab, r);
    }
    if (s.edges.scenes) {
      if (this.meetData) {
        let max = 1;
        for (const v of this.meetData.pairs.values()) max = Math.max(max, v.length);
        for (const [k, scenes] of this.meetData.pairs) {
          const [pa, pb] = k.split('|');
          const e = add(byId.get(pa), byId.get(pb), 'scenes', `${scenes.length} shared scene${scenes.length === 1 ? '' : 's'}`, `${scenes.length} shared scene${scenes.length === 1 ? '' : 's'}`);
          if (e) e.weight = scenes.length / max;
        }
      } else if (!this.meetLoading) {
        this.meetLoading = true;
        p.meetings().then((m) => { this.meetData = m; this.meetLoading = false; this.build(); }, () => { this.meetLoading = false; });
      }
    }
    if (s.hideIsolated) {
      const keep = new Set([this.selected, this.pendingFocus]);
      nodes = nodes.filter((n) => n.deg > 0 || keep.has(n.id));
    }

    const old = this.pos;
    const fresh = old.size === 0;
    const pos = new Map();
    const R = 45 * Math.sqrt(nodes.length + 1);
    nodes.forEach((n, i) => {
      let q = old.get(n.id);
      if (!q) {
        const nb = edges.find((e) => (e.a === n && old.has(e.b.id)) || (e.b === n && old.has(e.a.id)));
        const o = nb ? old.get((nb.a === n ? nb.b : nb.a).id) : null;
        const ang = i * 2.399963;
        const rad = o ? 40 : R * Math.sqrt((i + 0.5) / Math.max(1, nodes.length));
        q = { x: (o ? o.x : 0) + Math.cos(ang) * rad, y: (o ? o.y : 0) + Math.sin(ang) * rad, vx: 0, vy: 0 };
      }
      const pin = pins[n.id];
      if (pin) { q.x = pin[0]; q.y = pin[1]; q.pinned = true; } else q.pinned = false;
      q.fixed = q.pinned;
      pos.set(n.id, q);
      n.p = q;
      const cat = String(n.fm.category || '');
      n.r = (n.type === 'character' ? (cat === 'main' ? 14 : cat === 'minor' ? 8 : 11) : 9) + Math.min(n.deg, 12) * 0.35;
    });
    this.pos = pos;
    this.nodes = nodes;
    this.edges = edges.filter((e) => pos.has(e.a.id) && pos.has(e.b.id));
    // Pairs tied in more than one way get one line per tie, side by side.
    const lanes = new Map();
    for (const e of this.edges) {
      const k = [e.a.id, e.b.id].sort().join('\u0000');
      if (!lanes.has(k)) lanes.set(k, []);
      lanes.get(k).push(e);
    }
    for (const group of lanes.values()) {
      const order = Object.keys(EDGE_KINDS);
      group.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
      group.forEach((e, i) => { e.lane = i - (group.length - 1) / 2; });
    }
    this.byId = new Map(nodes.map((n) => [n.id, n]));

    this.drawGraph();
    this.msgEl.setText(nodes.length ? '' : s.types.length
      ? 'Nothing to show yet. Add entries, or turn on more types above.'
      : 'Pick at least one kind of entry to show.');

    if (fresh) {
      this.alpha = 1;
      for (let i = 0; i < 220 && this.alpha > 0.03; i++) this.tick();
      this.update();
      this.win().requestAnimationFrame(() => this.fit());
    } else {
      this.alpha = Math.max(this.alpha, 0.25);
    }
    this.kick();

    if (this.pendingFocus) {
      const id = this.pendingFocus;
      this.pendingFocus = null;
      this.win().requestAnimationFrame(() => this.focusOn(id, true));
    } else {
      this.select(this.selected && this.byId.has(this.selected) ? this.selected : null);
    }
  }

  drawGraph() {
    const p = this.plugin;
    const svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const defs = svgEl('defs', {}, svg);
    this.gView = svgEl('g', { class: 'ls-web-viewport' }, svg);
    const gEdges = svgEl('g', { class: 'ls-web-edges' }, this.gView);
    const gNodes = svgEl('g', { class: 'ls-web-nodes' }, this.gView);
    for (const e of this.edges) {
      e.el = svgEl('line', { class: `ls-edge ls-edge-${e.kind}` + (e.orig ? ` ls-edge-${e.orig}` : '') + (e.former ? ' is-former' : '') }, gEdges);
      if (e.weight != null) e.el.style.strokeWidth = String(1 + e.weight * 5);
      const la = e.views[e.b.id].join(', '), lb = e.views[e.a.id].join(', ');
      svgEl('title', {}, e.el).textContent = [la && `${e.a.label}: ${la} of ${e.b.label}`, lb && `${e.b.label}: ${lb} of ${e.a.label}`].filter(Boolean).join('\n')
        || `${e.a.label} and ${e.b.label}: ${EDGE_KINDS[e.kind].label}`;
    }
    this.nodes.forEach((n, i) => {
      const g = svgEl('g', {
        class: `ls-web-node ls-c-${TYPES[n.type].color}` + (n.p.pinned ? ' is-pinned' : '') + (n.type === 'character' && p.isDead(n.file) ? ' is-dead' : ''),
        'data-id': n.id, tabindex: '0', role: 'button', 'aria-label': `${n.label}, ${TYPES[n.type].label}`,
      }, gNodes);
      svgEl('circle', { class: 'ls-web-dot', r: n.r }, g);
      const img = p.resolveLink(n.fm.image, n.file);
      if (!img && n.type === 'character' && n.r >= 10) {
        svgEl('text', { class: 'ls-web-initials', 'text-anchor': 'middle', dy: '0.35em' }, g).textContent = initials(n.label);
      }
      if (img && IMAGE_EXT.includes(img.extension.toLowerCase())) {
        const id = `${this.uid}-${i}`;
        const cp = svgEl('clipPath', { id }, defs);
        svgEl('circle', { r: n.r - 2 }, cp);
        svgEl('image', {
          href: this.app.vault.getResourcePath(img), x: -(n.r - 2), y: -(n.r - 2), width: 2 * (n.r - 2), height: 2 * (n.r - 2),
          'clip-path': `url(#${id})`, preserveAspectRatio: 'xMidYMid slice',
        }, g);
      }
      svgEl('text', { class: 'ls-web-label', y: n.r + 13 }, g).textContent = n.label;
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); if (this.selected === n.id) this.plugin.openEntity(n.file); else this.focusOn(n.id, true); }
        if (ev.key === 'Escape') this.select(null);
      });
      n.el = g;
    });
    this.apply();
    this.update();
    this.renderLegend();
  }

  tick() {
    const ns = this.nodes;
    const a = this.alpha;
    const n = ns.length;
    for (let i = 0; i < n; i++) {
      const p = ns[i].p;
      for (let j = i + 1; j < n; j++) {
        const q = ns[j].p;
        let dx = q.x - p.x, dy = q.y - p.y;
        let d2 = dx * dx + dy * dy;
        if (d2 > 360000) continue;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        const f = (420 * a) / d2;
        p.vx -= dx * f; p.vy -= dy * f;
        q.vx += dx * f; q.vy += dy * f;
        // keep dots and their labels from sitting on top of each other
        const min = ns[i].r + ns[j].r + 18;
        if (d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.25;
          p.vx -= dx * push; p.vy -= dy * push;
          q.vx += dx * push; q.vy += dy * push;
        }
      }
    }
    for (const e of this.edges) {
      const p = e.a.p, q = e.b.p;
      const dx = q.x + q.vx - p.x - p.vx, dy = q.y + q.vy - p.y - p.vy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = ((d - 100) / d) * 0.08 * a;
      const deg = Math.max(1, Math.min(e.a.deg, e.b.deg));
      const fx = (dx * k) / Math.sqrt(deg), fy = (dy * k) / Math.sqrt(deg);
      q.vx -= fx; q.vy -= fy;
      p.vx += fx; p.vy += fy;
    }
    for (const nd of ns) {
      const p = nd.p;
      if (p.fixed) { p.vx = 0; p.vy = 0; continue; }
      p.vx -= p.x * 0.012 * a;
      p.vy -= p.y * 0.012 * a;
      p.vx *= 0.6; p.vy *= 0.6;
      p.x += p.vx; p.y += p.vy;
    }
    this.alpha = this.dragging ? Math.max(this.alpha * 0.98, 0.15) : this.alpha * 0.975;
  }

  kick() {
    if (this.raf) return;
    const loop = () => {
      this.raf = 0;
      if (!this.svg || !this.svg.isConnected) return;
      this.tick();
      this.update();
      if (this.alpha > 0.01 || this.dragging) this.raf = this.win().requestAnimationFrame(loop);
    };
    this.raf = this.win().requestAnimationFrame(loop);
  }

  update() {
    const gap = 4.5 / ((this.vp && this.vp.k) || 1); // lane spacing stays the same on screen at any zoom
    for (const e of this.edges) {
      // Lines always run from the lower id to the higher one, so the sideways offset is consistent.
      const [s, t] = e.a.id < e.b.id ? [e.a.p, e.b.p] : [e.b.p, e.a.p];
      let ox = 0, oy = 0;
      if (e.lane) {
        const dx = t.x - s.x, dy = t.y - s.y;
        const len = Math.hypot(dx, dy) || 1;
        ox = (-dy / len) * e.lane * gap;
        oy = (dx / len) * e.lane * gap;
      }
      e.el.setAttribute('x1', (s.x + ox).toFixed(1));
      e.el.setAttribute('y1', (s.y + oy).toFixed(1));
      e.el.setAttribute('x2', (t.x + ox).toFixed(1));
      e.el.setAttribute('y2', (t.y + oy).toFixed(1));
    }
    for (const n of this.nodes) n.el.setAttribute('transform', `translate(${n.p.x.toFixed(1)},${n.p.y.toFixed(1)})`);
  }

  apply() {
    if (!this.gView) return;
    const v = this.vp;
    this.gView.setAttribute('transform', `translate(${v.x},${v.y}) scale(${v.k})`);
    if (this.lastK !== v.k && this.edges) { this.lastK = v.k; this.update(); }
    this.svg.classList.toggle('is-far', v.k < 0.55);
  }

  size() {
    const r = this.svg.getBoundingClientRect();
    return { w: r.width || 600, h: r.height || 400, left: r.left, top: r.top };
  }

  fit() {
    if (!this.nodes.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of this.nodes) {
      x0 = Math.min(x0, n.p.x - n.r); y0 = Math.min(y0, n.p.y - n.r);
      x1 = Math.max(x1, n.p.x + n.r); y1 = Math.max(y1, n.p.y + n.r + 16);
    }
    const { w, h } = this.size();
    const k = Math.max(0.15, Math.min(2, Math.min(w / (x1 - x0 + 80), h / (y1 - y0 + 80))));
    this.vp = { k, x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k };
    this.apply();
  }

  zoomAt(sx, sy, factor) {
    const { w, h } = this.size();
    if (sx == null) { sx = w / 2; sy = h / 2; }
    const v = this.vp;
    const k = Math.max(0.12, Math.min(4, v.k * factor));
    const wx = (sx - v.x) / v.k, wy = (sy - v.y) / v.k;
    this.vp = { k, x: sx - wx * k, y: sy - wy * k };
    this.apply();
  }

  toWorld(cx, cy) {
    const { left, top } = this.size();
    return { x: (cx - left - this.vp.x) / this.vp.k, y: (cy - top - this.vp.y) / this.vp.k };
  }

  /* ---------- pointer: drag nodes, pan, pinch, tap, double-tap ---------- */

  bindPointer() {
    const svg = this.svg;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    svg.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button > 0) return;
      svg.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        const el = e.target.closest && e.target.closest('.ls-web-node');
        const n = el && this.byId.get(el.getAttribute('data-id'));
        this.drag = n
          ? { node: n, sx: e.clientX, sy: e.clientY, moved: false }
          : { pan: true, sx: e.clientX, sy: e.clientY, vx: this.vp.x, vy: this.vp.y, moved: false };
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const { left, top } = this.size();
        const mx = (a.x + b.x) / 2 - left, my = (a.y + b.y) / 2 - top;
        this.pinch = { d: dist(a, b) || 1, k: this.vp.k, wx: (mx - this.vp.x) / this.vp.k, wy: (my - this.vp.y) / this.vp.k };
        this.endDrag(false);
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const { left, top } = this.size();
        const k = Math.max(0.12, Math.min(4, this.pinch.k * (dist(a, b) / this.pinch.d)));
        const mx = (a.x + b.x) / 2 - left, my = (a.y + b.y) / 2 - top;
        this.vp = { k, x: mx - this.pinch.wx * k, y: my - this.pinch.wy * k };
        this.apply();
        return;
      }
      const d = this.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
      d.moved = true;
      if (d.node) {
        this.dragging = true;
        const w = this.toWorld(e.clientX, e.clientY);
        const q = d.node.p;
        q.x = w.x; q.y = w.y; q.vx = 0; q.vy = 0; q.fixed = true;
        this.alpha = Math.max(this.alpha, 0.3);
        this.update();
        this.kick();
      } else {
        this.vp.x = d.vx + (e.clientX - d.sx);
        this.vp.y = d.vy + (e.clientY - d.sy);
        this.apply();
      }
    });
    const up = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; return; }
      this.endDrag(e.type === 'pointerup');
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { left, top } = this.size();
      this.zoomAt(e.clientX - left, e.clientY - top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });
    svg.addEventListener('contextmenu', (e) => {
      const el = e.target.closest && e.target.closest('.ls-web-node');
      const n = el && this.byId.get(el.getAttribute('data-id'));
      if (!n) return;
      e.preventDefault();
      this.nodeMenu(e, n);
    });
  }

  endDrag(asTap) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.node && d.moved) {
      this.dragging = false;
      this.pin(d.node, true);
      return;
    }
    if (!asTap) return;
    if (d.node) {
      const now = Date.now();
      if (this.lastTap && this.lastTap.id === d.node.id && now - this.lastTap.t < 350) {
        this.lastTap = null;
        this.plugin.openEntity(d.node.file);
        return;
      }
      this.lastTap = { id: d.node.id, t: now };
      this.select(d.node.id);
    } else if (d.pan) {
      this.select(null);
    }
  }

  pin(n, on) {
    const p = this.plugin;
    const proj = p.settings.activeProject;
    const pins = p.settings.webPins[proj] || (p.settings.webPins[proj] = {});
    n.p.pinned = on;
    n.p.fixed = on;
    if (on) pins[n.id] = [Math.round(n.p.x), Math.round(n.p.y)];
    else delete pins[n.id];
    n.el.classList.toggle('is-pinned', on);
    p.saveSoon();
    if (!on) { this.alpha = Math.max(this.alpha, 0.3); this.kick(); }
    if (this.selected === n.id) this.renderCard();
  }

  nodeMenu(e, n) {
    const m = new Menu();
    addMenuItem(m, 'Open', 'arrow-up-right', () => this.plugin.openEntity(n.file));
    addMenuItem(m, 'Focus', 'crosshair', () => this.focusOn(n.id, true));
    if (n.p.pinned) addMenuItem(m, 'Unpin', 'pin-off', () => this.pin(n, false));
    else addMenuItem(m, 'Pin here', 'pin', () => this.pin(n, true));
    m.showAtMouseEvent(e);
  }

  /* ---------- selection ---------- */

  select(id) {
    this.selected = id && this.byId.has(id) ? id : null;
    const near = new Set();
    if (this.selected) {
      near.add(this.selected);
      for (const e of this.edges) {
        if (e.a.id === this.selected) near.add(e.b.id);
        if (e.b.id === this.selected) near.add(e.a.id);
      }
    }
    this.svg.classList.toggle('has-focus', !!this.selected);
    for (const n of this.nodes) {
      n.el.classList.toggle('is-near', near.has(n.id));
      n.el.classList.toggle('is-selected', n.id === this.selected);
    }
    for (const e of this.edges) e.el.classList.toggle('is-near', !!this.selected && (e.a.id === this.selected || e.b.id === this.selected));
    this.renderCard();
  }

  focusOn(id, center) {
    const p = this.plugin;
    if (!this.byId.has(id)) {
      const f = this.app.vault.getAbstractFileByPath(id);
      const t = f && p.typeOf(f);
      if (t && WEB_TYPES.includes(t) && !p.settings.web.types.includes(t)) {
        p.settings.web.types.push(t);
        p.saveSettings();
        this.pendingFocus = id;
        this.renderBar();
        this.build();
        return;
      }
      if (f && p.settings.web.hideIsolated) { this.pendingFocus = id; this.build(); return; }
      new Notice(f ? `${f.basename} isn't in the web.` : 'That entry is gone.');
      return;
    }
    this.select(id);
    if (center) {
      const n = this.byId.get(id);
      const { w, h } = this.size();
      const k = Math.max(this.vp.k, 0.9);
      this.vp = { k, x: w / 2 - n.p.x * k, y: h / 2 - n.p.y * k };
      this.apply();
    }
  }

  renderCard() {
    const card = this.cardEl;
    card.empty();
    const n = this.selected && this.byId.get(this.selected);
    card.toggle(!!n);
    if (!n) return;
    const p = this.plugin;
    card.className = `ls-web-card ls-c-${TYPES[n.type].color}`;
    const head = card.createDiv('ls-web-card-head');
    if (TYPES[n.type].portrait) avatarEl(head, p, n.file, 'is-medium');
    const t = head.createDiv('ls-web-card-title');
    const name = t.createEl('a', { cls: 'ls-web-card-name', text: n.label, attr: { href: '#' } });
    name.addEventListener('click', (e) => { e.preventDefault(); p.openEntity(n.file); });
    t.createDiv({ cls: 'ls-entity-kind', text: [TYPES[n.type].label, n.fm.epithet || n.fm.kind].filter(Boolean).map(String).join(', ') });
    iconBtn(head, 'x', 'Close', () => this.select(null));

    const groups = new Map();
    for (const e of this.edges) {
      if (e.a !== n && e.b !== n) continue;
      const other = e.a === n ? e.b : e.a;
      if (!groups.has(e.kind)) groups.set(e.kind, []);
      groups.get(e.kind).push({ other, e, labels: e.views[n.id].length ? e.views[n.id] : [] });
    }
    const list = card.createDiv('ls-web-card-body');
    if (!groups.size) list.createDiv({ cls: 'ls-muted', text: 'No ties shown. Turn on more tie types, or link this entry from its sidebar.' });
    for (const k of Object.keys(EDGE_KINDS)) {
      const items = groups.get(k);
      if (!items) continue;
      const gEl = list.createDiv('ls-web-card-group');
      const kh = gEl.createDiv({ cls: `ls-web-card-kind ls-c-${EDGE_KINDS[k].color}` });
      setIcon(kh.createSpan('ls-web-card-kind-icon'), EDGE_KINDS[k].icon);
      kh.createSpan({ text: EDGE_KINDS[k].label });
      kh.createSpan({ cls: 'ls-web-card-kind-count', text: String(items.length) });
      const rows = gEl.createDiv('ls-web-card-rows');
      for (const { other, e, labels } of items.sort((x, y) => (k === 'scenes' ? (y.e.weight || 0) - (x.e.weight || 0) : 0) || natural(x.other.label, y.other.label))) {
        const row = rows.createDiv({ cls: `ls-web-card-row ls-c-${TYPES[other.type].color}`, attr: { tabindex: '0' } });
        if (TYPES[other.type].portrait) avatarEl(row, p, other.file, 'is-small');
        else setIcon(row.createSpan('ls-web-card-row-icon'), TYPES[other.type].icon);
        row.createSpan({ cls: 'ls-web-card-row-name', text: other.label });
        if (labels.length) row.createSpan({ cls: 'ls-web-card-row-rel', text: labels.join(', ') });
        if (e.history && e.history.length) row.setAttr('title', `Before: ${e.history.join('; ')}`);
        row.addEventListener('click', () => this.focusOn(other.id, true));
        row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') this.focusOn(other.id, true); });
        if (e.file) row.setAttr('aria-label', `Relation: ${e.file.basename}`);
      }
    }
    const acts = card.createDiv('ls-web-card-actions');
    textBtn(acts, 'Open', () => p.openEntity(n.file), 'mod-cta');
    if (n.p.pinned) textBtn(acts, 'Unpin', () => this.pin(n, false));
  }

  renderLegend() {
    const lg = this.legendEl;
    lg.empty();
    const s = this.plugin.settings.web;
    const shown = Object.entries(EDGE_KINDS).filter(([k]) => s.edges[k]);
    lg.toggle(shown.length > 0 && this.edges.length > 0);
    const used = new Set(this.edges.map((e) => e.kind));
    for (const [k, d] of shown) {
      if (!used.has(k)) continue;
      const it = lg.createDiv('ls-web-legend-item');
      it.createSpan(`ls-edge-swatch ls-edge-${k}`);
      setIcon(it.createSpan('ls-web-legend-icon'), d.icon);
      it.createSpan({ text: d.label });
    }
    lg.createDiv({ cls: 'ls-muted', text: 'Drag a dot to pin it. Double-tap to open.' });
  }
}

class FileSuggest extends FuzzySuggestModal {
  constructor(app, files, placeholder, onPick, label) { super(app); this.files = files; this.onPick = onPick; this.label = label; this.setPlaceholder(placeholder); }
  getItems() { return this.files; }
  getItemText(f) { return this.label ? this.label(f) : f.basename; }
  onChooseItem(f) { this.onPick(f); }
}

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */

class CreateModal extends Modal {
  constructor(app, plugin, type, preset) {
    super(app);
    this.plugin = plugin;
    this.type = type;
    this.data = Object.assign({ category: 'major' }, preset);
  }
  onOpen() {
    const def = TYPES[this.type];
    const { contentEl } = this;
    this.titleEl.setText(`New ${def.label.toLowerCase()}`);
    contentEl.addClass('ls-create', `ls-c-${def.color}`);
    const d = this.data;
    const input = (parent, key, placeholder) => {
      const i = parent.createEl('input', { type: 'text', attr: { placeholder } });
      i.addEventListener('input', () => { d[key] = i.value; });
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submit(); });
      return i;
    };

    let first;
    if (def.nameParts) {
      const g = contentEl.createDiv('ls-name-grid');
      first = input(g, 'first', 'First name');
      input(g, 'middle', 'Middle name');
      input(g, 'last', 'Last name');
      input(g, 'title', 'Title');
      const nameInputs = [...g.querySelectorAll('input')];
      const dice = contentEl.createDiv('ls-create-dice');
      textBtn(dice, 'Roll a name', () => new NameBuilderModal(this.app, this.plugin, {
        onPick: (n) => {
          ['first', 'middle', 'last'].forEach((k, i) => { nameInputs[i].value = n[k] || ''; d[k] = n[k] || ''; });
        },
      }).open(), 'ls-chip-add');
      const r = contentEl.createDiv('ls-radio ls-create-radio');
      const hint = contentEl.createDiv({ cls: 'ls-hint', text: CATEGORY_INFO[d.category] });
      const buttons = {};
      for (const c of ['main', 'major', 'minor']) {
        buttons[c] = r.createEl('button', { text: cap(c), cls: d.category === c ? 'is-active' : '' });
        buttons[c].addEventListener('click', () => {
          d.category = c;
          for (const k in buttons) buttons[k].toggleClass('is-active', k === c);
          hint.setText(CATEGORY_INFO[c]);
        });
      }
    } else {
      first = input(contentEl.createDiv('ls-create-row'), 'name', `${def.label} name`);
    }

    const tags = [...this.plugin.allTags(this.plugin.index()).keys()].sort(natural);
    const tagRow = contentEl.createDiv('ls-create-row');
    const listId = `ls-tags-${Date.now()}`;
    const t = input(tagRow, 'tag', 'Tag (optional)');
    t.setAttr('list', listId);
    const dl = tagRow.createEl('datalist', { attr: { id: listId } });
    for (const tag of tags) dl.createEl('option', { value: tag });

    const actions = contentEl.createDiv('ls-modal-actions');
    textBtn(actions, 'Cancel', () => this.close());
    textBtn(actions, `Create ${def.label.toLowerCase()}`, () => this.submit(), 'mod-cta');
    window.setTimeout(() => first && first.focus(), 30);
  }
  async submit() {
    if (this.busy) return;
    this.busy = true;
    this.close();
    await this.plugin.createEntity(this.type, this.data, true);
  }
  onClose() { this.contentEl.empty(); }
}

/* Rolls names from a culture's Naming lists, or from patterns in names you already use. */
class NameBuilderModal extends Modal {
  constructor(app, plugin, opts = {}) {
    super(app);
    this.plugin = plugin;
    this.opts = opts;
    this.culture = opts.culture || null;
    this.middle = false;
    this.surname = true;
  }
  onOpen() {
    const p = this.plugin;
    this.titleEl.setText('Name builder');
    this.contentEl.addClass('ls-names', 'ls-c-yellow');
    const bar = this.contentEl.createDiv('ls-names-bar');
    const sel = bar.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Culture' } });
    sel.createEl('option', { text: 'All my characters', value: '' });
    for (const c of p.index().culture) sel.createEl('option', { text: c.basename, value: c.path });
    sel.value = this.culture ? this.culture.path : '';
    sel.addEventListener('change', () => {
      const f = sel.value && this.app.vault.getAbstractFileByPath(sel.value);
      this.culture = f instanceof TFile ? f : null;
      this.roll();
    });
    const toggle = (label, key) => {
      const b = textBtn(bar, label, () => { this[key] = !this[key]; b.toggleClass('is-active', this[key]); this.roll(); }, 'ls-toggle' + (this[key] ? ' is-active' : ''));
    };
    toggle('Middle name', 'middle');
    toggle('Surname', 'surname');
    textBtn(bar, 'Roll again', () => this.roll(), 'mod-cta');
    this.note = this.contentEl.createDiv('ls-hint');
    this.list = this.contentEl.createDiv('ls-list ls-names-list');
    this.roll();
  }
  roll() {
    const p = this.plugin;
    const { learned, names } = p.rollNames(this.culture, 12, { middle: this.middle, surname: this.surname });
    this.list.empty();
    this.note.setText(learned
      ? `Built from the sounds of ${this.culture ? `${this.culture.basename}'s characters (or all your characters if it has fewer than three)` : 'your characters\' names'}. Fill in the Naming lists on a culture to steer it.`
      : `From ${this.culture.basename}'s Naming lists.`);
    if (!names.length) {
      this.list.createDiv({ cls: 'ls-muted', text: 'Not enough to build from yet. Add a few characters, or fill in a culture\'s Naming lists.' });
      return;
    }
    for (const n of names) {
      const full = [n.first, n.middle, n.last].filter(Boolean).join(' ');
      const row = this.list.createDiv('ls-row');
      row.createSpan({ cls: 'ls-row-name', text: full });
      if (this.opts.onPick) {
        textBtn(row, 'Use', () => { this.close(); this.opts.onPick(n); }, 'mod-cta');
      } else {
        iconBtn(row, 'copy', 'Copy', async () => { await navigator.clipboard.writeText(full); new Notice(`Copied "${full}".`); });
        iconBtn(row, 'user-plus', 'Create this character', async () => {
          this.close();
          const culture = this.culture;
          const f = await p.createEntity('character', { first: n.first, middle: n.middle, last: n.last }, false);
          if (f && culture) await this.app.fileManager.processFrontMatter(f, (fm) => { fm.affiliation = [p.linkTo(culture, f)]; });
          if (f) p.openEntity(f, 'character');
        });
      }
    }
  }
  onClose() { this.contentEl.empty(); }
}

class MoodboardModal extends Modal {
  constructor(app, plugin, title, getLinks, source, onChange) {
    super(app);
    this.plugin = plugin;
    this.title = title;
    this.links = getLinks();
    this.source = source;
    this.onChange = onChange;
  }
  onOpen() {
    this.titleEl.setText(this.title);
    this.contentEl.addClass('ls-mood-modal');
    this.draw();
  }
  draw() {
    this.contentEl.empty();
    if (!this.links.length) this.contentEl.createDiv({ cls: 'ls-hint', text: 'Add images from your vault. They show up in the sidebar while you write.' });
    renderMoodboard(this.contentEl, this.plugin, this.links, this.source, async (links) => {
      this.links = links;
      this.draw();
      await this.onChange(links);
    });
  }
  onClose() { this.contentEl.empty(); }
}

class CastModal extends Modal {
  constructor(app, plugin, file) { super(app); this.plugin = plugin; this.file = file; this.list = []; }
  async onOpen() {
    this.titleEl.setText(`Characters in ${this.file.basename}`);
    this.list = toArr(readFm(await this.app.vault.read(this.file)).characters);
    this.draw();
  }
  draw() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ls-c-red');
    const box = contentEl.createDiv('ls-chips ls-cast');
    if (!this.list.length) box.createSpan({ cls: 'ls-muted', text: 'Nobody yet.' });
    for (const s of this.list) {
      const f = this.plugin.resolveLink(s, this.file);
      const chip = box.createDiv('ls-chip' + (f ? '' : ' is-unresolved'));
      chip.createSpan({ text: f ? f.basename : linkText(s) });
      iconBtn(chip, 'x', 'Remove from scene', () => { this.list = this.list.filter((x) => x !== s); this.save(); });
    }
    textBtn(box, 'Add character', () => new EntitySuggest(this.app, this.plugin, ['character'], (f) => {
      const l = this.plugin.linkTo(f, this.file);
      if (!this.list.some((x) => linkText(x) === linkText(l))) this.list.push(l);
      this.save();
    }).open(), 'ls-chip-add');
    contentEl.createEl('p', { cls: 'ls-muted', text: 'Characters only linked in the scene text count as mentioned, not as appearing.' });
  }
  async save() {
    await this.plugin.setCast(this.file, this.list);
    this.draw();
  }
  onClose() { this.contentEl.empty(); }
}

/* Every role a character holds or held in one group, each with optional years and a "no longer active" switch. */
class RolesModal extends Modal {
  constructor(app, plugin, ch, org, onDone, opts = {}) {
    super(app); this.plugin = plugin; this.ch = ch; this.org = org; this.onDone = onDone;
    this.field = opts.field || 'roles';
    this.isTie = this.field === 'ties';
  }
  onOpen() {
    const p = this.plugin;
    this.titleEl.setText(this.isTie ? `${this.ch.basename} and ${this.org.basename} over time` : `${this.ch.basename} at ${this.org.basename}`);
    this.rows = (this.isTie ? p.tieEntriesOf(this.ch) : p.roleEntriesOf(this.ch)).filter((e) => e.org === this.org)
      .map((e) => ({ title: e.title, start: e.start, end: e.end, former: e.former, active: e.active }));
    if (!this.rows.length) this.rows.push({ title: '', start: '', end: '', former: false });
    this.draw();
  }
  draw() {
    const p = this.plugin;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ls-roles-modal', this.isTie ? 'ls-c-red' : 'ls-c-orange');
    contentEl.createEl('p', { cls: 'ls-muted', text: this.isTie
      ? `One line for each stage of what ${this.org.basename} is to ${this.ch.basename}: "Enemy" until 1995, then "Friend" from 1995. A line that ended before your story's present date, or is switched to "No longer active", becomes past. Add a note after a comma, like "Brother, estranged".`
      : 'One line per position. Someone who was a student and later a professor gets two lines. A role that ended before your story\'s present date, or is switched to "No longer active", shows as former but stays on both pages.' });
    if (this.isTie) {
      const theirs = p.tieEntriesOf(this.org).filter((e) => e.org === this.ch);
      if (theirs.length) {
        const box = contentEl.createDiv('ls-role-theirs');
        box.createDiv({ cls: 'ls-pv-label', text: `Written on ${this.org.basename}'s page (from their side)` });
        for (const e of theirs) box.createDiv({ cls: 'ls-muted', text: [e.title || '(no title)', p.roleYears(e) && `(${p.roleYears(e)})`, e.status === 'former' && 'past'].filter(Boolean).join(' ') });
      }
      if (!contentEl.querySelector('#ls-tie-words')) {
        const dl = contentEl.createEl('datalist', { attr: { id: 'ls-tie-words' } });
        for (const w of ['Friend', 'Best friend', 'Ally', 'Enemy', 'Nemesis', 'Rival', 'Mentor', 'Student', 'Lover', 'Partner', 'Fiancé', 'Fiancée', 'Wife', 'Husband', 'Spouse', 'Brother, estranged', 'Sister, estranged']) dl.createEl('option', { value: w });
      }
    }
    const subs = this.isTie ? [] : p.allSubdivisions(this.org);
    if (subs.length) {
      if (!this.subSel) this.subSel = new Set(subs.map((x) => x.org).filter((o) => p.inGroup(this.ch, o)));
      const word = p.subdivisionWord(this.org);
      const box = contentEl.createDiv('ls-sub-pick');
      box.createDiv({ cls: 'ls-pv-label', text: word === 'subgroup' ? `Which part of ${this.org.basename}?` : `Which ${word} at ${this.org.basename}?` });
      const chips = box.createDiv('ls-chips');
      for (const { org: o, depth } of subs) {
        const on = this.subSel.has(o);
        const b = chips.createEl('button', { cls: 'ls-sub-chip' + (on ? ' is-active' : ''), text: o.basename, attr: { 'aria-pressed': String(on) } });
        if (depth) { b.addClass('is-nested'); b.setAttr('aria-label', `${o.basename}, inside ${p.resolveLink(p.fm(o).partOf, o)?.basename || ''}`); }
        b.addEventListener('click', () => { if (on) this.subSel.delete(o); else this.subSel.add(o); this.draw(); });
      }
      box.createDiv({ cls: 'ls-hint', text: this.subSel.size
        ? `Joins ${[...this.subSel].map((o) => o.basename).join(', ')} through Affiliation. Their role there can be set from the ${word === 'subgroup' ? 'group' : word}'s page.`
        : `Not in any ${word === 'subgroup' ? 'part' : word} yet. Tap one to add them.` });
    }
    const list = contentEl.createDiv('ls-role-rows');
    const head = list.createDiv('ls-role-row is-head');
    for (const t of ['Title', 'From', 'To', 'Status', '']) head.createSpan({ text: t });
    let first = null;
    this.rows.forEach((r, i) => {
      const row = list.createDiv('ls-role-row');
      const inp = (k, ph) => {
        const el = row.createEl('input', { type: 'text', cls: `ls-input ls-role-${k}`, attr: { placeholder: ph, 'aria-label': ph } });
        el.value = r[k] || '';
        el.addEventListener('input', () => { r[k] = el.value; if (k !== 'title') r.active = false; pill(); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.save(); });
        return el;
      };
      const ti = inp('title', this.isTie ? (i === 0 ? 'Enemy' : 'Friend') : i === 0 ? 'Student, 5th year' : 'Professor, Potions');
      if (this.isTie) ti.setAttr('list', 'ls-tie-words');
      if (!first) first = ti;
      inp('start', 'From');
      inp('end', 'To');
      const st = row.createDiv('ls-role-status');
      const lab = st.createEl('label', { cls: 'ls-role-former' });
      const cb = lab.createEl('input', { type: 'checkbox' });
      cb.checked = !!r.former;
      lab.createSpan({ text: this.isTie ? 'In the past' : 'No longer active' });
      const pv = st.createSpan('ls-pill ls-status-pill');
      const pill = () => {
        const s = p.roleStatus({ start: r.start, end: r.end, former: r.former, active: r.active }, this.isTie ? null : this.ch);
        pv.setText(s === 'former' ? (this.isTie ? 'Past' : 'Former') : s === 'future' ? 'Not yet' : (this.isTie ? 'Now' : 'Active'));
        pv.className = `ls-pill ls-status-pill is-${s}`;
      };
      cb.addEventListener('change', () => { r.former = cb.checked; if (cb.checked) r.active = false; pill(); });
      pill();
      iconBtn(row, 'x', 'Remove this role', () => { this.rows.splice(i, 1); if (!this.rows.length) this.rows.push({ title: '', start: '', end: '', former: false }); this.draw(); });
    });
    const more = textBtn(contentEl, this.isTie ? 'Add another stage' : 'Add another role', () => { this.rows.push({ title: '', start: '', end: '', former: false }); this.draw(); }, 'ls-chip-add');
    setIcon(more.createSpan({ cls: 'ls-btn-icon' }), 'plus');
    more.prepend(more.lastChild);
    const a = contentEl.createDiv('ls-modal-actions');
    textBtn(a, 'Cancel', () => this.close());
    textBtn(a, this.isTie ? 'Save history' : 'Save roles', () => this.save(), 'mod-cta');
    window.setTimeout(() => { if (first && !first.value) first.focus(); }, 30);
  }
  async save() {
    if (this.busy) return;
    this.busy = true;
    this.close();
    await this.plugin.setRoles(this.ch, this.org, this.rows, this.field);
    if (this.subSel) await this.plugin.setSubdivisions(this.ch, this.org, this.subSel);
    if (this.onDone) this.onDone();
  }
  onClose() { this.contentEl.empty(); }
}

class NameModal extends Modal {
  constructor(app, opts, onSubmit) { super(app); this.opts = opts; this.onSubmit = onSubmit; }
  onOpen() {
    this.titleEl.setText(this.opts.title);
    const inp = this.contentEl.createEl('input', { type: 'text', cls: 'ls-full', attr: { placeholder: this.opts.placeholder || '' } });
    inp.value = this.opts.initial || '';
    const go = () => { const v = inp.value; this.close(); if (v.trim() || this.opts.allowEmpty) this.onSubmit(v); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const a = this.contentEl.createDiv('ls-modal-actions');
    textBtn(a, 'Cancel', () => this.close());
    textBtn(a, this.opts.cta || 'Save', go, 'mod-cta');
    window.setTimeout(() => { inp.focus(); inp.select(); }, 30);
  }
  onClose() { this.contentEl.empty(); }
}

class ConfirmModal extends Modal {
  constructor(app, opts, onConfirm) { super(app); this.opts = opts; this.onConfirm = onConfirm; }
  onOpen() {
    this.titleEl.setText(this.opts.title);
    this.contentEl.createEl('p', { text: this.opts.message });
    const a = this.contentEl.createDiv('ls-modal-actions');
    textBtn(a, 'Cancel', () => this.close());
    textBtn(a, this.opts.cta || 'Confirm', () => { this.close(); this.onConfirm(); }, 'mod-warning');
  }
  onClose() { this.contentEl.empty(); }
}

class EntitySuggest extends SuggestModal {
  constructor(app, plugin, types, onPick, exclude) {
    super(app);
    this.plugin = plugin;
    this.types = types;
    this.onPick = onPick;
    this.exclude = exclude;
    const what = types.length > 2 ? 'an entry' : types.map((t) => TYPES[t].label.toLowerCase()).join(' or ');
    this.setPlaceholder(`Find or create ${what}`);
  }
  getSuggestions(q) {
    const idx = this.plugin.index();
    const ql = q.toLowerCase().trim();
    const res = [];
    for (const t of this.types) {
      for (const f of idx[t]) {
        if (f === this.exclude) continue;
        const par = TAXA.includes(t) ? this.plugin.taxonParent(f) : null;
        const cls = TAXA.includes(t) ? this.plugin.classOf(f).path.join(' ').toLowerCase() : '';
        if (!ql || this.plugin.namesOf(f).some((n) => n.toLowerCase().includes(ql)) || (par && par.basename.toLowerCase().includes(ql)) || (cls && cls.includes(ql))) res.push({ file: f, type: t });
      }
    }
    if (ql && !res.some((r) => r.file.basename.toLowerCase() === ql)) {
      for (const t of this.types) res.push({ create: true, name: q.trim(), type: t });
    }
    return res.slice(0, 200);
  }
  renderSuggestion(it, el) {
    el.addClass('ls-suggest', `ls-c-${TYPES[it.type].color}`);
    const ic = el.createSpan('ls-suggest-icon');
    setIcon(ic, it.create ? 'plus' : TYPES[it.type].icon);
    el.createSpan({ text: it.create ? `Create "${it.name}"` : it.file.basename });
    const par = null;
    const nee = !it.create && it.type === 'character' ? this.plugin.birthNameText(it.file) : '';
    const spLine = !it.create && TAXA.includes(it.type) ? this.plugin.taxonLine(it.file).split(' · ').slice(1).join(' · ') : '';
    el.createSpan({ cls: 'ls-suggest-type', text: spLine || (nee ? `${TYPES[it.type].label}, ${nee}` : TYPES[it.type].label) });
  }
  async onChooseSuggestion(it) {
    let f = it.file;
    if (it.create) {
      const parts = it.name.split(/\s+/);
      const data = TYPES[it.type].nameParts
        ? { first: parts[0], last: parts.slice(1).join(' ') }
        : { name: it.name };
      f = await this.plugin.createEntity(it.type, data, false);
    }
    if (f) this.onPick(f);
  }
}

class TagSuggest extends SuggestModal {
  constructor(app, plugin, onPick) {
    super(app);
    this.plugin = plugin;
    this.onPick = onPick;
    this.tags = [...plugin.allTags(plugin.index()).keys()].sort(natural);
    this.setPlaceholder('Find or create a tag');
  }
  getSuggestions(q) {
    const t = cleanTag(q).toLowerCase();
    const res = this.tags.filter((x) => x.toLowerCase().includes(t)).map((x) => ({ tag: x }));
    if (t && !this.tags.some((x) => x.toLowerCase() === t)) res.push({ tag: cleanTag(q), create: true });
    return res;
  }
  renderSuggestion(it, el) { el.setText(it.create ? `Create tag "${it.tag}"` : it.tag); }
  onChooseSuggestion(it) { this.onPick(it.tag); }
}

class ImageSuggest extends FuzzySuggestModal {
  constructor(app, onPick) { super(app); this.onPick = onPick; this.setPlaceholder('Choose an image from your vault'); }
  getItems() { return this.app.vault.getFiles().filter((f) => IMAGE_EXT.includes(f.extension.toLowerCase())); }
  getItemText(f) { return f.path; }
  onChooseItem(f) { this.onPick(f); }
}

class ChapterSuggest extends FuzzySuggestModal {
  constructor(app, chapters, onPick) { super(app); this.chapters = chapters; this.onPick = onPick; this.setPlaceholder('Move to chapter'); }
  getItems() { return this.chapters; }
  getItemText(c) { return c.name; }
  onChooseItem(c) { this.onPick(c); }
}

class TypeSuggest extends FuzzySuggestModal {
  constructor(app, onPick) { super(app); this.onPick = onPick; this.setPlaceholder('What do you want to create?'); }
  getItems() { return Object.keys(TYPES); }
  getItemText(k) { return TYPES[k].label; }
  onChooseItem(k) { this.onPick(k); }
}

class ProjectSuggest extends FuzzySuggestModal {
  constructor(app, plugin, onPick) { super(app); this.plugin = plugin; this.onPick = onPick; this.setPlaceholder('Switch to project'); }
  getItems() { return this.plugin.listProjects(); }
  getItemText(n) { return n; }
  onChooseItem(n) { this.onPick(n); }
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

class LoresmithSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName('Lore folder')
      .setDesc('Each subfolder inside this folder is one project.')
      .addText((t) => t.setPlaceholder('Lore').setValue(this.plugin.settings.rootFolder).onChange(async (v) => {
        this.plugin.settings.rootFolder = v.trim() || 'Lore';
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName('Open entries in a new tab')
      .setDesc('When off, entries replace the current tab.')
      .addToggle((t) => t.setValue(this.plugin.settings.openInNewTab).onChange(async (v) => {
        this.plugin.settings.openInNewTab = v;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl).setName('Relationships').setHeading();
    new Setting(containerEl)
      .setName('Keep links two-way')
      .setDesc('When you add Bram as Aria\'s ally, Aria is added as Bram\'s ally too. Works for family, friends, mentors and students, members, owners and more. Removing a link removes both sides. Siblings, cousins, in-laws and step-family are always worked out on their own, with or without this.')
      .addToggle((t) => t.setValue(!!this.plugin.settings.mirrorLinks).onChange(async (v) => {
        this.plugin.settings.mirrorLinks = v;
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName('Fill in missing sides now')
      .setDesc('Looks through the current project for links written on only one side and adds the other side. Nothing is removed.')
      .addButton((b) => b.setButtonText('Check links').onClick(() => this.plugin.syncLinks()));

    new Setting(containerEl).setName('Writing goals').setHeading();
    new Setting(containerEl)
      .setName('Daily word goal')
      .setDesc('Net words added to scene notes each day. Set to 0 to just count.')
      .addText((t) => {
        t.inputEl.type = 'number';
        t.inputEl.min = '0';
        t.setValue(String(this.plugin.settings.dailyGoal || 0)).onChange(async (v) => {
          this.plugin.settings.dailyGoal = Math.max(0, Number(v) || 0);
          await this.plugin.saveSettings();
        });
      });
    new Setting(containerEl)
      .setName('Show today\'s words in the status bar')
      .setDesc('Desktop only. Click it to open your goals.')
      .addToggle((t) => t.setValue(this.plugin.settings.showStatusBar).onChange(async (v) => {
        this.plugin.settings.showStatusBar = v;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl).setName('Typing log').setHeading();
    containerEl.createEl('p', { cls: 'setting-item-description', text: 'Counts what you type, paste and delete, and how long you spend typing, separately for scenes, lore and other notes. Each device keeps its own log in the plugin folder (typing/), so the logs sync without overwriting each other. See it under Writing log.' });
    const tl = this.plugin.settings.typing;
    new Setting(containerEl)
      .setName('Track notes outside Loresmith')
      .setDesc('Off: only scenes and lore are tracked. On: other notes in the vault too, kept separate as "Other notes".')
      .addToggle((t) => t.setValue(!!tl.outside).onChange(async (v) => { tl.outside = v; await this.plugin.saveSettings(); }));
    const num = (key, name, desc, min) => new Setting(containerEl).setName(name).setDesc(desc).addText((t) => {
      t.inputEl.type = 'number';
      t.inputEl.min = String(min);
      t.setValue(String(tl[key] || 0)).onChange(async (v) => { tl[key] = Math.max(min, Number(v) || 0); await this.plugin.saveSettings(); });
    });
    num('idleSeconds', 'Idle after (seconds)', 'A pause longer than this stops the typing clock until you type again. 30 is a good middle ground.', 5);
    num('timeGoal', 'Daily typing time goal (minutes)', 'Shown as a ring on the Today tab. 0 hides it.', 0);
    num('pomodoro', 'Pomodoro length (minutes)', 'Counts typing time only, so it waits while you think.', 1);

    const proj = this.plugin.settings.activeProject;
    const p = this.plugin;
    const model = p.calModel();
    const noteFile = p.calNoteFile();
    new Setting(containerEl).setName(proj ? `World calendar for ${proj}` : 'World calendar').setHeading();
    const summary = containerEl.createDiv('setting-item-description ls-cal-status');
    {
      const now = p.latestPresent();
      const c = p.calendar(now ? now.y : undefined);
      const parts = [];
      if (model.broken) parts.push('Custom calendar, but no months yet: add them in the calendar note.');
      else if (!model.custom) parts.push('Modern calendar (January to December, leap years, real weekdays and moon).');
      else if (c) parts.push(`Custom calendar: ${c.months.length} months, ${c.yearDays} days a year${c.weekdays.length ? `, ${c.weekdays.length}-day week` : ''}${c.moons.length ? `, ${c.moons.length} moon${c.moons.length === 1 ? '' : 's'}` : ''}.`);
      const changes = model.monthSets.filter((s) => s.from !== -Infinity).length;
      if (changes) parts.push(`Changes ${changes} time${changes === 1 ? '' : 's'} in its history.`);
      if (model.holidays.length) parts.push(`${model.holidays.length} holiday${model.holidays.length === 1 ? '' : 's'}.`);
      parts.push(now ? `Present: ${now.raw}${model.present ? '' : p.scanPresent() ? ' (latest story date)' : ' (today)'}.` : 'No present date yet.');
      summary.setText(parts.join(' '));
    }
    const set = async (props) => { await p.setCalendarProps(props); this.display(); };

    new Setting(containerEl)
      .setName('Custom calendar')
      .setDesc('Off: the modern calendar. On: your own month names and lengths, weekdays and moons, written in the calendar note.')
      .addToggle((t) => t.setValue(model.custom).onChange((v) => set({ custom_calendar: v })));
    new Setting(containerEl)
      .setName('Custom eras')
      .setDesc('Off: years count like ours (300 BC, 2026). On: name your own eras.')
      .addToggle((t) => t.setValue(model.eras.custom).onChange((v) => set({ custom_eras: v })));
    /* Text fields save when you leave them, so the note isn't rewritten on every keystroke. */
    const field = (name, desc, placeholder, value, key) => new Setting(containerEl).setName(name).setDesc(desc).addText((t) => {
      t.setPlaceholder(placeholder).setValue(value);
      t.inputEl.addEventListener('change', () => set({ [key]: t.getValue().trim() }));
    });
    if (model.eras.custom) {
      field('Eras that count backwards', 'Comma separated. A date like "300 Before Glass" sorts as -300. The first one is used when showing years.', 'BC, BCE', model.eras.neg.join(', '), 'backward_eras');
      field('Era after year 1', 'Shown after years that count forwards: "AC" turns 1023 into "1023 AC". Leave empty for just the number.', 'AC', model.eras.fwd, 'forward_era');
      new Setting(containerEl)
        .setName('Year 0')
        .setDesc('Off: the year before 1 is 1 in the backwards era. On: a year 0 sits between them.')
        .addToggle((t) => t.setValue(model.eras.zero).onChange((v) => set({ year_zero: v })));
    }
    const today = p.defaultPresent();
    field('Present date', `The world's "now", used for ages and "years ago" when no story, chapter or scene sets its own.${today ? ` Leave empty for today (${today.raw}).` : ''}`,
      today ? today.raw : '12 Frostmoon, 1023 AC', model.present == null ? '' : String(model.present), 'present');
    new Setting(containerEl)
      .setName('Calendar note')
      .setDesc('Month names and lengths, weekdays, moons, and a History section for holidays (with the years they were kept) and calendar changes.')
      .addButton((b) => b.setButtonText(noteFile ? 'Open' : 'Create').setCta().onClick(async () => {
        await p.openCalendarNote();
        this.display();
      }));

    new Setting(containerEl).setName('Generators').setHeading();
    const genFolder = this.plugin.genInstallFolder();
    const genSet = new Setting(containerEl)
      .setName('Generator tables')
      .setDesc(`The genre, character, conflict, plot and place lists the Generators roll, downloaded from GitHub for this version of Loresmith into "${genFolder}", where the Randomness plugin reads them. Files you've edited are never overwritten: the new version is saved beside them as a .txt to copy from.`)
      .addButton((b) => b.setButtonText('Install or update').setCta().onClick(async () => {
        b.setDisabled(true);
        await this.plugin.installGeneratorTables();
        this.display();
      }));
    if (!this.plugin.randomness()) genSet.descEl.createDiv({ cls: 'mod-warning', text: 'Needs the Randomness plugin, which is not enabled.' });
    else void this.plugin.genMissingTables().then((m) => {
      genSet.descEl.createDiv({ cls: m.length ? 'mod-warning' : '', text: m.length ? `${m.length} tables missing.` : 'All tables found ✓' });
    });

    new Setting(containerEl).setName('Manuscript and ebook').setHeading();
    const ms = this.plugin.settings.manuscript;
    const text = (key, name, desc, placeholder) => new Setting(containerEl).setName(name).setDesc(desc)
      .addText((t) => t.setPlaceholder(placeholder).setValue(String(ms[key] || '')).onChange(async (v) => { ms[key] = v; await this.plugin.saveSettings(); }));
    text('legalName', 'Your name', 'Top of the manuscript title page. The last word becomes the surname in the page header.', 'Hunter ...');
    text('byline', 'Byline', 'The name on the cover, if it differs from the one above.', 'Pen name');
    new Setting(containerEl).setName('Contact details').setDesc('Under your name on the title page, one line each: address, email, phone.')
      .addTextArea((t) => { t.setValue(ms.contact || '').onChange(async (v) => { ms.contact = v; await this.plugin.saveSettings(); }); t.inputEl.rows = 4; t.inputEl.addClass('ls-setting-area'); });
    new Setting(containerEl).setName('Manuscript font').setDesc('Times New Roman is the usual choice today; Courier New is the classic typewriter look.')
      .addDropdown((d) => d.addOption('Times New Roman', 'Times New Roman').addOption('Courier New', 'Courier New')
        .setValue(ms.font || 'Times New Roman').onChange(async (v) => { ms.font = v; await this.plugin.saveSettings(); }));
    text('lang', 'Ebook language', 'A language code such as en, en-US or fr.', 'en');
  }
}

/* The sidebar shows the same writing log as the main view. */
for (const m of ['renderWriting', 'kindChips', 'statGrid', 'ring', 'lineChart', 'renderToday', 'renderTrend', 'renderAuthorship', 'renderGoals', 'bar', 'heatmap']) {
  PanelView.prototype[m] = OverviewView.prototype[m];
}
PanelView.prototype.compact = true;

module.exports = LoresmithPlugin;
