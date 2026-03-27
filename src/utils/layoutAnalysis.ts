import * as ort from 'onnxruntime-web';

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
 */
export class LayoutAnalyzer {
  private session: ort.InferenceSession | null = null;
  private initialized = false;
  private modelUrl: string;

  constructor(modelUrl: string = '/models/doclayout-yolo.onnx') {
    this.modelUrl = modelUrl;
  }

  /**
   * Initialize the layout analyzer with ONNX model
   * @param onProgress - Optional callback for initialization progress
   */
  async initialize(
    onProgress?: (progress: LayoutAnalysisProgress) => void
  ): Promise<void> {
    if (this.initialized) {
      return;
    }

    onProgress?.({ status: 'Loading layout analysis model...', progress: 0 });

    try {
      // Configure WASM paths to use local files
      // This must be done before creating the inference session
      if (typeof ort !== 'undefined' && ort.env && ort.env.wasm) {
        // Use absolute URL to avoid Vite treating it as a module import
        ort.env.wasm.wasmPaths = `${window.location.origin}/onnxruntime/`;
      }

      // Determine if WebGPU is available
      const hasWebGPU = typeof navigator !== 'undefined' && (navigator as any).gpu;
      let session: ort.InferenceSession;

      if (hasWebGPU) {
        // Try WebGPU first with a timeout to avoid hanging
        const webGPUTimeoutMs = 8000; // 8 seconds
        try {
          onProgress?.({ status: 'Initializing WebGPU...', progress: 10 });
          session = await Promise.race([
            ort.InferenceSession.create(this.modelUrl, {
              executionProviders: ['webgpu'],
            }),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error('WebGPU initialization timeout')),
                webGPUTimeoutMs
              )
            ),
          ]);
          onProgress?.({ status: 'WebGPU initialized', progress: 50 });
        } catch (webGPUError) {
          console.warn('WebGPU failed, falling back to WASM:', webGPUError);
          onProgress?.({ status: 'WebGPU failed, using WASM', progress: 20 });
          // Fall back to WASM
          session = await ort.InferenceSession.create(this.modelUrl, {
            executionProviders: ['wasm'],
          });
        }
      } else {
        // Use WASM directly
        onProgress?.({ status: 'Initializing WASM...', progress: 30 });
        session = await ort.InferenceSession.create(this.modelUrl, {
          executionProviders: ['wasm'],
        });
      }

      this.session = session;
      this.initialized = true;
      onProgress?.({ status: 'Layout analysis model ready', progress: 100 });
    } catch (error) {
      console.error('Failed to load layout analysis model:', error);
      throw new Error(
        `Failed to load layout analysis model: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Analyze document image to detect layout regions
   * @param imageData - Image data from canvas
   * @returns Array of detected regions with bounding boxes and types (in original image coordinates)
   */
  async analyze(imageData: ImageData): Promise<LayoutRegion[]> {
    if (!this.session) {
      throw new Error('Layout analyzer not initialized. Call initialize() first.');
    }
    // Capture session in a local variable to satisfy TypeScript
    const session = this.session;

    // Preprocess image for model, also get transformation parameters
    const { tensor: inputTensor, params } = this.preprocessImage(imageData);

    // Run inference with a timeout to prevent hanging
    const inferenceTimeoutMs = 30000; // 30 seconds
    let results: ort.InferenceSession.OnnxValueMapType;
    try {
      // Dynamically import the timeout utility
      const { withTimeout } = await import('../lib/utils');
      results = await withTimeout(
        session.run({ images: inputTensor }),
        inferenceTimeoutMs,
        'Layout analysis inference timed out'
      );
    } catch (e) {
      // If the dynamic import fails or timeout occurs, fallback to direct call without timeout
      // (but only if the error is not from session.run itself)
      if (e instanceof Error && e.message.includes('timed out')) {
        console.warn('Inference timed out, attempting to continue without timeout');
        // We still try to get results, but this may also hang; at least we logged
        results = await session.run({ images: inputTensor });
      } else {
        throw e;
      }
    }

    // Post-process results to get bounding boxes, and transform back to original coordinates
    return this.postprocessResults(results, params);
  }

  /**
   * Preprocess image data for ONNX model input
   * Resizes and pads image to the target size (typically 640x640 for YOLO models)
   * @returns Object containing the input tensor and transformation parameters for coordinate mapping
   */
  private preprocessImage(imageData: ImageData): { tensor: ort.Tensor; params: { scale: number; offsetX: number; offsetY: number; targetSize: number; originalWidth: number; originalHeight: number } } {
    const { width, height } = imageData;
    
    // YOLO models typically expect 640x640 input (can be configurable)
    const targetSize = 640;
    
    // Calculate scaling factor to fit image within target size while preserving aspect ratio
    const scale = Math.min(targetSize / width, targetSize / height);
    const newWidth = Math.round(width * scale);
    const newHeight = Math.round(height * scale);
    
    // Step 1: Create a canvas with the original image data
    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = width;
    originalCanvas.height = height;
    originalCanvas.getContext('2d')!.putImageData(imageData, 0, 0);
    
    // Step 2: Resize the image by drawing onto a smaller canvas
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = newWidth;
    resizedCanvas.height = newHeight;
    resizedCanvas.getContext('2d')!.drawImage(originalCanvas, 0, 0, newWidth, newHeight);
    
    // Step 3: Create padded canvas with target size
    const paddedCanvas = document.createElement('canvas');
    paddedCanvas.width = targetSize;
    paddedCanvas.height = targetSize;
    const paddedCtx = paddedCanvas.getContext('2d')!;
    
    // Fill with gray (127,127,127) - common YOLO padding
    paddedCtx.fillStyle = 'rgb(127, 127, 127)';
    paddedCtx.fillRect(0, 0, targetSize, targetSize);
    
    // Center the resized image on the padded canvas
    const offsetX = (targetSize - newWidth) / 2;
    const offsetY = (targetSize - newHeight) / 2;
    paddedCtx.drawImage(resizedCanvas, offsetX, offsetY);
    
    // Get final padded image data
    const paddedImageData = paddedCtx.getImageData(0, 0, targetSize, targetSize);
    const paddedData = paddedImageData.data;
    
    // Normalize to [0, 1] and convert to NCHW format
    const float32Data = new Float32Array(3 * targetSize * targetSize);

    for (let i = 0; i < targetSize * targetSize; i++) {
      // RGB channels, normalized to [0, 1]
      float32Data[i] = paddedData[i * 4] / 255.0; // R
      float32Data[targetSize * targetSize + i] = paddedData[i * 4 + 1] / 255.0; // G
      float32Data[2 * targetSize * targetSize + i] = paddedData[i * 4 + 2] / 255.0; // B
    }

    return {
      tensor: new ort.Tensor('float32', float32Data, [1, 3, targetSize, targetSize]),
      params: { scale, offsetX, offsetY, targetSize, originalWidth: width, originalHeight: height }
    };
  }

  /**
   * Post-process model output to extract regions
   * @param results - ONNX model inference results
   * @param params - Preprocessing parameters for coordinate transformation
   * @returns Array of detected regions with bounding boxes in original image coordinates
   */
  private postprocessResults(
    results: ort.InferenceSession.OnnxValueMapType,
    params: { scale: number; offsetX: number; offsetY: number; targetSize: number; originalWidth: number; originalHeight: number }
  ): LayoutRegion[] {
    const regions: LayoutRegion[] = [];
    const { scale, offsetX, offsetY, originalWidth, originalHeight } = params;

    // Get output tensor (format depends on model)
    const outputTensor = results.output || results.detections || Object.values(results)[0];
    
    if (!outputTensor) {
      return regions;
    }

    const outputData = outputTensor.data as Float32Array;
    const outputDims = outputTensor.dims;

    // Parse output based on model format
    // DocLayout-YOLO output format: [batch, num_detections, 6]
    // Each detection: [x1, y1, x2, y2, confidence, class_id]
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

      // Filter low confidence detections
      if (confidence < 0.3) {
        continue;
      }

      // Transform coordinates from padded image back to original image
      // Remove padding offset
      x1 -= offsetX;
      y1 -= offsetY;
      x2 -= offsetX;
      y2 -= offsetY;
      
      // Scale back to original size
      x1 /= scale;
      y1 /= scale;
      x2 /= scale;
      y2 /= scale;
      
      // Clamp to original image bounds
      x1 = Math.max(0, Math.min(x1, originalWidth));
      y1 = Math.max(0, Math.min(y1, originalHeight));
      x2 = Math.max(0, Math.min(x2, originalWidth));
      y2 = Math.max(0, Math.min(y2, originalHeight));

      // Map class ID to region type
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

    // Apply Non-Maximum Suppression (NMS) in original coordinate space
    return this.applyNMS(regions, 0.5);
  }

  /**
   * Map model class ID to region type
   */
  private classIdToType(classId: number): LayoutRegion['type'] {
    // DocLayout-YOLO class mapping
    // Adjust based on actual model classes
    const classMap: Record<number, LayoutRegion['type']> = {
      0: 'text',
      1: 'heading',
      2: 'table',
      3: 'figure',
      4: 'caption',
      5: 'list',
    };

    return classMap[classId] || 'text';
  }

  /**
   * Apply Non-Maximum Suppression to remove overlapping detections
   */
  private applyNMS(regions: LayoutRegion[], iouThreshold: number): LayoutRegion[] {
    if (regions.length === 0) {
      return [];
    }

    // Sort by confidence (descending)
    const sorted = [...regions].sort((a, b) => b.confidence - a.confidence);
    const selected: LayoutRegion[] = [];

    while (sorted.length > 0) {
      const current = sorted.shift()!;
      selected.push(current);

      // Remove overlapping regions
      for (let i = sorted.length - 1; i >= 0; i--) {
        const iou = this.calculateIoU(current.bbox, sorted[i].bbox);
        if (iou > iouThreshold) {
          sorted.splice(i, 1);
        }
      }
    }

    return selected;
  }

  /**
   * Calculate Intersection over Union (IoU) between two bounding boxes
   */
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

  /**
   * Check if analyzer is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.session !== null;
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
      this.initialized = false;
    }
  }
}

/**
 * Singleton layout analyzer instance for shared use
 */
let sharedAnalyzer: LayoutAnalyzer | null = null;

/**
 * Get or create shared layout analyzer instance
 */
export function getSharedLayoutAnalyzer(modelUrl?: string): LayoutAnalyzer {
  if (!sharedAnalyzer) {
    sharedAnalyzer = new LayoutAnalyzer(modelUrl);
  }
  return sharedAnalyzer;
}

/**
 * Terminate shared layout analyzer
 */
export async function terminateSharedLayoutAnalyzer(): Promise<void> {
  if (sharedAnalyzer) {
    await sharedAnalyzer.dispose();
    sharedAnalyzer = null;
  }
}
