import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Wrap a promise with a timeout to prevent indefinite hanging.
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param message - Error message if timeout occurs
 * @returns The resolved value of the promise, or throws if timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), timeoutMs)
    ),
  ]);
}
