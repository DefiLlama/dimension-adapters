import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import getTxReceipts from "../../helpers/getTxReceipts";
import { METRIC } from "../../helpers/metrics";
import { addTokensReceived } from "../../helpers/token";

const USDC = ADDRESSES.abstract.USDC;

const MAIN_CONTRACT = "0x458422e93bf89a109afc4fac00aacf2f18fcf541";
const MARKETPLACE = "0xC74d5002c10c13D2ad258B4584690829387f84dC";
const TRADING = "0x7627994b4B2d56A05cb2978b813cA0E1ccB22f97";
const PLATFORM_WALLET = "0xfB1302F5D6c5F107a0715b8Ce7303D1e3C647807";

const VENDING_MACHINES = [
  "0x92e6f37f41f78b7dd64d9741e2abd304cc3d9f0e",
  "0xbc4dD610d4930fAe06874a546561F4654D603387",
  "0x270Bbb21B1187Bc6e694F428DCb51432958Eb3d9",
];

const SERVICE_FEE_TARGETS = [MAIN_CONTRACT, PLATFORM_WALLET];
const INTERNAL_ADDRESSES = new Set(
  [MAIN_CONTRACT, MARKETPLACE, TRADING, PLATFORM_WALLET, ...VENDING_MACHINES].map((address) =>
    address.toLowerCase(),
  ),
);

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const LISTING_BOUGHT =
  "event ListingBought(uint256 listingId, uint256 tokenId, address buyer, address seller, uint64 amount, uint128 pricePerItem)";
const BID_ACCEPTED =
  "event BidAccepted(uint256 bidId, uint256 tokenId, address seller, address buyer, uint64 amount, uint128 pricePerItem)";
const ORDER_ACCEPTED = "event OrderAccepted(uint256 indexed orderId, address indexed accepter)";

// Current DYLI production fees; public docs may lag platform config.
const MARKETPLACE_FEE_BPS = 500n;
const TRADE_FEE_BPS = 250n;
const BPS_DENOMINATOR = 10_000n;

const normalize = (address?: string) => address?.toLowerCase();
const getLogFrom = (log: any) => normalize(log.from ?? log.from_address ?? log.args?.from);
const getLogTo = (log: any) => normalize(log.to ?? log.to_address ?? log.args?.to);

