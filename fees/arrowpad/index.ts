import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const ARROWPAD = "0x5d2391CF88cd48BB6B9Ec12b38BC8119562F9012";

const BuyTokensEvent =
  "event BuyTokens(address user, address token, uint256 ethAmount, uint256 tokenAmount, uint256 tokenPrice, uint256 ethPriceUSD, uint256 marketCap, uint256 date)";
const SellTokensEvent =
  "event SellTokens(address user, address token, uint256 ethAmount, uint256 tokenAmount, uint256 tokenPrice, uint256 ethPriceUSD, uint256 marketCap, uint256 date)";
const TokenCreatedEvent =
  "event TokenCreated(address token, uint256 tokenPrice, uint256 ethPriceUSD, uint32 sig, uint256 date)";
const TokenLaunchedEvent = "event TokenLaunched(address token, uint256 date)";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const buyLogs = await options.getLogs({ target: ARROWPAD, eventAbi: BuyTokensEvent });
  const sellLogs = await options.getLogs({ target: ARROWPAD, eventAbi: SellTokensEvent });
  const createdLogs = await options.getLogs({ target: ARROWPAD, eventAbi: TokenCreatedEvent });
  const launchedLogs = await options.getLogs({ target: ARROWPAD, eventAbi: TokenLaunchedEvent });

  // flat fees are owner-configurable, read them from the contract
  const createFee = await options.api.call({ target: ARROWPAD, abi: "uint256:CREATE_TOKEN_FEE_AMOUNT" });
  const graduationFee = await options.api.call({ target: ARROWPAD, abi: "uint256:platformLPFee" });

  for (const log of [...buyLogs, ...sellLogs]) {
    dailyVolume.addGasToken(log.ethAmount);
    // ethAmount is emitted net of the 1% platform fee: fee = net / 99
    dailyFees.addGasToken(log.ethAmount / 99n, METRIC.TRADING_FEES);
  }
  dailyFees.addGasToken(BigInt(createFee) * BigInt(createdLogs.length), "Token Creation Fees");
  dailyFees.addGasToken(BigInt(graduationFee) * BigInt(launchedLogs.length), "Graduation Fees");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  };
};

const methodology = {
  Volume: "ETH value of all bonding-curve buys and sells (BuyTokens/SellTokens events).",
  Fees: "1% platform fee on every buy and sell, plus flat token-creation and graduation fees read from the contract (currently 0 and 0.1 ETH).",
  Revenue: "1% platform fee on every buy and sell, plus flat token-creation and graduation fees read from the contract (currently 0 and 0.1 ETH).",
  ProtocolRevenue: "1% platform fee on every buy and sell, plus flat token-creation and graduation fees read from the contract (currently 0 and 0.1 ETH).",
  SupplySideRevenue: "0 — there is currently no supply-side revenue.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "1% platform fee taken from every bonding-curve buy and sell.",
    "Token Creation Fees": "Flat fee charged per token creation, read from the contract (currently 0).",
    "Graduation Fees": "Flat fee charged when a token graduates to Uniswap, read from the contract (currently 0.1 ETH).",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "1% platform fee on every buy and sell.",
    "Token Creation Fees": "Flat fee charged per token creation, read from the contract (currently 0).",
    "Graduation Fees": "Flat fee charged when a token graduates to Uniswap, read from the contract (currently 0.1 ETH).",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "1% platform fee on every buy and sell.",
    "Token Creation Fees": "Flat fee charged per token creation, read from the contract (currently 0).",
    "Graduation Fees": "Flat fee charged when a token graduates to Uniswap, read from the contract (currently 0.1 ETH).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-03",
  methodology,
  breakdownMethodology,
};

export default adapter;
