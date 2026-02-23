const fs = require("fs");
const path = require("path");

const SKIP_FIELDS = new Set(["moduleFilePath", "codePath", "_randomUID"]);

const currentPath = path.join(__dirname, "dimensionModules.json");
const safePath = path.join(__dirname, "..", "safe.json.log");

if (!fs.existsSync(currentPath)) {
  console.error("dimensionModules.json not found. Run buildModules first.");
  process.exit(1);
}
if (!fs.existsSync(safePath)) {
  console.error("safe.json.log not found.");
  process.exit(1);
}
const whitelistedBaseAdapterKeys = new Set([
  'start', 'deadFrom', 'fetch', 'runAtCurrTime'
])

const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
const safe = JSON.parse(fs.readFileSync(safePath, "utf8"));
cleanup(safe);

let missingCount = 0;
let extraCount = 0;
let diffCount = 0;

// --- 1. Missing & extra keys ---
console.log("=".repeat(80));
console.log("MISSING & EXTRA KEYS (comparing dimensionModules.json against safe.json.log)");
console.log("=".repeat(80));

const allTypes = new Set([...Object.keys(safe), ...Object.keys(current)]);
const ignoredModules = [
  'canto-dex',
  'auragi',
  'dyorswap',
  'swapmode-v2',
  'viperswap',
  'xswap-v2',
  'zkswap-finance',
  'mare-finance-v2',
  'mux-protocol',
  'koi-finance',
  'alphasec-spot',
]

for (const adapterType of [...allTypes].sort()) {
  const safeAdapters = safe[adapterType] || {};
  const currentAdapters = current[adapterType] || {};

  ignoredModules.forEach(m => {
    delete safeAdapters[m];
    delete currentAdapters[m];
  })

  const safeKeys = new Set(Object.keys(safeAdapters));
  const currentKeys = new Set(Object.keys(currentAdapters));

  const missingFromCurrent = [...safeKeys].filter((k) => !currentKeys.has(k));
  const extraInCurrent = [...currentKeys].filter((k) => !safeKeys.has(k));

  if (missingFromCurrent.length > 0) {
    console.log(
      `\n[${adapterType}] Missing from current build (${missingFromCurrent.length}):`
    );
    for (const k of missingFromCurrent.sort()) {
      console.log(`  - ${k}`);
      missingCount++;
    }
  }

  /*  if (extraInCurrent.length > 0) {
     console.log(
       `\n[${adapterType}] New in current build (not in safe) (${extraInCurrent.length}):`
     );
     for (const k of extraInCurrent.sort()) {
       console.log(`  + ${k}`);
       extraCount++;
     }
   } */
}

// --- 2. Deep comparison ---
console.log("\n" + "=".repeat(80));
console.log("VALUE DIFFERENCES (skipping moduleFilePath, codePath, _randomUID)");
console.log("=".repeat(80));

function deepCompare(a, b, path) {
  const diffs = [];

  if (a === b) return diffs;

  if (a === null || b === null || typeof a !== typeof b) {
    if (path.endsWith('runAtCurrTime') && a === false && b === true) {
      // Ignore this specific change as it's intentional and doesn't affect output
      return diffs;
    }
    diffs.push({ path, safe: a, current: b });
    return diffs;
  }

  if (typeof a !== "object") {
    if (a !== b) {
      diffs.push({ path, safe: a, current: b });
    }
    return diffs;
  }

  // Both are objects/arrays
  const isArrayA = Array.isArray(a);
  const isArrayB = Array.isArray(b);
  if (isArrayA !== isArrayB) {
    diffs.push({ path, safe: a, current: b });
    return diffs;
  }

  if (isArrayA) {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= a.length) {
        diffs.push({ path: `${path}[${i}]`, safe: undefined, current: b[i] });
      } else if (i >= b.length) {
        diffs.push({ path: `${path}[${i}]`, safe: a[i], current: undefined });
      } else {
        diffs.push(...deepCompare(a[i], b[i], `${path}[${i}]`));
      }
    }
    return diffs;
  }

  // Object comparison
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue;

    const childPath = path ? `${path}.${key}` : key;

    if (!(key in a)) {
      diffs.push({ path: childPath, safe: undefined, current: b[key] });
    } else if (!(key in b)) {
      diffs.push({ path: childPath, safe: a[key], current: undefined });
    } else {
      diffs.push(...deepCompare(a[key], b[key], childPath));
    }
  }

  return diffs;
}

