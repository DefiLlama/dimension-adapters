import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter, FetchResult } from "../../adapters/types";
import { getSolanaReceived } from "../../helpers/token";
import { queryAllium } from "../../helpers/allium";

// ============ EVM Chain Config ============
const evmChainConfig: Record<string, { start: string; contract: string }> = {
  [CHAIN.OG]: { start: "2024-06-01", contract: "0x2880ab155794e7179c9ee2e38200202908c17b43" },
  [CHAIN.ETHEREUM]: { start: "2023-07-01", contract: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6" },
  [CHAIN.AVAX]: { start: "2023-07-01", contract: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6" },
  [CHAIN.BSC]: { start: "2023-07-01", contract: "0x4D7E825f80bDf85e913E0DD2A2D54927e9dE1594" },
  [CHAIN.POLYGON]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.CELO]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.GNOSIS]: { start: "2023-07-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.AURORA]: { start: "2023-07-01", contract: "0xF89C7b475821EC3fDC2dC8099032c05c6c0c9AB9" },
  [CHAIN.KAVA]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.CRONOS]: { start: "2023-07-01", contract: "0xE0d0e68297772Dd5a1f1D99897c581E2082dbA5B" },
  [CHAIN.CONFLUX]: { start: "2023-07-01", contract: "0xe9d69CdD6Fe41e7B621B4A688C5D1a68cB5c8ADc" },
  [CHAIN.METER]: { start: "2023-07-01", contract: "0xbFe3f445653f2136b2FD1e6DdDb5676392E3AF16" },
  [CHAIN.WEMIX]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.KLAYTN]: { start: "2023-07-01", contract: "0x2880ab155794e7179c9ee2e38200202908c17b43" },
  [CHAIN.HEDERA]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.BITTORRENT]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.CORE]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.KCC]: { start: "2023-07-01", contract: "0xE0d0e68297772Dd5a1f1D99897c581E2082dbA5B" },
  [CHAIN.FLOW]: { start: "2023-10-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.FILECOIN]: { start: "2024-03-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.BITTENSOR]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.ARBITRUM]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.OPTIMISM]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.BASE]: { start: "2023-08-01", contract: "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a" },
  [CHAIN.BLAST]: { start: "2024-02-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.LINEA]: { start: "2023-08-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.MANTLE]: { start: "2023-08-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.SCROLL]: { start: "2023-10-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.MANTA]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.MODE]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.ERA]: { start: "2023-08-01", contract: "0xf087c864AEccFb6A2Bf1Af6A0382B0d0f6c5D834" },
  [CHAIN.POLYGON_ZKEVM]: { start: "2023-07-01", contract: "0xC5E56d6b40F3e3B5fbfa266bCd35C37426537c65" },
  [CHAIN.OP_BNB]: { start: "2023-09-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.BOBA]: { start: "2023-07-01", contract: "0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF" },
  [CHAIN.NEON]: { start: "2023-09-01", contract: "0x7f2dB085eFC3560AFF33865dD727225d91B4f9A5" },
  [CHAIN.SHIMMER_EVM]: { start: "2023-10-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.RONIN]: { start: "2024-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.LIGHTLINK_PHOENIX]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.ETHERLINK]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.POLYNOMIAL]: { start: "2024-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.ZETA]: { start: "2024-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.MERLIN]: { start: "2024-04-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.VICTION]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.CHILIZ]: { start: "2024-03-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.SEI]: { start: "2024-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.BERACHAIN]: { start: "2025-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.SONIC]: { start: "2024-12-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.ABSTRACT]: { start: "2024-11-01", contract: "0x8739d5024B5143278E2b15Bd9e7C26f6CEc658F1" },
  [CHAIN.APECHAIN]: { start: "2024-10-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.UNICHAIN]: { start: "2024-11-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.HYPERLIQUID]: { start: "2024-12-01", contract: "0xe9d69CdD6Fe41e7B621B4A688C5D1a68cB5c8ADc" },
  [CHAIN.SONEIUM]: { start: "2025-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.WORLDCHAIN]: { start: "2024-10-01", contract: "0xe9d69cdd6fe41e7b621b4a688c5d1a68cb5c8adc" },
  [CHAIN.INK]: { start: "2024-12-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.GRAVITY]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.MORPH]: { start: "2024-10-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.TAIKO]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.STORY]: { start: "2025-01-01", contract: "0xD458261E832415CFd3BAE5E416FdF3230ce6F134" },
  [CHAIN.HEMI]: { start: "2024-10-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.SWELL]: { start: "2024-12-01", contract: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21" },
  [CHAIN.IOTA]: { start: "2024-06-01", contract: "0x8D254a21b3C86D32F7179855531CE99164721933" },
  [CHAIN.MEZO]: { start: "2024-09-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.SKATE]: { start: "2024-10-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.SUPERSEED]: { start: "2024-12-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.MONAD]: { start: "2025-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.INJECTIVE]: { start: "2024-06-01", contract: "0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320" },
  [CHAIN.CRONOS_ZKEVM]: { start: "2024-06-01", contract: "0x056f829183Ec806A78c26C98961678c24faB71af" },
  [CHAIN.ZKFAIR]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.CAMP]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.PLASMA]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.EVENTUM]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
};

// Fee per price feed update by chain (from https://docs.pyth.network/price-feeds/core/current-fees)
const feePerUpdateByChain: Record<string, bigint> = {
  [CHAIN.AURORA]: 3000000000000n,
  [CHAIN.AVAX]: 250000000000000n,
  [CHAIN.CONFLUX]: 100000000000000000n,
  [CHAIN.CRONOS]: 60000000000000000n,
  [CHAIN.METER]: 20000000000000000n,
  [CHAIN.OP_BNB]: 186000000000000n,
  [CHAIN.RONIN]: 1000000000000000n,
  [CHAIN.SEI]: 10000000000000000n,
  [CHAIN.SHIMMER_EVM]: 1000000000000000000n,
  [CHAIN.SWELL]: 50000000000000n,
  [CHAIN.WORLDCHAIN]: 10000000000000n,
};

