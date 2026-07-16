import { JsonRpcProvider, id } from "ethers";

type ChainScanConfig = {
  chain: string;
  chainId: number;
  rpc: string;
  contract: string;
};

const contracts: ChainScanConfig[] = [
  {
    chain: "ethereum",
    chainId: 1,
    rpc: process.env.ETHEREUM_RPC || "https://cloudflare-eth.com",
    contract: "0x3cb3D9E659653de02D8e3Aecd4963Ba1Ae429682",
  },
  {
    chain: "bsc",
    chainId: 56,
    rpc: process.env.BSC_RPC || "https://bsc-dataseed.binance.org",
    contract: "0x920b4Ee4970CFE1ef523a0679200f9d9b2F87B2c",
  },
  {
    chain: "base",
    chainId: 8453,
    rpc: process.env.BASE_RPC || "https://mainnet.base.org",
    contract: "0x0F2C33F406D58144Dec03FCdb69571249F0b0286",
  },
  {
    chain: "megaeth",
    chainId: 4326,
    rpc: process.env.MEGAETH_RPC || "https://mainnet.megaeth.com/rpc",
    contract: "0x695e175c9704432cdFB98e3C193966F95a5F119D",
  },
  {
    chain: "robinhood",
    chainId: 4663,
    rpc: process.env.ROBINHOOD_RPC || "https://rpc.mainnet.chain.robinhood.com",
    contract: "0x6EC95a3C6C7b8368C9bF37Ff664672E55df3550d",
  },
];

const eventTopics = [
  id("Bought(address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool,uint8,uint256,uint256)"),
  id("FlashLaunchV3TokenCreated(address,(address,uint24,uint8,bool,uint8,uint256,uint256,address,uint8,uint256,uint256,uint256,uint160,uint8,uint160,uint8,int24,int24,int24,int24,uint8),(address,bool,uint8,bytes32,string,address,uint8,uint256,address))"),
  id("FlashLaunchV4TokenCreated(address,(address,uint24,uint8,bool,uint8,uint256,uint256,address,uint8,uint256,uint256,uint256,uint160,uint8,uint160,uint8,int24,int24,int24,int24,uint8),(address,bool,uint8,address,uint8,bytes32,string,address,uint8,uint256,address,(bool,bool,uint8,uint24,uint24,uint24,uint24,uint24,uint24,uint24,uint256,uint32,uint24,uint24,(uint16,uint16,uint16,address[],uint16[]),(uint24,uint24,uint24,uint24,uint32,uint32,uint24,uint24),(uint32,uint256[],uint16[]),(uint16[],uint16[],uint256[],uint256[]),address,(address,address,uint24,int24,address))))"),
  id("LogMemeTokenFinalized(address)"),
];

async function hasLogsInRange(provider: JsonRpcProvider, address: string, fromBlock: number, toBlock: number) {
  const logs = await provider.getLogs({
    address,
    fromBlock,
    toBlock,
    topics: [eventTopics],
  });
  return logs.length > 0;
}

async function findFirstActivityBlock(provider: JsonRpcProvider, address: string) {
  const latest = Number(await provider.getBlockNumber());
  const step = 5_000;
  const maxIterations = 220;

  let right = latest;
  let left = Math.max(0, right - step);
  let found = false;
  let iteration = 0;

  while (right > 0 && iteration < maxIterations) {
    // Keep ranges small to avoid RPC getLogs range limits.
    if (await hasLogsInRange(provider, address, left, right)) {
      found = true;
      break;
    }
    right = Math.max(0, left - 1);
    left = Math.max(0, right - step);
    iteration++;
  }

  if (!found) return null;

  let lo = left;
  let hi = right;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await hasLogsInRange(provider, address, lo, mid)) hi = mid;
    else lo = mid + 1;
  }

  return lo;
}

async function main() {
  const results: Record<string, { firstBlock: number | null; startDate: string | null; rpc: string }> = {};

  for (const cfg of contracts) {
    try {
      const provider = new JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true });
      const firstBlock = await findFirstActivityBlock(provider, cfg.contract);
      if (firstBlock === null) {
        results[cfg.chain] = { firstBlock: null, startDate: null, rpc: cfg.rpc };
        continue;
      }
      const block = await provider.getBlock(firstBlock);
      const startDate = block?.timestamp ? new Date(block.timestamp * 1000).toISOString().slice(0, 10) : null;
      results[cfg.chain] = { firstBlock, startDate, rpc: cfg.rpc };
    } catch (e: any) {
      results[cfg.chain] = {
        firstBlock: null,
        startDate: null,
        rpc: `${cfg.rpc} (error: ${e?.message || "unknown"})`,
      };
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
