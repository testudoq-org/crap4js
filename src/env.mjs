// Single entry point for all process.env reads.
// Other modules import from here rather than reading process.env directly.

export const CRAP4JS_DEBUG_LCOV = !!process.env.CRAP4JS_DEBUG_LCOV;
