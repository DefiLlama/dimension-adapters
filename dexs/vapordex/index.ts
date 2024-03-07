import v1 from "./v1";
import v2 from "./v2";
import { BreakdownAdapter } from "../../adapters/types";

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: v1,
    v2: v2,
  },
};

export default adapter;
