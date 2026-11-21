import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from '../../helpers/coreAssets.json'

const endpoint = sdk.graph.modifyEndpoint('5CBKsDihF7KeBrNX4bgtb4tVFqy41PguVm88zBGpd4Hi');

const FEE_DENOMINATOR: Record<string, number> = {
  '0xd6715a8be3944ec72738f0bfdc739d48c3c29349': 1000,   // NomiswapFactory (constant product)
  '0xc6b7ee49d386bae4fd501f2d2f8d18828f1f6285': 100000, // NomiswapStableFactory
};
const Q112 = 2n ** 112n;
const ZERO_ADDRESS = ADDRESSES.null;
const MAX_HOURLY_VOLUME_TO_LIQUIDITY = 10;

type PairSnapshot = { factory: string, volumeUSD: number, reserveUSD: number };

async function getPairSnapshots(fromBlock: number, toBlock: number) {
  const start: Record<string, PairSnapshot> = {};
  const end: Record<string, PairSnapshot> = {};
  const toSnapshot = (pair: any): PairSnapshot => ({ factory: pair.factory.id, volumeUSD: Number(pair.volumeUSD), reserveUSD: Number(pair.reserveUSD) });
  const fields = 'id volumeUSD reserveUSD factory { id }';
  let lastId = '';
  while (true) {
    const { startPairs, endPairs } = await sdk.graph.request(endpoint, `{
      startPairs: pairs(first: 1000, orderBy: id, where: { id_gt: "${lastId}" }, block: { number: ${fromBlock} }) { ${fields} }
      endPairs: pairs(first: 1000, orderBy: id, where: { id_gt: "${lastId}" }, block: { number: ${toBlock} }) { ${fields} }
    }`);
    for (const pair of startPairs) start[pair.id] = toSnapshot(pair);
    for (const pair of endPairs) end[pair.id] = toSnapshot(pair);
    if (endPairs.length < 1000) return { start, end };
    lastId = endPairs[endPairs.length - 1].id;
  }
}

async function fetch(options: FetchOptions) {
  const { start, end } = await getPairSnapshots(await options.getFromBlock(), await options.getToBlock());
  const maxVolumeToLiquidity = MAX_HOURLY_VOLUME_TO_LIQUIDITY * (options.toTimestamp - options.fromTimestamp) / 3600;
  const pairs = Object.entries(end)
    .map(([id, { factory, volumeUSD, reserveUSD }]) => ({
      id,
      factory,
      volume: volumeUSD - (start[id]?.volumeUSD ?? 0),
      liquidity: Math.max(reserveUSD, start[id]?.reserveUSD ?? 0),
    }))
    .filter(pair => pair.volume > 0 && pair.volume <= pair.liquidity * maxVolumeToLiquidity);

  const factories = [...new Set(pairs.map(pair => pair.factory))];
  const [swapFees, devFees, feeTos] = await Promise.all([
    options.api.multiCall({ abi: 'uint32:swapFee', calls: pairs.map(pair => pair.id) }),
    options.api.multiCall({ abi: 'uint256:devFee', calls: pairs.map(pair => pair.id) }),
    options.api.multiCall({ abi: 'address:feeTo', calls: factories }),
  ]);

  let dailyVolume = 0;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  pairs.forEach((pair, i) => {
    const denominator = FEE_DENOMINATOR[pair.factory];
    if (!denominator) throw new Error(`Unknown Nomiswap factory ${pair.factory} for pair ${pair.id}`);
    const feeOn = feeTos[factories.indexOf(pair.factory)].toLowerCase() !== ZERO_ADDRESS;
    const protocolShare = feeOn ? Number(Q112 * 1_000_000n / (Q112 + BigInt(devFees[i]))) / 1e6 : 0;
    const fees = pair.volume * Number(swapFees[i]) / denominator;

    dailyVolume += pair.volume;
    dailyFees.addUSDValue(fees, METRIC.SWAP_FEES);
    dailyRevenue.addUSDValue(fees * protocolShare, 'Swap Fees To Protocol');
    dailySupplySideRevenue.addUSDValue(fees * (1 - protocolShare), METRIC.LP_FEES);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2021-12-30',
    }
  },
  methodology: {
    Volume: "Change in the subgraph's cumulative volumeUSD of Nomiswap constant-product and stable pairs over the period, excluding illiquid pairs whose reported volume is implausible against their reserves.",
    Fees: "Swap fees paid by traders: each pair's volume times its on-chain swapFee (0.1% on most constant-product pairs, 0.3% on NMX pairs, 0.004-0.006% on stable pairs).",
    UserFees: "All swap fees are paid by traders.",
    Revenue: "Protocol share of swap fees, minted as LP tokens to the factory feeTo address: 70% on most pairs, about 100% on NMX pairs.",
    ProtocolRevenue: "All revenue (protocol share of swap fees) goes to the factory feeTo address.",
    SupplySideRevenue: "Swap fees left in the pools for liquidity providers: 30% on most pairs, about 0% on NMX pairs.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by traders, at each pair's on-chain swapFee.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by traders, at each pair's on-chain swapFee.",
    },
    Revenue: {
      'Swap Fees To Protocol': "Share of swap fees minted as LP tokens to the factory feeTo address, set per pair by devFee.",
    },
    ProtocolRevenue: {
      'Swap Fees To Protocol': "Share of swap fees minted as LP tokens to the factory feeTo address, set per pair by devFee.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Share of swap fees kept by liquidity providers in the pools.",
    },
  },
}

export default adapters
