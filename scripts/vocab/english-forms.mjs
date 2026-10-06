// English forms the dictionaries don't spell out, for scripts/vocab/word-info.mjs.

/** Irregular verbs: base → [past, past participle] (American use; "/" separates common variants). */
export const IRREGULAR_VERBS = Object.fromEntries(
  `arise arose arisen|awake awoke awoken|be was/were been|bear bore born|beat beat beaten|become became become
begin began begun|bend bent bent|bet bet bet|bind bound bound|bite bit bitten|bleed bled bled|blow blew blown
break broke broken|breed bred bred|bring brought brought|broadcast broadcast broadcast|build built built
burn burned/burnt burned/burnt|burst burst burst|buy bought bought|cast cast cast|catch caught caught
choose chose chosen|cling clung clung|come came come|cost cost cost|creep crept crept|cut cut cut
deal dealt dealt|dig dug dug|do did done|draw drew drawn|dream dreamed/dreamt dreamed/dreamt|drink drank drunk
drive drove driven|eat ate eaten|fall fell fallen|feed fed fed|feel felt felt|fight fought fought|find found found
flee fled fled|fly flew flown|forbid forbade forbidden|forecast forecast forecast|forget forgot forgotten
forgive forgave forgiven|freeze froze frozen|get got got/gotten|give gave given|go went gone|grind ground ground
grow grew grown|hang hung hung|have had had|hear heard heard|hide hid hidden|hit hit hit|hold held held
hurt hurt hurt|keep kept kept|kneel knelt knelt|know knew known|lay laid laid|lead led led|lean leaned/leant leaned/leant
leap leaped/leapt leaped/leapt|learn learned/learnt learned/learnt|leave left left|lend lent lent|let let let
lie lay lain|light lit lit|lose lost lost|make made made|mean meant meant|meet met met|mislead misled misled
mistake mistook mistaken|misunderstand misunderstood misunderstood|overcome overcame overcome|overtake overtook overtaken
pay paid paid|prove proved proven/proved|put put put|quit quit quit|read read read|rid rid rid|ride rode ridden
ring rang rung|rise rose risen|run ran run|say said said|see saw seen|seek sought sought|sell sold sold
send sent sent|set set set|sew sewed sewn|shake shook shaken|shed shed shed|shine shone shone|shoot shot shot
show showed shown|shrink shrank shrunk|shut shut shut|sing sang sung|sink sank sunk|sit sat sat|sleep slept slept
slide slid slid|speak spoke spoken|speed sped sped|spell spelled/spelt spelled/spelt|spend spent spent
spill spilled/spilt spilled/spilt|spin spun spun|spit spit/spat spit/spat|split split split|spoil spoiled/spoilt spoiled/spoilt
spread spread spread|spring sprang sprung|stand stood stood|steal stole stolen|stick stuck stuck|sting stung stung
stink stank stunk|strike struck struck|strive strove striven|swear swore sworn|sweep swept swept|swell swelled swollen
swim swam swum|swing swung swung|take took taken|teach taught taught|tear tore torn|tell told told|think thought thought
throw threw thrown|undergo underwent undergone|understand understood understood|undertake undertook undertaken
upset upset upset|wake woke woken|wear wore worn|weave wove woven|weep wept wept|win won won|wind wound wound
withdraw withdrew withdrawn|withstand withstood withstood|write wrote written`
    .split(/[|\n]/)
    .map((row) => row.trim().split(/\s+/))
    .filter((row) => row.length === 3)
    .map(([base, past, pp]) => [base, [past, pp]]),
)

/** Irregular comparatives: adjective → [comparative, superlative] */
export const IRREGULAR_ADJECTIVES = {
  good: ['better', 'best'],
  bad: ['worse', 'worst'],
  far: ['farther/further', 'farthest/furthest'],
  little: ['less', 'least'],
  many: ['more', 'most'],
  much: ['more', 'most'],
  well: ['better', 'best'],
  ill: ['worse', 'worst'],
}

/** Irregular plurals the dictionaries don't list */
export const IRREGULAR_PLURALS = {
  man: 'men',
  woman: 'women',
  child: 'children',
  person: 'people',
  foot: 'feet',
  tooth: 'teeth',
  goose: 'geese',
  mouse: 'mice',
  ox: 'oxen',
  sheep: 'sheep',
  fish: 'fish',
  deer: 'deer',
  series: 'series',
  species: 'species',
  crisis: 'crises',
  analysis: 'analyses',
  thesis: 'theses',
  phenomenon: 'phenomena',
  criterion: 'criteria',
  medium: 'media',
  datum: 'data',
  cactus: 'cacti',
  fungus: 'fungi',
  nucleus: 'nuclei',
  stimulus: 'stimuli',
  appendix: 'appendices',
  index: 'indexes/indices',
}

/**
 * Nouns without a plural in everyday use (uncountable, or already plural): no "số nhiều" form.
 * Their -s spellings exist in dictionaries ("informations", "peoples"), so they must be listed.
 */
export const NO_PLURAL = new Set(
  `information advice news furniture equipment luggage baggage homework housework knowledge research progress
evidence money music traffic weather health wealth happiness sadness anger fun luck patience courage honesty
education pollution transportation accommodation garbage rubbish trash litter mud dust sand snow rain thunder lightning
electricity gas oil petrol fuel water milk juice coffee tea rice bread butter cheese meat sugar salt flour soup
pasta honey jam cereal vocabulary grammar english mathematics physics economics politics athletics gymnastics
people police cattle clothes scissors trousers jeans pants glasses shorts pajamas goods thanks staff
software hardware feedback access permission produce machinery clothing jewelry jewellery scenery mail
safety violence poverty peace freedom justice employment unemployment leisure nature mankind humanity
biodiversity deforestation conservation hygiene obesity fatigue stamina literacy automation surveillance`.split(/\s+/),
)

/** Word-family links that a suffix rule finds but that aren't the same family today */
export const NOT_FAMILY = new Set(
  `busy:business good:goody hard:hardly late:lately sign:signal port:portable car:career cab:cabin
pass:passive pass:passion mean:meant ward:warden sing:single eat:eaten hum:human pat:patent
cape:incapable cape:capable fat:fatal fat:fatality fate:fatal tape:tap tie:tier mute:mutation bunk:bunker
show:shower pose:repose pose:dispose pose:disposal skip:skipper fine:refinement raft:rafter sew:sewer die:dial
cord:record man:manner fine:final fig:figure mat:matter rate:ration see:seal let:letter
import:importance import:important fine:refine`.split(/\s+/),
)
