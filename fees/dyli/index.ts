import { Interface, zeroPadValue } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";
import { METRIC } from "../../helpers/metrics";
import { addTokensReceived } from "../../helpers/token";

// DYLI production contracts on Abstract; source is DYLI's live production config.
const MAIN_CONTRACT = "0x458422e93bf89a109afc4fac00aacf2f18fcf541";
const MARKETPLACE = "0xC74d5002c10c13D2ad258B4584690829387f84dC";
const TRADING = "0x7627994b4B2d56A05cb2978b813cA0E1ccB22f97";
const PLATFORM_WALLET = "0xfB1302F5D6c5F107a0715b8Ce7303D1e3C647807";
// DYLI vault/warehouse payment wallet on both chains; counts external service-fee inflows and excludes internal sweeps.
// Source: https://abscan.org/address/0x04eaa73b518783010a5A5dc471eEa89C4C34eF44
// Base: https://basescan.org/address/0x04eaa73b518783010a5A5dc471eEa89C4C34eF44
const VAULT_PAYMENT_WALLET = "0x04eaa73b518783010a5A5dc471eEa89C4C34eF44";

const VENDING_MACHINES = [
  "0x92e6f37f41f78b7dd64d9741e2abd304cc3d9f0e",
  "0xbc4dD610d4930fAe06874a546561F4654D603387",
  "0x270Bbb21B1187Bc6e694F428DCb51432958Eb3d9",
];

// DYLI migrated at noon New York time on October 13, 2026 (16:00 UTC).
const MIGRATION_TIMESTAMP = 1791907200;
const CHAIN_CONFIG = {
  [CHAIN.ABSTRACT]: {
    usdc: ADDRESSES.abstract.USDC,
    main: MAIN_CONTRACT,
    marketplace: MARKETPLACE,
    trading: TRADING,
    vendingMachines: VENDING_MACHINES,
    // First block at/after the cutoff: https://abscan.org/block/87554869
    migrationBlock: 87554869,
  },
  [CHAIN.BASE]: {
    usdc: ADDRESSES.base.USDC,
    // DYLI Base production config; contract source links are listed beside each address.
    main: "0xc9376Fc32bFdbDb039Cc86542F0974d61D127a2A", // https://basescan.org/address/0xc9376Fc32bFdbDb039Cc86542F0974d61D127a2A
    marketplace: "0xb026de341A0f21Cc1BDdF0CC08EFB010A2d37c0d", // https://basescan.org/address/0xb026de341A0f21Cc1BDdF0CC08EFB010A2d37c0d
    trading: "0x6478749AcAA9A77C6c4225668c815A456c7c3492", // https://basescan.org/address/0x6478749AcAA9A77C6c4225668c815A456c7c3492
    vendingMachines: ["0x2f28a653fFfFe4698838BC695c1354023C7b46D2"], // https://basescan.org/address/0x2f28a653fFfFe4698838BC695c1354023C7b46D2
    // First block at/after the cutoff: https://basescan.org/block/52558927
    migrationBlock: 52558927,
  },
};

const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const ERC20_INTERFACE = new Interface([TRANSFER_EVENT]);
const LISTING_BOUGHT =
  "event ListingBought(uint256 listingId, uint256 tokenId, address buyer, address seller, uint64 amount, uint128 pricePerItem)";
const BID_ACCEPTED =
  "event BidAccepted(uint256 bidId, uint256 tokenId, address seller, address buyer, uint64 amount, uint128 pricePerItem)";
const ORDER_ACCEPTED = "event OrderAccepted(uint256 indexed orderId, address indexed accepter)";

// Current DYLI production fees; source is DYLI's live production config.
const MARKETPLACE_FEE_BPS = 500n; // 5% secondary marketplace fee.
const TRADE_FEE_BPS = 250n; // 2.5% accepted P2P trade fee.
const BPS_DENOMINATOR = 10_000n;
const CARD_SALES = "Card Sales";
const CARD_BUYBACK_SPENDS = "Card Buyback Spends";

const normalize = (address?: string) => address?.toLowerCase();
const formatError = (error: unknown) => (error instanceof Error ? error.message : String(error));
const getLogFrom = (log: any) => normalize(log.from ?? log.from_address ?? log.args?.from);
const getLogTo = (log: any) => normalize(log.to ?? log.to_address ?? log.args?.to);

