import { parseEther } from "ethers";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
  dailyFees.addGasToken(launchFee);
  dailyProtocolRevenue.addGasToken(launchFee);

  // buy/sell events from MemeCenter contract
  const buySellLogs = (await Promise.all([
    getLogs({ target: memeCenterAddr, eventAbi: buyAbi, }),
    getLogs({ target: memeCenterAddr, eventAbi: sellAbi, }),
  ])).flat();

  for (const log of buySellLogs) {
      // Total 1% baseToken swap amount
      dailyFees.addToken(log.baseToken, log.totalFee);
      // Protocols - 60% total fee
      dailyProtocolRevenue.addToken(log.baseToken, log.totalFee * 60n / 100n);
      // Creator - 40% total fee
      dailySupplySideRevenue.addToken(log.baseToken, log.totalFee * 40n / 100n);
  }

  // graduate events from MemeCenter contract
  const graduateLogs = await getLogs({
    target: memeCenterAddr,
    eventAbi: graduateAbi,
  });
  for (const log of graduateLogs) {
      // Total 7% baseToken raised amount
      const graduateFee = log.baseTokenAmount * 7n / 93n;
      dailyFees.addToken(log.baseToken, graduateFee);
      // Protocols - 5% raised amount
      dailyProtocolRevenue.addToken(log.baseToken, graduateFee * 5n / 7n);
      // Creator - 2% raised amount
      dailySupplySideRevenue.addToken(log.baseToken, graduateFee * 2n / 7n);
  }

  return { dailyFees, dailyRevenue: dailyProtocolRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
}

const methodology = {
  UserFees: "User pays 1% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.6% of each swap and 5% raised amount when token reached graduated MCP",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: 22764597,
    }
  },
  methodology
};

export default adapter;