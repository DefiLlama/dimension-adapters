import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * x402 Protocol Volume Adapter
 *
 * x402 is a payment protocol enabling USDC payments to AI agents using Account Abstraction.
 * This adapter tracks payment volume across ALL x402 facilitators on Base.
 *
 * Methodology:
 *  - Detects transactions via AuthorizationUsed events (EIP-3009) on USDC(Base)
 *  - Filters to x402 facilitator addresses (tx.from in allowlist)
 *  - Respects dateOfFirstTransaction per sender
 *  - Sums USDC Transfer amounts from matching transactions
 *  - Returns raw token balances as dailyVolume
 */

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const AUTH_USED_EVENT =
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // keccak256("Transfer(address,address,uint256)")

// All x402 facilitators on Base (36 addresses across 11 providers)
const FACILITATOR_SENDERS_BASE: { address: string; since: number }[] = [
  // 402104
  { address: "0x73b2b8df52fbe7c40fe78db52e3dffdd5db5ad07", since: Date.UTC(2025, 9, 29) },

  // Aurracloud
  { address: "0x222c4367a2950f3b53af260e111fc3060b0983ff", since: Date.UTC(2025, 9, 5) },
  { address: "0xb70c4fe126de09bd292fe3d1e40c6d264ca6a52a", since: Date.UTC(2025, 9, 27) },
  { address: "0xd348e724e0ef36291a28dfeccf692399b0e179f8", since: Date.UTC(2025, 9, 29) },

  // Coinbase
  { address: "0xdbdf3d8ed80f84c35d01c6c9f9271761bad90ba6", since: Date.UTC(2025, 4, 5) },

  // Codenut
  { address: "0x8d8Fa42584a727488eeb0E29405AD794a105bb9b", since: Date.UTC(2025, 9, 13) },
  { address: "0x87aF99356d774312B73018b3B6562e1aE0e018C9", since: Date.UTC(2025, 9, 31) },
  { address: "0x65058CF664D0D07f68B663B0D4b4f12A5E331a38", since: Date.UTC(2025, 9, 31) },
  { address: "0x88E13D4c764a6c840Ce722A0a3765f55A85b327E", since: Date.UTC(2025, 9, 31) },

  // Daydreams
  { address: "0x279e08f711182c79Ba6d09669127a426228a4653", since: Date.UTC(2025, 9, 16) },

  // Mogami
  { address: "0xfe0920a0a7f0f8a1ec689146c30c3bbef439bf8a", since: Date.UTC(2025, 9, 24) },

  // OpenX402
  { address: "0x97316fa4730bc7d3b295234f8e4d04a0a4c093e8", since: Date.UTC(2025, 9, 16) },
  { address: "0x97db9b5291a218fc77198c285cefdc943ef74917", since: Date.UTC(2025, 9, 16) },

  // PayAI
  { address: "0xc6699d2aada6c36dfea5c248dd70f9cb0235cb63", since: Date.UTC(2025, 4, 18) },
  { address: "0xb2bd29925cbbcea7628279c91945ca5b98bf371b", since: Date.UTC(2025, 9, 29) },
  { address: "0x25659315106580ce2a787ceec5efb2d347b539c9", since: Date.UTC(2025, 9, 29) },
  { address: "0xb8f41cb13b1f213da1e94e1b742ec1323235c48f", since: Date.UTC(2025, 9, 29) },
  { address: "0xe575fa51af90957d66fab6d63355f1ed021b887b", since: Date.UTC(2025, 9, 29) },

  // Questflow
  { address: "0x724efafb051f17ae824afcdf3c0368ae312da264", since: Date.UTC(2025, 9, 29) },
  { address: "0xa9a54ef09fc8b86bc747cec6ef8d6e81c38c6180", since: Date.UTC(2025, 9, 29) },
  { address: "0x4638bc811c93bf5e60deed32325e93505f681576", since: Date.UTC(2025, 9, 29) },
  { address: "0xd7d91a42dfadd906c5b9ccde7226d28251e4cd0f", since: Date.UTC(2025, 9, 29) },
  { address: "0x4544b535938b67d2a410a98a7e3b0f8f68921ca7", since: Date.UTC(2025, 9, 29) },
  { address: "0x59e8014a3b884392fbb679fe461da07b18c1ff81", since: Date.UTC(2025, 9, 29) },
  { address: "0xe6123e6b389751c5f7e9349f3d626b105c1fe618", since: Date.UTC(2025, 9, 29) },
  { address: "0xf70e7cb30b132fab2a0a5e80d41861aa133ea21b", since: Date.UTC(2025, 9, 29) },
  { address: "0x90da501fdbec74bb0549100967eb221fed79c99b", since: Date.UTC(2025, 9, 29) },
  { address: "0xce7819f0b0b871733c933d1f486533bab95ec47b", since: Date.UTC(2025, 9, 29) },

  // Thirdweb
  { address: "0x80c08de1a05df2bd633cf520754e40fde3c794d3", since: Date.UTC(2025, 9, 7) },

  // x402rs
  { address: "0xd8dfc729cbd05381647eb5540d756f4f8ad63eec", since: Date.UTC(2024, 11, 5) },
  { address: "0x76eee8f0acabd6b49f1cc4e9656a0c8892f3332e", since: Date.UTC(2025, 9, 26) },
  { address: "0x97d38aa5de015245dcca76305b53abe6da25f6a5", since: Date.UTC(2025, 9, 24) },
  { address: "0x0168f80e035ea68b191faf9bfc12778c87d92008", since: Date.UTC(2025, 9, 24) },
  { address: "0x5e437bee4321db862ac57085ea5eb97199c0ccc5", since: Date.UTC(2025, 9, 24) },
  { address: "0xc19829b32324f116ee7f80d193f99e445968499a", since: Date.UTC(2025, 9, 26) },

  // XEcho
  { address: "0x3be45f576696a2fd5a93c1330cd19f1607ab311d", since: Date.UTC(2025, 9, 30) },
];

