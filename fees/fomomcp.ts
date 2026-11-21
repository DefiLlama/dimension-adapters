import { ethers } from "ethers";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getSolanaReceived } from "../helpers/token";

// fomo-mcp (https://fomomcp.app, https://x.com/FomoMCP): copy trading for fomo traders
// (https://copy.fomomcp.app) and fomo data for AI assistants. Two on-chain income sources:
//
// 1. Copy trading fee on every copied buy and sell: 1% on copies under $100, 0.5% from $100.
//    On Solana it is taken by Jupiter as a referral fee into fomo-mcp's Jupiter referral account
//    4Ai6UrYwTrEc8CVQea2oZyV3ENzNirPGuj4JCfiYW8Fx (Jupiter keeps 20% of it; the 80% that reaches
//    the account is what is counted). Its token accounts (associated token accounts of the
//    referral account, created for the two mints the trades pay fees in):
//    USDC 8Cnupzw2NM42o4vRNHhExxxs8zmSBWdaHN9VGbbvYfKZ, wSOL 8R6EaUW1M1poUkkHVLK5WDhJY4s9FrV1G3fUL9Gkhkk4.
//    EVM copies pay the fee as a native transfer to 0x1FD538c72075c1238a48129aF4a34797642E0C1a;
//    nothing meaningful has arrived there yet (0.0005 BNB on BSC, nothing on other chains), so
//    EVM chains are not listed.
//
// 2. Creator fees of the fomo-mcp token $FOMOMCP (Robinhood Chain, Pons launchpad,
//    https://www.ponsfamily.com/launchpad/0xa8197768DC7C97dBD8A553bb3F9Dbb1626dad75e).
//    Pons credits every creator payout to its fee escrow: on the launch curve (curve
//    0x4Bca7dE4f3C4ca584b4B40e75c3DC63C941e7B11, 2% creator tax plus 70% of the 1% curve fee) and,
//    since graduation on 2026-10-05 03:25 UTC, on the Uniswap v4 pool with the Pons hook
//    (pool id 0x0e2d700997900367cc677b89d871a7a13435dc34bf82516d4468e4344d598052). The creator
//    fee recipient is read from the factory: getLaunchedToken(token).creatorFeeRecipient.

const JUPITER_REFERRAL_ACCOUNT = "4Ai6UrYwTrEc8CVQea2oZyV3ENzNirPGuj4JCfiYW8Fx";
const JUPITER_REFERRAL_TOKEN_ACCOUNTS = [
  "8Cnupzw2NM42o4vRNHhExxxs8zmSBWdaHN9VGbbvYfKZ", // USDC
  "8R6EaUW1M1poUkkHVLK5WDhJY4s9FrV1G3fUL9Gkhkk4", // wSOL
];

const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const PONS_FEE_ESCROW = "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e"; // PonsV2 fee escrow (Sourcify verified)
const FOMOMCP = "0xa8197768DC7C97dBD8A553bb3F9Dbb1626dad75e";

const CREDITED_EVENT = "event Credited(address indexed recipient, address indexed depositor, uint256 amount)";
const GET_LAUNCHED_TOKEN = "function getLaunchedToken(address token) view returns (tuple(address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, bool buybackEnabled, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists))";

const COPY_TRADING_FEES = METRIC.TRADING_FEES;
const TOKEN_CREATOR_FEES = METRIC.CREATOR_FEES;

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const received = await getSolanaReceived({ options, targets: [JUPITER_REFERRAL_ACCOUNT, ...JUPITER_REFERRAL_TOKEN_ACCOUNTS] });
  dailyFees.addBalances(received, COPY_TRADING_FEES);
  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
};

const fetchRobinhood = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  // read at the window end: the token can launch inside the window
  const launch = await options.toApi.call({ target: PONS_FACTORY, abi: GET_LAUNCHED_TOKEN, params: [FOMOMCP] });
  const credits = await options.getLogs({
    target: PONS_FEE_ESCROW,
    eventAbi: CREDITED_EVENT,
    topics: [ethers.id("Credited(address,address,uint256)"), ethers.zeroPadValue(launch.creatorFeeRecipient, 32)],
  });
  // $FOMOMCP pairs with native ETH (pairToken is the zero address), so every credit is in ETH
  for (const credit of credits) dailyFees.addGasToken(credit.amount, TOKEN_CREATOR_FEES);
  return { dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
};

const fetch = async (options: FetchOptions) => (options.chain === CHAIN.SOLANA ? fetchSolana(options) : fetchRobinhood(options));

const methodology = {
  Fees: "Copy trading fees fomo-mcp users pay on every copied buy and sell (1% on copies under $100, 0.5% from $100), plus the creator fees of the fomo-mcp token $FOMOMCP on the Pons launchpad.",
  UserFees: "Copy trading fees paid by fomo-mcp users. Excludes the $FOMOMCP creator fees, which are paid by $FOMOMCP traders.",
  Revenue: "All fees (copy trading fees and $FOMOMCP creator fees) are kept by fomo-mcp.",
  ProtocolRevenue: "All fees (copy trading fees and $FOMOMCP creator fees) are kept by fomo-mcp.",
};

const breakdownMethodology = {
  Fees: {
    [COPY_TRADING_FEES]: "Copy trading fees on Solana, taken by Jupiter as a referral fee and received in fomo-mcp's Jupiter referral account (the 80% that reaches the account; Jupiter keeps 20%).",
    [TOKEN_CREATOR_FEES]: "ETH that Pons credits to the $FOMOMCP creator fee recipient in its fee escrow: the 2% creator tax and 70% of the 1% curve fee on the launch curve, then the creator share of the Pons hook fees on the Uniswap v4 pool after graduation. Counted when Pons sweeps and credits them.",
  },
  UserFees: {
    [COPY_TRADING_FEES]: "Same as the Fees component.",
  },
  Revenue: {
    [COPY_TRADING_FEES]: "Same as the Fees component.",
    [TOKEN_CREATOR_FEES]: "Same as the Fees component.",
  },
  ProtocolRevenue: {
    [COPY_TRADING_FEES]: "Same as the Fees component.",
    [TOKEN_CREATOR_FEES]: "Same as the Fees component.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.SOLANA]: { start: "2026-10-03" }, // first referral fee 2026-10-03 00:13 UTC
    [CHAIN.ROBINHOOD]: { start: "2026-10-04" }, // $FOMOMCP launched 2026-10-04 16:36 UTC (block 80082142)
  },
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
