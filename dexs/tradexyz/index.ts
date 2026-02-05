import { exportHIP3DeployerAdapter } from "../../helpers/hyperliquid";

export default exportHIP3DeployerAdapter('xyz', {
  type: 'dexs',
  start: '2025-11-01',
  methodology: {
    Fees: 'Trading fees paid by users on Hyperliquid markets deployed by Trade.xyz.',
    Revenue: 'Half of the fees goes to the protocol and rest to hyperliquid',
    ProtocolRevenue: 'All the revenue goes to the protocol.'
  }
});
