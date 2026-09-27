import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const CFO_ROUTER = '0xf4f7b6400DB5D121194BdA173d8b8727B295207F';
const USDT = ADDRESSES.bsc.USDT;

const eventAbi = "event MiningNotified(address indexed trader, uint256 volumeUSDT18, address indexed referrer, uint256 notifiedMask)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({
    target: CFO_ROUTER,
    eventAbi,
  });
  logs.forEach((log: any) => {
    dailyVolume.add(USDT, log.volumeUSDT18);
  });
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: '2026-09-24',
  methodology: {
    Volume: 'Volume is calculated from MiningNotified events emitted by CfoRouter, which records the USD-normalized volume (volumeUSDT18) of each swap.'
  }
};

export default adapter;
