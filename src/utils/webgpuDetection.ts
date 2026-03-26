/**
 * Detects if the browser supports WebGPU
 */
export function hasWebGPUSupport(): boolean {
  return !!(navigator as any).gpu;
}

/**
 * Get WebGPU support status with details
 */
export function getWebGPUStatus(): {
  supported: boolean;
  message: string;
} {
  if (!hasWebGPUSupport()) {
    return {
      supported: false,
      message: 'WebGPU is not supported in this browser. Please use Chrome 113+, Edge 112+, or Firefox Nightly.',
    };
  }
  return {
    supported: true,
    message: 'WebGPU is supported',
  };
}
