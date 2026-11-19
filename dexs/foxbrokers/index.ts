import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Fox Brokers (foxbrokers.fun) — meme-token launchpad on Robinhood Chain.
// Tokens trade on a bonding curve priced in a Robinhood Stock Token or WETH,
// then graduate into permanently locked SushiSwap V3 liquidity.
// Every curve trade emits Buy/Sell on the curve contract; curves are created by the factory.

const FACTORIES = [
  { address: "0x3058c77848116d89000060Ec7CE711f3f921fA3c", fromBlock: 54291415 }, // v1
  { address: "0xdcede6c4b1851Fb7baCB7fCd902eEeD22b8Ef0E2", fromBlock: 56766441 }, // v2
];
// Shared oracle guard: USD price (1e18) of any registered quote asset (Stock Tokens and WETH).
const ORACLE_GUARD = "0xC8c7730C785480a379925279EC1B3938C9364759";

// Full LaunchCreated ABI (nested LaunchPolicy) so topic0 matches the factories.
const EVENT_LAUNCH_CREATED =
  "event LaunchCreated(uint256 indexed launchId, address indexed creator, address indexed curve, address creatorFeeRecipient, address memeToken, address stockToken, bytes32 stockAssetId, string name, string symbol, string metadataUri, bytes32 metadataHash, (uint32 presetVersion, uint256 totalSupply, uint256 curveDistributionCap, uint256 virtualMemeReserve0, uint256 virtualStockReserve0, uint256 graduationThresholdUsd, uint16 protocolFeeBps, uint16 creatorFeeBps, uint16 maxPoolPriceDeviationBps, uint24 poolFee, int24 poolTickSpacing, uint256 launchOraclePriceUsd, uint64 launchTimestamp, bytes32 liquidityVenue, uint256 launchUiMultiplier) policy, uint256 creationBlock, uint256 creationTimestamp, uint256 initialBuyStockAmount)";

const EVENT_BUY =
  "event Buy(address indexed buyer, address indexed receiver, uint256 stockAmountIn, uint256 stockAmountUsed, uint256 stockAmountRefunded, uint256 memeAmountOut, uint256 protocolFee, uint256 creatorFee, uint256 stockReserveAfter, uint256 memeSoldAfter, uint256 spotPriceX18)";
const EVENT_SELL =
  "event Sell(address indexed seller, address indexed receiver, uint256 memeAmountIn, uint256 stockAmountGross, uint256 stockAmountOut, uint256 protocolFee, uint256 creatorFee, uint256 stockReserveAfter, uint256 memeSoldAfter, uint256 spotPriceX18)";
const ABI_PRICE = "function getValidatedPrice(address stockToken) view returns (uint256 priceUsd, uint256 updatedAt)";

const FEE_TO_PROTOCOL = "Token Swap Fees To Protocol";
const FEE_TO_CREATORS = "Token Swap Fees To Creators";

async function getCurves(options: FetchOptions): Promise<Map<string, string>> {
  const toBlock = await options.getToBlock();
  const curves = new Map<string, string>();
  const logs = await options.getLogs({
    targets: FACTORIES.map((f) => f.address),
    eventAbi: EVENT_LAUNCH_CREATED,
    fromBlock: Math.min(...FACTORIES.map((f) => f.fromBlock)),
    toBlock,
    cacheInCloud: true,
  });
  for (const log of logs as any[]) {
    curves.set(String(log.curve).toLowerCase(), String(log.stockToken).toLowerCase());
  }
  return curves;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const curves = await getCurves(options);
  if (curves.size === 0) return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyProtocolRevenue.clone(),
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };

  // Quote assets are 18-decimal tokens; the oracle guard returns USD with 18 decimals.
  const quoteTokens = Array.from(new Set(curves.values()));
  const prices = await options.toApi.multiCall({
    abi: ABI_PRICE,
    calls: quoteTokens.map((t) => ({ target: ORACLE_GUARD, params: [t] })),
    permitFailure: true,
  });
  const usdPerToken = new Map<string, number>();
  quoteTokens.forEach((t, i) => {
    const p = prices[i]?.priceUsd ?? prices[i]?.[0];
    if (p) usdPerToken.set(t, Number(p) / 1e18);
  });
  const toUsd = (curve: string, amount: bigint) => {
    const px = usdPerToken.get(curves.get(curve)!);
    if (!px) return 0; // unpriced quote asset: skipped
    return (Number(amount) / 1e18) * px;
  };

  const targets = Array.from(curves.keys());
  const [buys, sells] = await Promise.all([
    options.getLogs({ targets, eventAbi: EVENT_BUY, entireLog: true, parseLog: true }),
    options.getLogs({ targets, eventAbi: EVENT_SELL, entireLog: true, parseLog: true }),
  ]);

  const addTrade = (log: any, gross: bigint) => {
    const curve = String(log.address || log.source).toLowerCase();
    if (!curves.has(curve)) return;
    const a = log.args;
    const protocolUsd = toUsd(curve, a.protocolFee);
    const creatorUsd = toUsd(curve, a.creatorFee);
    dailyVolume.addUSDValue(toUsd(curve, gross));
    dailyFees.addUSDValue(protocolUsd + creatorUsd, METRIC.SWAP_FEES);
    dailyProtocolRevenue.addUSDValue(protocolUsd, FEE_TO_PROTOCOL);
    dailySupplySideRevenue.addUSDValue(creatorUsd, FEE_TO_CREATORS);
  };
  for (const log of buys as any[]) addTrade(log, log.args.stockAmountUsed);
  for (const log of sells as any[]) addTrade(log, log.args.stockAmountGross);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyProtocolRevenue.clone(),
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Sum of every buy and sell on Fox Brokers bonding curves (Buy/Sell events on curve contracts created by the launch factories), valued in USD with the protocol's on-chain oracle price of the curve's quote asset (a Robinhood Stock Token or WETH). Post-graduation SushiSwap V3 trading is not included here (it is tracked under SushiSwap).",
  Fees: "Trading fees charged on every curve buy and sell (1% of the quote amount on the active preset: 0.8% creator, 0.2% protocol).",
  UserFees: "Same as Fees: paid by traders on curve trades.",
  Revenue: "Protocol share of curve trading fees (0.2%).",
  ProtocolRevenue: "Protocol share of curve trading fees (0.2%).",
  SupplySideRevenue: "Creator share of curve trading fees (0.8%), paid to the token creator's fee recipient.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fees charged on every curve buy and sell (1% of the quote amount on the active preset).",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Same as Fees: paid by traders on curve trades.",
  },
  Revenue: {
    [FEE_TO_PROTOCOL]: "Protocol share of curve trading fees (0.2%).",
  },
  ProtocolRevenue: {
    [FEE_TO_PROTOCOL]: "Protocol share of curve trading fees (0.2%).",
  },
  SupplySideRevenue: {
    [FEE_TO_CREATORS]: "Creator share of curve trading fees (0.8%), paid to the token creator's fee recipient.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-03",
  methodology,
  breakdownMethodology,
};

export default adapter;
