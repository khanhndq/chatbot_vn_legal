import { LLMProviderType } from './types';
import { ILLMProvider } from './llm-provider.interface';
import { OpenAIProvider } from './openai/openai.provider';
import { ClaudeProvider } from './claude/claude.provider';
import { GeminiProvider } from './gemini/gemini.provider';
import { config } from '../common/config';

export class LLMFactory {
  private static providers: Map<string, ILLMProvider> = new Map();

  /**
   * Get or create an LLM provider instance.
   * Caches instances by provider type to avoid re-initialization.
   */
  static getProvider(providerType?: LLMProviderType): ILLMProvider {
    const type = providerType || config.llm.defaultProvider;

    if (this.providers.has(type)) {
      return this.providers.get(type)!;
    }

    const provider = this.createProvider(type);
    this.providers.set(type, provider);
    return provider;
  }

  private static createProvider(type: LLMProviderType): ILLMProvider {
    switch (type) {
      case 'openai':
        return new OpenAIProvider({
          apiKey: config.openai.apiKey,
          model: config.openai.model,
          maxTokens: config.openai.maxTokens,
          temperature: config.openai.temperature,
        });
      case 'claude':
        return new ClaudeProvider({
          apiKey: config.claude.apiKey,
          model: config.claude.model,
          maxTokens: config.claude.maxTokens,
          temperature: config.claude.temperature,
        });
      case 'gemini':
        return new GeminiProvider({
          apiKey: config.gemini.apiKey,
          model: config.gemini.model,
          maxTokens: config.gemini.maxTokens,
          temperature: config.gemini.temperature,
        });
      default:
        throw new Error(`Unsupported LLM provider: ${type}`);
    }
  }

  /** Get list of available (configured) providers */
  static getAvailableProviders(): LLMProviderType[] {
    const available: LLMProviderType[] = [];
    if (config.openai.apiKey) available.push('openai');
    if (config.claude.apiKey) available.push('claude');
    if (config.gemini.apiKey) available.push('gemini');
    return available;
  }

  /** Clear cached providers (useful for testing) */
  static clearCache(): void {
    this.providers.clear();
  }
}
