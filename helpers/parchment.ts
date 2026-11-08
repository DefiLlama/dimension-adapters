// Parchment perps on Sui (https://parchment.trade). Shared by dexs/parchment, fees/parchment and open-interest/parchment.
// Contracts: https://docs.parchment.trade/contracts , fees: https://docs.parchment.trade/trading/fees
import ADDRESSES from "./coreAssets.json";
import { getObject, graphqlCall, queryEvents } from "./sui";

// Core `parchment` package. Every Parchment event is emitted as `<CORE>::events::Event<<CORE>::events::X>`.
// Sui keys a type on the package that first defined it, so these strings survive in-place upgrades of the
// package; a new event struct added by an upgrade would carry the upgraded package id instead.
export const PARCHMENT_CORE = "0xb4d5d077a8997f8dcbfefe36dd61ec8f26dfa0f789ba83e81e55252fd30eb3a2";
// The single USDC Exchange (shared object). Created 2026-11-03, first trade 2026-11-03, public launch 2026-11-06.
export const PARCHMENT_EXCHANGE = "0xbe3c5d2d066c8ec04b4f280fab7c560f78deff91c7abcbdb38a750b797c29c82";
// Collateral of every market and the vault: native Circle USDC (6 decimals).
export const PARCHMENT_USDC = ADDRESSES.sui.USDC_CIRCLE;
export const PARCHMENT_START = "2026-11-03";

// Close fee in parts per million of position notional, stamped on every position at open
// (`constants::close_fee_ppm`, 0.4 bp; `OpenPositionEventV1.close_fee_ppm`). Used to recover a closed
// position's notional from `CloseFeesEventV2.close_charge` (= floor(notional * ppm / 1e6)).
export const CLOSE_FEE_PPM = 40n;

const eventType = (name: string) => `${PARCHMENT_CORE}::events::Event<${PARCHMENT_CORE}::events::${name}>`;

// Events of one type in the half-open window [start, end), unwrapped from the `Event<T>` envelope (`pos0`).
export async function getParchmentEvents(name: string, startTimestamp: number, endTimestamp: number): Promise<any[]> {
  return queryEvents({
    eventType: eventType(name),
    options: { startTimestamp, endTimestamp },
    transform: (e: any) => e.pos0 ?? e,
  });
}

// Events that carry `exchange_id` are filtered to the Parchment USDC Exchange.
export const isParchmentExchange = (e: any) => e.exchange_id === PARCHMENT_EXCHANGE;

// Closed notional of a voluntary close, keeper close or session force close, in USDC base units, from its
// close charge. Rounding is at most 1e6 / 40 - 1 base units (< $0.025) per close.
export function closedNotional(closeCharge: string | number): bigint {
  return (BigInt(closeCharge) * 1_000_000n) / CLOSE_FEE_PPM;
}

// Each Exchange / Market keeps its state in a dynamic object field keyed by `extended_field::VersionKey(version)`.
export async function getVersionedState(objectId: string): Promise<any> {
  const parent = await getObject(objectId);
  if (!parent?.fields?.version) throw new Error(`Parchment: object ${objectId} not found`);
  const version = BigInt(parent.fields.version);
  const key = Buffer.alloc(8);
  key.writeBigUInt64LE(version); // BCS of `VersionKey(u64)` is the bare u64
  const bcs = key.toString("base64");
  const data = await graphqlCall(`query ($parent: SuiAddress!, $name: DynamicFieldName!) {
    address(address: $parent) { dynamicObjectField(name: $name) { value { ... on MoveObject { contents { json } } } } }
  }`, { parent: objectId, name: { type: `${PARCHMENT_CORE}::extended_field::VersionKey`, bcs } });
  const state = data?.address?.dynamicObjectField?.value?.contents?.json;
  if (!state) throw new Error(`Parchment: versioned state of ${objectId} (version ${version}) not found`);
  return state;
}
