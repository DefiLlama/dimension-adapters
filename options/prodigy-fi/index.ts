import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import {
  BlockRange,
  VaultMetadata,
  ChainConfig,
  VaultQuery,
  config,
  v2Deposit,
  v1_1Deposit,
  v1Deposit,
} from "./interfaces";

const WAD = 10n ** 18n;

function intersectRange(
  fromBlock: number,
  toBlock: number,
  rangeStart: number,
  rangeEnd: number,
): BlockRange | null {
  const from = Math.max(fromBlock, rangeStart);
  const to = Math.min(toBlock, rangeEnd);
  if (from > to) return null;
  return { fromBlock: from, toBlock: to };
}

function toBigInt(value: any): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(value.toString());
}

function addVaultMetadata(
  vaults: Map<string, VaultMetadata>,
  vaultAddress: string,
  investmentToken: string,
  quantity: any,
  yieldValue: any,
) {
  if (!vaultAddress || !investmentToken || quantity === null || quantity === undefined) return;

  vaults.set(vaultAddress.toLowerCase(), {
    token: investmentToken.toLowerCase(),
    quantity: toBigInt(quantity),
    yieldValue: toBigInt(yieldValue ?? 0),
  });
}

async function fetchVaultMetadataRange(
  options: FetchOptions,
  chainConfig: ChainConfig,
  fromBlock: number,
  toBlock: number,
): Promise<Map<string, VaultMetadata>> {
  const vaults = new Map<string, VaultMetadata>();

  const v2Range = intersectRange(
    fromBlock,
    toBlock,
    chainConfig.v2StartBlock,
    toBlock,
  );
  const v1_1Range = intersectRange(
    fromBlock,
    toBlock,
    chainConfig.v1_1StartBlock,
    chainConfig.v2StartBlock - 1,
  );
  const v1Range = intersectRange(
    fromBlock,
    toBlock,
    chainConfig.v1StartBlock,
    chainConfig.v1_1StartBlock - 1,
  );

  const queries: VaultQuery[] = [];

  if (v2Range) {
    queries.push({
      kind: "v2",
      logs: options.getLogs({
        target: chainConfig.factory,
        eventAbi: v2Deposit,
        fromBlock: v2Range.fromBlock,
        cacheInCloud: true,
      }),
    });
  }

  if (v1_1Range) {
    queries.push({
      kind: "v1_1",
      logs: options.getLogs({
        target: chainConfig.factory,
        eventAbi: v1_1Deposit,
        fromBlock: v1_1Range.fromBlock,
        toBlock: v1_1Range.toBlock,
        cacheInCloud: true,
      }),
    });
  }

  if (v1Range) {
    queries.push({
      kind: "v1",
      logs: options.getLogs({
        target: chainConfig.factory,
        eventAbi: v1Deposit,
        fromBlock: v1Range.fromBlock,
        toBlock: v1Range.toBlock,
        cacheInCloud: true,
      }),
    });
  }

  const resolved = await Promise.all(queries.map((q) => q.logs));

  resolved.forEach((logs, idx) => {
    const kind = queries[idx].kind;
    if (kind === "v2" || kind === "v1_1") {
      logs.forEach((log: any) => {
        addVaultMetadata(vaults, log.vaultAddress, log.vaultParams.investmentToken, log.vaultParams.quantity, log.vaultParams.yieldValue);
      });
    } else {
      logs.forEach((log: any) => {
        const investmentToken = log.isBuyLow ? log.quoteToken : log.baseToken;
        addVaultMetadata(vaults, log.vaultAddress, investmentToken, log.quantity, log.yieldValue);
      });
    }
  });

  return vaults;
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const chainConfig = config[options.chain];
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  const fetchFromBlock = await options.getFromBlock();
  const fetchToBlock = await options.getToBlock();

  const dayVaults = await fetchVaultMetadataRange(options, chainConfig, fetchFromBlock, fetchToBlock);
  dayVaults.forEach((metadata) => {
    dailyNotionalVolume.add(metadata.token, metadata.quantity);
    dailyPremiumVolume.add(metadata.token, (metadata.quantity * metadata.yieldValue) / WAD);
  });

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: config,
  methodology: {
    NotionalVolume: "The total value of the underlying asset in an option or derivative contract.",
    PremiumVolume: "The price paid up front to buy or sell option or derivative contract.",
  },
};

export default adapter;
