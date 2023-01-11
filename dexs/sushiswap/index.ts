import { BreakdownAdapter } from "../../adapters/types";
import trident from './trident'
import classic from './classic'

const adapter: BreakdownAdapter = {
  breakdown: {
    classic: classic,
    trident: trident
  }
}

export default adapter
