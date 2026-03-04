import { ILLMProvider } from './llm-provider.interface';
import { LLMMessage, LLMResponse, LLMTool, LLMToolExecutor, LLMOptions, LLMProviderType } from './types';

export abstract class BaseLLMProvider implements ILLMProvider {
  abstract readonly providerName: LLMProviderType;

  abstract chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;

  abstract streamChat(
    messages: LLMMessage[],
    onChunk: (chunk: string) => void,
    options?: LLMOptions
  ): Promise<LLMResponse>;

  abstract chatWithTools(
    messages: LLMMessage[],
    tools: LLMTool[],
    options?: LLMOptions
  ): Promise<LLMResponse>;

  abstract testConnection(): Promise<boolean>;

  abstract getConfig(): { model: string; maxTokens: number; temperature: number };

  /**
   * Run a complete tool-calling loop until the model produces a final response.
   * Shared across all providers - only chatWithTools() is provider-specific.
   */
  async runWithTools(
    messages: LLMMessage[],
    tools: LLMTool[],
    toolExecutor: LLMToolExecutor,
    options?: LLMOptions
  ): Promise<LLMResponse> {
    const maxIterations = options?.maxToolCalls || 10;
    let currentMessages = [...messages];
    let iteration = 0;
    let hasExecutedTools = false;

    while (iteration < maxIterations) {
      iteration++;
      console.log(`🔧 [${this.providerName}] Tool call iteration ${iteration}/${maxIterations}`);

      const effectiveToolChoice = (options?.toolChoice === 'required' && hasExecutedTools)
        ? 'auto'
        : options?.toolChoice;

      const response = await this.chatWithTools(currentMessages, tools, {
        ...options,
        toolChoice: effectiveToolChoice,
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        console.log(`✅ [${this.providerName}] Tool execution complete, returning final response`);
        return response;
      }

      // Add assistant message with tool calls
      currentMessages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.toolCalls,
      });

      // Execute each tool call and add results
      for (const toolCall of response.toolCalls) {
        try {
          console.log(`🔧 [${this.providerName}] Executing tool: ${toolCall.function.name}`);
          const args = JSON.parse(toolCall.function.arguments);
          const result = await toolExecutor(toolCall.function.name, args);

          currentMessages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          });

          console.log(`✅ [${this.providerName}] Tool ${toolCall.function.name} executed successfully`);
          hasExecutedTools = true;
        } catch (error) {
          console.error(`❌ [${this.providerName}] Tool ${toolCall.function.name} failed:`, error);
          currentMessages.push({
            role: 'tool',
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            tool_call_id: toolCall.id,
          });
          hasExecutedTools = true;
        }
      }
    }

    // If we've exhausted iterations but have tool results, make one final call
    if (hasExecutedTools) {
      console.log(`🔧 [${this.providerName}] Max iterations reached, forcing final text response`);
      const finalResponse = await this.chatWithTools(currentMessages, tools, {
        ...options,
        toolChoice: 'none',
      });
      return finalResponse;
    }

    throw new Error(`Maximum tool call iterations (${maxIterations}) exceeded`);
  }

  /**
   * Stream chat with tools - runs tool calls silently, then streams the final response.
   * Shared across all providers.
   */
  async streamChatWithTools(
    messages: LLMMessage[],
    tools: LLMTool[],
    toolExecutor: LLMToolExecutor,
    onChunk: (chunk: string) => void,
    options?: LLMOptions
  ): Promise<LLMResponse> {
    const maxIterations = options?.maxToolCalls || 10;
    let currentMessages = [...messages];
    let iteration = 0;
    let hasExecutedTools = false;

    // Run tool calls until no more tool calls are requested
    while (iteration < maxIterations) {
      iteration++;

      const effectiveToolChoice = (options?.toolChoice === 'required' && hasExecutedTools)
        ? 'auto'
        : options?.toolChoice;

      const response = await this.chatWithTools(currentMessages, tools, {
        ...options,
        toolChoice: effectiveToolChoice,
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      currentMessages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await toolExecutor(toolCall.function.name, args);
          currentMessages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          });
          hasExecutedTools = true;
        } catch (error) {
          currentMessages.push({
            role: 'tool',
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            tool_call_id: toolCall.id,
          });
          hasExecutedTools = true;
        }
      }
    }

    // Stream the final response
    return this.streamChat(currentMessages, onChunk, options);
  }
}
