import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { filterPools } from "../../helpers/uniswap";

const event_swap = 'event Swap(address indexed sender, address indexed to, uint24 id, bytes32 amountsIn, bytes32 amountsOut, uint24 volatilityAccumulator, bytes32 totalFees, bytes32 protocolFees)';
const FACTORY_ADDRESS = '0x8Cce20D17aB9C6F60574e678ca96711D907fD08c';

type TABI = {
  [k: string]: string;
}
const ABIs: TABI = {
  "getNumberOfLBPairs": "uint256:getNumberOfLBPairs",
  "getLBPairAtIndex": "function getLBPairAtIndex(uint256 index) view returns (address lbPair)"
}

// Liquidity Book packs a bytes32 as (amountY << 128) | amountX:
// left 32 hex chars (most-significant) = tokenY, right 32 = tokenX.
const decodeY = (bytes: string) => Number('0x' + bytes.replace('0x', '').slice(0, 32));
const decodeX = (bytes: string) => Number('0x' + bytes.replace('0x', '').slice(32, 64));

const fetch: any = async ({ getLogs, api, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const lpTokens = await api.fetchList({ lengthAbi: ABIs.getNumberOfLBPairs, itemAbi: ABIs.getLBPairAtIndex, target: FACTORY_ADDRESS })
  const [tokens0, tokens1] = await Promise.all(['address:getTokenX', 'address:getTokenY'].map((abi: string) => api.multiCall({ abi, calls: lpTokens })));


  const pairObject: IJSON<string[]> = {}
  lpTokens.forEach((pair: string, i: number) => {
    pairObject[pair] = [tokens0[i], tokens1[i]]
  })

  // keep pairs with at least 200 USD pooled (filterPools default), capped at the top 42 by pooled value
  const filteredPairs = await filterPools({ api: api, pairs: pairObject, createBalances: createBalances })
  await Promise.all(Object.keys(filteredPairs).map(async (pair) => {
    const [tokenX, tokenY] = pairObject[pair]
    const logs = await getLogs({ target: pair, eventAbi: event_swap })
    logs.forEach(log => {
      dailyVolume.add(tokenY, decodeY(log.amountsOut));
      dailyVolume.add(tokenX, decodeX(log.amountsOut));

      const totalFeesX = decodeX(log.totalFees);
      const totalFeesY = decodeY(log.totalFees);
      const protocolFeesX = decodeX(log.protocolFees);
      const protocolFeesY = decodeY(log.protocolFees);

      dailyFees.add(tokenX, totalFeesX, METRIC.SWAP_FEES)
      dailyFees.add(tokenY, totalFeesY, METRIC.SWAP_FEES)
      // protocol share (25% on every pair) is carved out of totalFees; the rest stays with LPs.
      dailyRevenue.add(tokenX, protocolFeesX, METRIC.PROTOCOL_FEES)
      dailyRevenue.add(tokenY, protocolFeesY, METRIC.PROTOCOL_FEES)

      dailyHoldersRevenue.add(tokenX, protocolFeesX, METRIC.STAKING_REWARDS)
      dailyHoldersRevenue.add(tokenY, protocolFeesY, METRIC.STAKING_REWARDS)

      dailySupplySideRevenue.add(tokenX, totalFeesX - protocolFeesX, METRIC.LP_FEES)
      dailySupplySideRevenue.add(tokenY, totalFeesY - protocolFeesY, METRIC.LP_FEES)
    })
  }))

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
}

const methodology = {
  Fees: "Swap fees paid by traders, from 0.05% on stablecoin pairs to 0.8% on volatile pairs, rising further while the market is volatile.",
  UserFees: "Swap fees paid by traders on every swap.",
  Revenue: "25% of swap fees, the protocol's share on every pool.",
  SupplySideRevenue: "The other 75% of swap fees, which stays with liquidity providers.",
  HoldersRevenue: "The protocol's 25% share of swap fees, routed to the Magic LUM staking pool and paid out to MLUM stakers in USDC.",
}

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: "Total swap fees charged to traders." },
  UserFees: { [METRIC.SWAP_FEES]: "Total swap fees charged to traders." },
  Revenue: { [METRIC.PROTOCOL_FEES]: "Protocol share of swap fees." },
  SupplySideRevenue: { [METRIC.LP_FEES]: "Swap fees paid to liquidity providers." },
  HoldersRevenue: { [METRIC.STAKING_REWARDS]: "Protocol share of swap fees paid to MLUM stakers." },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.IOTAEVM],
  start: '2024-04-10',
  methodology,
  breakdownMethodology,
};

export default adapter;
