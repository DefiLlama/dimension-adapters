import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const ORAI_LCD = "https://lcd.orai.io";
const PERFORMANCE_FEE_LABEL = "performanceFee";

const FEES_QUERY_MSG = { get_fees: {} } as const;

type FeesSource = {
  contract: string;
};

const FEES_SOURCES: FeesSource[] = [
  {
    contract: "orai1rzfk6fd6d5zhm77cshdtr0vsuyu0qe0dg36evysklx8n6q8h38psxywppw",
  },
];

function toBase64QueryMsg(msg: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(msg)).toString("base64");
}

async function queryContract({
  contract,
  height,
}: {
  contract: string;
  height: number;
}) {
  const query = encodeURIComponent(toBase64QueryMsg(FEES_QUERY_MSG));
  const url = `${ORAI_LCD}/cosmwasm/wasm/v1/contract/${contract}/smart/${query}`;
  const res = await httpGet(url, {
    headers: { "x-cosmos-block-height": String(height) },
  });
  return res.data;
}

const blockCache: Record<number, number> = {};

async function getBlockTimestamp(height: number): Promise<number> {
  if (blockCache[height]) return blockCache[height];
  const res = await httpGet(
    `${ORAI_LCD}/cosmos/base/tendermint/v1beta1/blocks/${height}`
  );
  if (!res?.block?.header?.time)
    throw new Error(`orai-quant-terminal: no block header at height ${height}`);
  const ts = Math.floor(new Date(res.block.header.time).getTime() / 1000);
  blockCache[height] = ts;
  return ts;
}

async function getLatestBlock(): Promise<{ height: number; timestamp: number }> {
  const res = await httpGet(
    `${ORAI_LCD}/cosmos/base/tendermint/v1beta1/blocks/latest`
  );
  if (!res?.block?.header?.height || !res?.block?.header?.time)
    throw new Error("orai-quant-terminal: failed to fetch latest block");
  const height = Number(res.block.header.height);
  const timestamp = Math.floor(new Date(res.block.header.time).getTime() / 1000);
  blockCache[height] = timestamp;
  return { height, timestamp };
}

// oraichain blocks are ~0.68s, so 100k blocks is ~19h of history: long enough to
// average out jitter, short enough to stay inside what lcd.orai.io keeps (it serves
// block headers back ~1.8m blocks and 404s below that)
const BLOCK_TIME_PROBE = 100000;
// ~180 blocks of slack, small next to a 24h window
const HEIGHT_TOLERANCE_SECONDS = 120;
const MAX_REFINEMENTS = 6;

async function getHeightAt(
  timestamp: number,
  latest: { height: number; timestamp: number }
): Promise<number> {
  if (timestamp >= latest.timestamp) return latest.height;

  const probeHeight = latest.height - BLOCK_TIME_PROBE;
  const probeTimestamp = await getBlockTimestamp(probeHeight);
  const blockTime = (latest.timestamp - probeTimestamp) / BLOCK_TIME_PROBE;
  if (!Number.isFinite(blockTime) || blockTime <= 0)
    throw new Error(
      `orai-quant-terminal: could not measure oraichain block time (${blockTime})`
    );

  let height = Math.floor(
    latest.height - (latest.timestamp - timestamp) / blockTime
  );
  for (let i = 0; i < MAX_REFINEMENTS; i++) {
    const ts = await getBlockTimestamp(height);
    const drift = ts - timestamp;
    if (Math.abs(drift) <= HEIGHT_TOLERANCE_SECONDS) return height;
    height = Math.min(
      latest.height,
      Math.max(1, height - Math.round(drift / blockTime))
    );
  }
  throw new Error(
    `orai-quant-terminal: could not resolve a block within ${HEIGHT_TOLERANCE_SECONDS}s of ${timestamp}`
  );
}

function readFeesValue(payload: unknown): number | null {
  if (typeof payload !== "number" && typeof payload !== "string") return null;
  if (typeof payload === "string" && payload.trim() === "") return null;
  const parsed = Number(payload);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function getCumulativeFees(contract: string, height: number) {
  const snapshot = await queryContract({ contract, height });
  const value = readFeesValue(snapshot);
  if (value === null)
    throw new Error(
      `orai-quant-terminal: unreadable get_fees response for ${contract} at height ${height}`
    );
  return value;
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const latest = await getLatestBlock();
  const [endHeight, startHeight] = await Promise.all([
    getHeightAt(options.toTimestamp, latest),
    getHeightAt(options.fromTimestamp, latest),
  ]);

  const deltas = await Promise.all(
    FEES_SOURCES.map(async ({ contract }) => {
      const [current, previous] = await Promise.all([
        getCumulativeFees(contract, endHeight),
        getCumulativeFees(contract, startHeight),
      ]);
      if (current < previous)
        throw new Error(
          `orai-quant-terminal: get_fees went backwards for ${contract} (${previous} -> ${current}), it is not the cumulative total this adapter assumes`
        );
      return current - previous;
    })
  );

  deltas.forEach((delta) => {
    // get_fees is reported in micro-USD, same 6-decimal scale as get_tvl
    // (953362900000 -> $953,362.90 against the $953k tvl on defillama)
    const humanReadableFeesUsd = delta / 1e6;

    dailyFees.addUSDValue(humanReadableFeesUsd, PERFORMANCE_FEE_LABEL);
    dailyRevenue.addUSDValue(humanReadableFeesUsd, PERFORMANCE_FEE_LABEL);
    dailyProtocolRevenue.addUSDValue(humanReadableFeesUsd, PERFORMANCE_FEE_LABEL);
  });
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};


const breakdownMethodology = {
  Fees: {
    [PERFORMANCE_FEE_LABEL]:
      "Performance fees charged by Orai Quant Terminal vaults on profitable strategy execution.",
  },
  Revenue: {
    [PERFORMANCE_FEE_LABEL]:
      "Gross revenue recognized from vault performance fees before any internal operating allocations.",
  },
  ProtocolRevenue: {
    [PERFORMANCE_FEE_LABEL]:
      "Protocol treasury share of vault performance fees retained by Orai Quant Terminal.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CHAIN_GLOBAL], // has vaults across chains, difficult to track each chain separately
  runAtCurrTime: true,
  methodology: {
    Fees:
      "Daily change in the cumulative performance fees the Quant Terminal stats contract reports, read 24h apart.",
    Revenue:
      "Daily change in cumulative performance-fee income generated by vault profits.",
    ProtocolRevenue:
      "Daily change in the share of performance-fee income allocated to protocol treasury.",
  },
  breakdownMethodology,
};

export default adapter;
