import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const FEE_BPS = 0.0003;
const USDC_MICROS = 1_000_000;

const MARKET_PDAS: string[] = [
  '64Tv5ZwQi5zHDTtnMt8ymcmJ6oUHkgdehPZDXsfrHtE5', // SOL-USD
  'D17rGDPwvNHRScGVxhU3vmwRJVbCLcg45iWur1vX4bDH', // BTC-USD
  '6vhdtLWxifiojEAKX1DUARzSbvVM5VhP7pYZt9GdjVyP', // ETH-USD
];

const BFF = 'https://app.sour.finance/api';

interface VolumePayload {
  volumeMicros?: string;
}

async function fetchMarketVolume(market: string, fromTs: number, toTs: number): Promise<number> {
  const url = `${BFF}/markets/${market}/volume?from=${fromTs}&to=${toTs}`;
  const json = (await httpGet(url)) as VolumePayload;
  return Number(json?.volumeMicros ?? 0) / USDC_MICROS;
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  const volumes = await Promise.all(
    MARKET_PDAS.map((m) => fetchMarketVolume(m, startTimestamp, endTimestamp)),
  );
  const dailyVolume = volumes.reduce((a, b) => a + b, 0);
  const dailyFees = dailyVolume * FEE_BPS;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: dailyFees,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true,
  start: '2026-05-06',
  methodology: {
    Fees: '3 basis points (0.0003) x daily volume. Flat per-fill rate, no taker/maker split, no tier ladder.',
    Revenue:'protocol does not claim any portion of the fee — 100% routes to the SOUR LP vault.',
    SupplySideRevenue: '100% of fees. The LP vault is the economic owner of the protocol; LPs receive all fee flow.',
    HoldersRevenue:'There is no token-holder distribution.',
  },
};

export default adapter;