const SENDER_SET = new Set(FACILITATOR_SENDERS_BASE.map((s) => s.address.toLowerCase()));
const SINCE_BY_SENDER = new Map(
  FACILITATOR_SENDERS_BASE.map((s) => [s.address.toLowerCase(), s.since || 0]),
);

const START = "2024-12-05"; // First x402rs facilitator

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // 1) Get AuthorizationUsed events from USDC(Base)
  const authLogs: any[] = await options.getLogs({
    target: USDC_BASE,
    eventAbi: AUTH_USED_EVENT
  });

  if (!authLogs?.length) {
    return {
      dailyVolume,
      dailyFees: 0,
      dailyRevenue: 0,
    };
  }

  const txHashes = [...new Set(authLogs.map((l) => l.transactionHash))];

  // 2) Preferred path: receipts (filter sender+since; sum USDC Transfers)
  const receipts = (options as any).getTxReceipts
    ? await (options as any).getTxReceipts(txHashes)
    : [];

  if (receipts.length) {
    for (const r of receipts) {
      if (!r) continue;
      const sender = (r.from || "").toLowerCase();
      if (!SENDER_SET.has(sender)) continue;

      const blockTimeMs = (r.blockTimestamp ?? 0) * 1000;
      const sinceMs = SINCE_BY_SENDER.get(sender) ?? 0;
      if (sinceMs && blockTimeMs && blockTimeMs < sinceMs) continue;

      // Note: We don't filter by method selector - AuthorizationUsed + sender is sufficient.
      // This avoids missing x402 transactions that go through wrappers/variants.

      for (const log of r.logs || []) {
        const addr = (log.address || "").toLowerCase();
        if (addr !== USDC_BASE.toLowerCase()) continue;
        if (!log.topics || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
        dailyVolume.add(`base:${USDC_BASE}`, log.data);
      }
    }
    return {
      dailyVolume,
      dailyFees: 0,
      dailyRevenue: 0,
    };
  }

  // 3) Fallback: if no receipts, use getTransactions to filter sender
  if ((options as any).getTransactions) {
    const txs: any[] = await (options as any).getTransactions(txHashes);
    const allowedHashes = new Set<string>();
    for (const tx of txs) {
      const sender = (tx.from || "").toLowerCase();
      if (!SENDER_SET.has(sender)) continue;
      // Can't check since without timestamps; if runner exposes receipts "per hash", try 1 call
      if ((options as any).getTxReceipts) {
        const [r] = await (options as any).getTxReceipts([tx.hash]);
        const blockTimeMs = (r?.blockTimestamp ?? 0) * 1000;
        const sinceMs = SINCE_BY_SENDER.get(sender) ?? 0;
        if (sinceMs && blockTimeMs && blockTimeMs < sinceMs) continue;
      }
      allowedHashes.add(tx.hash);
    }

    // Intersect with USDC Transfers to get amounts
    if (allowedHashes.size) {
      const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
      const transferLogs: any[] = await options.getLogs({
        target: USDC_BASE,
        eventAbi: TRANSFER_EVENT
      });
      for (const log of transferLogs) {
        if (allowedHashes.has(log.transactionHash)) {
          dailyVolume.add(`base:${USDC_BASE}`, log.value);
        }
      }
    }
    return {
      dailyVolume,
      dailyFees: 0,
      dailyRevenue: 0,
    };
  }

  // 4) Last resort: return empty to avoid false positives
  return {
    dailyVolume,
    dailyFees: 0,
    dailyRevenue: 0,
  };
};

const methodology = {
  Volume:
    "USDC payment volume facilitated through x402 protocol on Base. Tracks transfers from authorized facilitator addresses (36 addresses across 11 providers: Coinbase, PayAI, Questflow, x402rs, Codenut, Aurracloud, OpenX402, Daydreams, Mogami, Thirdweb, 402104, XEcho) using EIP-3009 (transferWithAuthorization). Respects dateOfFirstTransaction for each facilitator address.",
  Fees:
    "x402 protocol does not charge user fees. All payment amounts go directly to recipients.",
  Revenue:
    "Protocol does not collect direct revenue from transactions. Revenue model is not public.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: START,
    },
  },
  methodology,
};

export default adapter;
