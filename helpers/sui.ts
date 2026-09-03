const http = require('axios')
const { getEnv } = require('./env')
const { queryAllium } = require('./allium')

// Sui JSON-RPC is deprecated, migrated to GraphQL RPC
// https://docs.sui.io/concepts/data-access/graphql-rpc
// https://docs.sui.io/develop/accessing-data/json-rpc-migration#method-mapping
const graphEndpoint = () => getEnv('SUI_GRAPH_RPC')

async function graphqlCall(query: string, variables: any = {}, attempts = 4) {
  let lastErr: any
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await http.post(graphEndpoint(), { query, variables }, { timeout: 60_000 })
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
  return type.replace(/0x([0-9a-fA-F]+)/g, (_m: string, hex: string) => {
    const stripped = hex.replace(/^0+/, '') || '0'
    return stripped.length <= 1 ? '0x' + stripped : '0x' + stripped.padStart(64, '0')
  })
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
  if (!obj || !obj.type) return null
  const layout = obj.type.layout
  if (layout) {
    const rewrapped = rewrapWithLayout(obj.json, layout)
    if (!rewrapped || typeof rewrapped !== 'object')
      throw new Error(`Unexpected Sui move object shape for type ${obj.type.repr}`)
    const { type, fields } = rewrapped
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
  const { data } = await graphqlCall(`query ($address: SuiAddress!) {
    object(address: $address) {
      asMoveObject { contents { json type { repr layout } } }
    }
  }`, { address: toAddr(objectId) })
  return formatObject(data.object?.asMoveObject?.contents)
}

export interface SuiEventModule {
  package: string
  module: string
}

export interface QueryEventsParams<T = any> {
  eventType?: string
  eventModule?: SuiEventModule
  options: { startTimestamp: number; endTimestamp: number }
  transform?: (item: any) => T
}

export async function queryEvents<T = any>({ eventType, eventModule, options, transform = (i: any) => i }: QueryEventsParams<T>): Promise<T[]> {
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
        nodes { timestamp contents { json type { repr layout } } }
      }
    }`, { before })

    const { pageInfo, nodes } = data.events // nodes ascending (oldest -> newest)
    before = pageInfo.hasPreviousPage ? pageInfo.startCursor : null

    for (const node of nodes) {
      const ts = Date.parse(node.timestamp) / 1e3
      // half-open window: startTimestamp inclusive, endTimestamp exclusive
      if (options.startTimestamp <= ts && ts < options.endTimestamp) {
        const parsedEvent = toParsedJson(node.contents.json, node.contents.type.layout)
        parsedEvent.type = node.contents.type.repr
        items.push(parsedEvent)
      }
    }

    // stop once the oldest event on this page is already before the window start
    if (!nodes.length || Date.parse(nodes[0].timestamp) / 1e3 <= options.startTimestamp) before = null
  } while (before)

  return items.map(transform)
}

// graphql queryEvents doesn't retrieve historical events so we use allium for this
export async function queryEventsAllium(
  eventTypes: string[],
  options: { fromTimestamp: number; toTimestamp: number }
): Promise<Record<string, any[]>> {
  const start = new Date(options.fromTimestamp * 1000).toISOString()
  const end = new Date(options.toTimestamp * 1000).toISOString()
  const typeFilter = eventTypes.map((t) => `type LIKE '${t}%'`).join(' OR ')
  const rows: any[] = await queryAllium(`
    SELECT type, parsed_json
    FROM sui.raw.events
    WHERE checkpoint_timestamp >= '${start}' AND checkpoint_timestamp < '${end}'
      AND (${typeFilter})
  `)
  const byType: Record<string, any[]> = Object.fromEntries(eventTypes.map((t) => [t, []]))
  for (const row of rows) {
    const t = eventTypes.find((t) => row.type.startsWith(t))
    if (t) {
      byType[t].push({
        ...row.parsed_json,
        type: row.type
    })
  }
  }
  return byType
}
