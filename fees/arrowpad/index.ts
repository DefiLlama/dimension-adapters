import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ARROWPAD = "0x5d2391CF88cd48BB6B9Ec12b38BC8119562F9012";

const BuyTokensEvent =
  "event BuyTokens(address user, address token, uint256 ethAmount, uint256 tokenAmount, uint256 tokenPrice, uint256 ethPriceUSD, uint256 marketCap, uint256 date)";
const SellTokensEvent =
  "event SellTokens(address user, address token, uint256 ethAmount, uint256 tokenAmount, uint256 tokenPrice, uint256 ethPriceUSD, uint256 marketCap, uint256 date)";
const TokenCreatedEvent =
  "event TokenCreated(address token, uint256 tokenPrice, uint256 ethPriceUSD, uint32 sig, uint256 date)";
const TokenLaunchedEvent = "event TokenLaunched(address token, uint256 date)";

const CREATE_TOKEN_FEE = 1000000000000000n; // 0.001 ETH per token creation
const GRADUATION_FEE = 100000000000000000n; // 0.1 ETH platform fee per graduation to Uniswap

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const buyLogs = await options.getLogs({ target: ARROWPAD, eventAbi: BuyTokensEvent });
  const sellLogs = await options.getLogs({ target: ARROWPAD, eventAbi: SellTokensEvent });
  const createdLogs = await options.getLogs({ target: ARROWPAD, eventAbi: TokenCreatedEvent });
  const launchedLogs = await options.getLogs({ target: ARROWPAD, eventAbi: TokenLaunchedEvent });

  for (const log of [...buyLogs, ...sellLogs]) {
    dailyVolume.addGasToken(log.ethAmount);
    // ethAmount is emitted net of the 1% platform fee: fee = net / 99
    dailyFees.addGasToken(log.ethAmount / 99n);
  }
  dailyFees.addGasToken(CREATE_TOKEN_FEE * BigInt(createdLogs.length));
  dailyFees.addGasToken(GRADUATION_FEE * BigInt(launchedLogs.length));

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Volume: "ETH value of all bonding-curve buys and sells (BuyTokens/SellTokens events).",
  Fees: "1% platform fee on every buy and sell, plus 0.001 ETH per token creation and 0.1 ETH per graduation to Uniswap.",
  Revenue: "All fees go to the ArrowPad protocol fee address.",
  ProtocolRevenue: "Same as Revenue — there is currently no token-owner fee share.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-03",
  methodology,
};

export default adapter;