const DEFAULT_FEE = 1n;
const PRICE_FEED_UPDATE_ABI = "event PriceFeedUpdate(bytes32 indexed id, uint64 publishTime, int64 price, uint64 conf)";

// ============ Non-EVM Chain Config ============
const SOLANA_FEE_ADDRESS = "8hQfT7SVhkCrzUSgBq6u2wYEt1sH3xmofZ5ss3YaydZW";
const SUI_FEE_RECIPIENT = "0x9da043aa51d1c91706d1e95168d9566cd3f9335a568a0a8564750a1e3b7ab891";
const APTOS_PYTH_CONTRACT = "0x7e783b349d3e89cf5931af376ebeadbfab855b3fa239b7ada8f5a92fbea6b387";
const NEAR_PYTH_CONTRACT = "pyth-oracle.near";

// ============ EVM Fetch Function ============
async function fetchEvm(options: FetchOptions): Promise<FetchResult> {
  const dailyFees = options.createBalances();
  const config = evmChainConfig[options.chain];

  if (!config) {
    const emptyBalances = options.createBalances();
    return { dailyFees: emptyBalances, dailyRevenue: emptyBalances };
  }

  try {
    const updateLogs = await options.getLogs({
      target: config.contract,
      eventAbi: PRICE_FEED_UPDATE_ABI,
    });

    const updateCount = updateLogs.length;
    const feePerUpdate = feePerUpdateByChain[options.chain] || DEFAULT_FEE;
    dailyFees.addGasToken(feePerUpdate * BigInt(updateCount));

    return { dailyFees, dailyRevenue: dailyFees };
  } catch (e) {
    console.error(`Pyth Core EVM fetch error on ${options.chain}:`, e);
    const emptyBalances = options.createBalances();
    return { dailyFees: emptyBalances, dailyRevenue: emptyBalances };
  }
}

// ============ Solana Fetch Function ============
async function fetchSolana(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  try {
    const dailyFees = await getSolanaReceived({
      options,
      target: SOLANA_FEE_ADDRESS,
    });
    return { dailyFees, dailyRevenue: dailyFees };
  } catch (e) {
    console.error(`Pyth Core Solana fetch error:`, e);
    const emptyBalances = options.createBalances();
    return { dailyFees: emptyBalances, dailyRevenue: emptyBalances };
  }
}

// ============ Sui Fetch Function ============
async function fetchSui(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  const dailyFees = options.createBalances();
  const fromTime = new Date(options.startTimestamp * 1000).toISOString().split("T")[0];
  const toTime = new Date(options.endTimestamp * 1000).toISOString().split("T")[0];

  try {
    const query = `
      SELECT SUM(amount::DOUBLE) AS total_fees
      FROM sui.raw.balance_changes
      WHERE owner = '${SUI_FEE_RECIPIENT}'
        AND amount > 0
        AND checkpoint_timestamp >= '${fromTime}'
        AND checkpoint_timestamp <= '${toTime}'
    `;
    const res = await queryAllium(query);
    if (res[0]?.total_fees) {
      dailyFees.addCGToken("sui", res[0].total_fees / 1e9);
    }
    return { dailyFees, dailyRevenue: dailyFees };
  } catch (e) {
    console.error(`Pyth Core Sui fetch error:`, e);
    const emptyBalances = options.createBalances();
    return { dailyFees: emptyBalances, dailyRevenue: emptyBalances };
  }
}

// ============ Aptos Fetch Function ============
async function fetchAptos(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  const dailyFees = options.createBalances();

  try {
    const query = `
      SELECT SUM(amount) AS total_fees
      FROM aptos.core.fungible_asset_activities
      WHERE owner_address = '${APTOS_PYTH_CONTRACT}'
      AND activity_type = 'deposit'
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    `;
    const res = await queryAllium(query);
    if (res[0]?.total_fees) {
      dailyFees.addCGToken("aptos", res[0].total_fees / 1e8);
    }
    return { dailyFees, dailyRevenue: dailyFees };
  } catch (e) {
    console.error(`Pyth Core Aptos fetch error:`, e);
    const emptyBalances = options.createBalances();
    return { dailyFees: emptyBalances, dailyRevenue: emptyBalances };
  }
}

// ============ Near Fetch Function ============
async function fetchNear(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  const dailyFees = options.createBalances();

  try {
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
  } catch (e) {
    console.error(`Pyth Core Near fetch error:`, e);
    const emptyBalances = options.createBalances();
    return { dailyFees: emptyBalances, dailyRevenue: emptyBalances };
  }
}

// ============ Build Adapter ============
const evmAdapterEntries = Object.fromEntries(
  Object.entries(evmChainConfig).map(([chain, config]) => [
    chain,
    { fetch: fetchEvm, start: config.start },
  ])
);

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    ...evmAdapterEntries,
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2023-01-01" },
    [CHAIN.SUI]: { fetch: fetchSui, start: "2023-06-01" },
    [CHAIN.APTOS]: { fetch: fetchAptos, start: "2023-06-01" },
    [CHAIN.NEAR]: { fetch: fetchNear, start: "2023-06-01" },
  },
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Fees paid by users to update Pyth price feeds on-chain",
    Revenue: "All update fees accrue to the Pyth protocol",
  },
};

export default adapter;
