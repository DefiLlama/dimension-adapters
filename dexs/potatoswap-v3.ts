import { fees } from "../factory/uniV3";

const adapter = fees.getAdapter("potatoswap-v3");

if (!adapter) {
  throw new Error("Missing factory adapter for potatoswap-v3");
}

export default adapter;
