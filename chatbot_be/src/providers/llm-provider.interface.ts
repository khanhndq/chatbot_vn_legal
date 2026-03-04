import { LLMMessage, LLMResponse, LLMTool, LLMToolExecutor, LLMOptions, LLMProviderType } from './types';

export interface ILLMProvider {
  readonly providerName: LLMProviderType;

  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;

  streamChat(
    messages: LLMMessage[],
    onChunk: (chunk: string) => void,
    options?: LLMOptions
  ): Promise<LLMResponse>;

  chatWithTools(
    messages: LLMMessage[],
    tools: LLMTool[],
    options?: LLMOptions
  ): Promise<LLMResponse>;

  runWithTools(
    messages: LLMMessage[],
    tools: LLMTool[],
    toolExecutor: LLMToolExecutor,
    options?: LLMOptions
  ): Promise<LLMResponse>;

  streamChatWithTools(
    messages: LLMMessage[],
    tools: LLMTool[],
    toolExecutor: LLMToolExecutor,
    onChunk: (chunk: string) => void,
    options?: LLMOptions
  ): Promise<LLMResponse>;

  testConnection(): Promise<boolean>;

  getConfig(): { model: string; maxTokens: number; temperature: number };
}
