import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const WXPL = ADDRESSES.plasma.WXPL;
const USDT0 = ADDRESSES.plasma.USDT0;

const REFUND_PROCESSOR = "0xbea491ebb285fb658e1408a97b608b4847ee79d1";
const CARD_SPEND_POOL = "0xc7eda2b178c8488aa98dd1a3711566634d725268";

const CASHBACK_PROCESSOR_V1 = "0xb1bcb6a1fda3a6c47d12f985a62481dacbccf84e";
const CASHBACK_PROCESSOR_V2 = "0x6322196fb6ee14852ff4901b1885d5a9db7fa302";

// event Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function topic(address: string) {
   return "0x000000000000000000000000" + address.slice(2).toLowerCase();
};

const MetricLabels = {
  REFUNDS: "Refunds",
  CASHBACKS: "Cashbacks",
};

const fetch = async (options: FetchOptions) => {
  const dailySupplySideRevenue = options.createBalances();
  const dailyFees = options.createBalances();

  // Card purchase refunds: outflows from REFUND_PROCESSOR that don't go back to CARD_SPEND_POOL
  const refundLogs = await options.getLogs({
    target: USDT0,
    topics: [TRANSFER_TOPIC, topic(REFUND_PROCESSOR)],
    entireLog: true,
    cacheInCloud: true,
  });

  for (const log of refundLogs) {
    const to = "0x" + log.topics[2].slice(26);
    if (to.toLowerCase() === CARD_SPEND_POOL) continue;
    dailyFees.add(USDT0, log.data, MetricLabels.REFUNDS);
    dailySupplySideRevenue.add(USDT0, log.data, MetricLabels.REFUNDS);
  }

  // XPL Cashbacks: outflows from cashback processors
  // V1 deprecated after block 17612591, V2 from then on
  const CASHBACK_V1_LAST_BLOCK = 17612591;
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  const useV1 = fromBlock <= CASHBACK_V1_LAST_BLOCK;
  const useV2 = toBlock > CASHBACK_V1_LAST_BLOCK;

  const cashbackLogFetches = [];
  if (useV1) {
    cashbackLogFetches.push(
      options.getLogs({ 
        target: WXPL, 
        topics: [TRANSFER_TOPIC, topic(CASHBACK_PROCESSOR_V1)], 
        entireLog: true, 
      })
    );
  };
  if (useV2) {
    cashbackLogFetches.push(
      options.getLogs({ 
        target: WXPL, 
        topics: [TRANSFER_TOPIC, topic(CASHBACK_PROCESSOR_V2)], 
        entireLog: true, 
      })
    );
  };
  const cashbackLogs = (await Promise.all(cashbackLogFetches)).flat();

  for (const log of cashbackLogs) {
    dailyFees.add(WXPL, log.data, MetricLabels.CASHBACKS);
    dailySupplySideRevenue.add(ADDRESSES.plasma.WXPL, log.data, MetricLabels.CASHBACKS);
  }

  // Volume: inflows to CARD_SPEND_POOL = on-chain movement of real-life card expenditures
  const dailyVolume = options.createBalances();
  const volumeLogs = await options.getLogs({
    target: USDT0,
    topics: [TRANSFER_TOPIC, null as any, topic(CARD_SPEND_POOL)],
    entireLog: true,
    cacheInCloud: true,
  });
  for (const log of volumeLogs) {
    const from = "0x" + log.topics[1].slice(26);
    // skip mints
    if (from === "0x0000000000000000000000000000000000000000") continue;
    dailyVolume.add(USDT0, log.data);
  }

  return { dailySupplySideRevenue, dailyFees, dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.PLASMA],
  start: "2025-11-12",
  methodology: {
    Volume: "Real-life card expenditure settled on-chain.",
    Fees: "Total fees paid by users, including refunds and XPL cashback rewards.",
    SupplySideRevenue: "USDT0 refunds from the Refund Processor and XPL cashback rewards.",
  },
  breakdownMethodology: {
    Fees: {
      [MetricLabels.REFUNDS]: "USDT0 refunded to users by the Refund Processor.",
      [MetricLabels.CASHBACKS]: "XPL tokens distributed as cashback rewards to cardholders.",
    },
    SupplySideRevenue: {
      [MetricLabels.REFUNDS]: "USDT0 refunded to users by the Refund Processor.",
      [MetricLabels.CASHBACKS]: "XPL tokens distributed as cashback rewards to cardholders.",
    },
  },
  skipBreakdownValidation: true,
};

export default adapter;
