import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { nullAddress } from "../helpers/token";
import { httpGet } from "../utils/fetchURL";

const BASE = 'https://prod-api.ekubo.org/overview';
const CHAIN_ID = 1; // Ethereum mainnet

function toEvmAddress(raw: string): string {
  const s = (raw ?? '').toLowerCase();
  return !s || s === '0x0' || s === '0x0000000000000000000000000000000000000000'
    ? nullAddress
    : s;
}

async function fetch(_ts: number, _blocks: any, options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0];

  const volumeData: any[] = (await httpGet(`${BASE}/volume?chainId=${CHAIN_ID}`)).volumeByTokenByDate ?? [];
  const revenueData: any[] = (await httpGet(`${BASE}/revenue?chainId=${CHAIN_ID}`)).revenueByTokenByDate ?? [];

  for (const t of volumeData.filter((e: any) => e.date.split('T')[0] === dateStr)) {
    const token = toEvmAddress(t.token);
    dailyVolume.add(token, t.volume);
    dailyFees.add(token, t.fees);
  }

  for (const t of revenueData.filter((e: any) => e.date.split('T')[0] === dateStr)) {
    const token = toEvmAddress(t.token);
    dailyFees.add(token, t.revenue);
    dailyRevenue.add(token, t.revenue);
  }

  const dailySupplySideRevenue = dailyFees.clone();
  dailySupplySideRevenue.subtract(dailyRevenue);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-01-31',
    },
  },
  methodology: {
    Volume: 'Per-token daily swap volume.',
    Fees: 'Total swap fees paid by traders plus protocol-owned LP position earnings.',
    Revenue: 'Fees earned by protocol-owned LP positions (DAO-controlled).',
    SupplySideRevenue: 'Swap fees distributed to non-protocol liquidity providers.',
    ProtocolRevenue: 'Fees earned by protocol-owned LP positions (DAO-controlled).',
  },
};

export default adapter;
