import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// vfat SwapRouter, deployed as "MultiSwapRouter" and later "SwapRouter" (source
// verified on each chain's explorer; audit: https://reports.yaudit.dev/2026-02-vfat-router).
// Every swap emits MultiSwap; the router fee (feeBps, 1 bp on every deployment)
// is taken from tokenOut. Native currency is address(0).
const MULTI_SWAP_EVENT = 'event MultiSwap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 amountOut, uint256 feeAmount)';
// First MultiSwapRouter version (Dec 2025), before the router fee existed.
const LEGACY_MULTI_SWAP_EVENT = 'event MultiSwap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)';

// Immutable feeCollector of every router below: the vfat.io fee collector, the
// same address that receives Sickle service fees (feeCollector() on each router).
const FEE_COLLECTOR = '0xd4627ecb405b64448ee6b07dcf860bf55590c83d';

// Tokens the DefiLlama price feed overvalues by orders of magnitude; the other
// side of the swap is counted instead.
const MISPRICED_TOKENS: Record<string, string[]> = {
  // "TAC" on BSC: not on CoinGecko, DEX pools under $1K liquidity trading near
  // $0.0000023 while coins.llama.fi quotes ~$0.0015 (Sep 2026).
  [CHAIN.BSC]: ['0x1219c409fabe2c27bd0d1a565daeed9bd9f271de'],
};

