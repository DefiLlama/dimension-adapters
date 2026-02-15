import { parseEther } from "ethers";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Addresses
const memeCenterAddr = "0xDFcB2aB25b7978C112E9E08a2c70d52b035F1776";

// Abi
const buyAbi = "event BuyExecuted(address indexed token, address indexed baseToken, address indexed user, uint256 amountIn, uint256 amountOut, uint256 totalFee)";
const sellAbi = "event SellExecuted(address indexed token, address indexed baseToken, address indexed user, uint256 amountIn, uint256 amountOut, uint256 totalFee)"
const launchAbi = "event TokenDeployed(address indexed creator, string symbol, string uri, address tokenAddress, address baseToken)";
const graduateAbi = "event LiquidityMigrated(address indexed token, address indexed baseToken, uint256 lpTokenId, address locker, uint256 tokenAmount, uint256 baseTokenAmount)";


const fetchFees = async (options: FetchOptions): Promise<FetchResultV2> => {
  const {getLogs, createBalances} = options;

  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // launch events from MemeCenter contract
  // platform collect 0.001776 eth for each launch
  const launchLogs = await getLogs({
    target: memeCenterAddr,
    eventAbi: launchAbi,
  });
  const launchFee = parseEther("0.001776") * BigInt(launchLogs.length);
  dailyFees.addGasToken(launchFee, "Token launch fees");
  dailyProtocolRevenue.addGasToken(launchFee, "Token launch fees");

  // buy/sell events from MemeCenter contract
  const buySellLogs = (await Promise.all([
    getLogs({ target: memeCenterAddr, eventAbi: buyAbi, }),
    getLogs({ target: memeCenterAddr, eventAbi: sellAbi, }),
  ])).flat();

  for (const log of buySellLogs) {
      // Total 1% baseToken swap amount
      dailyFees.addToken(log.baseToken, log.totalFee, METRIC.TRADING_FEES);
      // Protocols - 60% total fee
      dailyProtocolRevenue.addToken(log.baseToken, log.totalFee * 60n / 100n, "Trading fees to protocol");
      // Creator - 40% total fee
      dailySupplySideRevenue.addToken(log.baseToken, log.totalFee * 40n / 100n, METRIC.CREATOR_FEES);
  }

  // graduate events from MemeCenter contract
  const graduateLogs = await getLogs({
    target: memeCenterAddr,
    eventAbi: graduateAbi,
  });
  for (const log of graduateLogs) {
      // Total 7% baseToken raised amount
      const graduateFee = log.baseTokenAmount * 7n / 93n;
      dailyFees.addToken(log.baseToken, graduateFee, "Token graduation fees");
      // Protocols - 5% raised amount
      dailyProtocolRevenue.addToken(log.baseToken, graduateFee * 5n / 7n, "Graduation fees to protocol");
      // Creator - 2% raised amount
      dailySupplySideRevenue.addToken(log.baseToken, graduateFee * 2n / 7n, "Graduation fees to creator");
  }

  return { dailyFees, dailyRevenue: dailyProtocolRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
}

const methodology = {
  UserFees: "User pays 1% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.6% of each swap and 5% raised amount when token reached graduated MCP",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const breakdownMethodology = {
  Fees: {
    "Token launch fees": "Fixed 0.001776 ETH fee charged when a new token is launched on the platform",
    [METRIC.TRADING_FEES]: "1% fee on all token buy and sell transactions",
    "Token graduation fees": "7% fee on the total raised amount when a token graduates to DEX liquidity"
  },
  Revenue: {
    "Token launch fees": "100% of the 0.001776 ETH launch fee goes to protocol",
    "Trading fees to protocol": "60% of the 1% trading fee goes to protocol treasury",
    "Graduation fees to protocol": "5/7ths (71.4%) of the graduation fee goes to protocol treasury"
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "40% of the 1% trading fee goes to token creator",
    "Graduation fees to creator": "2/7ths (28.6%) of the graduation fee goes to token creator"
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch: fetchFees,
  start: '2025-06-24',
  chains: [CHAIN.ETHEREUM],
  methodology,
  breakdownMethodology
};

export default adapter;