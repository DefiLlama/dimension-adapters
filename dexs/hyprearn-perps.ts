import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://hyprearn.com/

const START = '2025-09-01';
const HL_BUILDER_ADDRESS = '0x70cf605bb180daf00c3e2f1ca3df5bb602664452';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