for (const adapterType of [...allTypes].sort()) {
  const safeAdapters = safe[adapterType] || {};
  const currentAdapters = current[adapterType] || {};

  const commonKeys = Object.keys(safeAdapters).filter(
    (k) => k in currentAdapters
  );

  const typeDiffs = [];

  for (const key of commonKeys.sort()) {
    let diffs = deepCompare(
      safeAdapters[key],
      currentAdapters[key],
      `${adapterType}.${key}`
    );
    const ignoredPatterns = (str) => ([
      'ethodology',
      // 'dyorswap',
      // 'swapmode-v2',
      // 'viperswap',
      // 'canto-dex',
    ]).some(i => str.includes(i))
    diffs = diffs.filter(i => {
      const filter = i.safe !== undefined && !i.path.endsWith('pullHourly') && !ignoredPatterns(i.path)
      if (!filter) return false

      if(i.path.endsWith('runAtCurrTime') && i.safe === false && i.current === true) {
        return false
      }

      const paths = i.path.split('.')
      const safeJSON = safe[paths[0]]?.[paths[1]]?.[paths[2]]
      const currJSON = current[paths[0]]?.[paths[1]]?.[paths[2]]
      const currentAdapterJSONStr = JSON.stringify(currJSON);
        
      if (i.path.endsWith('.module.fetch')) {
        if (currentAdapterJSONStr?.includes('fetch')) return false
      }

      if (i.path.endsWith('.module.chains') && !currJSON?.chains) {
        const someChainIsMissing = safeJSON?.module?.chains?.some(chain =>  currentAdapterJSONStr?.includes(chain))
        return someChainIsMissing
      }
      
      if (i.path.endsWith('.start')) {
        return currentAdapterJSONStr?.includes(i.safe)
      }
      
      if (i.path.endsWith('.version')) {
        return i.safe > i.current
      }


      return true
    })
    if (diffs.length > 0) {
      typeDiffs.push({ key, diffs });
    }
  }

  if (typeDiffs.length > 0) {
    console.log(`\n[${adapterType}] ${typeDiffs.length} adapter(s) with differences:`);
    for (const { key, diffs } of typeDiffs) {
      console.log(`\n  ${key}:`);
      for (const d of diffs) {
        const safeFmt = fmt(d.safe);
        const currFmt = fmt(d.current);

        console.log(`    ${d.path}`);
        console.log(`      safe:    ${safeFmt}`);
        console.log(`      current: ${currFmt}`);
        diffCount++;
      }
    }
  }
}

// --- Summary ---
console.log("\n" + "=".repeat(80));
console.log("SUMMARY");
console.log("=".repeat(80));
console.log(`  Missing from current build : ${missingCount}`);
console.log(`  New in current build       : ${extraCount}`);
console.log(`  Value differences          : ${diffCount}`);

function fmt(v) {
  if (v === undefined) return "(missing)";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function cleanup(obj) {
  const adapterTypes = Object.keys(obj)
  for (const type of adapterTypes) {
    const adapters = obj[type]
    for (const adapterName in adapters) {
      const adapter = adapters[adapterName]
      if (adapter.module?.adapter) {
        for (const key of Object.keys(adapter.module.adapter)) {
          if (!whitelistedBaseAdapterKeys.has(key)) {
            delete adapter.module.adapter[key];
          }
        }
      }
    }
  }
  return obj
}