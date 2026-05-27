import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const STAKER = "0xc30877315f3b621a8f7bcda27819ec29429f3817";
const DONATE_EVENT = "event DonatedRewards(address indexed account, uint256 amount)";
const token = ADDRESSES.optimism.sUSD

const getFees = async (options: FetchOptions) => {
  const { getLogs } = options;
  const logs = await getLogs({
    targets: [STAKER],
    eventAbi: DONATE_EVENT,
  });
  const dailyFees = options.createBalances();
  logs.forEach((log) => {
    dailyFees.add(token, log.amount);
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: getFees,
      start: '2024-04-10',
    },
  },
  deadFrom: "2025-08-02",
};
export default adapter;
