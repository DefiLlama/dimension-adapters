import * as sdk from "@defillama/sdk";
import { SimpleAdapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { blockfrost } from "../helpers/cardano";
import { httpGet } from "../utils/fetchURL";

const BLOCKS_PAGE_SIZE = 100

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const [fromBlock, toBlock] = await Promise.all([
    sdk.chains.cardano.getBlockAtTimestamp({ timestamp: options.startTimestamp - 1 }),
    sdk.chains.cardano.getBlockAtTimestamp({ timestamp: options.endTimestamp - 1 }),
  ])
  const blockCount = toBlock.number - fromBlock.number
  const pages = await Promise.all(Array.from({ length: Math.ceil(blockCount / BLOCKS_PAGE_SIZE) }, (_, i) =>
    blockfrost(`/blocks/${fromBlock.number}/next?count=${BLOCKS_PAGE_SIZE}&page=${i + 1}`)
  ))
  const blocks = pages.flat().filter((block: any) => block.height <= toBlock.number)
  if (blocks.length !== blockCount) {
    throw Error(`Expected ${blockCount} cardano blocks at ${options.dateString}, got ${blocks.length}`)
  }

  const treasuryCut = (await httpGet(
    `https://api.koios.rest/api/v1/epoch_params?order=epoch_no.desc&limit=1&select=epoch_no,treasury_growth_rate`
  ))[0]?.treasury_growth_rate

  const fees = blocks.reduce((sum: bigint, block: any) => sum + BigInt(block.fees ?? 0), 0n)
  dailyFees.addCGToken('cardano', Number(fees) / 1e6)

  // 2022-01-01
  const dailyRevenue = options.startOfDay >= 1577836800 ? dailyFees.clone(treasuryCut) : 0;
  
  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch,
  start: '2017-09-24',
  protocolType: ProtocolType.CHAIN
}

export default adapter;
