const ALLOWED_ROOTS = ['volumes', 'dexs', 'options', 'derivatives', 'incentives', 'fees', 'options', 'protocols', 'aggregators','aggregator-derivatives','bridge-aggregators', 'open-interest']
const MODIFIED = parse(process.env.MODIFIED)
const ADDED = parse(process.env.ADDED)
const fileSet = new Set();

[...MODIFIED, ...ADDED].forEach(file => {
  // Skip markdown documentation files (e.g., GUIDELINES.md)
  if (file.endsWith('.md')) return;
  
  const [root, adapter] = file.split('/')
  if (ALLOWED_ROOTS.includes(root) && adapter !== undefined)
    fileSet.add(`${root}@${adapter}`)
})

console.log(JSON.stringify([...fileSet]))

function parse(data) {
  return data.replace('[', '').replace(']', '').split(',')
}
