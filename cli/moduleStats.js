const data = require('./dimensionModules.json');

function newStat() {
  return { total: 0, noVersion: 0, version1: 0, version2: 0, dead: 0, pullHourly: 0, runAtCurrTime: 0, notPullHourly: 0 };
}

function isFactory(codePath) {
  return codePath.startsWith('factory/') || codePath.startsWith('helpers/');
}

const factory = {};
const individual = {};

for (const [adapterType, protocols] of Object.entries(data)) {
  factory[adapterType] = newStat();
  individual[adapterType] = newStat();

  for (const [name, info] of Object.entries(protocols)) {
    const bucket = isFactory(info.codePath) ? factory[adapterType] : individual[adapterType];
    bucket.total++;
    const mod = info.module;
    const version = mod.version
    const isDead = mod.deadFrom

    if (isDead) bucket.dead++;
    else if (version === undefined || version === null) bucket.noVersion++;
    else if (version === 1) bucket.version1++;
    else if (version === 2) bucket.version2++;

    if (!isDead && mod.pullHourly) bucket.pullHourly++;
    else if (!isDead && !mod.pullHourly) bucket.notPullHourly++;
    if (!isDead && mod.runAtCurrTime) bucket.runAtCurrTime++;
  }
}

function printTable(title, stats) {
  console.log('='.repeat(100));
  console.log(title);
  console.log('='.repeat(100));

  const header = [
    'Type'.padEnd(25),
    'Total'.padStart(7),
    'No Ver'.padStart(8),
    'V1'.padStart(6),
    'V2'.padStart(6),
    'Dead'.padStart(8),
    'PullHrly'.padStart(10),
    'RunAtCurr'.padStart(11),
    'NotPullHrly'.padStart(13),
  ].join(' | ');

  console.log(header);
  console.log('-'.repeat(100));

  const grand = newStat();

  for (const [type, s] of Object.entries(stats)) {
    if (s.total === 0) continue;
    const row = [
      type.padEnd(25),
      String(s.total).padStart(7),
      String(s.noVersion).padStart(8),
      String(s.version1).padStart(6),
      String(s.version2).padStart(6),
      String(s.dead).padStart(8),
      String(s.pullHourly).padStart(10),
      String(s.runAtCurrTime).padStart(11),
      String(s.notPullHourly).padStart(13),
    ].join(' | ');
    console.log(row);

    for (const k of Object.keys(grand)) grand[k] += s[k];
  }

  console.log('-'.repeat(100));
  const totalRow = [
    'TOTAL'.padEnd(25),
    String(grand.total).padStart(7),
    String(grand.noVersion).padStart(8),
    String(grand.version1).padStart(6),
    String(grand.version2).padStart(6),
    String(grand.dead).padStart(8),
    String(grand.pullHourly).padStart(10),
    String(grand.runAtCurrTime).padStart(11),
    String(grand.notPullHourly).padStart(13),
  ].join(' | ');
  console.log(totalRow);
  console.log('');
}

printTable('FACTORY ADAPTERS (codePath starts with factory/ or helpers/)', factory);
printTable('INDIVIDUAL ADAPTERS (own file)', individual);
