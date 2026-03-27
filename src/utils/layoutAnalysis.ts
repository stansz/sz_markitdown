// Import WebGPU-enabled ONNX Runtime
import * as ort from 'onnxruntime-web/webgpu';
import ortWasmAsyncifyMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmAsyncifyWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';

// IMPORTANT:
// Do NOT force wasmPaths to /public in Vite dev, because ORT may try to dynamically
// import .mjs companion files from that path and Vite rejects public-file source imports.
// Let the bundler-resolved defaults be used for WebGPU runtime assets.
if (typeof ort !== 'undefined' && ort.env && ort.env.wasm) {
  // Explicitly pin the ORT runtime assets via Vite-processed URLs.
  // This avoids loading HTML fallback content for wasm URLs in dev.
  ort.env.wasm.wasmPaths = {
    mjs: ortWasmAsyncifyMjsUrl,
    wasm: ortWasmAsyncifyWasmUrl,
  };

  // Keep WebGPU-only flow deterministic and avoid threaded asyncify runtime variant
  // that commonly triggers public-path dynamic import issues in dev.
  ort.env.wasm.numThreads = 1;

  console.log('[LayoutAnalyzer] ONNX Runtime environment configured:');
  console.log('[LayoutAnalyzer] - WebGPU entrypoint imported:', true);
  console.log('[LayoutAnalyzer] - wasmPaths (explicit):', ort.env.wasm.wasmPaths ?? '(unset)');
  console.log('[LayoutAnalyzer] - pinned mjs URL:', ortWasmAsyncifyMjsUrl);
  console.log('[LayoutAnalyzer] - pinned wasm URL:', ortWasmAsyncifyWasmUrl);
  console.log('[LayoutAnalyzer] - numThreads:', ort.env.wasm.numThreads);
}

export interface LayoutRegion {
  type: 'text' | 'heading' | 'table' | 'figure' | 'caption' | 'list';
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

export interface LayoutAnalysisProgress {
  status: string;
  progress: number;
}

/**
 * Document layout analysis using ONNX models
 * Detects regions like text, headings, tables, figures in document images
 * Uses WebGPU only (no fallback backend)
 */
export class LayoutAnalyzer {
  private session: ort.InferenceSession | null = null;
  private initialized = false;
  private modelUrl: string;
  private usedBackend: 'webgpu' | null = null;

  constructor(modelUrl: string = '/models/doclayout-yolo.onnx') {
    this.modelUrl = modelUrl;
  }

