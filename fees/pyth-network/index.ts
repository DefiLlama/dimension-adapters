import { CHAIN } from "../../helpers/chains";
import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
  FetchResult,
} from "../../adapters/types";
import { getSolanaReceivedDune } from "../../helpers/token";
import { queryAllium } from "../../helpers/allium";

// ============ ABI for fee query ============
const SINGLE_UPDATE_FEE_ABI = "function singleUpdateFeeInWei() view returns (uint256)";

// ============ EVM Chain Config ============
const evmChainConfig: Record<string, { start: string; contract: string }> = {
  [CHAIN.OG]: {
    start: "2024-06-01",
    contract: "0x2880ab155794e7179c9ee2e38200202908c17b43",
  },
  [CHAIN.ETHEREUM]: {
    start: "2023-07-01",
    contract: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",
  },
  [CHAIN.AVAX]: {
    start: "2023-07-01",
    contract: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",
  },
  [CHAIN.BSC]: {
    start: "2023-07-01",
    contract: "0x4D7E825f80bDf85e913E0DD2A2D54927e9dE1594",
  },
  [CHAIN.POLYGON]: {
    start: "2023-07-01",
    contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
  },
  [CHAIN.CELO]: {
    start: "2023-07-01",
    contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
  },
  [CHAIN.XDAI]: {
    start: "2023-07-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.AURORA]: {
    start: "2023-07-01",
    contract: "0xF89C7b475821EC3fDC2dC8099032c05c6c0c9AB9",
  },
  [CHAIN.KAVA]: {
    start: "2023-07-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.CRONOS]: {
    start: "2023-07-01",
    contract: "0xE0d0e68297772Dd5a1f1D99897c581E2082dbA5B",
  },
  [CHAIN.CONFLUX]: {
    start: "2023-07-01",
    contract: "0xe9d69CdD6Fe41e7B621B4A688C5D1a68cB5c8ADc",
  },
  [CHAIN.METER]: {
    start: "2023-07-01",
    contract: "0xbFe3f445653f2136b2FD1e6DdDb5676392E3AF16",
  },
  [CHAIN.WEMIX]: {
    start: "2023-07-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.KLAYTN]: {
    start: "2023-07-01",
    contract: "0x2880ab155794e7179c9ee2e38200202908c17b43",
  },
  [CHAIN.HEDERA]: {
    start: "2023-07-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.BITTORRENT]: {
    start: "2023-07-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.CORE]: {
    start: "2023-07-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.KCC]: {
    start: "2023-07-01",
    contract: "0xE0d0e68297772Dd5a1f1D99897c581E2082dbA5B",
  },
  [CHAIN.FLOW]: {
    start: "2023-10-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.FILECOIN]: {
    start: "2024-03-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.ARBITRUM]: {
    start: "2023-07-01",
    contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
  },
  [CHAIN.OPTIMISM]: {
    start: "2023-07-01",
    contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
  },
  [CHAIN.BASE]: {
    start: "2023-08-01",
    contract: "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a",
  },
  [CHAIN.BLAST]: {
    start: "2024-02-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.LINEA]: {
    start: "2023-08-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.MANTLE]: {
    start: "2023-08-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.SCROLL]: {
    start: "2023-10-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.MANTA]: {
    start: "2024-01-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.MODE]: {
    start: "2024-01-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.ERA]: {
    start: "2023-08-01",
    contract: "0xf087c864AEccFb6A2Bf1Af6A0382B0d0f6c5D834",
  },
  [CHAIN.POLYGON_ZKEVM]: {
    start: "2023-07-01",
    contract: "0xC5E56d6b40F3e3B5fbfa266bCd35C37426537c65",
  },
  [CHAIN.OP_BNB]: {
    start: "2023-09-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.BOBA]: {
    start: "2023-07-01",
    contract: "0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF",
  },
  [CHAIN.NEON]: {
    start: "2023-09-01",
    contract: "0x7f2dB085eFC3560AFF33865dD727225d91B4f9A5",
  },
  [CHAIN.SHIMMER_EVM]: {
    start: "2023-10-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.RONIN]: {
    start: "2024-01-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.LIGHTLINK_PHOENIX]: {
    start: "2024-01-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.ETHERLINK]: {
    start: "2024-06-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.POLYNOMIAL]: {
    start: "2024-01-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.ZETA]: {
    start: "2024-01-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.MERLIN]: {
    start: "2024-04-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.CHILIZ]: {
    start: "2024-03-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.BERACHAIN]: {
    start: "2025-01-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.SONIC]: {
    start: "2024-12-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.ABSTRACT]: {
    start: "2024-11-01",
    contract: "0x8739d5024B5143278E2b15Bd9e7C26f6CEc658F1",
  },
  [CHAIN.APECHAIN]: {
    start: "2024-10-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.UNICHAIN]: {
    start: "2024-11-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.HYPERLIQUID]: {
    start: "2024-12-01",
    contract: "0xe9d69CdD6Fe41e7B621B4A688C5D1a68cB5c8ADc",
  },
  [CHAIN.SONEIUM]: {
    start: "2025-01-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.WC]: {
    start: "2024-10-01",
    contract: "0xe9d69cdd6fe41e7b621b4a688c5d1a68cb5c8adc",
  },
  [CHAIN.INK]: {
    start: "2024-12-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.GRAVITY]: {
    start: "2024-06-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.MORPH]: {
    start: "2024-10-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.TAIKO]: {
    start: "2024-06-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.STORY]: {
    start: "2025-01-01",
    contract: "0xD458261E832415CFd3BAE5E416FdF3230ce6F134",
  },
  [CHAIN.HEMI]: {
    start: "2024-10-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.SWELLCHAIN]: {
    start: "2024-12-01",
    contract: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
  },
  [CHAIN.MEZO]: {
    start: "2024-09-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.SSEED]: {
    start: "2024-12-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.MONAD]: {
    start: "2025-01-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.CRONOS_ZKEVM]: {
    start: "2024-06-01",
    contract: "0x056f829183Ec806A78c26C98961678c24faB71af",
  },
  [CHAIN.ZKFAIR]: {
    start: "2024-01-01",
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  [CHAIN.CAMP]: {
    start: "2024-06-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.PLASMA]: {
    start: "2024-06-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },
  [CHAIN.EVENTUM]: {
    start: "2024-06-01",
    contract: "0x2880aB155794e7179c9eE2e38200202908C17B43",
  },

  // bad rpcs chains
  // [CHAIN.SEI]: { start: "2024-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  // [CHAIN.IOTA]: { start: "2024-06-01", contract: "0x8D254a21b3C86D32F7179855531CE99164721933" },
  // [CHAIN.INJECTIVE]: { start: "2024-06-01", contract: "0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320" },
};

// ============ Fee History ============
// Historical fee values by chain with effective timestamps
// Used for backfills when contract call would return current (not historical) fee
// Source: OP-PIP-93 (https://forum.pyth.network/t/passed-op-pip-93-q1-2026-pyth-core-fee-implementation-evm-chains/2346)
// Effective date: Feb 25, 2026 (after governance vote passed Feb 21, 2026)
const OP_PIP_93_EFFECTIVE_TIMESTAMP = 1740441600; // Feb 25, 2026 00:00:00 UTC

// Fee values from OP-PIP-93 (in wei)
// Source: https://docs.pyth.network/price-feeds/core/current-fees
const currentFees: Record<string, bigint> = {
  // ETH-based chains (0.000003 ETH = 3e12 wei)
  [CHAIN.ABSTRACT]: 3_000_000_000_000n,
  [CHAIN.ARBITRUM]: 3_000_000_000_000n,
  [CHAIN.AURORA]: 3_000_000_000_000n,
  [CHAIN.BLAST]: 3_000_000_000_000n,
  [CHAIN.BOBA]: 3_000_000_000_000n,
  [CHAIN.ETHEREUM]: 3_000_000_000_000n,
  [CHAIN.EVENTUM]: 3_000_000_000_000n,
  [CHAIN.HEMI]: 3_000_000_000_000n,
  [CHAIN.INK]: 3_000_000_000_000n,
  [CHAIN.LINEA]: 3_000_000_000_000n,
  [CHAIN.MANTA]: 3_000_000_000_000n,
  [CHAIN.MODE]: 3_000_000_000_000n,
  [CHAIN.MORPH]: 3_000_000_000_000n,
  [CHAIN.OPTIMISM]: 3_000_000_000_000n,
  [CHAIN.POLYGON_ZKEVM]: 3_000_000_000_000n,
  [CHAIN.SCROLL]: 3_000_000_000_000n,
  [CHAIN.SONEIUM]: 3_000_000_000_000n,
  [CHAIN.SSEED]: 3_000_000_000_000n,
  [CHAIN.SWELLCHAIN]: 3_000_000_000_000n,
  [CHAIN.TAIKO]: 3_000_000_000_000n,
  [CHAIN.UNICHAIN]: 3_000_000_000_000n,
  [CHAIN.WC]: 3_000_000_000_000n,
  [CHAIN.ERA]: 3_000_000_000_000n,

  // Base (0.000015 ETH)
  [CHAIN.BASE]: 15_000_000_000_000n,

  // BNB chains (0.0000125 BNB)
  [CHAIN.BSC]: 12_500_000_000_000n,
  [CHAIN.OP_BNB]: 12_500_000_000_000n,

  // Avalanche (0.0005 AVAX)
  [CHAIN.AVAX]: 500_000_000_000_000n,

  // HyperEVM (0.0001 HYPE)
  [CHAIN.HYPERLIQUID]: 100_000_000_000_000n,

  // Chains with 0.1 native token fee
  [CHAIN.CELO]: 100_000_000_000_000_000n,
  [CHAIN.CONFLUX]: 100_000_000_000_000_000n,
  [CHAIN.FLOW]: 100_000_000_000_000_000n,
  [CHAIN.POLYGON]: 100_000_000_000_000_000n,
  [CHAIN.RONIN]: 100_000_000_000_000_000n,
  [CHAIN.ZETA]: 100_000_000_000_000_000n,

  // Chains with 0.01 native token fee
  [CHAIN.ETHERLINK]: 10_000_000_000_000_000n,
  [CHAIN.FILECOIN]: 10_000_000_000_000_000n,
  [CHAIN.HEDERA]: 10_000_000_000_000_000n,
  [CHAIN.MANTLE]: 10_000_000_000_000_000n,
  [CHAIN.XDAI]: 10_000_000_000_000_000n,

  // Chains with 0.2 native token fee
  [CHAIN.APECHAIN]: 200_000_000_000_000_000n,
  [CHAIN.KLAYTN]: 200_000_000_000_000_000n,
  [CHAIN.OG]: 200_000_000_000_000_000n,

  // Other specific fees
  [CHAIN.BERACHAIN]: 3_000_000_000_000_000n, // 0.003 BERA
  [CHAIN.BITTORRENT]: 25_000_000_000_000_000_000_000n, // 25000 BTT
  [CHAIN.CAMP]: 2_000_000_000_000_000_000n, // 2 CAMP
  [CHAIN.CHILIZ]: 330_000_000_000_000_000n, // 0.33 CHZ
  [CHAIN.CORE]: 20_000_000_000_000_000n, // 0.02 CORE
  [CHAIN.CRONOS]: 60_000_000_000_000_000n, // 0.06 CRO
  [CHAIN.CRONOS_ZKEVM]: 60_000_000_000_000_000n, // 0.06 CRO
  [CHAIN.GRAVITY]: 1_000_000_000_000_000_000n, // 1 G
  [CHAIN.LIGHTLINK_PHOENIX]: 1_000_000_000_000_000_000n, // 1 LL
  [CHAIN.MERLIN]: 100_000_000_000n, // 0.0000001 BTC
  [CHAIN.METER]: 40_000_000_000_000_000n, // 0.04 MTR
  [CHAIN.MEZO]: 100_000_000_000n, // 0.0000001 BTC
  [CHAIN.MONAD]: 5_000_000_000_000_000n, // 0.005 MON
  [CHAIN.NEON]: 150_000_000_000_000_000n, // 0.15 NEON
  [CHAIN.PLASMA]: 50_000_000_000_000_000n, // 0.05 XPL
  [CHAIN.SHIMMER_EVM]: 100_000_000_000_000_000_000n, // 100 SMR
  [CHAIN.STORY]: 6_000_000_000_000_000n, // 0.006 IP
  [CHAIN.WEMIX]: 30_000_000_000_000_000n, // 0.03 WEMIX
};

// Default fee for chains not in the governance fee list
// Per Pyth docs: chains not listed use 1 unit of smallest denomination (1 wei)
const DEFAULT_FEE = 1n;

// How recent is "recent" for using live contract data vs historical
const RECENT_DATA_THRESHOLD_SECONDS = 7 * 24 * 60 * 60; // 7 days

const PRICE_FEED_UPDATE_ABI =
  "event PriceFeedUpdate(bytes32 indexed id, uint64 publishTime, int64 price, uint64 conf)";

// ============ Fee Lookup Function ============
// For recent data: fetch from contract (singleUpdateFeeInWei)
// For historical data: use fee history table with timestamps
async function getFeeForChain(
  chain: string,
  timestamp: number,
  options: FetchOptions,
  contract: string
): Promise<bigint> {
  const now = Math.floor(Date.now() / 1000);

  // For recent data, try to fetch live from contract
  if (timestamp > now - RECENT_DATA_THRESHOLD_SECONDS) {
    try {
      const fee = await options.api.call({
        target: contract,
        abi: SINGLE_UPDATE_FEE_ABI,
        permitFailure: true,
      });
      if (fee && BigInt(fee) > 0n) {
        return BigInt(fee);
      }
    } catch {
      // Fall through to historical lookup
    }
  }

  // For historical data or if contract call fails, use fee history
  if (timestamp >= OP_PIP_93_EFFECTIVE_TIMESTAMP && currentFees[chain]) {
    return currentFees[chain];
  }

  // Before OP-PIP-93, most chains used 1 wei (default)
  // Some chains had earlier fee implementations, but data is incomplete
  // Using DEFAULT_FEE for pre-OP-PIP-93 historical accuracy
  if (!currentFees[chain]) {
    console.warn(
      `[pyth-network] No fee configured for chain ${chain}, using default (1 wei). ` +
      `This chain may not have governance-approved fees yet.`
    );
  }

  return currentFees[chain] || DEFAULT_FEE;
}

// ============ Non-EVM Chain Config ============
const SOLANA_FEE_ADDRESS = "8hQfT7SVhkCrzUSgBq6u2wYEt1sH3xmofZ5ss3YaydZW";
const SUI_FEE_RECIPIENT =
  "0x9da043aa51d1c91706d1e95168d9566cd3f9335a568a0a8564750a1e3b7ab891";
const APTOS_PYTH_CONTRACT =
  "0x7e783b349d3e89cf5931af376ebeadbfab855b3fa239b7ada8f5a92fbea6b387";
const NEAR_PYTH_CONTRACT = "pyth-oracle.near";

// ============ EVM Fetch Function ============
async function fetchEvm(
  timestamp: number,
  _cb: any,
  options: FetchOptions,
): Promise<FetchResult> {
  const dailyFees = options.createBalances();
  const config = evmChainConfig[options.chain];

  if (config) {
    const updateLogs = await options.getLogs({
      target: config.contract,
      eventAbi: PRICE_FEED_UPDATE_ABI,
    });

    const updateCount = updateLogs.length;
    const feePerUpdate = await getFeeForChain(
      options.chain,
      timestamp,
      options,
      config.contract
    );
    dailyFees.addGasToken(feePerUpdate * BigInt(updateCount));
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

// ============ Solana Fetch Function ============
async function fetchSolana(
  _t: number,
  _cb: any,
  options: FetchOptions,
): Promise<FetchResult> {
  const dailyFees = await getSolanaReceivedDune({
    options,
    target: SOLANA_FEE_ADDRESS,
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

// ============ Sui Fetch Function ============
const SUI_COIN_TYPE = "0x2::sui::SUI";

async function fetchSui(
  _t: number,
  _cb: any,
  options: FetchOptions,
): Promise<FetchResult> {
  const dailyFees = options.createBalances();

  const query = `
    SELECT SUM(amount::DOUBLE) AS total_fees
    FROM sui.raw.balance_changes
    WHERE owner = '${SUI_FEE_RECIPIENT}'
      AND coin_type = '${SUI_COIN_TYPE}'
      AND amount > 0
      AND checkpoint_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND checkpoint_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;
  const res = await queryAllium(query);
  if (res[0]?.total_fees) {
    dailyFees.addCGToken("sui", res[0].total_fees / 1e9);
  }
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

// ============ Aptos Fetch Function ============
const APTOS_COIN_TYPE = "0x1::aptos_coin::AptosCoin";

async function fetchAptos(
  _t: number,
  _cb: any,
  options: FetchOptions,
): Promise<FetchResult> {
  const dailyFees = options.createBalances();

  const query = `
    SELECT SUM(amount) AS total_fees
    FROM aptos.core.fungible_asset_activities
    WHERE owner_address = '${APTOS_PYTH_CONTRACT}'
      AND asset_type = '${APTOS_COIN_TYPE}'
      AND activity_type = 'deposit'
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;
  const res = await queryAllium(query);
  if (res[0]?.total_fees) {
    dailyFees.addCGToken("aptos", res[0].total_fees / 1e8);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

// ============ Near Fetch Function ============
async function fetchNear(
  _t: number,
  _cb: any,
  options: FetchOptions,
): Promise<FetchResult> {
  const dailyFees = options.createBalances();
  const query = `
    SELECT SUM(deposit) AS total_fees
    FROM near.raw.receipts
    WHERE receiver_id = '${NEAR_PYTH_CONTRACT}'
    AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
    AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;
  const res = await queryAllium(query);
  if (res[0]?.total_fees) {
    dailyFees.addCGToken("near", res[0].total_fees / 1e24);
  }
  return { dailyFees, dailyRevenue: dailyFees };
}

// ============ Build Adapter ============
const evmAdapterEntries = Object.fromEntries(
  Object.entries(evmChainConfig).map(([chain, config]) => [
    chain,
    { fetch: fetchEvm, start: config.start },
  ]),
);

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    ...evmAdapterEntries,
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2023-01-01" },
    [CHAIN.SUI]: { fetch: fetchSui, start: "2023-06-01" },
    // [CHAIN.APTOS]: { fetch: fetchAptos, start: "2023-06-01" },
    // [CHAIN.NEAR]: { fetch: fetchNear, start: "2023-06-01" },
  },
  dependencies: [Dependencies.ALLIUM, Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Fees paid by users to update Pyth price feeds on-chain. Fee amounts per chain are set by Pyth DAO governance via singleUpdateFeeInWei() on each contract.",
    Revenue: "All update fees accrue to the Pyth protocol treasury.",
    ProtocolRevenue: "All update fees accrue to the Pyth protocol treasury.",
  },
};

export default adapter;
