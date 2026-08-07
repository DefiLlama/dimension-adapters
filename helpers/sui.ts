const http = require('axios')
const { getEnv } = require('./env')

// Sui JSON-RPC is deprecated, migrated to GraphQL RPC
// https://docs.sui.io/concepts/data-access/graphql-rpc
// https://docs.sui.io/develop/accessing-data/json-rpc-migration#method-mapping
const graphEndpoint = () => getEnv('SUI_GRAPH_RPC')

async function graphqlCall(query: string, variables: any = {}, attempts = 4) {
  let lastErr: any
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await http.post(graphEndpoint(), { query, variables })
      const { data, errors } = res.data
      if (errors?.length || !data) throw new Error(`Failed to fetch sui data: ${errors?.[0]?.message ?? 'no data returned'}`)
      return { data }
    } catch (e) {
      lastErr = e
      if (i < attempts) await new Promise((r) => setTimeout(r, 500 * i))
    }
  }
  throw lastErr
}

function normalizeFields(fields: any): any {
  if (!fields || typeof fields !== 'object') return fields
  const normalized: any = {}
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'id' && typeof value === 'string') {
      normalized[key] = { id: value }
    } else if (Array.isArray(value)) {
      normalized[key] = value.map((v: any) => (typeof v === 'object' && v !== null) ? wrapStruct(v) : v)
    } else if (typeof value === 'object' && value !== null) {
      normalized[key] = wrapStruct(value)
    } else {
      normalized[key] = value
    }
  }
  return normalized
}

function wrapStruct(obj: any): any {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj
  return { fields: normalizeFields(obj) }
}

function shortenTypeAddresses(type: string): string {
  return type
    .replace(/0x0*([0-9a-fA-F])/g, '0x$1')
    .replace(/0x([0-9a-fA-F]{63})(?![0-9a-fA-F])/g, '0x0$1')
}

function rewrapWithLayout(value: any, layout: any): any {
  if (!layout || typeof layout === 'string') {
    if (layout === 'address' && typeof value === 'string' && value && !value.startsWith('0x')) return '0x' + value
    return value
  }
  if (layout.vector !== undefined)
    return Array.isArray(value) ? value.map((v: any) => rewrapWithLayout(v, layout.vector)) : value
  if (layout.struct) {
    const { type, fields } = layout.struct
    if (type.endsWith('::object::UID')) return { id: (value && typeof value === 'object') ? value.id : value }
    if (type.endsWith('::object::ID') || type.endsWith('::string::String') || type.endsWith('::ascii::String'))
      return (value && typeof value === 'object') ? Object.values(value)[0] : value
    const t = shortenTypeAddresses(type.replace(/,(?!\s)/g, ', '))
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const f: any = {}
      for (const fl of fields) f[fl.name] = rewrapWithLayout(value[fl.name], fl.layout)
      return { type: t, fields: f }
    }
    if (type.endsWith('::type_name::TypeName'))
      return { type: t, fields: { [fields[0].name]: value } }
    return value
  }
  return value
}

function formatObject(obj: any): any {
  if (!obj) return null
  const layout = obj.type?.layout
  if (layout) {
    const { type, fields } = rewrapWithLayout(obj.json, layout)
    return { type, fields, dataType: 'moveObject' }
  }
  const type = shortenTypeAddresses(obj.type.repr.replace(/,(?!\s)/g, ', '))
  return { type, fields: normalizeFields(obj.json), dataType: 'moveObject' }
}

function toAddr(id: string): string {
  if (typeof id === 'string' && id && !id.startsWith('0x') && /^[0-9a-fA-F]+$/.test(id)) return '0x' + id
  return id
}

function toParsedJson(value: any, layout: any): any {
  if (value === null || value === undefined) return value
  if (!layout || typeof layout === 'string') return value // bool / uN / address
  if (layout.vector !== undefined) return Array.isArray(value) ? value.map((v: any) => toParsedJson(v, layout.vector)) : value
  if (layout.struct) {
    const { type, fields } = layout.struct
    const unwrap = (v: any) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.values(v)[0] : v
    if (type.endsWith('::type_name::TypeName')) return { name: unwrap(value) }
    if (type.endsWith('::ascii::String') || type.endsWith('::string::String') || type.endsWith('::object::ID')) return unwrap(value)
    if (type.endsWith('::object::UID')) return { id: (value && typeof value === 'object') ? (value.id ?? unwrap(value)) : value }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const out: any = {}
      for (const f of fields) out[f.name] = toParsedJson(value[f.name], f.layout)
      return out
    }
    return value
  }
  return value
}

export async function getObject(objectId: string) {
  const { data } = await graphqlCall(`{
    object(address: "${toAddr(objectId)}") {
      asMoveObject { contents { json type { repr layout } } }
    }
  }`)
  return formatObject(data.object?.asMoveObject?.contents)
}

export async function queryEvents({ eventType, eventModule, options, transform = (i: any) => i }: any): Promise<any[]> {
  let filter = ''
  if (eventModule) {
    filter = `filter: { module: "${eventModule.package}::${eventModule.module}" }`
  } else if (eventType) {
    filter = `filter: { type: "${eventType}" }`
  }

  const items: any[] = []
  let before: string | null = null
  do {
    const { data } = await graphqlCall(`query ($before: String) {
      events(last: 50, before: $before, ${filter}) {
        pageInfo { hasPreviousPage startCursor }
        nodes { timestamp contents { json type { layout } } }
      }
    }`, { before })

    const { pageInfo, nodes } = data.events // nodes ascending (oldest -> newest)
    before = pageInfo.hasPreviousPage ? pageInfo.startCursor : null

    for (const node of nodes) {
      const ts = Date.parse(node.timestamp) / 1e3
      if (options.startTimestamp < ts && ts < options.endTimestamp) items.push(toParsedJson(node.contents.json, node.contents.type.layout))
    }
    // stop once the oldest event on this page is already before the window start
    if (!nodes.length || Date.parse(nodes[0].timestamp) / 1e3 <= options.startTimestamp) before = null
  } while (before)

  return items.map(transform)
}
