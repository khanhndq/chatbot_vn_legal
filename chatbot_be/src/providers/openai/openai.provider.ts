import OpenAI from 'openai';
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption
} from 'openai/resources/chat/completions';
import { BaseLLMProvider } from '../base-provider';
import { LLMMessage, LLMResponse, LLMTool, LLMToolCall, LLMOptions, LLMProviderConfig, LLMProviderType } from '../types';

export class OpenAIProvider extends BaseLLMProvider {
  readonly providerName: LLMProviderType = 'openai';
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(providerConfig: LLMProviderConfig) {
    super();
    if (!providerConfig.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({ apiKey: providerConfig.apiKey });
    this.model = providerConfig.model || 'gpt-4o-mini';
    this.maxTokens = providerConfig.maxTokens || 1024;
    this.temperature = providerConfig.temperature || 0.7;
    console.log(`✅ OpenAI provider initialized with model: ${this.model}`);
  }

  private toOpenAIMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
    return messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content || '',
          tool_call_id: msg.tool_call_id || '',
        };
      }
      if (msg.role === 'assistant' && msg.tool_calls) {
        return {
          role: 'assistant' as const,
          content: msg.content || null,
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        };
      }
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content || '',
      };
    });
  }

  private toOpenAITools(tools: LLMTool[]): ChatCompletionTool[] {
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  private toToolChoice(choice?: LLMOptions['toolChoice']): ChatCompletionToolChoiceOption | undefined {
    if (!choice) return 'auto';
    if (typeof choice === 'string') return choice;
    return choice;
  }

  private parseToolCalls(choice: OpenAI.Chat.Completions.ChatCompletion.Choice): LLMToolCall[] | undefined {
    return choice.message.tool_calls
      ?.filter(tc => tc.type === 'function')
      ?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: options?.model || this.model,
        messages: this.toOpenAIMessages(messages),
        max_tokens: options?.maxTokens || this.maxTokens,
        temperature: options?.temperature || this.temperature,
      });

      const choice = response.choices[0];
      return {
        content: choice.message.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        finishReason: choice.finish_reason || undefined,
      };
    } catch (error) {
      console.error('❌ OpenAI chat error:', error);
      throw error;
    }
  }

  async streamChat(
    messages: LLMMessage[],
    onChunk: (chunk: string) => void,
    options?: LLMOptions
  ): Promise<LLMResponse> {
    try {
      const stream = await this.client.chat.completions.create({
        model: options?.model || this.model,
        messages: this.toOpenAIMessages(messages),
        max_tokens: options?.maxTokens || this.maxTokens,
        temperature: options?.temperature || this.temperature,
        stream: true,
      });

      let fullContent = '';
      let finishReason: string | undefined;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }

      return { content: fullContent, finishReason };
    } catch (error) {
      console.error('❌ OpenAI stream chat error:', error);
      throw error;
    }
  }

  async chatWithTools(
    messages: LLMMessage[],
    tools: LLMTool[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: options?.model || this.model,
        messages: this.toOpenAIMessages(messages),
        tools: this.toOpenAITools(tools),
        tool_choice: this.toToolChoice(options?.toolChoice),
        max_tokens: options?.maxTokens || this.maxTokens,
        temperature: options?.temperature || this.temperature,
      });

      const choice = response.choices[0];
      return {
        content: choice.message.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        finishReason: choice.finish_reason || undefined,
        toolCalls: this.parseToolCalls(choice),
      };
    } catch (error) {
      console.error('❌ OpenAI chat with tools error:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.chat([
        { role: 'user', content: 'Hello' }
      ], { maxTokens: 5 });
      return !!response.content;
    } catch {
      return false;
    }
  }

  getConfig() {
    return { model: this.model, maxTokens: this.maxTokens, temperature: this.temperature };
  }
}
