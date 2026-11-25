import { CHAIN } from "../../helpers/chains";
import { btrAdapter } from "../btr";

// BTR V2: same pool contracts and events as V1, only the PoolFactory differs.
export default btrAdapter({
  [CHAIN.MONAD]: {
    start: "2026-11-12",
    // factory deployed at block 121557204 (2026-11-12 08:43 UTC), first official pool at block 121838449 (2026-11-13)
    factories: [{ address: "0xbbbbbbb16b9B5Fa94AD8CD35e696bEA55DB9C8B0", from: 1794472602 }],
  },
});
