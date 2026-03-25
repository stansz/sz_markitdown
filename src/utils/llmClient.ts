import type { LLMClient } from '../core/types';

/**
 * Placeholder LLM client for future image description and audio transcription
 * This will be implemented in future versions
 */
export class PlaceholderLLMClient implements LLMClient {
  async describeImage(_imageData: ArrayBuffer): Promise<string> {
    throw new Error(
      'LLM client not configured. Image description is not available in this version.'
    );
  }

  async transcribeAudio(_audioData: ArrayBuffer): Promise<string> {
    throw new Error(
      'LLM client not configured. Audio transcription is not available in this version.'
    );
  }
}

/**
 * Factory function to create an LLM client
 * Can be extended to support different LLM providers
 */
export function createLLMClient(_options?: {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}): LLMClient {
  // For now, return a placeholder
  // In the future, this could return a real client like OpenAI
  return new PlaceholderLLMClient();
}
