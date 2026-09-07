import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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

// LaunchCreated(uint256 indexed launchId, address indexed creator, address indexed curve, address creatorFeeRecipient, address memeToken, address stockToken, ...)
const TOPIC_LAUNCH_CREATED = "0xbb62abbef024ed20d2030cfddf59ba11c15271e34dc2783a7f57b86c2578d546";

const EVENT_BUY =
  "event Buy(address indexed buyer, address indexed receiver, uint256 stockAmountIn, uint256 stockAmountUsed, uint256 stockAmountRefunded, uint256 memeAmountOut, uint256 protocolFee, uint256 creatorFee, uint256 stockReserveAfter, uint256 memeSoldAfter, uint256 spotPriceX18)";
const EVENT_SELL =
  "event Sell(address indexed seller, address indexed receiver, uint256 memeAmountIn, uint256 stockAmountGross, uint256 stockAmountOut, uint256 protocolFee, uint256 creatorFee, uint256 stockReserveAfter, uint256 memeSoldAfter, uint256 spotPriceX18)";
const ABI_PRICE = "function getValidatedPrice(address stockToken) view returns (uint256 priceUsd, uint256 updatedAt)";

const iface = new ethers.Interface([EVENT_BUY, EVENT_SELL]);

// curve -> quote (stock) token, from LaunchCreated on both factories
async function getCurves(options: FetchOptions): Promise<Map<string, string>> {
  const toBlock = await options.getToBlock();
  const curves = new Map<string, string>();
  for (const f of FACTORIES) {
    // Full history scan (not the daily window): options.getLogs clamps to the day's block range.
    const logs = await sdk.getEventLogs({
      chain: options.chain,
      target: f.address,
      topics: [TOPIC_LAUNCH_CREATED],
      fromBlock: f.fromBlock,
      toBlock,
      entireLog: true,
      skipIndexer: true,
      cacheInCloud: true,
    });
    for (const log of logs as any[]) {
      const curve = ("0x" + String(log.topics[3]).slice(26)).toLowerCase();
      const data = String(log.data);
      const stockToken = ("0x" + data.slice(2 + 64 * 2 + 24, 2 + 64 * 3)).toLowerCase();
      curves.set(curve, stockToken);
    }
  }
  return curves;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const curves = await getCurves(options);
  if (curves.size === 0) return { dailyVolume, dailyFees, dailyRevenue: dailyProtocolRevenue, dailyProtocolRevenue, dailySupplySideRevenue };

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
    options.getLogs({ targets, eventAbi: EVENT_BUY, entireLog: true, skipIndexer: true }),
    options.getLogs({ targets, eventAbi: EVENT_SELL, entireLog: true, skipIndexer: true }),
  ]);

  for (const log of [...buys, ...sells] as any[]) {
    const curve = String(log.address || log.source).toLowerCase();
    if (!curves.has(curve)) continue;
    const parsed = iface.parseLog(log);
    if (!parsed) continue;
    const a = parsed.args as any;
    const gross: bigint = parsed.name === "Buy" ? a.stockAmountUsed : a.stockAmountGross;
    const protocolFee: bigint = a.protocolFee;
    const creatorFee: bigint = a.creatorFee;
    dailyVolume.addUSDValue(toUsd(curve, gross));
    dailyFees.addUSDValue(toUsd(curve, protocolFee + creatorFee));
    dailyProtocolRevenue.addUSDValue(toUsd(curve, protocolFee));
    dailySupplySideRevenue.addUSDValue(toUsd(curve, creatorFee));
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-03",
  methodology: {
    Volume: "Sum of every buy and sell on Fox Brokers bonding curves (Buy/Sell events on curve contracts created by the launch factories), valued in USD with the protocol's on-chain oracle price of the curve's quote asset (a Robinhood Stock Token or WETH). Post-graduation SushiSwap V3 trading is not included here (it is tracked under SushiSwap).",
    Fees: "Trading fees charged on every curve buy and sell (1% of the quote amount on the active preset: 0.8% creator, 0.2% protocol).",
    UserFees: "Same as Fees: paid by traders on curve trades.",
    Revenue: "Protocol share of curve trading fees (0.2%).",
    ProtocolRevenue: "Protocol share of curve trading fees (0.2%).",
    SupplySideRevenue: "Creator share of curve trading fees (0.8%), paid to the token creator's fee recipient.",
  },
};

export default adapter;
