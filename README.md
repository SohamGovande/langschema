# 🧱 langschema

**one-line LLM output parsers for JS/TS.** no code bloat. one file.

## how to use

### 1. install the package
```bash
npm i langschema
```

### 2. use any of our one-line parsers
``

```javascript
import { bool, list, categorize } from 'langschema'

const isGood: boolean = await bool('Is this review positive? Review: Best bang for your buck.')

const foodsAte: string[] = await list(
  'What foods did this review user like? Review: i loved pizza and milkshakes', 
  ['pizza', 'burger', 'fries']
)

const rating: string = await categorize(
  `What rating would this review user give?
  Review: could NOT recommend it more, best ive ever eaten`, 
  ['1 star', '2 stars', '3 stars', '4 stars', '5 stars']
)
```

## features

### boolean parser
useful for parsing outputs that are in a binary format, i.e., `true` or `false`.

### categorize parser
it assists in parsing outputs that can be categorized into a specific set of strings (enums).

### list parser
this is intended to parse outputs that are lists of specific set of strings (enums).
