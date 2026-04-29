import { fees } from "../factory/uniV2";

const adapter = fees.getAdapter("potatoswap");

if (!adapter) {
  throw new Error("Missing factory adapter for potatoswap");
}

export default adapter;
