const http = require('axios')
const { getEnv } = require('./env')

// const endpoint = () => getEnv('IOTA_RPC')
const endpoint = () => 'https://api.mainnet.iota.cafe:443'

export async function getObject(objectId:string) {
  return (await call('iota_getObject', [objectId, {
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
  do {
    const { data , nextCursor, hasNextPage } = await call('iotax_queryEvents', [filter, cursor, 100, true], { withMetadata: true, })
    cursor = hasNextPage ? nextCursor : null
    items.push(...data.filter((ev:any)=>{
      const ts = Number(ev.timestampMs)/1e3
      return options.startTimestamp < ts && ts < options.endTimestamp
    }))
    if(Number(data[data.length-1].timestampMs)/1e3 < options.startTimestamp){
      cursor = null
    }
  } while (cursor)
  return items.map(i => i.parsedJson).map(transform)
}

export async function call(method:string, params:any,  { withMetadata = false} = {}) {
  if (!Array.isArray(params)) params = [params]
  const {
    data: {result}
  } = await http.post(endpoint(), { jsonrpc: "2.0", id: 1, method, params, })
  return withMetadata ? result : result.data
}

export async function multiCall(calls:any[]) {
  return Promise.all(calls.map(i => call(...(i as [any,any,any]))))
}
