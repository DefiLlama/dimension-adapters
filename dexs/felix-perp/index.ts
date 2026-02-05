import { exportHIP3DeployerAdapter } from "../../helpers/hyperliquid";

export default exportHIP3DeployerAdapter('flx', {
  type: 'dexs',
  start: '2025-11-13',
  methodology: {
    Fees: 'Trading fees paid by users on Hyperliquid markets deployed by Felix protocol.',
    Revenue: 'Half of the fees goes to the protocol and rest to hyperliquid',
    ProtocolRevenue: 'All the revenue goes to the protocol.'
  }
});