  /**
   * Initialize the layout analyzer with ONNX model
   * Initializes ONNX session with WebGPU only
   */
  async initialize(
    onProgress?: (progress: LayoutAnalysisProgress) => void
  ): Promise<void> {
    if (this.initialized) {
      return;
    }

    onProgress?.({ status: 'Loading layout analysis model...', progress: 0 });

    try {
      // Check WebGPU availability first
      const hasWebGPU = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
      const pageOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
      const expectedModelUrl = new URL(this.modelUrl, pageOrigin).toString();

      console.log('[LayoutAnalyzer] Initialize called with diagnostics:');
      console.log('[LayoutAnalyzer] - Model URL:', this.modelUrl);
      console.log('[LayoutAnalyzer] - Resolved model URL:', expectedModelUrl);
      console.log('[LayoutAnalyzer] - Current wasmPaths:', ort.env?.wasm?.wasmPaths);
      console.log('[LayoutAnalyzer] - Current wasm.numThreads:', ort.env?.wasm?.numThreads);
      console.log('[LayoutAnalyzer] - navigator.gpu present:', hasWebGPU);
      console.log('[LayoutAnalyzer] - crossOriginIsolated:', typeof window !== 'undefined' ? window.crossOriginIsolated : 'unknown');
      
      if (!hasWebGPU) {
        throw new Error('WebGPU is not available in this browser. AI Scientific mode requires WebGPU and does not allow fallback.');
      }

      console.log('[LayoutAnalyzer] WebGPU detected, attempting initialization...');
      onProgress?.({ status: 'Initializing WebGPU backend...', progress: 20 });
      
      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      };

      console.log('[LayoutAnalyzer] - Session options:', sessionOptions);
      
      this.session = await ort.InferenceSession.create(this.modelUrl, sessionOptions);
      this.usedBackend = 'webgpu';
      console.log('[LayoutAnalyzer] ✓ Model loaded successfully with WebGPU acceleration');
      console.log('[LayoutAnalyzer]   Backend: WebGPU (JSEP)');
      this.initialized = true;
      onProgress?.({ status: 'Layout analysis model ready (WebGPU)', progress: 100 });
    } catch (error) {
      console.error('[LayoutAnalyzer] ✗ Failed to load model:', error);
      
      // Provide more helpful error messages
      let errorMessage = 'Failed to load layout analysis model. ';
      if (error instanceof Error) {
        errorMessage += 'WebGPU initialization failed (fallback disabled). ';
        errorMessage += `Error: ${error.message}`;
      } else {
        errorMessage += 'Unknown error occurred.';
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Get which backend is being used
   */
  getUsedBackend(): 'webgpu' | null {
    return this.usedBackend;
  }

  /**
   * Analyze document image to detect layout regions
   */
  async analyze(imageData: ImageData): Promise<LayoutRegion[]> {
    if (!this.session) {
      throw new Error('Layout analyzer not initialized. Call initialize() first.');
    }

    // Preprocess image for model
    const { tensor: inputTensor, params } = this.preprocessImage(imageData);

    // Run inference
    const results = await this.session.run({ images: inputTensor });

    // Post-process results to get bounding boxes
    return this.postprocessResults(results, params);
  }

  /**
   * Preprocess image data for ONNX model input
   */
  private preprocessImage(imageData: ImageData): { 
    tensor: ort.Tensor; 
    params: { 
      scale: number; 
      offsetX: number; 
      offsetY: number; 
      targetSize: number; 
      originalWidth: number; 
      originalHeight: number 
    } 
  } {
    const { width, height } = imageData;
    const targetSize = 640;
    
    const scale = Math.min(targetSize / width, targetSize / height);
    const newWidth = Math.round(width * scale);
    const newHeight = Math.round(height * scale);
    
    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = width;
    originalCanvas.height = height;
    originalCanvas.getContext('2d')!.putImageData(imageData, 0, 0);
    
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = newWidth;
    resizedCanvas.height = newHeight;
    resizedCanvas.getContext('2d')!.drawImage(originalCanvas, 0, 0, newWidth, newHeight);
    
    const paddedCanvas = document.createElement('canvas');
    paddedCanvas.width = targetSize;
    paddedCanvas.height = targetSize;
    const paddedCtx = paddedCanvas.getContext('2d')!;
    
    paddedCtx.fillStyle = 'rgb(127, 127, 127)';
    paddedCtx.fillRect(0, 0, targetSize, targetSize);
    
    const offsetX = (targetSize - newWidth) / 2;
    const offsetY = (targetSize - newHeight) / 2;
    paddedCtx.drawImage(resizedCanvas, offsetX, offsetY);
    
    const paddedImageData = paddedCtx.getImageData(0, 0, targetSize, targetSize);
    const paddedData = paddedImageData.data;
    
    const float32Data = new Float32Array(3 * targetSize * targetSize);

    for (let i = 0; i < targetSize * targetSize; i++) {
      float32Data[i] = paddedData[i * 4] / 255.0;
      float32Data[targetSize * targetSize + i] = paddedData[i * 4 + 1] / 255.0;
      float32Data[2 * targetSize * targetSize + i] = paddedData[i * 4 + 2] / 255.0;
    }

    return {
      tensor: new ort.Tensor('float32', float32Data, [1, 3, targetSize, targetSize]),
      params: { scale, offsetX, offsetY, targetSize, originalWidth: width, originalHeight: height }
    };
  }

  /**
   * Post-process model output to extract regions
   */
  private postprocessResults(
    results: ort.InferenceSession.OnnxValueMapType,
    params: { scale: number; offsetX: number; offsetY: number; targetSize: number; originalWidth: number; originalHeight: number }
  ): LayoutRegion[] {
    const regions: LayoutRegion[] = [];
    const { scale, offsetX, offsetY, originalWidth, originalHeight } = params;

    // Log available output tensor names for debugging
    console.log('[LayoutAnalyzer] Available output tensor names:', Object.keys(results));
    console.log('[LayoutAnalyzer] Output tensor details:', results);

    const outputTensor = results.output || results.detections || results.output0 || Object.values(results)[0];
    
    if (!outputTensor) {
      console.error('[LayoutAnalyzer] No valid output tensor found in results');
      return regions;
    }

    const outputData = outputTensor.data as Float32Array;
    const outputDims = outputTensor.dims;
    console.log('[LayoutAnalyzer] Output tensor dimensions:', outputDims);
    console.log('[LayoutAnalyzer] Output tensor data length:', outputData.length);

    const numDetections = outputDims[1] || 0;
    const detectionSize = outputDims[2] || 6;

    for (let i = 0; i < numDetections; i++) {
      const offset = i * detectionSize;
      let x1 = outputData[offset];
      let y1 = outputData[offset + 1];
      let x2 = outputData[offset + 2];
      let y2 = outputData[offset + 3];
      const confidence = outputData[offset + 4];
      const classId = Math.round(outputData[offset + 5]);

      if (confidence < 0.3) {
        continue;
      }

      x1 -= offsetX;
      y1 -= offsetY;
      x2 -= offsetX;
      y2 -= offsetY;
      
      x1 /= scale;
      y1 /= scale;
      x2 /= scale;
      y2 /= scale;
      
      x1 = Math.max(0, Math.min(x1, originalWidth));
      y1 = Math.max(0, Math.min(y1, originalHeight));
      x2 = Math.max(0, Math.min(x2, originalWidth));
      y2 = Math.max(0, Math.min(y2, originalHeight));

      const type = this.classIdToType(classId);

      regions.push({
        type,
        bbox: {
          x: x1,
          y: y1,
          width: x2 - x1,
          height: y2 - y1,
        },
        confidence,
      });
    }

    return this.applyNMS(regions, 0.5);
  }

  private classIdToType(classId: number): LayoutRegion['type'] {
    const classMap: Record<number, LayoutRegion['type']> = {
      0: 'text',
      1: 'heading',
      2: 'table',
      3: 'figure',
      4: 'caption',
      5: 'list',
    };

    const result = classMap[classId] || 'text';
    console.log(`[LayoutAnalyzer] Class ID ${classId} mapped to type: ${result}`);
    return result;
  }

  private applyNMS(regions: LayoutRegion[], iouThreshold: number): LayoutRegion[] {
    if (regions.length === 0) {
      return [];
    }

    const sorted = [...regions].sort((a, b) => b.confidence - a.confidence);
    const selected: LayoutRegion[] = [];

    while (sorted.length > 0) {
      const current = sorted.shift()!;
      selected.push(current);

      for (let i = sorted.length - 1; i >= 0; i--) {
        const iou = this.calculateIoU(current.bbox, sorted[i].bbox);
        if (iou > iouThreshold) {
          sorted.splice(i, 1);
        }
      }
    }

    return selected;
  }

  private calculateIoU(
    box1: { x: number; y: number; width: number; height: number },
    box2: { x: number; y: number; width: number; height: number }
  ): number {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const box1Area = box1.width * box1.height;
    const box2Area = box2.width * box2.height;
    const unionArea = box1Area + box2Area - intersectionArea;

    return unionArea > 0 ? intersectionArea / unionArea : 0;
  }

  isInitialized(): boolean {
    return this.initialized && this.session !== null;
  }

  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
      this.initialized = false;
    }
  }
}

let sharedAnalyzer: LayoutAnalyzer | null = null;

export function getSharedLayoutAnalyzer(modelUrl?: string): LayoutAnalyzer {
  if (!sharedAnalyzer) {
    sharedAnalyzer = new LayoutAnalyzer(modelUrl);
  }
  return sharedAnalyzer;
}

export async function terminateSharedLayoutAnalyzer(): Promise<void> {
  if (sharedAnalyzer) {
    await sharedAnalyzer.dispose();
    sharedAnalyzer = null;
  }
}
