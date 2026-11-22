import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { getMultipleAccounts } from '../../helpers/solana';
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const volumeEndpoint = "https://mfx-stats-mainnet.fly.dev/volume";
// per-market 24h volume from the same stats server; target_volume is the quote side in quote mint units
const tickersEndpoint = "https://mfx-stats-mainnet.fly.dev/tickers";

async function fetch(options: FetchOptions) {
  const response = await httpGet(volumeEndpoint);
  const tickers = await httpGet(tickersEndpoint);

  // USDC-quoted markets plus wSOL-quoted markets converted at the SOL/USDC price, as summed by the stats server
  const usdcVolume = response?.dailyVolume?.['solana:' + ADDRESSES.solana.USDC];
  if (typeof usdcVolume !== 'number') throw new Error('manifest-trade: no USDC volume in /volume response');
  if (!Array.isArray(tickers) || !tickers.length) throw new Error('manifest-trade: no markets in /tickers response');

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(usdcVolume);

  // the USDC key leaves out markets quoted in any other mint: add their quote side once, priced by DefiLlama
  const otherQuoted = tickers.filter((t: any) => t.target_currency !== ADDRESSES.solana.USDC && t.target_currency !== ADDRESSES.solana.SOL && t.target_volume > 0 && t.base_volume > 0);
  const mints: string[] = [...new Set<string>(otherQuoted.map((t: any) => t.target_currency))];
  const mintInfos = await getMultipleAccounts({ chain: CHAIN.SOLANA, accounts: mints, encoding: "jsonParsed" });
  const decimals: Record<string, number> = {};
  mints.forEach((mint, i) => {
    const d = mintInfos[i]?.data?.parsed?.info?.decimals;
    if (typeof d !== 'number') throw new Error(`manifest-trade: no decimals for quote mint ${mint}`);
    decimals[mint] = d;
  });
  for (const t of otherQuoted)
    dailyVolume.add(t.target_currency, Math.round(t.target_volume * 10 ** decimals[t.target_currency]));

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true,
}

export default adapter;
