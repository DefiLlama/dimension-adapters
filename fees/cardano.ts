import * as sdk from "@defillama/sdk";
import { SimpleAdapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { blockfrost } from "../helpers/cardano";
import { METRIC } from "../helpers/metrics";

const PAGE_SIZE = 100 // Blockfrost max `count`
const SHELLEY_EPOCH = 208 // Shelley hard fork, 2020-07-29: first epoch with a treasury and on-chain protocol parameters

async function getBlockFees(from: number, to: number): Promise<{ fees: bigint, epoch: number }> {
  const anchor = await sdk.chains.cardano.getBlockAtTimestamp({ timestamp: from })
  let fees = 0n

  for (let page = 1; ; page++) {
    const blocks = await blockfrost(`/blocks/${anchor.hash}/next?count=${PAGE_SIZE}&page=${page}`)
    for (const block of blocks) {
      if (block.time > to) return { fees, epoch: anchor.epoch }
      fees += BigInt(block.fees ?? 0) // null on blocks without transactions
    }
    if (blocks.length < PAGE_SIZE) throw new Error(`Cardano blocks indexed only up to ${blocks[blocks.length - 1]?.time}, window ends at ${to}`)
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const { fees, epoch } = await getBlockFees(options.fromTimestamp, options.toTimestamp)
  dailyFees.addCGToken('cardano', Number(fees) / 1e6, METRIC.TRANSACTION_GAS_FEES)

  if (epoch >= SHELLEY_EPOCH) {
    const { tau } = await blockfrost(`/epochs/${epoch}/parameters`)
    dailyRevenue.addCGToken('cardano', Number(fees) * tau / 1e6, 'Transaction Fees To Treasury')
  }

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.CARDANO],
  fetch,
  start: '2017-09-24',
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users on Cardano.',
    Revenue: 'Share of transaction fees sent to the Cardano treasury (the tau protocol parameter, 20% since the Shelley hard fork in July 2020; no treasury existed before).',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Fees paid by users for transactions included in blocks.',
    },
    Revenue: {
      'Transaction Fees To Treasury': 'The tau share (20%) of transaction fees sent to the Cardano treasury at each epoch boundary.',
    },
  },
}

export default adapter;