const addMarketplaceLogs = (
  logs: any[],
  dailyVolume: any,
  dailyFees: any,
  usdc: string,
) => {
  for (const log of logs) {
    const args = log.args ?? log;
    const volume = BigInt(args.amount) * BigInt(args.pricePerItem);
    const fees = (volume * MARKETPLACE_FEE_BPS) / BPS_DENOMINATOR;

    dailyVolume.add(usdc, volume);
    dailyFees.add(usdc, fees, METRIC.TRADING_FEES);
  }
};

const fetch = async (originalOptions: FetchOptions) => {
  const config = CHAIN_CONFIG[originalOptions.chain];
  const isBase = originalOptions.chain === CHAIN.BASE;
  const USDC = config.usdc;
  const SERVICE_FEE_TARGETS = [config.main, PLATFORM_WALLET, VAULT_PAYMENT_WALLET];
  const INTERNAL_ADDRESSES = new Set(
    [...SERVICE_FEE_TARGETS, config.marketplace, config.trading, ...config.vendingMachines].map(normalize),
  );
  const isExternalSender = (log: any) => !INTERNAL_ADDRESSES.has(getLogFrom(log));
  const dailyVolume = originalOptions.createBalances();
  const dailyFees = originalOptions.createBalances();
  const result = () => ({
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  });

  if (isBase ? originalOptions.endTimestamp < MIGRATION_TIMESTAMP : originalOptions.startTimestamp >= MIGRATION_TIMESTAMP)
    return result();

  const [originalFromBlock, originalToBlock] = await Promise.all([
    originalOptions.getFromBlock(), originalOptions.getToBlock(),
  ]);
  const fromBlock = isBase ? Math.max(originalFromBlock, config.migrationBlock) : originalFromBlock;
  const toBlock = isBase ? originalToBlock : Math.min(originalToBlock, config.migrationBlock - 1);
  if (fromBlock > toBlock) return result();

  // Bound both token-transfer helpers and event queries on the migration day.
  const options: FetchOptions = {
    ...originalOptions,
    getFromBlock: async () => fromBlock,
    getToBlock: async () => toBlock,
    getLogs: (params) => originalOptions.getLogs({ ...params, fromBlock, toBlock }),
  };

  const [listingBoughtLogs, bidAcceptedLogs, orderAcceptedLogs] = await Promise.all([
    options.getLogs({ target: config.marketplace, eventAbi: LISTING_BOUGHT, onlyArgs: false, parseLog: true }),
    options.getLogs({ target: config.marketplace, eventAbi: BID_ACCEPTED, onlyArgs: false, parseLog: true }),
    options.getLogs({ target: config.trading, eventAbi: ORDER_ACCEPTED, entireLog: true }),
  ]);
  const settlementTxs = new Set(
    [...listingBoughtLogs, ...bidAcceptedLogs, ...orderAcceptedLogs].map((log) => log.transactionHash?.toLowerCase()).filter(Boolean),
  );

  const getServiceFeeInflows = async () => {
    if (!isBase) return addTokensReceived({ options, targets: SERVICE_FEE_TARGETS, token: USDC, logFilter: isExternalSender });
    const balances = options.createBalances();
    // Base commissions go directly from users to the payment wallet; count them under trading fees once.
    const logs = await Promise.all(SERVICE_FEE_TARGETS.map((target) => options.getLogs({
      target: USDC,
      eventAbi: TRANSFER_EVENT,
      topics: [ERC20_INTERFACE.getEvent("Transfer")!.topicHash, null as any, zeroPadValue(target, 32)],
      onlyArgs: false,
      parseLog: true,
    })));
    for (const log of logs.flat()) {
      const isCommission = getLogTo(log) === normalize(PLATFORM_WALLET)
        && settlementTxs.has(log.transactionHash?.toLowerCase());
      if (isExternalSender(log) && !isCommission)
        balances.add(USDC, log.args.value);
    }
    return balances;
  };

  const [serviceFeeInflows, cardSaleInflows, cardBuybackOutflows] = await Promise.all([
    getServiceFeeInflows(),
    addTokensReceived({
      options,
      targets: config.vendingMachines,
      token: USDC,
      logFilter: (log) => {
        return isExternalSender(log);
      },
    }),
    addTokensReceived({
      options,
      fromAdddesses: config.vendingMachines,
      token: USDC,
      logFilter: (log) => {
        const to = getLogTo(log);
        return !to || !INTERNAL_ADDRESSES.has(to);
      },
    }),
  ]);

  const serviceFees = serviceFeeInflows.clone(1, METRIC.SERVICE_FEES);
  const cardSales = cardSaleInflows.clone(1, CARD_SALES);
  const cardBuybacks = cardBuybackOutflows.clone(-1, CARD_BUYBACK_SPENDS);

  dailyVolume.add(serviceFees);
  dailyVolume.add(cardSales);

  dailyFees.add(serviceFees, METRIC.SERVICE_FEES);
  dailyFees.add(cardSales, CARD_SALES);
  dailyFees.add(cardBuybacks, CARD_BUYBACK_SPENDS);

  addMarketplaceLogs(listingBoughtLogs, dailyVolume, dailyFees, USDC);
  addMarketplaceLogs(bidAcceptedLogs, dailyVolume, dailyFees, USDC);

  const acceptedTradeTxHashes = [
    ...new Set(
      orderAcceptedLogs.map((log: any) => log.transactionHash?.toLowerCase()).filter(Boolean),
    ),
  ];

  let tradingVolume = 0n;
  let baseTradingFees = 0n;
  if (acceptedTradeTxHashes.length) {
    let receipts;
    try {
      receipts = await getTxReceiptsWithRetry(options.chain, acceptedTradeTxHashes);
      if (receipts.some((receipt) => !receipt))
        throw new Error("Accepted-trade receipts are still missing after retries");
    } catch (error) {
      throw new Error(`Failed to fetch DYLI P2P trade receipts: ${formatError(error)}`);
    }

    const platformWallet = normalize(PLATFORM_WALLET);
    const usdc = normalize(USDC);

    for (const receipt of receipts) {
      for (const log of receipt?.logs ?? []) {
        if (normalize(log.address) !== usdc) continue;

        const parsedLog = ERC20_INTERFACE.parseLog({
          topics: log.topics ?? [],
          data: log.data ?? "0x",
        });
        if (!parsedLog || parsedLog.name !== "Transfer") continue;
        if (normalize(parsedLog.args.to) === platformWallet) {
          if (!isBase || !isExternalSender(parsedLog)) continue;
          baseTradingFees += BigInt(parsedLog.args.value);
        }
        tradingVolume += BigInt(parsedLog.args.value);
      }
    }
  }

  if (tradingVolume > 0n) {
    const tradingFees = isBase ? baseTradingFees : (tradingVolume * TRADE_FEE_BPS) / BPS_DENOMINATOR;
    dailyVolume.add(USDC, tradingVolume);
    dailyFees.add(USDC, tradingFees, METRIC.TRADING_FEES);
  }

  return result();
};

