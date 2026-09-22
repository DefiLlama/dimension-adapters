import { coins } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const RIALTO_ROUTER = '0xC94135b63772b91D79d0A2DaAb2a8801f32359bD';
const NATIVE_ETH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function normalizeToken(token: string): string {
  const address = token.toLowerCase();
  return address === NATIVE_ETH ? ZERO_ADDRESS : address;
}


const swapExecutedEvent = 'event SwapExecuted(address indexed sender, address indexed recipient, address indexed sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, bytes32 quoteId, bytes32 referralCode)';
const feeChargedEvent = 'event FeeCharged(address indexed token, address indexed recipient, uint256 amount, uint16 bps, bytes32 integratorId)';

/**
 * Returns volume and fees emitted by completed Rialto swaps for the requested period.
 */
async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const swapExecutedLogs = await options.getLogs({
    target: RIALTO_ROUTER,
    eventAbi: swapExecutedEvent,
  });

  const feeChargedLogs = await options.getLogs({
    target: RIALTO_ROUTER,
    eventAbi: feeChargedEvent,
  });

  const swaps = swapExecutedLogs.map((log) => ({
    sellToken: normalizeToken(log.sellToken),
    sellAmount: log.sellAmount,
    buyToken: normalizeToken(log.buyToken),
    buyAmount: log.buyAmount,
  }));
  const tokenIds = [...new Set(swaps.flatMap((swap) => [
    `${options.chain}:${swap.sellToken}`,
    `${options.chain}:${swap.buyToken}`,
  ]))];

  // Match the SDK's timestamp choice for valuing these balances.
  const timestamp = dailyVolume.timestamp;
  const priceTimestamp = timestamp && Math.abs(Date.now() / 1000 - timestamp) >= 3600
    ? timestamp
    : "now";
  const prices: Record<string, { price: number; confidence?: number }> =
    await coins.getPrices(tokenIds, priceTimestamp);
  const hasPrice = (token: string): boolean => {
    const price = prices[`${options.chain}:${token}`];
    return !!price && Number.isFinite(price.price) && price.price > 0
      && (price.confidence ?? 1) >= 0.5;
  };

  for (const swap of swaps) {
    if (hasPrice(swap.sellToken)) {
      dailyVolume.add(swap.sellToken, swap.sellAmount);
    } else if (hasPrice(swap.buyToken)) {
      dailyVolume.add(swap.buyToken, swap.buyAmount);
    }
    // Neither side priced: leave the swap unvalued rather than invent a price.
  }

  for (const log of feeChargedLogs) {
    dailyFees.add(normalizeToken(log.token), log.amount, "Platform Fees");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Volume: "Each completed swap is counted once using its priced input, or its priced output when the input has no usable price. Native ETH addresses are normalized before pricing. Swaps with neither side priced are excluded.",
  Fees: "5-10 BPs of platform fees charged on all swaps.",
  Revenue: "5-10 BPs of platform fees charged on all swaps.",
  ProtocolRevenue: "5-10 BPs of platform fees charged on all swaps.",
}

const breakdownMethodology = {
  Fees: {
    "Platform Fees": "5-10 BPs of platform fees charged on all swaps.",
  },
  Revenue: {
    "Platform Fees": "5-10 BPs of platform fees charged on all swaps.",
  },
  ProtocolRevenue: {
    "Platform Fees": "5-10 BPs of platform fees charged on all swaps.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-06-12",
  methodology,
  breakdownMethodology,
}

export default adapter;