// Every router that ever emitted MultiSwap on the chain, plus the currently
// deployed one, from vfat's deployment records. Each was checked on-chain
// (creation, MultiSwap history, feeCollector). `start` is the day of the first
// MultiSwap.
const chainConfig: Record<string, { start: string; routers: string[]; legacyRouters?: string[] }> = {
  [CHAIN.MONAD]: {
    start: '2025-12-16',
    routers: [
      '0xb61c567ee2d90be26adeaef632fdedd97689bf86', // deployed 2026-02-09
      '0x96c64d2f4709355033130c92e70f8aae36f3fa1b', // deployed 2026-05-06
      '0xa452df37e4f845c15f49489486a9b4e8323bd7c4', // deployed 2026-05-16
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-05
      '0xffbab3d0cb829ce4eed26c6202d8fc92949f028e', // deployed 2026-08-23, current
    ],
    // Pre-fee MultiSwapRouter version emitting the 5-field MultiSwap event
    legacyRouters: [
      '0xd290f6d8b57e079765c9c7a3b886c10fe4212691', // deployed 2025-12-15
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: '2025-12-21',
    routers: [
      '0x7057683aaac034bb812269aad2fa3963db21cd0f', // deployed 2026-02-09
      '0x4763ebb49b5f6c3990e1976d34e4fb75b1d78fd9', // deployed 2026-05-06
      '0x917c50722872672628a456f2ab011554f0198be4', // deployed 2026-05-15
      '0xc1f60ba6aea2ed02e5b77e7f29ead500f50f368e', // deployed 2026-08-06
      '0x9b910603111ece21e3ff78bd8c692c60c87ccbcf', // deployed 2026-08-23, current
    ],
    // Pre-fee MultiSwapRouter version emitting the 5-field MultiSwap event
    legacyRouters: [
      '0x0e9c10f54a92b797c440cabf7a0ef585503d606c', // deployed 2025-12-15
    ],
  },
  [CHAIN.LISK]: {
    start: '2026-02-09',
    routers: [
      '0x76384443b91a576809dfc2cdc0f7ae8f3148147a', // deployed 2026-02-06
      '0x52897097f0318b88c60bf82601ea620654cd7ad7', // deployed 2026-05-06
      '0xc5542dceaf587de894d8c2f957cb06e134d9668d', // deployed 2026-05-15
      '0x3e579af59c68b19550f3210367f0fd3d1c784266', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.INK]: {
    start: '2026-02-09',
    routers: [
      '0xba38483d78d56e63248e876bf59c01601b8f6ba5', // deployed 2026-02-06
      '0xace729eeaef6bb911d2227053260645cfb8fc17b', // deployed 2026-05-04
      '0x400b2d19abd0883a80945c82492393d3c0bba104', // deployed 2026-05-15
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-06
      '0x33dfe2d685ce830dafc35c56d08de188af5035fe', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.FRAXTAL]: {
    start: '2026-02-12',
    routers: [
      '0x72b10dc817658293b3703e9e8eb069e1627bef2e', // deployed 2026-02-06
      '0x76fb09f9077a6e0deb4edde76f9e36dd625dd487', // deployed 2026-05-07
      '0x0eb29e143df4e658419df23a2f09af3714ddb08a', // deployed 2026-05-16
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-05
      '0x0aba9bcca7b50ecfd2c6f5ba8360f09c7d6d953a', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.UNICHAIN]: {
    start: '2026-02-13',
    routers: [
      '0x84bf32762f81842bc7242792c68b412331dba11a', // deployed 2026-02-06
      '0x1732e3ebc63e8d7c5d32ba8e9bd40982c21e320f', // deployed 2026-05-06
      '0x6f3e8f5a93dbcc9b0ded259068aa29e9c5bc3fe3', // deployed 2026-05-15
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-06
      '0x7351633d56663f2861907a573e8d4f67828ae330', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.SONEIUM]: {
    start: '2026-02-13',
    routers: [
      '0xa7c8ecc21bcd023eb1db5bb35113b7123cb1f33b', // deployed 2026-02-06
      '0xdf70bbcf26dfa446f0f492ec0fe054966e316916', // deployed 2026-05-04
      '0xfd2d0de5a902d19b3823d31f1bce9d8f70d850e7', // deployed 2026-05-15
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-05
      '0x0aba9bcca7b50ecfd2c6f5ba8360f09c7d6d953a', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.MODE]: {
    start: '2026-02-13',
    routers: [
      '0x74547dd2bd05c8ad55a98272db37fcd4f2220283', // deployed 2026-02-06
      '0x5a72c0f4bf7f3ddf1370780d405e29149b128a04', // deployed 2026-05-06
      '0x428ef7e95888fac6b4fc6a192ed6074281edd75c', // deployed 2026-05-15
      '0x6906b7cab8e565ada6b34282314b21fb51163ff8', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.CELO]: {
    start: '2026-02-13',
    routers: [
      '0x282f8343eef2adfe00fe3fef0755098fc5983027', // deployed 2026-02-06
      '0x5a25167c72fea35986740e6b6104c70e6505cd3e', // deployed 2026-05-07
      '0x8bb9065f3c00f6cfb42ce41e0168632f00548289', // deployed 2026-05-15
      '0x4b2118ea66a18e433aa53e48e718dbfb81dc55f0', // deployed 2026-08-06
      '0x66ae3bfa3082b7ddd828386a20fe4d44376e8967', // deployed 2026-08-24, current
    ],
  },
  [CHAIN.OPTIMISM]: {
    start: '2026-02-14',
    routers: [
      '0xe054aeee167dc213886f343647f451bfea6bdfa1', // deployed 2026-02-09
      '0xab19608881742dcbc03f94f802bde1a34833d6a6', // deployed 2026-05-06
      '0x8513e5b96ad29b51441d88c0370187c028a4b1f1', // deployed 2026-05-16
      '0xcd3b677f642a857453257fdbd6f17a4b4902027e', // deployed 2026-08-06
      '0x36f89be8cef366a97129c7d18cfcaf860ba9ff7c', // deployed 2026-08-12, current
      '0x745c4638e5d0f54dc99658dea7d8d5bf46083443', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.BSC]: {
    start: '2026-03-13',
    routers: [
      '0xf53ee3ec8fbd76ea0bcb673f866b03254f785845', // deployed 2026-02-09
      '0x716415a309e673c9c34e4de92909bdc628f775d0', // deployed 2026-05-06
      '0xf65d68ecae6e592c078c2c7bc018df896d259c07', // deployed 2026-05-15
      '0xc1f60ba6aea2ed02e5b77e7f29ead500f50f368e', // deployed 2026-08-05
      '0xdf6ebfdf5fb2911ab1dbba3daa60a8ae870ee506', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.HYPERLIQUID]: {
    start: '2026-03-13',
    routers: [
      '0xff638dc7605065e33c74620c1f859d49183d9452', // deployed 2026-02-09
      '0xb051f35a2b629ab6f9cd8ff2776caf8c0d800307', // deployed 2026-05-06
      '0xf152172a4af1096c953e087e671b682b434158cf', // deployed 2026-05-16
      '0xc1f60ba6aea2ed02e5b77e7f29ead500f50f368e', // deployed 2026-08-06
      '0x8ac1697061e6016b7d1f15e93e2f231cc6c86bdb', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.METAL]: {
    start: '2026-03-20',
    routers: [
      '0x8e5ad312483fb369d8a5e724cb50e5b5b3228865', // deployed 2026-02-06
      '0x67afb7733bc70607d9bac244ee3feedc98c195df', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.KATANA]: {
    start: '2026-04-13',
    routers: [
      '0x8cf93e63cbd02d790523bea5cafc7db08e5fdcc0', // deployed 2026-03-13
      '0x4f025aba4887631a6d601ae3156bf53568f5a5fd', // deployed 2026-05-08
      '0x84676ee313cd7c7b85869b208d2effb7af136f8a', // deployed 2026-05-15
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-06
      '0xffbab3d0cb829ce4eed26c6202d8fc92949f028e', // deployed 2026-08-12, current
      '0x9b910603111ece21e3ff78bd8c692c60c87ccbcf', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.ETHEREUM]: {
    start: '2026-04-14',
    routers: [
      '0xd9704cdacaee366b7b55eddc6f280339bb2affc0', // deployed 2026-02-17
      '0xf852516daec5d29be4e2925104ab499369735741', // deployed 2026-05-06
      '0xb6d55b223e55bd3ebf3a08a7da6bbebdfe49a2c1', // deployed 2026-05-16
      '0xcd3b677f642a857453257fdbd6f17a4b4902027e', // deployed 2026-08-06
      '0x79c9d85fa916d2d52677eb29f0c6793eb2ed39d2', // deployed 2026-08-12, current
      '0xbe8c6f9f284c7cfe0264a5365e14b169300147d3', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.SONIC]: {
    start: '2026-04-14',
    routers: [
      '0x9c418bb66f65e8a65b518601cf4bcf10f7ff1b58', // deployed 2026-03-03
      '0xd51a36e079bc3cfa9163b6ca40b7e796257fcc97', // deployed 2026-05-08
      '0x0998943d5caec304658b7af3b4367e134c73a8c1', // deployed 2026-05-15
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-05
      '0x5328244d451d2a523d03d92b6c103bf0652eddb1', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.BASE]: {
    start: '2026-04-14',
    routers: [
      '0xf33ff09dcbd11ecc69abe074fbde99ba7376526c', // deployed 2026-03-06
      '0x8e5ebbb98382dbdfb42167c61c8d1e1015c7d73b', // deployed 2026-05-08
      '0x7424c3e944a9ab9710ead57e66ce56137adc657e', // deployed 2026-05-16
      '0x3e2040b9b5eebf7c43e8801ca366502c35af62ae', // deployed 2026-06-17, current
      '0xcf70cc22f8de1bd36e56b8184ff771f1bb93d82a', // deployed 2026-08-05
      '0xb7647612839c242ea035886dcf014e9bf58086a7', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.AVAX]: {
    start: '2026-04-14',
    routers: [
      '0xb9ab7e050a4a3d12c638506bc94332f87b3c5a5e', // deployed 2026-02-22
      '0xedce63dc020450a5a813b522e591495216839004', // deployed 2026-05-08
      '0xf6e2d130407c12a8390d70f4879c0edfe36d92c7', // deployed 2026-05-15
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-06
      '0xff64600c95143714cb054e463868d642c0311af8', // deployed 2026-08-12, current
      '0xc540c0c69876e9941a6c308c30a4321af72d57bf', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.POLYGON]: {
    start: '2026-05-11',
    routers: [
      '0x6fa6a0aa93732c735b6088a8dfcded60e8f23dbe', // deployed 2026-05-06
      '0x7badae0bf1b3b758478cb4dd94be5aeccd03804f', // deployed 2026-05-16
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-05
      '0x770b7b081e9546042b3f4aa3a233d587e9336b54', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.WC]: {
    start: '2026-05-11',
    routers: [
      '0xb9e44309bf986c71223be157ad88ddf5d4e75bc2', // deployed 2026-05-06
      '0x02427335676a5bef943eb20b73caaae08936e46c', // deployed 2026-05-15
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-06
      '0xffbab3d0cb829ce4eed26c6202d8fc92949f028e', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.PLASMA]: {
    start: '2026-05-11',
    routers: [
      '0xff844443c7837869e9861d1051fd32b23e14460d', // deployed 2026-05-06
      '0xd34d1328103d9cf65037aaa7e736f74b8f878dd2', // deployed 2026-05-15
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-05
      '0xffbab3d0cb829ce4eed26c6202d8fc92949f028e', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.CRONOS]: {
    start: '2026-05-12',
    routers: [
      '0x76fe032c942c03cc4d4d0d527ef2686cfc414b2f', // deployed 2026-05-08
      '0xaf0ee4d542e29dd7d271b43f8a2d3b40a12622b6', // deployed 2026-05-16
      '0xff64600c95143714cb054e463868d642c0311af8', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.PULSECHAIN]: {
    start: '2026-05-12',
    routers: [
      '0xc5542dceaf587de894d8c2f957cb06e134d9668d', // deployed 2026-05-08
      '0xba38483d78d56e63248e876bf59c01601b8f6ba5', // deployed 2026-05-16
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-05
      '0x4bff9c589ab4f7a8ae41e0f804ff362791512f2f', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.BERACHAIN]: {
    start: '2026-05-15',
    routers: [
      '0xaf0ee4d542e29dd7d271b43f8a2d3b40a12622b6', // deployed 2026-05-15
      '0x8cbec5c723f5bf6292da2ad354d35c35b25a863d', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.LINEA]: {
    start: '2026-05-17',
    routers: [
      '0x0e1044f8b4f9d7cf370d9f723613a4099a3bc311', // deployed 2026-05-15
      '0x468430a96df9389448e65052d2cd68374e9d2e39', // deployed 2026-06-17, current
      '0xcd3b677f642a857453257fdbd6f17a4b4902027e', // deployed 2026-08-06
      '0x33dfe2d685ce830dafc35c56d08de188af5035fe', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.MEGAETH]: {
    start: '2026-05-19',
    routers: [
      '0x23eb5ce64769b969b58f008154d396957a7ade3b', // deployed 2026-05-16
      '0xffbab3d0cb829ce4eed26c6202d8fc92949f028e', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.HEMI]: {
    start: '2026-05-20',
    routers: [
      '0xb616435169538d4749351765bf050354e5030262', // deployed 2026-05-16
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-06
      '0x67afb7733bc70607d9bac244ee3feedc98c195df', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.MANTLE]: {
    start: '2026-06-04',
    routers: [
      '0x564dde51c3e4725542fceebf38d60f5d3068dae1', // deployed 2026-05-15
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-05
      '0x8e3203f717e3c4f1ad5cf90dae9781a260b91bd8', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.PEAQ]: {
    start: '2026-07-01',
    routers: [
      '0x478ec7641ee72df36d5ae2767b264b4a00a57103', // deployed 2026-06-03
      '0x366f9012725af9fe05663122f086ebf68126b777', // deployed 2026-08-14
      '0xf5475038c7dcad66cf0ad1e0ad22df0d67ef8841', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.ROBINHOOD]: {
    start: '2026-07-08',
    routers: [
      '0xa8281d411b9ad6bc3ba3fde6d4b1631fcafda45d', // deployed 2026-07-07
      '0x3a7bc0cccd02762b0d4f3e2276e25597d68bcd77', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.SCROLL]: {
    start: '2026-08-17',
    routers: [
      '0x7941808b1d3f76786aa66b72d74989310995afbd', // deployed 2026-08-06
      '0x7842a6620b749e5d148edd368bc90759b7369187', // deployed 2026-08-23, current
    ],
  },
  [CHAIN.ARC]: {
    start: '2026-09-16',
    routers: [
      '0x854a12e23dcb12e89eba6322a246f0e5de8bc087', // deployed 2026-09-16, current
    ],
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const { routers, legacyRouters } = chainConfig[options.chain];
  const mispriced = new Set(MISPRICED_TOKENS[options.chain] ?? []);
  // address(0) is the native token, which Balances prices as the gas token.
  const addVolume = (tokenIn: string, amountIn: bigint, tokenOut: string, amountOut: bigint) => {
    if (!mispriced.has(tokenIn.toLowerCase())) dailyVolume.add(tokenIn, amountIn);
    else if (!mispriced.has(tokenOut.toLowerCase())) dailyVolume.add(tokenOut, amountOut);
  };

  const logs = await options.getLogs({
    targets: routers,
    eventAbi: MULTI_SWAP_EVENT,
  });

  if (legacyRouters) {
    const legacyLogs = await options.getLogs({
      targets: legacyRouters,
      eventAbi: LEGACY_MULTI_SWAP_EVENT,
    });
    for (const log of legacyLogs) addVolume(log.tokenIn, log.amountIn, log.tokenOut, log.amountOut);
  }

  for (const log of logs) {
    // The fee collector converting fees it already collected is vfat treasury
    // management, not user volume, and its fee is paid to itself.
    if (log.sender.toLowerCase() === FEE_COLLECTOR) continue;
    // amountOut is net of the fee, so the gross output is amountOut + feeAmount.
    addVolume(log.tokenIn, log.amountIn, log.tokenOut, log.amountOut + log.feeAmount);
    if (mispriced.has(log.tokenOut.toLowerCase())) continue;
    dailyFees.add(log.tokenOut, log.feeAmount, METRIC.SWAP_FEES);
    dailyRevenue.add(log.tokenOut, log.feeAmount, 'Token Swap Fees To vfat');
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const methodology = {
  Volume: 'Input amount of every swap routed through the vfat SwapRouter contracts, including swaps made by vfat Sickle smart wallets during zaps, rebalances and compounds. Excludes swaps by the vfat fee collector.',
  Fees: 'The router fee (1 basis point of the output amount) paid by users on every swap.',
  UserFees: 'The router fee (1 basis point of the output amount) paid by users on every swap.',
  Revenue: 'All router fees go to the vfat.io fee collector.',
  ProtocolRevenue: 'All router fees go to the vfat.io fee collector.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Router fee taken from the output token of each swap.',
  },
  UserFees: {
    [METRIC.SWAP_FEES]: 'Router fee taken from the output token of each swap.',
  },
  Revenue: {
    'Token Swap Fees To vfat': 'Router fees sent to the vfat.io fee collector.',
  },
  ProtocolRevenue: {
    'Token Swap Fees To vfat': 'Router fees sent to the vfat.io fee collector.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
