import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from '../base-provider';
import { LLMMessage, LLMResponse, LLMTool, LLMToolCall, LLMOptions, LLMProviderConfig, LLMProviderType } from '../types';

export class ClaudeProvider extends BaseLLMProvider {
  readonly providerName: LLMProviderType = 'claude';
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(providerConfig: LLMProviderConfig) {
    super();
    if (!providerConfig.apiKey) {
      throw new Error('Claude API key is required');
    }
    this.client = new Anthropic({ apiKey: providerConfig.apiKey });
    this.model = providerConfig.model || 'claude-3-haiku-20240307';
    this.maxTokens = providerConfig.maxTokens || 1024;
    this.temperature = providerConfig.temperature || 0.7;
    console.log(`✅ Claude provider initialized with model: ${this.model}`);
  }

  /**
   * Extract system message from LLMMessage array.
   * Claude takes system as a separate parameter, not in the messages array.
   */
  private extractSystem(messages: LLMMessage[]): { system: string | undefined; messages: LLMMessage[] } {
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const system = systemMessages.map(m => m.content).filter(Boolean).join('\n\n') || undefined;
    return { system, messages: nonSystemMessages };
  }

  /**
   * Convert LLMMessage array to Anthropic message params.
   * Handles tool_calls (assistant) and tool results.
   */
  private toClaudeMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const content: Anthropic.ContentBlockParam[] = [];
          if (msg.content) {
            content.push({ type: 'text', text: msg.content });
          }
          for (const tc of msg.tool_calls) {
            let input: Record<string, unknown>;
            try {
              input = JSON.parse(tc.function.arguments);
            } catch {
              input = {};
            }
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input,
            });
          }
          result.push({ role: 'assistant', content });
        } else {
          result.push({ role: 'assistant', content: msg.content || '' });
        }
      } else if (msg.role === 'tool') {
        // Claude expects tool results as user messages with tool_result content blocks
        // Check if previous message is already a user message with tool_result blocks to batch
        const lastMsg = result[result.length - 1];
        const toolResultBlock: Anthropic.ToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: msg.tool_call_id || '',
          content: msg.content || '',
        };

        if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
          (lastMsg.content as Anthropic.ContentBlockParam[]).push(toolResultBlock);
        } else {
          result.push({ role: 'user', content: [toolResultBlock] });
        }
      } else if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content || '' });
      }
    }

    return result;
  }

  private toClaudeTools(tools: LLMTool[]): Anthropic.Tool[] {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: {
        type: 'object' as const,
        properties: tool.function.parameters.properties,
        required: tool.function.parameters.required,
      },
    }));
  }

  private parseToolCalls(response: Anthropic.Message): LLMToolCall[] | undefined {
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );
    if (toolUseBlocks.length === 0) return undefined;

    return toolUseBlocks.map(block => ({
      id: block.id,
      type: 'function' as const,
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input),
      },
    }));
  }

  private extractTextContent(response: Anthropic.Message): string {
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    try {
      const { system, messages: nonSystemMessages } = this.extractSystem(messages);
      const response = await this.client.messages.create({
        model: options?.model || this.model,
        max_tokens: options?.maxTokens || this.maxTokens,
        temperature: options?.temperature || this.temperature,
        system: system,
        messages: this.toClaudeMessages(nonSystemMessages),
      });

      return {
        content: this.extractTextContent(response),
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        finishReason: response.stop_reason || undefined,
      };
    } catch (error) {
      console.error('❌ Claude chat error:', error);
      throw error;
    }
  }

  async streamChat(
    messages: LLMMessage[],
    onChunk: (chunk: string) => void,
    options?: LLMOptions
  ): Promise<LLMResponse> {
    try {
      const { system, messages: nonSystemMessages } = this.extractSystem(messages);
      const stream = this.client.messages.stream({
        model: options?.model || this.model,
        max_tokens: options?.maxTokens || this.maxTokens,
        temperature: options?.temperature || this.temperature,
        system: system,
        messages: this.toClaudeMessages(nonSystemMessages),
      });

      let fullContent = '';

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          if (text) {
            fullContent += text;
            onChunk(text);
          }
        }
      }

      const finalMessage = await stream.finalMessage();
      return {
        content: fullContent,
        usage: {
          promptTokens: finalMessage.usage.input_tokens,
          completionTokens: finalMessage.usage.output_tokens,
          totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
        },
        finishReason: finalMessage.stop_reason || undefined,
      };
    } catch (error) {
      console.error('❌ Claude stream chat error:', error);
      throw error;
    }
  }

  async chatWithTools(
    messages: LLMMessage[],
    tools: LLMTool[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    try {
      const { system, messages: nonSystemMessages } = this.extractSystem(messages);
      const claudeTools = this.toClaudeTools(tools);

      const createParams: Anthropic.MessageCreateParams = {
        model: options?.model || this.model,
        max_tokens: options?.maxTokens || this.maxTokens,
        temperature: options?.temperature || this.temperature,
        system: system,
        messages: this.toClaudeMessages(nonSystemMessages),
        tools: claudeTools,
      };

      // Map tool choice
      if (options?.toolChoice === 'required') {
        createParams.tool_choice = { type: 'any' };
      } else if (options?.toolChoice === 'none') {
        // Don't send tools if none
        delete createParams.tools;
      } else if (options?.toolChoice === 'auto') {
        createParams.tool_choice = { type: 'auto' };
      }

      const response = await this.client.messages.create(createParams);

      return {
        content: this.extractTextContent(response),
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        finishReason: response.stop_reason || undefined,
        toolCalls: this.parseToolCalls(response),
      };
    } catch (error) {
      console.error('❌ Claude chat with tools error:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.chat([
        { role: 'user', content: 'Hello' }
      ], { maxTokens: 10 });
      return !!response.content;
    } catch {
      return false;
    }
  }

  getConfig() {
    return { model: this.model, maxTokens: this.maxTokens, temperature: this.temperature };
  }
}
