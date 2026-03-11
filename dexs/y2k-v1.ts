import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const vault_factory = "0x984e0eb8fb687afa53fc8b33e12e04967560e092";
const WETH = ADDRESSES.arbitrum.WETH;
const event_deposit = "event Deposit (address indexed user, address indexed receiver, uint256 id, uint256 assets)";

const abis: any = {
  "getVaults": "function getVaults(uint256 index) view returns (address[] vaults)",
  "marketIndex": "uint256:marketIndex"
};

const fetch: any = async (timestamp: number, _: any, { api, getLogs, createBalances, }: FetchOptions): Promise<FetchResultVolume> => {
  const vaults = (await api.fetchList({ lengthAbi: abis.marketIndex, itemAbi: abis.getVaults, target: vault_factory })).flat()
  const dailyVolume = createBalances()
  const logs_deposit = await getLogs({ targets: vaults, eventAbi: event_deposit, })
  logs_deposit.forEach((log: any) => dailyVolume.add(WETH, log.amount))

  return { dailyVolume, timestamp, };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2022-10-30',
    },
  },
};

export default adapter;