const methodology = {
  Volume:
    "Onchain USDC payments into DYLI mint, vending-machine, platform-wallet, vault-payment, and batchRedeem paths, plus marketplace and P2P trade settlement volume.",
  Fees:
    "Onchain USDC collected by DYLI contracts and payment wallets after subtracting vending-machine card buybacks, plus 5% marketplace fees. P2P fees are calculated as 2.5% of accepted trade USDC volume on Abstract and measured from USDC paid to the DYLI platform wallet in accepted trades on Base. Abstract is tracked before October 13, 2026 at 16:00 UTC; Base is tracked from that time onward. Stripe/card payments are excluded.",
  Revenue: "Onchain USDC fees and payment flows retained by DYLI.",
  ProtocolRevenue: "Onchain USDC fees and payment flows retained by DYLI.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "USDC transfers into DYLI mint, platform-wallet, vault-payment, and batchRedeem fee paths.",
    [CARD_SALES]: "USDC spent by users on card packs (vending-machine sales).",
    [CARD_BUYBACK_SPENDS]: "USDC spent by the protocol on card buybacks (vending-machine buybacks).",
    [METRIC.TRADING_FEES]: "5% of secondary marketplace volume; P2P fees are 2.5% of accepted trade USDC volume on Abstract and the USDC paid to the DYLI platform wallet in accepted trades on Base.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
    [CARD_SALES]: "USDC spent by users on card packs (vending-machine sales) retained by DYLI.",
    [CARD_BUYBACK_SPENDS]: "USDC spent by the protocol on card buybacks (vending-machine buybacks) spent by DYLI.",
    [METRIC.TRADING_FEES]: "Marketplace and P2P trade fees retained by DYLI.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
    [CARD_SALES]: "USDC spent by users on card packs (vending-machine sales) retained by DYLI.",
    [CARD_BUYBACK_SPENDS]: "USDC spent by the protocol on card buybacks (vending-machine buybacks) spent by DYLI.",
    [METRIC.TRADING_FEES]: "Marketplace and P2P trade fees retained by DYLI.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ABSTRACT]: { fetch, start: "2025-10-05" },
    [CHAIN.BASE]: { fetch, start: "2026-10-13" },
  },
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // buybacks in this period can cover sales from prior periods, so net fees may be negative
};

export default adapter;
