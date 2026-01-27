import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const info = {
  methodology: {
    Fees: 'All yields earning from funding and basis spread from the delta hedging derivatives positions.',
  }
}

const fetch: FetchV2 = async (option: FetchOptions) => {
  const dailyFees = option.createBalances();

  const logs = await option.getLogs({
    target: "0x7788A3538C5fc7F9c7C8A74EAC4c898fC8d87d92",
    eventAbi: "event RewardsReceived (uint256 amount)",
  });
  logs.map((e: any) => {
    dailyFees.addToken("0xf3527ef8de265eaa3716fb312c12847bfba66cef", e.amount);
  });

  return {
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  fetch, 
  methodology: info.methodology,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2024-03-18", },
    [CHAIN.ARBITRUM]: { start: "2024-03-18", },
    [CHAIN.BSC]: { start: "2024-03-18", },
  },
  version: 2,
};

export default adapter;
