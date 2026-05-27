import { FetchOptions } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { fetchURLAutoHandleRateLimit } from '../utils/fetchURL';
import { sleep } from '../utils/utils';

const GECKOTERMINAL_POOLS_URL =
  "https://api.geckoterminal.com/api/v2/networks/sei-evm/dexes/sailor/pools";
const DEFAULT_FEE_RATE = 0.003;
const PROTOCOL_FEE_SHARE = 0.16;
const MAX_PAGES = 20;

const getFeeRateFromPoolName = (name = "") => {
  const feeMatch = name.match(/([0-9.]+)%\s*$/);
  return feeMatch ? Number(feeMatch[1]) / 100 : DEFAULT_FEE_RATE;
};

const fetchPools = async () => {
  const pools: any[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetchURLAutoHandleRateLimit(`${GECKOTERMINAL_POOLS_URL}?page=${page}`);
    const pagePools = response?.data ?? [];
    if (!pagePools.length) break;
    pools.push(...pagePools);
    await sleep(1000);
  }

  return pools;
};

const methodology = {
  Fees: "Sailor-Finance swap fees, calculated from each pool's 24h volume and advertised fee tier.",
  UserFees: "Sailor-Finance swap fees, calculated from each pool's 24h volume and advertised fee tier.",
  Revenue: "Fees sent to the protocol wallet (16% of total accumulated fees).",
  ProtocolRevenue: "Fees sent to the protocol wallet (16% of total accumulated fees), is used to provide benefits to users in custom ways.",
  SupplySideRevenue: "There are 84% swap fees distributed to LPs.",
};

const blacklistPools: Array<string> = [
  // '0x80fe558c54f1f43263e08f0e1fa3e02d8b897f93',
  // '0x038aac60e1d17ce2229812eca8ee7800214baffc',
  // '0x44b13cd80a9a165a4cea7b6a42952a9a14bd8ff5',
  // '0x9ca64194ce1f88d11535915dc482ae0383d5f76d',
  '0xad00786c2ba76f08c92e7847456015728f98ac56', // bad pool - very low liquidity
];

const fetch = async (_a: any, _b: any, _: FetchOptions) => {
  const pools = await fetchPools();
  let dailyVolume = 0;
  let dailyFees = 0;

  for (const { attributes } of pools) {
    if (blacklistPools.includes(String(attributes.address).toLowerCase())) continue;

    const volume = Number(attributes.volume_usd.h24);
    if (!Number.isFinite(volume) || volume <= 0) continue;

    dailyVolume += volume;
    dailyFees += volume * getFeeRateFromPoolName(attributes.name);
  }
  const dailyRevenue = dailyFees * PROTOCOL_FEE_SHARE;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: dailyFees - dailyRevenue,
    dailyHoldersRevenue: 0,
  }
}

export default {
  version: 1,
  methodology,
  runAtCurrTime: true,
  fetch,
  chains: [CHAIN.SEI],
}
