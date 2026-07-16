import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// IMF launcher (app.imf.bz) — gasless bonding-curve launchpad on Robinhood Chain.
// Factory deploys a Token + BondingCurve pair per launch; curves graduate into
// Uniswap v4 pools at a fixed ETH target. Token creation is currently free
// (creationFeeWei = 0) and launch gas is sponsored by the protocol relayer.
const FACTORY = "0x82e927237ff6aAff00d0D9B60E77E495ac722799";
const FACTORY_DEPLOY_BLOCK = 10266249;

const TokenCreatedEvent =
  "event TokenCreated(address indexed token, address indexed creator, address indexed bondingCurve, string name, string symbol)";
// ethIn/ethOut are net of fee: the user pays ethIn + ethFee on buys and
// receives ethOut (fee already deducted) on sells.
const BuyEvent =
  "event Buy(address indexed buyer, uint256 ethIn, uint256 ethFee, uint256 tokensOut, uint256 virtualTokenReserves, uint256 virtualEthReserves)";
const SellEvent =
  "event Sell(address indexed seller, uint256 tokensIn, uint256 ethFee, uint256 ethOut, uint256 virtualTokenReserves, uint256 virtualEthReserves)";
// Fires on every buy/sell with the exact creator/protocol split of ethFee
// (creatorAmount + protocolAmount == ethFee, verified on-chain).
const FeesAccruedEvent =
  "event FeesAccrued(uint256 creatorAmount, uint256 protocolAmount)";
const GraduatedEvent =
  "event Graduated(address indexed token, bytes32 indexed poolId, uint256 ethSeeded, uint256 tokensSeeded, uint256 lpTokenId)";

const GRADUATION_FEES = "Graduation fees";
const CREATION_FEES = "Token creation fees";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Every bonding curve ever deployed by the factory (full history, cached).
  // Buy/Sell/FeesAccrued/Graduated fire on the per-token curve contracts, so
  // day-range logs are fetched chain-wide by topic and filtered to our curves —
  // other launchpads forked from similar code can emit identical signatures.
  const createdLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: TokenCreatedEvent,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const curves = new Set(createdLogs.map((log: any) => log.bondingCurve.toLowerCase()));

  const isOurs = (log: any) => curves.has(log.address.toLowerCase());
  const dayLogs = (eventAbi: string) =>
    options.getLogs({ eventAbi, noTarget: true, entireLog: true, parseLog: true });

  const buyLogs = (await dayLogs(BuyEvent)).filter(isOurs);
  const sellLogs = (await dayLogs(SellEvent)).filter(isOurs);
  const accruedLogs = (await dayLogs(FeesAccruedEvent)).filter(isOurs);
  const graduatedLogs = (await dayLogs(GraduatedEvent)).filter(isOurs);

  for (const log of buyLogs) {
    dailyVolume.addGasToken(log.args.ethIn);
    dailyFees.addGasToken(log.args.ethFee, METRIC.TRADING_FEES);
  }
  for (const log of sellLogs) {
    dailyVolume.addGasToken(log.args.ethOut);
    dailyFees.addGasToken(log.args.ethFee, METRIC.TRADING_FEES);
  }
  for (const log of accruedLogs) {
    dailySupplySideRevenue.addGasToken(log.args.creatorAmount, METRIC.TRADING_FEES);
    dailyProtocolRevenue.addGasToken(log.args.protocolAmount, METRIC.TRADING_FEES);
  }

  // Flat fees are owner-configurable — read them from the current config.
  const config = await options.api.call({
    target: FACTORY,
    abi: "function getCurrentConfig() view returns ((uint256 virtualTokenReserves, uint256 virtualEthReserves, uint256 curveSupply, uint256 migrationSupply, uint256 graduationEthTarget, uint256 graduationFeeWei, uint256 creatorGraduationRewardWei, uint96 protocolFeeBps, uint96 creatorFeeBps, address protocolFeeRecipient, address migrator, uint64 creatorFirstBuyWindowSec))",
  });
  const creationFeeWei = await options.api.call({ target: FACTORY, abi: "uint256:creationFeeWei" });

  const graduationFees = BigInt(config.graduationFeeWei) * BigInt(graduatedLogs.length);
  dailyFees.addGasToken(graduationFees, GRADUATION_FEES);
  dailyProtocolRevenue.addGasToken(graduationFees, GRADUATION_FEES);

  const createdToday = await options.getLogs({ target: FACTORY, eventAbi: TokenCreatedEvent });
  const creationFees = BigInt(creationFeeWei) * BigInt(createdToday.length);
  dailyFees.addGasToken(creationFees, CREATION_FEES);
  dailyProtocolRevenue.addGasToken(creationFees, CREATION_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "ETH value of all bonding-curve buys and sells (Buy/Sell events on every curve deployed by the factory).",
  Fees: "1.25% fee on every bonding-curve trade (Buy/Sell ethFee), plus flat graduation and token-creation fees read from the factory config (currently 0.001 ETH and 0).",
  UserFees: "Same as Fees — all fees are paid by traders.",
  Revenue: "Protocol share of trading fees (0.95% of trade value via FeesAccrued) plus graduation and creation fees.",
  ProtocolRevenue: "Protocol share of trading fees (0.95% of trade value via FeesAccrued) plus graduation and creation fees.",
  SupplySideRevenue: "Creator share of trading fees (0.30% of trade value via FeesAccrued). Creators additionally receive a fixed one-off reward per graduation (currently 0.024 ETH), excluded here as it is an internal incentive transfer rather than a user fee.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "1.25% fee taken from every bonding-curve buy and sell.",
    [GRADUATION_FEES]: "Flat fee charged when a curve graduates into its Uniswap v4 pool, read from the factory config (currently 0.001 ETH).",
    [CREATION_FEES]: "Flat fee charged per token creation, read from the factory (currently 0 — launches are free and gas is sponsored).",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Protocol share of the trading fee (0.95% of trade value).",
    [GRADUATION_FEES]: "Graduation fees accrue to the protocol.",
    [CREATION_FEES]: "Creation fees accrue to the protocol.",
  },
  SupplySideRevenue: {
    [METRIC.TRADING_FEES]: "Creator share of the trading fee (0.30% of trade value).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-15",
  methodology,
  breakdownMethodology,
};

export default adapter;
