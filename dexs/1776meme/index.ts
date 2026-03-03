import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Addresses
const memeCenterAddr = "0xDFcB2aB25b7978C112E9E08a2c70d52b035F1776";

// Abi
const buyAbi =
  "event BuyExecuted(address indexed token, address indexed baseToken, address indexed user, uint256 amountIn, uint256 amountOut, uint256 totalFee)";
const sellAbi =
  "event SellExecuted(address indexed token, address indexed baseToken, address indexed user, uint256 amountIn, uint256 amountOut, uint256 totalFee)";

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyVolume = createBalances();

  const buyLogs = await getLogs({ target: memeCenterAddr, eventAbi: buyAbi });
  for (const log of buyLogs) {
    dailyVolume.addToken(log.baseToken, log.amountIn);
  }

  const sellLogs = await getLogs({ target: memeCenterAddr, eventAbi: sellAbi });
  for (const log of sellLogs) {
    dailyVolume.addToken(log.baseToken, log.amountOut);
  }

  return {
    dailyVolume,
  };
};

const methodology = {
  UserFees: "User pays 1% fees on each swap.",
  ProtocolRevenue:
    "Treasury receives 0.6% of each swap and 5% raised amount when token reached graduated MCP",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user.",
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {},
  },
  fetch,
  methodology,
};

export default adapter;
