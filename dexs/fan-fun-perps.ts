import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://defillama.com/protocol/fan.fun

const START = '2025-09-22';
const HL_BUILDER_ADDRESS = '0xbbbbbbe4126c0bbc6a209faa60b67f17b10dea86';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
