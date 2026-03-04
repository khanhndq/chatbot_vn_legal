// Provider-agnostic LLM types

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  toolCalls?: LLMToolCall[];
}

export interface LLMToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface LLMTool {
  type: 'function';
  function: LLMToolFunction;
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMToolResult {
  tool_call_id: string;
  result: string;
}

export type LLMToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  maxToolCalls?: number;
}

export type LLMProviderType = 'openai' | 'claude' | 'gemini';

export interface LLMProviderConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}
