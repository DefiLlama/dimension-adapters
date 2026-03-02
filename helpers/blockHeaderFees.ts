import { getProvider } from "@defillama/sdk";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import PromisePool from "@supercharge/promise-pool";

interface BlockHeaderFeeConfig {
  chain: string;
  start: string;
}

const CONCURRENCY = 25;

/**
 * Generic chain-level fee adapter using block headers.
 * Works for EIP-1559 chains where baseFeePerGas > 0.
 *
 * For each block: dailyFees += baseFeePerGas * gasUsed
 * This captures burned base fees (chain revenue / holder revenue).
 * Priority tips are excluded — typically <10% on alt-L1s.
 */
export function blockHeaderFeeAdapter(config: BlockHeaderFeeConfig): SimpleAdapter {
  const { chain, start } = config;

  const fetch = async (options: FetchOptions) => {
    const fromBlock = await options.getFromBlock();
    const toBlock = await options.getToBlock();

    if (fromBlock == null || toBlock == null || !Number.isFinite(fromBlock) || !Number.isFinite(toBlock)) {
      throw new Error(`${chain}: block resolution failed (from=${fromBlock}, to=${toBlock})`);
    }
    if (toBlock <= fromBlock) {
      throw new Error(`${chain}: invalid block range (from=${fromBlock}, to=${toBlock})`);
    }

    const provider = getProvider(chain);

    // Probe first block to verify EIP-1559 support
    const probe = await provider.getBlock(fromBlock);
    if (!probe) {
      throw new Error(`${chain}: failed to fetch probe block ${fromBlock}`);
    }
    if (probe.baseFeePerGas === null || probe.baseFeePerGas === undefined) {
      throw new Error(
        `${chain}: block ${fromBlock} has no baseFeePerGas. ` +
        `This chain does not support EIP-1559 and cannot use the block-header fee adapter.`
      );
    }

    const blockNumbers: number[] = [];
    for (let i = fromBlock; i < toBlock; i++) {
      blockNumbers.push(i);
    }

    let totalBaseFees = 0n;
    let nullBlocks = 0;

    const { errors } = await PromisePool
      .withConcurrency(CONCURRENCY)
      .for(blockNumbers)
      .process(async (blockNum) => {
        const block = await provider.getBlock(blockNum);
        if (!block) { nullBlocks++; return; }
        if (block.baseFeePerGas !== null && block.baseFeePerGas !== undefined) {
          totalBaseFees += BigInt(block.baseFeePerGas.toString()) * BigInt(block.gasUsed.toString());
        }
      });

    if (errors.length > 0) throw errors[0];

    // Fail if too many blocks couldn't be fetched (>5% missing)
    if (nullBlocks > blockNumbers.length * 0.05) {
      throw new Error(`${chain}: ${nullBlocks}/${blockNumbers.length} blocks returned null — RPC may be unreliable`);
    }

    const dailyFees = options.createBalances();
    dailyFees.addGasToken(totalBaseFees);

    const dailyRevenue = dailyFees.clone();
    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
    };
  };

  return {
    version: 2,
    chains: [chain],
    fetch,
    start,
    protocolType: ProtocolType.CHAIN,
    isExpensiveAdapter: true,
    methodology: {
      Fees: "Burned base fees (baseFeePerGas * gasUsed) from block headers, excluding priority tips.",
      Revenue: "Burned base fees removed from circulation.",
      HoldersRevenue: "Burned base fees benefit token holders through deflation.",
    },
  };
}
