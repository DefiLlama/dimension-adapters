import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesFromRPC } from "../helpers/getFeesFromRPC";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.KATANA]: { fetch: getFeesFromRPC, start: 0 },
    [CHAIN.PULSECHAIN]: { fetch: getFeesFromRPC, start: 1683849600 },
    [CHAIN.FLARE]: { fetch: getFeesFromRPC, start: 1657756800 },
    [CHAIN.BOTANIX]: { fetch: getFeesFromRPC, start: 0 },
    [CHAIN.XDC]: { fetch: getFeesFromRPC, start: 1559347200 },
    [CHAIN.MERLIN]: { fetch: getFeesFromRPC, start: 1706745600 },
    [CHAIN.CORE]: { fetch: getFeesFromRPC, start: 1673654400 },
    [CHAIN.KAVA]: { fetch: getFeesFromRPC, start: 1653436800 },
    [CHAIN.HECO]: { fetch: getFeesFromRPC, start: 1608508800 },
    [CHAIN.DOGECHAIN]: { fetch: getFeesFromRPC, start: 1659312000 },
  },
  protocolType: ProtocolType.CHAIN,
}

export default adapter;
