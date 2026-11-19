import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// DaWabLauncher production deployment on Robinhood Chain (chainId 4663).
//
// Factory:
// https://robinhoodchain.blockscout.com/address/0x0E54a12dB2d6B8f309269ef98F8b9c2764aa3A92
//
// The Factory is the canonical discovery root for DaWabLauncher markets.
// Each CurveCreated event identifies the bonding curve and its quote token.
//
// Bonding-curve trades charge a 1.00% protocol fee (100 bps). The exact
// protocolFee is emitted by CurveBuy / CurveSell.
//
// Post-graduation swaps occur on the receiving AMM and are intentionally
// excluded here to avoid double-counting DEX volume.

const FACTORY = "0x0E54a12dB2d6B8f309269ef98F8b9c2764aa3A92";
const FACTORY_DEPLOYMENT_BLOCK = 66_552_064;

const CURVE_CREATED =
  "event CurveCreated(address indexed curve, address indexed token, address indexed quoteToken, address creator, uint256 curveAllocation, uint256 liquidityReserve, uint256 startingPrice, uint256 slope, uint256 graduationThreshold, uint8 tokenDecimals)";

const CURVE_BUY =
  "event CurveBuy(address indexed trader, uint256 tokenAmount, uint256 curveQuote, uint256 protocolFee, uint256 totalQuoteIn, uint256 tokensSoldAfter, uint256 quoteReserveAfter)";

const CURVE_SELL =
  "event CurveSell(address indexed trader, uint256 tokenAmount, uint256 curveQuote, uint256 protocolFee, uint256 netQuoteOut, uint256 tokensSoldAfter, uint256 quoteReserveAfter)";

const BONDING_CURVE_FEES = "Bonding Curve Trading Fees";
const BONDING_CURVE_FEES_TO_PROTOCOL =
  "Bonding Curve Trading Fees To Protocol";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // Discover all protocol-created markets from the canonical Factory.
  const createdLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: CURVE_CREATED,
    fromBlock: FACTORY_DEPLOYMENT_BLOCK,
    cacheInCloud: true,
  });

  const quoteTokenByCurve = new Map<string, string>();

  for (const log of createdLogs) {
    quoteTokenByCurve.set(
      String(log.curve).toLowerCase(),
      String(log.quoteToken),
    );
  }

  const curves = [...quoteTokenByCurve.keys()];

  if (!curves.length) {
    return {
      dailyVolume,
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
    };
  }

  // Preserve the emitting contract address so each trade can be mapped back
  // to the quote token discovered through CurveCreated.
  const buyLogs = await options.getLogs({
    targets: curves,
    eventAbi: CURVE_BUY,
    onlyArgs: false,
  });

  const sellLogs = await options.getLogs({
    targets: curves,
    eventAbi: CURVE_SELL,
    onlyArgs: false,
  });

  for (const log of buyLogs) {
    const curve = String(log.address || "").toLowerCase();
    const quoteToken = quoteTokenByCurve.get(curve);

    if (!quoteToken) {
      throw new Error(
        `Missing quote token for DaWabLauncher curve ${curve}`,
      );
    }

    // Buy volume is gross of fees. totalQuoteIn is the complete quote-token
    // amount paid by the trader: curveQuote + protocolFee.
    dailyVolume.add(quoteToken, log.args.totalQuoteIn);

    dailyFees.add(
      quoteToken,
      log.args.protocolFee,
      BONDING_CURVE_FEES,
    );

    dailyRevenue.add(
      quoteToken,
      log.args.protocolFee,
      BONDING_CURVE_FEES_TO_PROTOCOL,
    );

    dailyProtocolRevenue.add(
      quoteToken,
      log.args.protocolFee,
      BONDING_CURVE_FEES_TO_PROTOCOL,
    );
  }

  for (const log of sellLogs) {
    const curve = String(log.address || "").toLowerCase();
    const quoteToken = quoteTokenByCurve.get(curve);

    if (!quoteToken) {
      throw new Error(
        `Missing quote token for DaWabLauncher curve ${curve}`,
      );
    }

    // Sell volume is gross of fees. curveQuote is the gross quote-token
    // redemption before protocolFee is deducted to produce netQuoteOut.
    dailyVolume.add(quoteToken, log.args.curveQuote);

    dailyFees.add(
      quoteToken,
      log.args.protocolFee,
      BONDING_CURVE_FEES,
    );

    dailyRevenue.add(
      quoteToken,
      log.args.protocolFee,
      BONDING_CURVE_FEES_TO_PROTOCOL,
    );

    dailyProtocolRevenue.add(
      quoteToken,
      log.args.protocolFee,
      BONDING_CURVE_FEES_TO_PROTOCOL,
    );
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Volume:
    "Gross quote-token value traded against DaWabLauncher bonding curves: fee-inclusive quote paid on buys plus gross quote redeemed from curve liquidity on sells. Post-graduation AMM swaps are excluded.",
  Fees:
    "The 1.00% protocol trading fee paid on DaWabLauncher bonding-curve buys and sells, read directly from each trade event. DaWabLauncher charges no separate market-creation or graduation fee.",
  Revenue:
    "All DaWabLauncher bonding-curve trading fees are retained as protocol revenue.",
  ProtocolRevenue:
    "All DaWabLauncher bonding-curve trading fees are allocated to the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [BONDING_CURVE_FEES]:
      "The 1.00% protocol fee paid on the quote-token side of every bonding-curve buy and sell.",
  },
  Revenue: {
    [BONDING_CURVE_FEES_TO_PROTOCOL]:
      "Bonding-curve trading fees retained by the DaWabLauncher protocol.",
  },
  ProtocolRevenue: {
    [BONDING_CURVE_FEES_TO_PROTOCOL]:
      "Bonding-curve trading fees retained by the DaWabLauncher protocol.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-09-18",  // Factory deployment; first bonding-curve trading activity was 2026-09-19.
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;