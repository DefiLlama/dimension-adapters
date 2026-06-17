import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getSolanaReceived } from "../../helpers/token";

// Solana fee collector confirmed from test files in gateio-service-web3-build and gateio_service_web3_swap_job
const SOL_FEE_COLLECTOR = "BmDFarMxxp6ZBMZc768iWXbSEiGBVb4UvnE7hEUG7at7";

// Standard EVM executor contracts (all chains except zkSync ERA)
const EVM_EXECUTORS = [
  "0x00000000AE2193C4ac6521146B1ADaFe9b43361D",
  "0x00000000D204b71c77e1fA21cF0892C6590cA78b",
  "0x000000003645ebC3cf33167962D5477F54f4c459",
  "0x0000000071647c6C1AE028daf9f80c000bEac2cC",
  "0x000000003FB974cfdd8f715353B005628b97bFA3",
  "0x00000000f9FF568cF0362FDfd1d2567C1E10fe0d",
];

// zkSync ERA executor contracts (separate deployment)
const ZK_EXECUTORS = [
  "0x00000000d775b5a65b1e51a0105eab5010B6AA85",
  "0x000000009f4317D004E69653FE4b36D39539B1C6",
  "0x0000000006b30ec04411E405803f7B249a76E0A0",
  "0x000000003bFfDA9D8E05dCEeBe2Ece70c9bDa854",
  "0x0000000036749ccbf6c63f9d957C8DfF6213cb74",
  "0x00000000D2650fc4c90a32Dfcc70b0B7c842D94C",
];

const EVENT_SWAP_WITH_FEE = "event SwapWithFee(address indexed token,address indexed feeAddr,uint256 indexed amount)";
const EEE_NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const SWAP_FEES = "Swap Fees";

type ChainConfig = {
  start: string;
  feeTargets: string[];
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.BSC]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.BASE]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.ARBITRUM]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.AVAX]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.BLAST]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.LINEA]: { start: "2025-09-10", feeTargets: EVM_EXECUTORS },
  [CHAIN.OPTIMISM]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.GATE_LAYER]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.BERACHAIN]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.ENI]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.SONIC]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.POLYGON]: { start: "2026-03-04", feeTargets: EVM_EXECUTORS },
  [CHAIN.WC]: { start: "2026-02-28", feeTargets: EVM_EXECUTORS },
  [CHAIN.ERA]: { start: "2025-09-01", feeTargets: ZK_EXECUTORS },
};

function getAddressFromTopic(topic: string) {
  return `0x${topic.slice(-40)}`;
}

function parseSwapWithFeeLog(log: any) {
  if (log.topics?.length !== 4) return undefined;
  return {
    token: getAddressFromTopic(log.topics[1]),
    amount: BigInt(log.topics[3]).toString(),
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
  const chainConfig = config[chain];

  if (!chainConfig.feeTargets.length) return { dailyFees, dailyUserFees };

  const logs = await options.getLogs({
    targets: chainConfig.feeTargets,
    eventAbi: EVENT_SWAP_WITH_FEE,
    onlyArgs: false,
    flatten: true,
    cacheInCloud: true,
  });

  logs.forEach((log: any) => {
    const fee = parseSwapWithFeeLog(log);
    if (!fee) return;
    addFeeAmount(dailyFees, fee.token, fee.amount, SWAP_FEES);
    addFeeAmount(dailyUserFees, fee.token, fee.amount, SWAP_FEES);
  });

  return { dailyFees, dailyUserFees };
}

async function fetchSolana(options: FetchOptions) {
  try {
    const dailyFees = await getSolanaReceived({ options, target: SOL_FEE_COLLECTOR });
    const dailyUserFees = await getSolanaReceived({ options, target: SOL_FEE_COLLECTOR });
    return { dailyFees, dailyUserFees };
  } catch (e: any) {
    if (e?.message?.includes('Allium API Key is required')) {
      return { dailyFees: options.createBalances(), dailyUserFees: options.createBalances() };
    }
    throw e;
  }
}

const breakdownMethodology = {
  Fees: {
    [SWAP_FEES]: "Fees paid by users on Gate Swap routes.",
  },
  UserFees: {
    [SWAP_FEES]: "User-paid fees on Gate Swap routes.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  skipBreakdownValidation: true,
  methodology: {
    Fees: "Fees paid by users to Gate Swap, tracked from SwapWithFee events on EVM and SOL transfers to fee address on Solana.",
    UserFees: "Fees paid by users to Gate Swap.",
  },
  breakdownMethodology,
  adapter: {
    ...Object.fromEntries(Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])),
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-02-28" },
  },
};

export default adapter;
