import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// https://docs.bitway.com/bitway-earn/detradfi
const STRATEGIES = [
  {
    // ABSOLUTE_RETURN
    vault: "0x5C4a6903732532eeB3AE0803e062d8AE25d52BD1",
  },
  {
    // CORE_ALPHA
    vault: "0xb82E32062C773c7748776C06FdB11B92EDAE3B63",
  },
];

const event_flash_withdraw =
  "event FlashWithdraw(address indexed _user, address indexed _token, uint256 indexed _amount, uint256 _principalAmount, uint256 _rewardAmount, uint256 _fee)";

const fetch = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances();

  const logs = await getLogs({
    targets: STRATEGIES.map((s) => s.vault),
    eventAbi: event_flash_withdraw,
  });
  logs.forEach((e: any) => {
    dailyFees.add(e._token, e._fee);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Flash unstake penalty fees charged on instant withdrawals from Bitway Earn vaults.",
  UserFees: "Penalty fees paid by users who choose instant withdrawal over the standard 7-day claim process.",
  Revenue: "All flash unstake penalty fees are retained by the Bitway protocol.",
  ProtocolRevenue: "All flash unstake penalty fees are retained by the Bitway protocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: { fetch, start: "2025-04-10" },
  },
  methodology,
};

export default adapter;
