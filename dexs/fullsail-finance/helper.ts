import * as sdk from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { getCheckpointAtTimestamp, graphqlCall } from "../../helpers/sui";

// Original package ids, event types keep them across upgrades. https://docs.fullsail.finance/developer/contracts
// CLMM (Cetus fork): the Pools registry 0x0efb954710df6648d090bdfa4a5e274843212d6eb3efe157ee465300086e3650 is `<package>::factory::Pools`
const CLMM_PACKAGE = '0xe74104c66dd9f16b3096db2cc00300e556aa92edc871be4bc052b5dfb80db239';
// governance: the Minter 0x58f1b1c1c3b996ffc6e100131cddd0c9999d10a2744db37b5d2422ae52db97f4 is `<package>::minter::Minter`
const GOVERNANCE_PACKAGE = '0x03fcdcee11f485731170944af3acd26b17d1b96121ce6b756fe8517a95192b3a';
const SWAP_EVENT = `${CLMM_PACKAGE}::pool::SwapEvent`;
const EXERCISE_OSAIL_EVENT = `${GOVERNANCE_PACKAGE}::minter::EventExerciseOSail`;

export interface FullSailSwap {
  coinIn: string
  amountIn: bigint // gross of the swap fee
  fee: bigint
  holdersFee: bigint // fullsail_fee_amount, distributed to veSAIL voters
  protocolFee: bigint // protocol_fee_amount, insurance fund
  refFee: bigint // ref_fee_amount, partner/referrer share
}

export interface FullSailExercise {
  feeToken: string
  fee: bigint // exercise_fee_amount, paid by the user to convert oSAIL into SAIL
  holdersFee: bigint // fee_to_distribute, distributed to veSAIL holders
  protocolFee: bigint // protocol_fee_amount
}

// one binary search per window, shared by the swap and exercise scans
const checkpointBeforeWindow: Record<number, Promise<{ sequenceNumber: number }>> = {};

// Events in [startTimestamp, endTimestamp), walking forward from the checkpoint before the window
async function getEvents(options: FetchOptions, eventType: string): Promise<any[]> {
  const events: any[] = [];
  checkpointBeforeWindow[options.startTimestamp] ??= getCheckpointAtTimestamp(options.startTimestamp - 1);
  const { sequenceNumber } = await checkpointBeforeWindow[options.startTimestamp];
  let after: string | null = null;
  while (true) {
    const { events: page } = await graphqlCall(`query ($after: String) {
      events(first: 50, after: $after, filter: { type: "${eventType}", afterCheckpoint: ${sequenceNumber} }) {
        pageInfo { hasNextPage endCursor }
        nodes { timestamp contents { json } }
      }
    }`, { after });
    const inWindow = page.nodes.filter((node: any) => Date.parse(node.timestamp) / 1e3 < options.endTimestamp);
    for (const node of inWindow) {
      if (Date.parse(node.timestamp) / 1e3 >= options.startTimestamp) events.push(node.contents.json);
    }
    if (inWindow.length < page.nodes.length || !page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  return events;
}

export async function getSwaps(options: FetchOptions): Promise<FullSailSwap[]> {
  const events = await getEvents(options, SWAP_EVENT);

  const poolIds = [...new Set(events.map((e) => e.pool))];
  const pools = await sdk.chains.sui.getObjects({ objectIds: poolIds, skipLayout: true });
  const poolCoins: Record<string, string[]> = {};
  poolIds.forEach((id, i) => {
    if (!pools[i]) throw new Error(`Full Sail pool ${id} not found`);
    poolCoins[id] = sdk.chains.sui.parseStructTag(pools[i]!.type).typeParams;
  });

  return events.map((e) => {
    const [coinA, coinB] = poolCoins[e.pool];
    return {
      coinIn: e.atob ? coinA : coinB,
      amountIn: BigInt(e.amount_in),
      fee: BigInt(e.fee_amount),
      holdersFee: BigInt(e.fullsail_fee_amount),
      protocolFee: BigInt(e.protocol_fee_amount),
      refFee: BigInt(e.ref_fee_amount),
    };
  });
}

export async function getOSailExercises(options: FetchOptions): Promise<FullSailExercise[]> {
  const events = await getEvents(options, EXERCISE_OSAIL_EVENT);
  return events.map((e) => ({
    feeToken: '0x' + e.exercise_fee_token_type,
    fee: BigInt(e.exercise_fee_amount),
    holdersFee: BigInt(e.fee_to_distribute),
    protocolFee: BigInt(e.protocol_fee_amount),
  }));
}
