import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const FEE_COLLECTORS = [
  "0x00000000ae2193c4ac6521146b1adafe9b43361d",
  "0x00000000d204b71c77e1fa21cf0892c6590ca78b",
  "0x0000000071647c6c1ae028daf9f80c000beac2cc",
  "0x000000003fb974cfdd8f715353b005628b97bfa3",
];
const EVENT_SWAP_WITH_FEE = "event SwapWithFee(address indexed token,address indexed feeAddr,uint256 indexed amount)";
const EEE_NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const SWAP_FEES = "Swap Fees";
const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Protocol";

type ChainConfig = {
  start: string;
  feeTargets: string[];
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.BSC]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.BASE]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.ARBITRUM]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.AVAX]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.BLAST]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.LINEA]: { start: "2025-09-10", feeTargets: FEE_COLLECTORS },
  [CHAIN.OPTIMISM]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.GATE_LAYER]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.BERACHAIN]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.ENI]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.SONIC]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.POLYGON]: { start: "2026-03-04", feeTargets: FEE_COLLECTORS },
  [CHAIN.WC]: { start: "2026-02-28", feeTargets: FEE_COLLECTORS },
  [CHAIN.ERA]: { start: "2025-09-01", feeTargets: FEE_COLLECTORS },
};

function getAddressFromTopic(topic: string) {
  return `0x${topic.slice(-40)}`;
}

function parseSwapWithFeeLog(log: any) {
  if (log.topics?.length === 4) {
    return {
      token: getAddressFromTopic(log.topics[1]),
      amount: BigInt(log.topics[3]).toString(),
    };
  }

  const data = log.data?.replace(/^0x/, "") ?? "";
  if (data.length < 64 * 3) return undefined;

  return {
    token: `0x${data.slice(24, 64)}`,
    amount: BigInt(`0x${data.slice(128, 192)}`).toString(),
  };
}

function addFeeAmount(balances: any, token: string, amount: string, label: string) {
  if (!amount || amount === "0") return;
  const normalizedToken = token.toLowerCase();
  if (normalizedToken === ADDRESSES.null || normalizedToken === EEE_NATIVE_TOKEN) balances.addGasToken(amount, label);
  else balances.add(token, amount, label);
}

async function fetch(options: FetchOptions) {
  const { createBalances, chain } = options;
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const chainConfig = config[chain];

  const logs = await options.getLogs({
    targets: chainConfig.feeTargets,
    eventAbi: EVENT_SWAP_WITH_FEE,
    onlyArgs: false,
    flatten: true,
  });

  logs.forEach((log: any) => {
    const fee = parseSwapWithFeeLog(log);
    if (!fee) return;
    addFeeAmount(dailyFees, fee.token, fee.amount, SWAP_FEES);
    addFeeAmount(dailyUserFees, fee.token, fee.amount, SWAP_FEES);
    addFeeAmount(dailyRevenue, fee.token, fee.amount, SWAP_FEES_TO_PROTOCOL);
    addFeeAmount(dailyProtocolRevenue, fee.token, fee.amount, SWAP_FEES_TO_PROTOCOL);
  });

  return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue };
}

const breakdownMethodology = {
  Fees: {
    [SWAP_FEES]: "Fees paid by users on Gate Swap routes.",
  },
  UserFees: {
    [SWAP_FEES]: "User-paid fees on Gate Swap routes.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "Swap fees retained by Gate/protocol.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "Protocol-retained swap fees sent to the Gate/protocol fee address.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "Fees paid by users to Gate Swap, tracked from SwapWithFee events.",
    UserFees: "Fees paid by users to Gate Swap, tracked from SwapWithFee events.",
    Revenue: "SwapWithFee feeAddr is a Gate/protocol revenue address, so fees are counted as protocol revenue.",
    ProtocolRevenue: "SwapWithFee feeAddr is a Gate/protocol revenue address, so fees are counted as protocol revenue.",
  },
  breakdownMethodology,
  adapter: Object.fromEntries(Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])),
};

export default adapter;
