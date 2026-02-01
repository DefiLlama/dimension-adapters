import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://trade.supurr.app/algotrading

const START = '2025-09-19';
const HL_BUILDER_ADDRESS = '0x36be02a397e969e010ccbd7333f4169f66b8989f';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
