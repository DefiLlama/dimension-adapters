// Sui helpers on top of `sdk.chains.sui` (GraphQL RPC, endpoint from `SUI_GRAPH_RPC`).
// https://docs.sui.io/concepts/data-access/graphql-rpc
import * as sdk from "@defillama/sdk";
import "./env"; // copies the repo's default endpoints (SUI_GRAPH_RPC, ...) into process.env for the sdk
import { queryAllium } from './allium'

const sui = sdk.chains.sui

// Move object contents shaped like the JSON-RPC `content` (`{ type, fields, dataType }`), null when missing.
export async function getObject(objectId: string): Promise<any> {
  return sui.getObject({ objectId })
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

// Events in the half-open window `[startTimestamp, endTimestamp)`, filtered by emitting module
// (preferred when given) or by event type, as `parsedJson`-shaped payloads.
export async function queryEvents<T = any>({ eventType, eventModule, options, transform }: QueryEventsParams<T>): Promise<T[]> {
  return sui.queryEvents<T>({
    eventType: eventModule ? undefined : eventType,
    eventModule,
    startTimestamp: options.startTimestamp,
    endTimestamp: options.endTimestamp,
    transform,
  })
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
    if (t) byType[t].push(row.parsed_json)
  }
  return byType
}
