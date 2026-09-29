import type { WorkerRequest, WorkerResponse, DistributiveOmit } from './workerMessages';

interface PendingJob {
  resolve: (response: any) => void;
  reject: (error: any) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private pendingJobs = new Map<number, PendingJob>();
  private nextRequestId = 1;
  private workerIndex = 0;
  private poolSize: number;

  constructor(size?: number) {
    const hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    this.poolSize = size ?? Math.min(hardwareConcurrency, 8);
    this.initPool();
  }

  private initPool(): void {
    try {
      for (let i = 0; i < this.poolSize; i++) {
        const worker = new Worker(new URL('./physics.worker.ts', import.meta.url), {
          type: 'module',
        });

        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          const resp = e.data;
          const job = this.pendingJobs.get(resp.id);
          if (job) {
            this.pendingJobs.delete(resp.id);
            job.resolve(resp);
          }
        };

        worker.onerror = (err) => {
          console.error('[WorkerPool] Worker runtime error:', err);
        };

        this.workers.push(worker);
      }
      console.log(`[WorkerPool] Initialized ${this.workers.length} multi-core simulation workers.`);
    } catch (err) {
      console.warn('[WorkerPool] Web Worker initialization failed (will fallback if needed):', err);
    }
  }

  public async execute<T extends WorkerResponse>(
    request: DistributiveOmit<WorkerRequest, 'id'>,
    transferables: Transferable[] = []
  ): Promise<T> {
    if (this.workers.length === 0) {
      throw new Error('No workers available in WorkerPool');
    }

    const id = this.nextRequestId++;
    const fullRequest = { ...request, id } as WorkerRequest;

    // 轮询（Round-robin）分配 Worker
    const worker = this.workers[this.workerIndex];
    this.workerIndex = (this.workerIndex + 1) % this.workers.length;

    return new Promise<T>((resolve, reject) => {
      this.pendingJobs.set(id, { resolve, reject });
      try {
        worker.postMessage(fullRequest, transferables);
      } catch (err) {
        this.pendingJobs.delete(id);
        reject(err);
      }
    });
  }

  public get size(): number {
    return this.workers.length;
  }

  public dispose(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.pendingJobs.clear();
  }
}
