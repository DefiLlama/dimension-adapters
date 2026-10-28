// TON helpers on top of `sdk.chains.ton` (toncenter v2/v3). Endpoint from `TON_RPC`, api key
// from `TONCENTER_API_KEY`; unauthenticated calls are paced to ~1 req/s by the sdk, so callers
// no longer need their own sleeps between pages.
import * as sdk from "@defillama/sdk";
import "./env"; // copies the repo's default endpoints / keys into process.env for the sdk

const ton = sdk.chains.ton

export const toBigInt = (v: any): bigint => {
  if (v === null || v === undefined) return 0n
  if (typeof v === "bigint") return v
  if (typeof v === "string") return BigInt(v)
  if (typeof v === "number") return BigInt(Math.trunc(v))
  return 0n
}

// Lower-cased address string for raw (`0:abc...`) address comparisons.
export const normAddr = (addr: string | undefined | null): string => (addr ?? "").toLowerCase()

export interface PageToncenterTxsParams {
  /** account address(es), raw or friendly */
  account: string | string[]
  /** inclusive, unix seconds */
  startTimestamp: number
  /** exclusive, unix seconds */
  endTimestamp: number
  /** page size, default 1000 (toncenter max) */
  limit?: number
  sort?: 'asc' | 'desc'
}

// Every v3 transaction of `account` in `[startTimestamp, endTimestamp)`, deduped by hash,
// walking all pages of `/api/v3/transactions`.
export async function pageToncenterTxs({ account, startTimestamp, endTimestamp, limit = 1000, sort = 'desc' }: PageToncenterTxsParams): Promise<any[]> {
  return ton.getTransactions({ account, startTimestamp, endTimestamp, limit, sort })
}

export interface PageToncenterMessagesParams {
  source?: string
  destination?: string
  direction?: 'in' | 'out'
  opcode?: string
  /** inclusive, unix seconds */
  startTimestamp: number
  /** exclusive, unix seconds */
  endTimestamp: number
  /** page size, default 1000 (toncenter max) */
  limit?: number
  sort?: 'asc' | 'desc'
}

// Every v3 message matching the filters in `[startTimestamp, endTimestamp)`, deduped by hash,
// walking all pages of `/api/v3/messages`.
export async function pageToncenterMessages({ source, destination, direction, opcode, startTimestamp, endTimestamp, limit = 1000, sort = 'desc' }: PageToncenterMessagesParams): Promise<any[]> {
  return ton.getMessages({ source, destination, direction, opcode, startTimestamp, endTimestamp, limit, sort })
}

// Masterchain seqno of the block at (or right before) `timestamp`.
export async function getTonBlock(timestamp: number): Promise<number> {
  const block = await ton.lookupBlock({ utime: timestamp })
  return Number(block.seqno)
}

// get methods
export const runGetMethod = ton.runGetMethod
export const callGetMethod = ton.call

// address codec
export const Address = ton.Address
export const parseAddress = ton.parseAddress
export const normalizeAddress = ton.normalizeAddress
export const toRawAddress = ton.toRawAddress
export const compareAddress = ton.compareAddress
export const isAddress = ton.isAddress
export const addressToInt = ton.addressToInt
