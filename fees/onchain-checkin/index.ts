import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainConfig: Record<string, { address: string, start: string }> = {
  [CHAIN.SONEIUM]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-25" },
  [CHAIN.ARBITRUM]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-27" },
  [CHAIN.ABSTRACT]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-10-24" },
  [CHAIN.ALIENX]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-25" },
  [CHAIN.APECHAIN]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-11" },
  [CHAIN.APPCHAIN]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-20" },
  [CHAIN.ARBITRUM_NOVA]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-12" },
  // [CHAIN.ASTAR]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.AURORA]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.AVAX]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-17" },
  [CHAIN.BASE]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-25" },
  [CHAIN.BERACHAIN]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-17" },
  [CHAIN.BLAST]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  [CHAIN.BOB]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-27" },
  [CHAIN.BOTANIX]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.BSC]: { address: "0x1e5fea6fbabd26b1ae5a29c80c3b6058b0a8e6f4", start: "2025-09-23" },
  [CHAIN.CAMP]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-17" },
  [CHAIN.CELO]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  // [CHAIN.CONFLUX]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-20" },
  [CHAIN.CORE]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.CRONOS]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.ETHERLINK]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  // [CHAIN.FRAXTAL]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.GATE_LAYER]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-10-02" },
  [CHAIN.XDAI]: { address: "0x1e5fea6fbabd26b1ae5a29c80c3b6058b0a8e6f4", start: "2025-09-24" },
  [CHAIN.GRAVITY]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  [CHAIN.HARMONY]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.HEMI]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-17" },
  [CHAIN.HYPERLIQUID]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-20" },
  [CHAIN.INK]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-25" },
  // [CHAIN.KLAYTN]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-18" },
  [CHAIN.KATANA]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-17" },
  [CHAIN.LENS]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-17" },
  [CHAIN.LINEA]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-27" },
  [CHAIN.LISK]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-25" },
  [CHAIN.ETHEREUM]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-27" },
  [CHAIN.MANTA]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  [CHAIN.MANTLE]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  [CHAIN.METIS]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  [CHAIN.MEZO]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-20" },
  [CHAIN.MINT]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-27" },
  [CHAIN.MODE]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-25" },
  [CHAIN.MONAD]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-11-24" },
  [CHAIN.MOONBEAM]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  [CHAIN.MOONRIVER]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  [CHAIN.MORPH]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-20" },
  // [CHAIN.OP_BNB]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  [CHAIN.OPTIMISM]: { address: "0x4ec299dab4fdd9a98ca8f8eb3d7f4d9625034a80", start: "2025-08-23" },
  [CHAIN.ORDERLY]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  [CHAIN.PLASMA]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-25" },
  [CHAIN.PLUME]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-27" },
  [CHAIN.POLYGON]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-27" },
  [CHAIN.PULSECHAIN]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.RARI]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  [CHAIN.REDSTONE]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-27" },
  [CHAIN.RONIN]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-27" },
  [CHAIN.SCROLL]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-16" },
  // [CHAIN.SEI]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.SHAPE]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.SOMNIA]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-17" },
  [CHAIN.SONIC]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-20" },
  // [CHAIN.STABLE]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-12-08" },
  // [CHAIN.STORY]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-17" },
  [CHAIN.SUPERPOSITION]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-27" },
  [CHAIN.SSEED]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-27" },
  [CHAIN.SWELLCHAIN]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  [CHAIN.TAIKO]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-16" },
  [CHAIN.UNICHAIN]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-25" },
  [CHAIN.WC]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-08-25" },
  // [CHAIN.XLAYER]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.XRPL_EVM]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-20" },
  // [CHAIN.ZERO]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-20" },
  [CHAIN.ZETA]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },
  [CHAIN.ZIRCUIT]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-24" },
  // [CHAIN.ZKSYNC]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-10-24" },
  [CHAIN.ZORA]: { address: "0x856b799345Eb20F74c1e0C5ec09ec41bEce2078c", start: "2025-09-30" },

};

const fetch = async (_: any, _b: any, options: FetchOptions) => {
  const address = chainConfig[options.chain].address;
  const dailyFees = options.createBalances();

  const fee = await options.api.call({
    abi: "function retroFee() view returns (uint256)",
    target: address,
    params: [],
  })

  const retroCheckedInLogs = await options.getLogs({
    target: address,
    eventAbi: "event RetroCheckedIn(address indexed user, uint32 indexed day)",
  });

  const totalCheckedIn = retroCheckedInLogs.length;
  dailyFees.addGasToken(fee * totalCheckedIn);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: "Fees paid by users for actions on On-chain Check-in",
    Revenue: "Protocol revenue, defined as the total amount of user fees collected by On-chain Check-in",
  },
};

export default adapter;
