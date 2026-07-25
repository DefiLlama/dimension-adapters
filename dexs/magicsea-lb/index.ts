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
  const lpTokens = await api.fetchList({ lengthAbi: ABIs.getNumberOfLBPairs, itemAbi: ABIs.getLBPairAtIndex, target: FACTORY_ADDRESS })
  const [tokens0, tokens1] = await Promise.all(['address:getTokenX', 'address:getTokenY'].map((abi: string) => api.multiCall({ abi, calls: lpTokens })));


  const pairObject: IJSON<string[]> = {}
  lpTokens.forEach((pair: string, i: number) => {
    pairObject[pair] = [tokens0[i], tokens1[i]]
  })

  // filter out the pairs with less than 1000 USD pooled value
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
      // protocol share (<= 25%) is carved out of totalFees; the rest stays with LPs.
      dailyRevenue.add(tokenX, protocolFeesX, METRIC.PROTOCOL_FEES)
      dailyRevenue.add(tokenY, protocolFeesY, METRIC.PROTOCOL_FEES)
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
    dailyHoldersRevenue: dailyRevenue,
  };
}

const methodology = {
  Fees: "Swap fees paid by traders on every swap, ranging from ~0.25% up to a 10% cap depending on the pool and market volatility.",
  UserFees: "Swap fees paid by traders on every swap.",
  Revenue: "The protocol share of swap fees (up to 25% of fees).",
  SupplySideRevenue: "The share of swap fees that stays with liquidity providers (at least 75% of fees).",
  HoldersRevenue: "The protocol share of swap fees, routed to the Magic LUM staking pool and paid to LUM stakers.",
}

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: "Total swap fees charged to traders." },
  UserFees: { [METRIC.SWAP_FEES]: "Total swap fees charged to traders." },
  Revenue: { [METRIC.PROTOCOL_FEES]: "Protocol share of swap fees." },
  SupplySideRevenue: { [METRIC.LP_FEES]: "Swap fees paid to liquidity providers." },
  HoldersRevenue: { [METRIC.PROTOCOL_FEES]: "Protocol share of swap fees paid to LUM stakers." },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.IOTAEVM],
  start: '2023-04-10',
  methodology,
  breakdownMethodology,
};

export default adapter;
