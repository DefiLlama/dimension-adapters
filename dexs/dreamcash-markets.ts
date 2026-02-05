import { exportHIP3DeployerAdapter } from "../helpers/hyperliquid";

export default exportHIP3DeployerAdapter('cash', {
  type: 'dexs',
  start: '2026-01-20',
  methodology: {
    Fees: 'Trading fees paid by users on Hyperliquid markets deployed by Dreamcash.',
    Revenue: 'Half of the fees goes to the protocol and rest to hyperliquid',
    ProtocolRevenue: 'All the revenue goes to the protocol.'
  }
});
