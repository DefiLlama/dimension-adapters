import { Adapter, Dependencies, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";

const FeeWallets: Record<string, string[]> = {
  [CHAIN.ABSTRACT]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.APECHAIN]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.ARBITRUM]: ["0x02E5AD03Ce77868B6Fe4E4DD78358229a9513040"],
  [CHAIN.AVAX]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.BASE]: ["0xbDB018e21AD1e5756853fe008793a474d329991b"],
  [CHAIN.BERACHAIN]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.BSC]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.BOB]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.BOBA]: ["0xf57cb671d50535126694ce5cc3cebe3f32794896"],
  [CHAIN.CELO]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.CORN]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.FLARE]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.FLOW]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.HEMI]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.INK]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.KATANA]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.LINEA]: ["0xbDB018e21AD1e5756853fe008793a474d329991b"],
  [CHAIN.MODE]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.OPTIMISM]: ["0xB9cC0Bb020cF55197C4C3d826AC87CAdba51f272"],
  [CHAIN.PLASMA]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.POLYGON]: ["0xfa31AB150782F086Ba93b7902E73B05DCBDe716b"],
  [CHAIN.SCROLL]: ["0xDC3D8318Fbaec2de49281843f5bba22e78338146"],
  [CHAIN.SHAPE]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.SOMNIA]: ["0x9c89e169A5552b5ac8b79b2b4BFcCB18e846579d"],
  [CHAIN.SONIC]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.TAC]: ["0xF57Cb671D50535126694Ce5Cc3CeBe3F32794896"],
  [CHAIN.TAIKO]: ["0xDC3D8318Fbaec2de49281843f5bba22e78338146"],
  [CHAIN.UNICHAIN]: ["0x009DBFEe9E155766AF434ED1652CA3769B05E76f"],
  [CHAIN.ERA]: ["0x8A1142620CbdE2f2d63E88F35D0D76eAAce0AC9e"],
};

const fetch = async (_a: any, _b:any, options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = await getETHReceived({ options, targets: FeeWallets[options.chain] })
  
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, };
};


const methodology = {
  Fees: "All received native coin is treated as revenue.",
  Revenue: "All received native coin is treated as revenue.",
  ProtocolRevenue: "All received fees are collected by protocol.",
}

const adapter: Adapter = {
  version: 1,
  fetch,
  dependencies: [Dependencies.ALLIUM],  
  adapter: {
    [CHAIN.ABSTRACT]: { start: '2025-10-07', },
    [CHAIN.APECHAIN]: { start: '2025-08-14', },
    [CHAIN.ARBITRUM]: { start: '2025-08-08', },
    [CHAIN.AVAX]: { start: '2025-09-03', },
    [CHAIN.BASE]: { start: '2023-11-19', },
    [CHAIN.BERACHAIN]: { start: '2025-08-28', },
    [CHAIN.BSC]: { start: '2025-10-07', },
    [CHAIN.INK]: { start: '2025-08-08', },
    [CHAIN.KATANA]: { start: '2025-08-29', },
    [CHAIN.LINEA]: { start: '2023-11-20', },
    [CHAIN.MODE]: { start: '2025-08-27', },
    [CHAIN.OPTIMISM]: { start: '2023-11-27', },
    [CHAIN.PLASMA]: { start: '2025-10-01', },
    [CHAIN.POLYGON]: { start: '2025-08-18', },
    [CHAIN.SCROLL]: { start: '2023-11-19', },
    [CHAIN.SONIC]: { start: '2025-10-07', },
    [CHAIN.UNICHAIN]: { start: '2025-08-08', },
    [CHAIN.ERA]: { start: '2023-11-20', },
    [CHAIN.CELO]: { start: '2025-08-14', },
    // [CHAIN.FLARE]: { start: '2025-09-05', },
    // [CHAIN.SOMNIA]: { start: '2025-09-01', },
    // [CHAIN.BOBA]: { start: '2025-08-21', },
    // [CHAIN.TAIKO]: { start: '2024-05-27', },
    // [CHAIN.TAC]: { start: '2025-08-20', },
    // [CHAIN.SHAPE]: { start: '2025-08-08', },
    // [CHAIN.CORN]: { start: '2025-09-03', },
    // [CHAIN.FLOW]: { start: '2025-09-11', },
    // [CHAIN.HEMI]: { start: '2025-08-08', },
    // [CHAIN.BOB]: { start: '2025-08-27', },
  },
  methodology,
};

export default adapter;
