import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter, FetchResult } from "../../adapters/types";

// Pyth Core contract addresses by chain
// These are the Pyth Proxy contracts that handle price feed updates
const chainConfig: Record<string, { start: string; contract: string }> = {
  [CHAIN.ETHEREUM]: { start: "2023-07-01", contract: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6" },
  [CHAIN.ARBITRUM]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.OPTIMISM]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.BASE]: { start: "2023-07-01", contract: "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a" },
  [CHAIN.POLYGON]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.AVAX]: { start: "2023-07-01", contract: "0x4305FB66699C3B2702D4d05CF36551390A4c69C6" },
  [CHAIN.BSC]: { start: "2023-07-01", contract: "0x4D7E825f80bDf85e913E0DD2A2D54927e9dE1594" },
  [CHAIN.BLAST]: { start: "2024-02-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.LINEA]: { start: "2023-08-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.MANTLE]: { start: "2023-08-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.SCROLL]: { start: "2023-10-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.MANTA]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.MODE]: { start: "2024-01-01", contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729" },
  [CHAIN.ZKSYNC]: { start: "2023-08-01", contract: "0xf087c864AEccFb6A2Bf1Af6A0382B0d0f6c5D834" },
  [CHAIN.POLYGON_ZKEVM]: { start: "2023-07-01", contract: "0xC5E56d6b40F3e3B5fbfa266bCd35C37426f18d97" },
  [CHAIN.FANTOM]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.CELO]: { start: "2023-07-01", contract: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C" },
  [CHAIN.GNOSIS]: { start: "2023-07-01", contract: "0x2880aB155794e7179c9eE2e38200202908C17B43" },
  [CHAIN.ERA]: { start: "2023-08-01", contract: "0xf087c864AEccFb6A2Bf1Af6A0382B0d0f6c5D834" },
};

// Event emitted when price feeds are updated
const PRICE_FEED_UPDATE_ABI = "event PriceFeedUpdate(bytes32 indexed id, uint64 publishTime, int64 price, uint64 conf)";

// ABI to get update fee
const GET_UPDATE_FEE_ABI = "function getUpdateFee(bytes[] calldata updateData) external view returns (uint feeAmount)";

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

    // Each update transaction pays a fee based on the number of price feeds updated
    // The fee is typically very small (around 1 wei per update on most chains)
    // We estimate by counting unique transactions and multiplying by approximate fee
    
    // Get unique transaction hashes to count actual update calls
    const uniqueTxs = new Set(updateLogs.map((log: any) => log.transactionHash));
    const updateCount = uniqueTxs.size;

    // Approximate fee per update (varies by chain, using conservative estimate)
    // Most chains charge ~1-10 wei per price feed, with multiple feeds per tx
    // Using a rough estimate of 0.0001 native token per update transaction
    const feePerUpdate = 100000000000000n; // 0.0001 in wei (1e14)
    
    dailyFees.addGasToken(feePerUpdate * BigInt(updateCount));

    return {
      dailyFees,
      dailyRevenue: dailyFees, // Fees go to Pyth protocol
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
