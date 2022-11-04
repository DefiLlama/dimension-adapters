const ALLOWED_ROOTS = ['dexs', 'options', 'derivatives', 'incentives', 'fees', 'options']
const MODIFIED = parse(process.env.MODIFIED)
const ADDED = parse(process.env.ADDED)
const fileSet = new Set();

[...MODIFIED, ...ADDED].forEach(file => {
  console.log("all files->", JSON.stringify([...fileSet]))
  const [root, adapter] = file.split('/')
  if (ALLOWED_ROOTS.includes(root) && adapter !== undefined)
    fileSet.add(`${root}@${adapter}`)
})

function parse(data) {
  return data.replace('[', '').replace(']', '').split(',')
}