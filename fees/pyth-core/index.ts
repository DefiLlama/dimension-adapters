import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter, FetchResult } from "../../adapters/types";

const chainConfig: Record<string, { start: string; contract: string }> = {
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
// Default is 1 wei for chains not listed
const feePerUpdateByChain: Record<string, bigint> = {
  [CHAIN.AURORA]: 3000000000000n,        // 0.000003 ETH
  [CHAIN.AVAX]: 250000000000000n,        // 0.00025 AVAX
  [CHAIN.CONFLUX]: 100000000000000000n,  // 0.1 CFX
  [CHAIN.CRONOS]: 60000000000000000n,    // 0.06 CRO
  [CHAIN.METER]: 20000000000000000n,     // 0.02 MTR
  [CHAIN.OP_BNB]: 186000000000000n,      // 0.000186 BNB
  [CHAIN.RONIN]: 1000000000000000n,      // 0.001 RON
  [CHAIN.SEI]: 10000000000000000n,       // 0.01 SEI
  [CHAIN.SHIMMER_EVM]: 1000000000000000000n, // 1 SMR
  [CHAIN.SWELL]: 50000000000000n,        // 0.00005 ETH
  [CHAIN.WORLDCHAIN]: 10000000000000n,   // 0.00001 ETH
};

const DEFAULT_FEE = 1n; // 1 wei for most chains

const PRICE_FEED_UPDATE_ABI = "event PriceFeedUpdate(bytes32 indexed id, uint64 publishTime, int64 price, uint64 conf)";

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const dailyFees = options.createBalances();
  const config = chainConfig[options.chain];

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

    return {
      dailyFees,
      dailyRevenue: dailyFees,
    };
  } catch (e) {
    console.error(`Pyth Core fetch error on ${options.chain}:`, e);
    const emptyBalances = options.createBalances();
    return { dailyFees: emptyBalances, dailyRevenue: emptyBalances };
  }
}

const methodology = {
  Fees: "Fees paid by users to update Pyth price feeds on-chain (per feed update)",
  Revenue: "All update fees accrue to the Pyth protocol",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: chainConfig,
  fetch,
  methodology,
};

export default adapter;
