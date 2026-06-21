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

const SERVICE_FEE_TARGETS = [MAIN_CONTRACT, ...VENDING_MACHINES, PLATFORM_WALLET];

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const LISTING_BOUGHT =
  "event ListingBought(uint256 listingId, uint256 tokenId, address buyer, address seller, uint64 amount, uint128 pricePerItem)";
const BID_ACCEPTED =
  "event BidAccepted(uint256 bidId, uint256 tokenId, address seller, address buyer, uint64 amount, uint128 pricePerItem)";
const ORDER_ACCEPTED = "event OrderAccepted(uint256 indexed orderId, address indexed accepter)";

const MARKETPLACE_FEE_BPS = 500n;
const TRADE_FEE_BPS = 250n;
const BPS_DENOMINATOR = 10_000n;

const normalize = (address?: string) => address?.toLowerCase();

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

  const serviceFeeInflows = await addTokensReceived({
    options,
    targets: SERVICE_FEE_TARGETS,
    token: USDC,
    logFilter: (log) => {
      const to = normalize(log.to);
      if (to === normalize(PLATFORM_WALLET)) return true;
      return normalize(log.from) !== normalize(PLATFORM_WALLET);
    },
  });

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

  dailyVolume.addBalances(serviceFeeInflows);
  dailyFees.addBalances(serviceFeeInflows, METRIC.SERVICE_FEES);
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
    "Onchain USDC payments into DYLI mint, vending-machine, platform-wallet, and batchRedeem paths, plus marketplace and P2P trade settlement volume.",
  Fees:
    "Onchain USDC collected by DYLI contracts and wallet, plus 5% marketplace fees and 2.5% P2P trade fees. Stripe/card payments are excluded.",
  UserFees: "USDC paid by users through the tracked onchain DYLI payment paths.",
  Revenue: "Onchain USDC fees and payment flows retained by DYLI.",
  ProtocolRevenue: "Onchain USDC fees and payment flows retained by DYLI.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]:
      "USDC transfers into DYLI mint, vending-machine, platform-wallet, and batchRedeem fee paths.",
    [METRIC.TRADING_FEES]:
      "5% of secondary marketplace volume and 2.5% of accepted P2P trade USDC volume.",
  },
  UserFees: {
    [METRIC.SERVICE_FEES]:
      "USDC transfers into DYLI mint, vending-machine, platform-wallet, and batchRedeem fee paths.",
    [METRIC.TRADING_FEES]:
      "5% of secondary marketplace volume and 2.5% of accepted P2P trade USDC volume.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
    [METRIC.TRADING_FEES]: "Marketplace and P2P trade fees retained by DYLI.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
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
};

export default adapter;
