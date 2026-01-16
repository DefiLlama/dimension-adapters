import { exportHIP3DeployerAdapter } from "../../helpers/hyperliquid";

export default exportHIP3DeployerAdapter('km', {
  type: 'dexs',
  start: '2025-12-16',
  methodology: {
    Fees: 'Trading fees paid by users on Hyperliquid markets deployed by Kinetiq Markets.',
    Revenue: 'Half of the fees goes to the protocol and rest to hyperliquid',
    ProtocolRevenue: 'All the revenue goes to the protocol.'
  }
});
