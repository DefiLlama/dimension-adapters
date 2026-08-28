import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

const ZRO_BUYBACK_WALLET = "0x6ac55e733dff03a54251670df0667774e8f7d28f";
const ZRO_TOKEN = "0x6985884c4392d348587b19cb9eaaf157f13271cd";

const eventExecutorFeePaid = "event ExecutorFeePaid(address executor, uint256 fee)";
const eventDVNFeePaid = "event DVNFeePaid(address[] requiredDVNs, address[] optionalDVNs, uint256[] fees)";

type ChainConfig = {
  // SendUln302 is the LayerZero V2 default send library.
  // SendUln301 is a V2 send library that serves V1-style OApps (legacy compat).
  // Both libraries emit ExecutorFeePaid + DVNFeePaid events with native-token fees,
  // so summing logs from both targets covers all V2 endpoint traffic (incl. V1 OApps on V2).
  // True legacy V1 (UltraLightNodeV2) traffic is being deprecated and is not covered here.
  sendLibs: string[];
  start: string;
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: { sendLibs: ["0xbB2Ea70C9E858123480642Cf96acbcCE1372dCe1", "0xD231084BfB234C107D3eE2b22F97F3346fDAF705"], start: "2024-01-31" },
  [CHAIN.BSC]: { sendLibs: ["0x9F8C645f2D0b2159767Bd6E0839DE4BE49e823DE", "0xfCCE712C9be5A78FE5f842008e0ed7af59455278"], start: "2024-01-31" },
  [CHAIN.AVAX]: { sendLibs: ["0x197D1333DEA5Fe0D6600E9b396c7f1B1cFCc558a", "0x31CAe3B7fB82d847621859fb1585353c5720660D"], start: "2024-01-31" },
  [CHAIN.POLYGON]: { sendLibs: ["0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3", "0x5727E81A40015961145330D91cC27b5E189fF3e1"], start: "2024-01-31" },
  [CHAIN.ARBITRUM]: { sendLibs: ["0x975bcD720be66659e3EB3C0e4F1866a3020E493A", "0x5cDc927876031B4Ef910735225c425A7Fc8efed9"], start: "2024-01-31" },
  [CHAIN.OPTIMISM]: { sendLibs: ["0x1322871e4ab09Bc7f5717189434f97bBD9546e95", "0x3823094993190Fbb3bFABfEC8365b8C18517566F"], start: "2024-01-31" },
  [CHAIN.BASE]: { sendLibs: ["0xB5320B0B3a13cC860893E2Bd79FCd7e13484Dda2", "0x9DB3714048B5499Ec65F807787897D3b3Aa70072"], start: "2024-01-31" },
  [CHAIN.LINEA]: { sendLibs: ["0x32042142DD551b4EbE17B6FEd53131dd4b4eEa06", "0x119C04C4E60158fa69eCf4cdDF629D09719a7572"], start: "2024-01-31" },
  [CHAIN.MANTLE]: { sendLibs: ["0xde19274c009A22921E3966a1Ec868cEba40A5DaC", "0xa6c26315a9229c516d7e002F098FeA7574c6C2D3"], start: "2024-01-31" },
  [CHAIN.SCROLL]: { sendLibs: ["0x9BbEb2B2184B9313Cf5ed4a4DDFEa2ef62a2a03B", "0xdf3ad32a558578AC0AD1c19AAD41DA1ba5b37d69"], start: "2024-01-31" },
  [CHAIN.FANTOM]: { sendLibs: ["0xC17BaBeF02a937093363220b0FB57De04A535D5E", "0xeDD674b123662D1922d7060c10548ae58D4838af"], start: "2024-01-31" },
  [CHAIN.CELO]: { sendLibs: ["0x42b4E9C6495B4cFDaE024B1eC32E09F28027620e", "0xc80233AD8251E668BecbC3B0415707fC7075501e"], start: "2024-01-31" },
  // [CHAIN.ZKSYNC]: { sendLibs: ["0x07fD0e370B49919cA8dA0CE842B8177263c0E12c", "0x8Ef9c3062747927F3138f855C0cfD8eEE79028ff"], start: "2024-01-31" },
  [CHAIN.AURORA]: { sendLibs: ["0x1aCe9DD1BC743aD036eF2D92Af42Ca70A1159df5", "0x148f693af10ddfaE81cDdb36F4c93B31A90076e1"], start: "2024-01-31" },
  [CHAIN.HARMONY]: { sendLibs: ["0x795F8325aF292Ff6E58249361d1954893BE15Aff", "0x91AA2547728307E0e3B35254D526aceF202d131A"], start: "2024-01-31" },
  [CHAIN.KLAYTN]: { sendLibs: ["0x9714Ccf1dedeF14BaB5013625DB92746C1358cb4", "0xaDDed4478B423d991C21E525Cd3638FBce1AaD17"], start: "2024-01-31" },
  [CHAIN.POLYGON_ZKEVM]: { sendLibs: ["0x28B6140ead70cb2Fb669705b3598ffB4BEaA060b", "0x8161B3B224Cd6ce37cC20BE61607C3E19eC2A8A6"], start: "2024-01-31" },
  [CHAIN.CORE]: { sendLibs: ["0x0BcAC336466ef7F1e0b5c184aAB2867C108331aF", "0xdCD9fd7EabCD0fC90300984Fc1Ccb67b5BF3DA36"], start: "2024-01-31" },
  [CHAIN.FRAXTAL]: { sendLibs: ["0x377530cdA84DFb2673bF4d145DCF0C4D7fdcB5b6", "0x282b3386571f7f794450d5789911a9804FA346b4"], start: "2024-02-29" },
  [CHAIN.BLAST]: { sendLibs: ["0xc1B621b18187F74c8F6D52a6F709Dd2780C09821", "0x7cacBe439EaD55fa1c22790330b12835c6884a91"], start: "2024-02-29" },
  [CHAIN.MODE]: { sendLibs: ["0x2367325334447C5E1E0f1b3a6fB947b262F58312", "0xfd76d9CB0Bac839725aB79127E7411fe71b1e3CA"], start: "2024-04-01" },
  [CHAIN.XLAYER]: { sendLibs: ["0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043", "0x15e51701F245F6D5bd0FEE87bCAf55B0841451B3"], start: "2024-04-01" },
  [CHAIN.MERLIN]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2024-04-01" },
  [CHAIN.BOB]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2024-05-01" },
  [CHAIN.TAIKO]: { sendLibs: ["0xc1B621b18187F74c8F6D52a6F709Dd2780C09821", "0x7cacBe439EaD55fa1c22790330b12835c6884a91"], start: "2024-05-27" },
  // [CHAIN.SEI]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2024-05-15" },
  [CHAIN.ZIRCUIT]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2024-08-15" },
  [CHAIN.SWELLCHAIN]: { sendLibs: ["0xc1B621b18187F74c8F6D52a6F709Dd2780C09821", "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043"], start: "2024-12-01" },
  [CHAIN.INK]: { sendLibs: ["0x76111DE813F83AAAdBD62773Bf41247634e2319a", "0x82760fD1c83345C6f3314278A1ea58Ad102be742"], start: "2024-12-18" },
  [CHAIN.SONIC]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2024-12-18" },
  [CHAIN.SONEIUM]: { sendLibs: ["0x50351C9dA75CCC6d8Ea2464B26591Bb4bd616dD5", "0x4bB746ED0DF6A8be563Ff66dFc502f084779F9c9"], start: "2025-01-14" },
  [CHAIN.ABSTRACT]: { sendLibs: ["0x166CAb679EBDB0853055522D3B523621b94029a1", "0x07fD0e370B49919cA8dA0CE842B8177263c0E12c"], start: "2025-01-27" },
  [CHAIN.BERACHAIN]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2025-02-06" },
  [CHAIN.UNICHAIN]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2025-02-11" },
  [CHAIN.STORY]: { sendLibs: ["0x2367325334447C5E1E0f1b3a6fB947b262F58312", "0xfd76d9CB0Bac839725aB79127E7411fe71b1e3CA"], start: "2025-02-13" },
  [CHAIN.MONAD]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2025-11-24" },
  [CHAIN.HEMI]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2025-03-12" },
  [CHAIN.MEGAETH]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2026-02-09" },
  [CHAIN.PLASMA]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2025-09-25" },
  [CHAIN.BITLAYER]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2024-04-01" },
  [CHAIN.PLUME]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2025-06-05" },
  [CHAIN.KATANA]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2025-06-30" },
  [CHAIN.FLARE]: { sendLibs: ["0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043", "0x15e51701F245F6D5bd0FEE87bCAf55B0841451B3"], start: "2024-09-01" },
  [CHAIN.SOPHON]: { sendLibs: ["0x01047601DB5E63b1574aae317BAd9C684E3C9056", "0xd07C30aF3Ff30D96BDc9c6044958230Eb797DDBF"], start: "2025-01-01" },
  // [CHAIN.NIBIRU]: { sendLibs: ["0xd1FA2df582C6C986Ec573e1a3B0218049CF1E5c7", "0x3c4962Ff6258dcfCafD23a814237B7d6Eb712063"], start: "2025-01-01" },
  // [CHAIN.LISK]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2024-12-01" },
  // [CHAIN.REYA]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2024-08-01" },
  // [CHAIN.CRONOS_ZKEVM]: { sendLibs: ["0x01047601DB5E63b1574aae317BAd9C684E3C9056", "0xd07C30aF3Ff30D96BDc9c6044958230Eb797DDBF"], start: "2024-10-01" },
  [CHAIN.ZKLINK]: { sendLibs: ["0x01047601DB5E63b1574aae317BAd9C684E3C9056", "0xd07C30aF3Ff30D96BDc9c6044958230Eb797DDBF"], start: "2024-07-01" },
  // [CHAIN.LENS]: { sendLibs: ["0x01047601DB5E63b1574aae317BAd9C684E3C9056", "0xd07C30aF3Ff30D96BDc9c6044958230Eb797DDBF"], start: "2025-04-01" },
  // [CHAIN.XDC]: { sendLibs: ["0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043", "0x15e51701F245F6D5bd0FEE87bCAf55B0841451B3"], start: "2024-10-01" },
  // [CHAIN.CAMP]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2025-08-01" },
  // [CHAIN.HEDERA]: { sendLibs: ["0x2367325334447C5E1E0f1b3a6fB947b262F58312", "0xfd76d9CB0Bac839725aB79127E7411fe71b1e3CA"], start: "2024-09-01" },
  // [CHAIN.APECHAIN]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2024-11-01" },
  // [CHAIN.ROOTSTOCK]: { sendLibs: ["0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043", "0x15e51701F245F6D5bd0FEE87bCAf55B0841451B3"], start: "2024-12-01" },
  // [CHAIN.SANKO]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2024-09-01" },
  // [CHAIN.WC]: { sendLibs: ["0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", "0x37aaaf95887624a363effB7762D489E3C05c2a02"], start: "2024-11-01" },
};

