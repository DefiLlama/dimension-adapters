import { exportHIP3DeployerAdapter } from "../../helpers/hyperliquid";

export default exportHIP3DeployerAdapter('hyna', {
  type: 'dexs',
  start: '2025-12-01',
  methodology: {
    Fees: 'Trading fees paid by users on Hyperliquid markets deployed by Based and Ethena teams.',
    Revenue: 'Half of the fees goes to the protocol and rest to hyperliquid',
    ProtocolRevenue: 'All the revenue goes to the protocol.'
  }
});
