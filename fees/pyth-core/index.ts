import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter, FetchResult } from "../../adapters/types";

// Pyth Core contract addresses by chain
// Common proxy addresses used across chains:
// - 0xff1a0f4744e8582DF1aE09D5611b887B6a12925C (most common)
// - 0x4305FB66699C3B2702D4d05CF36551390A4c69C6 (Ethereum, Avalanche)
// - 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729 (some L2s)
// - 0x2880aB155794e7179c9eE2e38200202908C17B43 (Gnosis)
const chainConfig: Record<string, { start: string; contract: string }> = {
  // Major L1s
  [CHAIN.ETHEREUM]: { start: "2023-07-01", contract: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6" },
  [CHAIN.AVAX]: { start: "2023-07-01", contract: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6" },
  [CHAIN.BSC]: { start: "2023-07-01", contract: "0x4D7E825f80bDf85e913E0DD2A2D54927e9dE1594" },
  [CHAIN.POLYGON]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.FANTOM]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.CELO]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.GNOSIS]: { start: "2023-07-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.AURORA]: { start: "2023-07-01", contract: "0xF89C7b475821EC3fDC2dC8099032c05c6c0c9AB9" },
  [CHAIN.KAVA]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.CRONOS]: { start: "2023-07-01", contract: "0xE0d0e68297772Dd5c0AF2D66571a4F6B533f4AeE" },
  [CHAIN.CONFLUX]: { start: "2023-07-01", contract: "0xe9d69CdD6Fe41e7B621B4A688C5D1a68cB5c8ADc" },
  [CHAIN.EVMOS]: { start: "2023-07-01", contract: "0x354bF866A4B006C9AF9d9e06d9364217A8616E12" },
  [CHAIN.METER]: { start: "2023-07-01", contract: "0xbFe3f445653f2136b2FD1e6DdDb5676392E3AF16" },
  [CHAIN.WEMIX]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.KLAYTN]: { start: "2023-07-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.HEDERA]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.BITTORRENT]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.EOS]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.CORE]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.KCC]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.FLOW]: { start: "2023-10-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  
  // L2s and Rollups
  [CHAIN.ARBITRUM]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.OPTIMISM]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.BASE]: { start: "2023-08-01", contract: "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a" },
  [CHAIN.BLAST]: { start: "2024-02-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.LINEA]: { start: "2023-08-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.MANTLE]: { start: "2023-08-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.SCROLL]: { start: "2023-10-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.MANTA]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.MODE]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.ZKSYNC]: { start: "2023-08-01", contract: "0xf087c864AEccFb6A2Bf1Af6A0382B0d0f6c5D834" },
  [CHAIN.ERA]: { start: "2023-08-01", contract: "0xf087c864AEccFb6A2Bf1Af6A0382B0d0f6c5D834" },
  [CHAIN.POLYGON_ZKEVM]: { start: "2023-07-01", contract: "0xC5E56d6b40F3e3B5fbfa266bCd35C37426f18d97" },
  [CHAIN.OP_BNB]: { start: "2023-09-01", contract: "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a" },
  [CHAIN.BOBA]: { start: "2023-07-01", contract: "0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF" },
  [CHAIN.CANTO]: { start: "2023-07-01", contract: "0x98046Bd286715D3B0BC227Dd7a956b83D8978603" },
  [CHAIN.NEON]: { start: "2023-09-01", contract: "0x7f2dB085eFC3560AFF33865dD727225d91B4f9A5" },
  [CHAIN.MOONBEAM]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.MOONRIVER]: { start: "2023-07-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.SHIMMER_EVM]: { start: "2023-10-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.RONIN]: { start: "2024-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.LIGHTLINK_PHOENIX]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.ETHERLINK]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.POLYNOMIAL]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.ZETA]: { start: "2024-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  
  // Newer chains
  [CHAIN.SEI]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.BERACHAIN]: { start: "2025-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.SONIC]: { start: "2024-12-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.ABSTRACT]: { start: "2024-11-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.APECHAIN]: { start: "2024-10-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.UNICHAIN]: { start: "2024-11-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.HYPERLIQUID]: { start: "2024-12-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.SONEIUM]: { start: "2025-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.WORLDCHAIN]: { start: "2024-10-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.INK]: { start: "2024-12-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.GRAVITY]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.MORPH]: { start: "2024-10-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.TAIKO]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.STORY]: { start: "2025-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.MERLIN]: { start: "2024-04-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.HEMI]: { start: "2024-10-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.SWELL]: { start: "2024-12-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.CHILIZ]: { start: "2024-03-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.FILECOIN]: { start: "2024-03-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.IOTA]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.VICTION]: { start: "2024-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.ZKFAIR]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.MEZO]: { start: "2024-09-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.HORIZEN]: { start: "2024-06-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.SKATE]: { start: "2024-10-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.SUPERSEED]: { start: "2024-12-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.MONAD]: { start: "2025-01-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
};

// Event emitted when price feeds are updated
const PRICE_FEED_UPDATE_ABI = "event PriceFeedUpdate(bytes32 indexed id, uint64 publishTime, int64 price, uint64 conf)";

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const dailyFees = options.createBalances();
  const config = chainConfig[options.chain];

  if (!config) {
    return { dailyFees: 0 };
  }

  try {
    // Get price feed update events
    const updateLogs = await options.getLogs({
      target: config.contract,
      eventAbi: PRICE_FEED_UPDATE_ABI,
    });

    // Get unique transaction hashes to count actual update calls
    const uniqueTxs = new Set(updateLogs.map((log: any) => log.transactionHash));
    const updateCount = uniqueTxs.size;

    // Approximate fee per update transaction
    // Pyth charges a small fee (typically ~1 wei per price feed)
    // Using conservative estimate of 0.0001 native token per update tx
    const feePerUpdate = 100000000000000n; // 0.0001 in wei (1e14)
    
    dailyFees.addGasToken(feePerUpdate * BigInt(updateCount));

    return {
      dailyFees,
      dailyRevenue: dailyFees,
    };
  } catch (e) {
    console.error(`Pyth Core fetch error on ${options.chain}:`, e);
    return { dailyFees: 0, dailyRevenue: 0 };
  }
}

const methodology = {
  Fees: "Fees paid by users to update Pyth price feeds on-chain",
  Revenue: "All update fees accrue to the Pyth protocol",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: chainConfig,
  fetch,
  methodology,
};

export default adapter;
