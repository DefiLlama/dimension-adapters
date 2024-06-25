import BigNumber from "bignumber.js";
import { Adapter, FetchOptions } from "../../adapters/types";
import { OPTIMISM } from "../../helpers/chains";

const STAKER = "0xc30877315f3b621a8f7bcda27819ec29429f3817";
const DONATE_EVENT =
  "event DonatedRewards(address indexed account, uint256 amount)";

const getFees = async (options: FetchOptions) => {
  const { getToBlock, getFromBlock, getLogs } = options;
  const [fromBlock, toBlock] = await Promise.all([
    getFromBlock(),
    getToBlock(),
  ]);
  const logs = await getLogs({
    targets: [STAKER],
    eventAbi: DONATE_EVENT,
  });
  const fees = logs
    .reduce((acc: any, log: any) => acc.plus(log.amount), new BigNumber(0))
    .div(1e18);

  return {
    dailyFees: `${fees}`,
    dailyRevenue: `${fees}`,
    dailyHoldersRevenue: `${fees}`,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [OPTIMISM]: {
      fetch: getFees,
      start: 1712727843,
    },
  },
};
export default adapter;
