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

async function getPairVolumes(block: number) {
  const volumes: Record<string, { factory: string, volumeUSD: number }> = {};
  let lastId = '';
  while (true) {
    const { pairs } = await sdk.graph.request(endpoint, `{
      pairs(first: 1000, orderBy: id, where: { id_gt: "${lastId}" }, block: { number: ${block} }) { id volumeUSD factory { id } }
    }`);
    for (const pair of pairs) volumes[pair.id] = { factory: pair.factory.id, volumeUSD: Number(pair.volumeUSD) };
    if (pairs.length < 1000) return volumes;
    lastId = pairs[pairs.length - 1].id;
  }
}

async function fetch(options: FetchOptions) {
  const [start, end] = await Promise.all([getPairVolumes(await options.getFromBlock()), getPairVolumes(await options.getToBlock())]);
  const pairs = Object.entries(end)
    .map(([id, { factory, volumeUSD }]) => ({ id, factory, volume: volumeUSD - (start[id]?.volumeUSD ?? 0) }))
    .filter(pair => pair.volume > 0);

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
    Volume: "Change in the subgraph's cumulative volumeUSD of every Nomiswap constant-product and stable pair over the period.",
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