const addMarketplaceLogs = (
  logs: any[],
  dailyVolume: any,
  dailyFees: any,
) => {
  for (const log of logs) {
    const volume = BigInt(log.amount) * BigInt(log.pricePerItem);
    const fees = (volume * MARKETPLACE_FEE_BPS) / BPS_DENOMINATOR;

    dailyVolume.add(USDC, volume);
    dailyFees.add(USDC, fees, METRIC.TRADING_FEES);
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const [serviceFeeInflows, cardSaleInflows, cardBuybackOutflows] = await Promise.all([
    addTokensReceived({
      options,
      targets: SERVICE_FEE_TARGETS,
      token: USDC,
      logFilter: (log) => {
        const to = getLogTo(log);
        if (to === normalize(PLATFORM_WALLET)) return true;
        return getLogFrom(log) !== normalize(PLATFORM_WALLET);
      },
    }),
    addTokensReceived({
      options,
      targets: VENDING_MACHINES,
      token: USDC,
      logFilter: (log) => {
        const to = getLogTo(log);
        if (to === normalize(PLATFORM_WALLET)) return true;
        return getLogFrom(log) !== normalize(PLATFORM_WALLET);
      },
    }),
    addTokensReceived({
      options,
      fromAdddesses: VENDING_MACHINES,
      token: USDC,
      logFilter: (log) => {
        const to = getLogTo(log);
        return !to || !INTERNAL_ADDRESSES.has(to);
      },
    }),
  ]);

  const serviceFees = serviceFeeInflows.clone(1, "Service Fees");
  const cardSales = cardSaleInflows.clone(1, "Card Sales");
  const cardBuybacks = cardBuybackOutflows.clone(-1, "Card Buyback Spends");

  dailyVolume.add(serviceFees);
  dailyVolume.add(cardSales);

  dailyFees.add(serviceFees);
  dailyFees.add(cardSales);
  dailyFees.add(cardBuybacks);

  const listingBoughtLogs = await options.getLogs({
    target: MARKETPLACE,
    eventAbi: LISTING_BOUGHT,
  });

  const bidAcceptedLogs = await options.getLogs({
    target: MARKETPLACE,
    eventAbi: BID_ACCEPTED,
  });

  const orderAcceptedLogs = await options.getLogs({
    target: TRADING,
    eventAbi: ORDER_ACCEPTED,
    entireLog: true,
  });

  addMarketplaceLogs(listingBoughtLogs, dailyVolume, dailyFees);
  addMarketplaceLogs(bidAcceptedLogs, dailyVolume, dailyFees);

  const acceptedTradeTxHashes = [
    ...new Set(
      orderAcceptedLogs.map((log: any) => log.transactionHash?.toLowerCase()).filter(Boolean),
    ),
  ];

  let tradingVolume = 0n;
  if (acceptedTradeTxHashes.length) {
    const receipts = await getTxReceipts(options.chain, acceptedTradeTxHashes, {
      cacheKey: "dyli-p2p-trades",
    });
    const platformWallet = normalize(PLATFORM_WALLET);
    const usdc = normalize(USDC);

    for (const receipt of receipts) {
      for (const log of receipt?.logs ?? []) {
        if (normalize(log.address) !== usdc) continue;
        const topics = log.topics ?? [];
        if (topics.length < 3 || normalize(topics[0]) !== TRANSFER_TOPIC) continue;
        if (`0x${topics[2].slice(26).toLowerCase()}` === platformWallet) continue;
        tradingVolume += BigInt(log.data ?? 0);
      }
    }
  }

  if (tradingVolume > 0n) {
    const tradingFees = (tradingVolume * TRADE_FEE_BPS) / BPS_DENOMINATOR;
    dailyVolume.add(USDC, tradingVolume);
    dailyFees.add(USDC, tradingFees, METRIC.TRADING_FEES);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Volume:
    "Onchain USDC payments into DYLI mint, vending-machine, platform-wallet, and batchRedeem paths, vending-machine card buyback payouts, plus marketplace and P2P trade settlement volume.",
  Fees:
    "Onchain USDC collected by DYLI contracts and wallet, net of vending-machine card buybacks up to zero, plus 5% marketplace fees and 2.5% P2P trade fees. Stripe/card payments are excluded.",
  UserFees: "USDC paid by users through the tracked onchain DYLI payment paths.",
  Revenue: "Onchain USDC fees and payment flows retained by DYLI.",
  ProtocolRevenue: "Onchain USDC fees and payment flows retained by DYLI.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "USDC transfers into DYLI mint, platform-wallet and batchRedeem fee paths.",
    "Card Sales": "USDC spent by users on card packs (vending-machine sales).",
    "Card Buyback Spends": "USDC spent by the protocol on card buybacks (vending-machine buybacks).",
    [METRIC.TRADING_FEES]: "5% of secondary marketplace volume and 2.5% of accepted P2P trade USDC volume.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
    "Card Sales": "USDC spent by users on card packs (vending-machine sales) retained by DYLI.",
    "Card Buyback Spends": "USDC spent by the protocol on card buybacks (vending-machine buybacks) spent by DYLI.",
    [METRIC.TRADING_FEES]: "Marketplace and P2P trade fees retained by DYLI.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
    "Card Sales": "USDC spent by users on card packs (vending-machine sales) retained by DYLI.",
    "Card Buyback Spends": "USDC spent by the protocol on card buybacks (vending-machine buybacks) spent by DYLI.",
    [METRIC.TRADING_FEES]: "Marketplace and P2P trade fees retained by DYLI.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ABSTRACT],
  start: "2025-10-05",
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // buybacks in this period can cover sales from prior periods, so net fees may be negative
};

export default adapter;
