const http = require('axios')
const { getEnv } = require('./env')

const endpoint = () => getEnv('SUI_RPC')

async function getObject(objectId:string) {
  return (await call('sui_getObject', [objectId, {
    "showType": true,
    "showOwner": true,
    "showContent": true,
  }])).content
}

export async function queryEvents({ eventType, options, transform = (i:any) => i }:any):Promise<any[]> {
  let filter:any = {}
  if (eventType) filter.MoveEventType = eventType
  const items:any[] = []
  let cursor = null
  const fromTimestamp = options.endTimestamp - 86400;
  const toTimestamp = options.endTimestamp;
  do {
    const { data , nextCursor, hasNextPage } = await call('suix_queryEvents', [filter, cursor, 100, true], { withMetadata: true, })
    cursor = hasNextPage ? nextCursor : null
    items.push(...data.filter((ev:any)=>{
      const ts = Number(ev.timestampMs)/1e3
      return fromTimestamp > ts && ts < toTimestamp
    }))
    if(Number(data[data.length-1].timestampMs)/1e3 < fromTimestamp){
      cursor = null
    }
  } while (cursor)
  return items.map(i => i.parsedJson).map(transform)
}

async function call(method:string, params:any,  { withMetadata = false} = {}) {
  if (!Array.isArray(params)) params = [params]
  const {
    data: {result}
  } = await http.post(endpoint(), { jsonrpc: "2.0", id: 1, method, params, })
  return withMetadata ? result : result.data
}

async function multiCall(calls:any[]) {
  return Promise.all(calls.map(i => call(...(i as [any,any,any]))))
}
