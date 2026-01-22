import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://www.uxuy.com/

const START = '2025-10-20';
const HL_BUILDER_ADDRESS = '0x2e266a0f40e9f5bca48f5df1686aab10b1b68ec8';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
