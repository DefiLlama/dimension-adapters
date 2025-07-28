import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSaddleVolume } from "../../helpers/saddle";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: '2023-01-03',
    },
  }
};

export default adapter;
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

