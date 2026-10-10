import type { NormalizedLandmark } from './types.ts';

export interface HandTrackingResult {
  landmarks: NormalizedLandmark[][];
  handedness: { categoryName: string; score: number }[][];
}

export interface VideoHandDetector {
  detectForVideo(image: ImageBitmap, timestamp: number): HandTrackingResult;
  close(): void;
}

/** Keep both VIDEO graphs alive: setOptions rebuilds the graph and loses tracking. */
export class HandTrackingPipeline {
  private trackingBoth = false;
  private nextDiscoveryAt = -Infinity;
  private single: VideoHandDetector;
  private dual: VideoHandDetector | null;
  private discoveryIntervalMs: number;

  constructor(
    single: VideoHandDetector,
    dual: VideoHandDetector | null,
    discoveryIntervalMs = 200,
  ) {
    this.single = single;
    this.dual = dual;
    this.discoveryIntervalMs = discoveryIntervalMs;
  }

  public detectForVideo(image: ImageBitmap, timestamp: number): HandTrackingResult {
    if (this.dual && (this.trackingBoth || timestamp >= this.nextDiscoveryAt)) {
      const result = this.dual.detectForVideo(image, timestamp);
      this.trackingBoth = result.landmarks.length >= 2;
      this.nextDiscoveryAt = timestamp + this.discoveryIntervalMs;
      return result;
    }
    return this.single.detectForVideo(image, timestamp);
  }

  public close(): void {
    try {
      this.single.close();
    } finally {
      this.dual?.close();
    }
  }
}
