export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** ISO-8601 timestamp string. */
export type ISODate = string;

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export type WorkflowStatus =
  | 'idle'
  | 'validating'
  | 'loading'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled';

export interface AppError {
  code: string;
  message: string;
  /** Technical details safe to show in a diagnostics panel (never secrets). */
  details?: string;
  recoverable?: boolean;
}
