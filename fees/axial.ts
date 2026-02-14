import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSaddleVolume } from "../helpers/saddle";
import { METRIC } from "../helpers/metrics";

const methodology = {
  Fees: 'Axial charges swap fees on all token exchanges through its StableSwap pools',
  Revenue: 'A portion of swap fees goes to the protocol as admin fees',
  SupplySideRevenue: 'The majority of swap fees are distributed to liquidity providers'
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Fees paid by users when swapping tokens in Axial StableSwap pools'
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Portion of swap fees retained by the protocol treasury (admin fee)'
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'Portion of swap fees distributed to liquidity providers in the pools'
  }
};

const abi = {
  "poolLength": "uint256:poolLength",
  "poolInfo": "function poolInfo(uint256) view returns (address lpToken, uint256 accAxialPerShare, uint256 lastRewardTimestamp, uint256 allocPoint, address rewarder)",
  "owner": "address:owner"
}

async function fetch(options: FetchOptions) {
  const { api } = options
  const AXIAL_MASTERCHEF_V3 = "0x958C0d0baA8F220846d3966742D4Fb5edc5493D3";
  const pools = (await api.fetchList({  lengthAbi: abi.poolLength, itemAbi: abi.poolInfo, target: AXIAL_MASTERCHEF_V3})).map((i: any) => i.lpToken)
  const vaults = (await api.multiCall({  abi: abi.owner, calls: pools, permitFailure: true,})).filter(i => i)
  return getSaddleVolume(options, vaults)
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.AVAX],
  fetch,
  start: '2023-01-03',
  methodology,
  breakdownMethodology,
};

export default adapter;