const fetch = async (options: FetchOptions) => {
  const { chain } = options;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const targets = config[chain]?.sendLibs ?? [];
  if (targets.length) {
    const executorLogs = await options.getLogs({
      targets,
      eventAbi: eventExecutorFeePaid,
      flatten: true,
    });
    for (const log of executorLogs) {
      const fee = log.fee?.toString() ?? "0";
      dailyFees.addGasToken(fee, 'EXECUTOR_FEES');
      dailySupplySideRevenue.addGasToken(fee, 'EXECUTOR_FEES');
    }

    const dvnLogs = await options.getLogs({
      targets,
      eventAbi: eventDVNFeePaid,
      flatten: true,
    });
    for (const log of dvnLogs) {
      const fees: any[] = log.fees ?? [];
      for (const fee of fees) {
        const amount = fee?.toString() ?? "0";
        dailyFees.addGasToken(amount, 'DVN_FEES');
        dailySupplySideRevenue.addGasToken(amount, 'DVN_FEES');
      }
    }
  }

  if (chain === CHAIN.ETHEREUM) {
    const buyback = await addTokensReceived({
      options,
      target: ZRO_BUYBACK_WALLET,
      tokens: [ZRO_TOKEN],
    });
    const buybackHolders = buyback.clone(1, METRIC.TOKEN_BUY_BACK);
    dailyRevenue.addBalances(buybackHolders);
    dailyHoldersRevenue.addBalances(buybackHolders);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  // pullHourly: true,
  fetch,
  adapter: config,
  methodology: {
    Fees: "Native token fees paid by users for cross-chain messaging, summed from ExecutorFeePaid and DVNFeePaid events on SendUln302 (V2 default) and SendUln301 (V1-compat through V2 endpoints) across supported chains.",
    Revenue: "ZRO buybacks funded by Stargate ecosystem allocation routed to LayerZero Foundation. LayerZero takes a 0% protocol take rate on messaging fees.",
    ProtocolRevenue: "ZRO buybacks funded by Stargate ecosystem allocation.",
    HoldersRevenue: "ZRO buybacks distributed to ZRO holders.",
    SupplySideRevenue: "Approximately 100% of messaging fees flow to DVNs and Executors that secure and deliver cross-chain messages.",
  },
  breakdownMethodology: {
    Fees: {
      'DVN_FEES': "Native token fees paid to required and optional DVNs that verify cross-chain messages.",
      'EXECUTOR_FEES': "Native token fees paid to Executors that deliver and execute messages on the destination chain.",
    },
    Revenue: {
      [METRIC.TOKEN_BUY_BACK]: "ZRO bought back using Stargate ecosystem revenue.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "ZRO bought back and distributed to holders.",
    },
    SupplySideRevenue: {
      'DVN_FEES': "Fees earned by DVNs.",
      'EXECUTOR_FEES': "Fees earned by Executors.",
    },
  },
};

export default adapter;
