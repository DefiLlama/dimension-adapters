import { BreakdownAdapter } from "../../adapters/types";
import trident from './trident'
import classic from './classic'
import v3 from './v3'

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    classic: classic,
    trident: trident,
    v3: v3
  }
}

export default adapter
