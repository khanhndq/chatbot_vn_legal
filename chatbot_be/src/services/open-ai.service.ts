import OpenAI from 'openai';
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption
} from 'openai/resources/chat/completions';
import { config } from '../common/config';

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// Simple message type for basic usage
export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Re-export OpenAI's native type for advanced usage
export type OpenAIMessage = ChatCompletionMessageParam;

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  toolCalls?: ToolCall[];
}

// Tool/Function definitions
export interface ToolFunction {
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

export interface Tool {
  type: 'function';
  function: ToolFunction;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  result: string;
}

// Tool execution handler type
export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

export interface ChatWithToolsOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  maxToolCalls?: number; // Maximum iterations of tool calls (default: 10)
}

export class OpenAIService {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(serviceConfig?: Partial<OpenAIConfig>) {
    const apiKey = serviceConfig?.apiKey || config.openai.apiKey;

    if (!apiKey) {
      throw new Error('❌ OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass it in config.');
    }

    this.client = new OpenAI({ apiKey });
    this.model = serviceConfig?.model || config.openai.model;
    this.maxTokens = serviceConfig?.maxTokens || config.openai.maxTokens;
    this.temperature = serviceConfig?.temperature || config.openai.temperature;

    console.log(`✅ OpenAI service initialized with model: ${this.model}`);
  }

  async chat(messages: ChatCompletionMessage[], options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<ChatCompletionResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: options?.model || this.model,
        messages: messages,
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
      console.error('❌ OpenAI chat completion error:', error);
      throw error;
    }
  }

  async sendMessage(userMessage: string, systemPrompt?: string, conversationHistory?: ChatCompletionMessage[]): Promise<string> {
    const messages: ChatCompletionMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (conversationHistory) {
      messages.push(...conversationHistory);
    }

    messages.push({ role: 'user', content: userMessage });

    const response = await this.chat(messages);
    return response.content;
  }

  async streamChat(
    messages: ChatCompletionMessage[],
    onChunk: (chunk: string) => void,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<ChatCompletionResponse> {
    try {
      const stream = await this.client.chat.completions.create({
        model: options?.model || this.model,
        messages: messages,
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

      return {
        content: fullContent,
        finishReason,
      };
    } catch (error) {
      console.error('❌ OpenAI stream chat error:', error);
      throw error;
    }
  }

  /**
   * Chat with tools - single call that may return tool calls
   */
  async chatWithTools(
    messages: ChatCompletionMessageParam[],
    tools: Tool[],
    options?: ChatWithToolsOptions
  ): Promise<ChatCompletionResponse> {
    try {
      const openAITools: ChatCompletionTool[] = tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      }));

      const toolChoice: ChatCompletionToolChoiceOption | undefined =
        options?.toolChoice === 'auto' ? 'auto' :
        options?.toolChoice === 'none' ? 'none' :
        options?.toolChoice === 'required' ? 'required' :
        options?.toolChoice && typeof options.toolChoice === 'object' ? options.toolChoice :
        'auto';

      const response = await this.client.chat.completions.create({
        model: options?.model || this.model,
        messages: messages,
        tools: openAITools,
        tool_choice: toolChoice,
        max_tokens: options?.maxTokens || this.maxTokens,
        temperature: options?.temperature || this.temperature,
      });

      const choice = response.choices[0];
      const toolCalls: ToolCall[] | undefined = choice.message.tool_calls
        ?.filter(tc => tc.type === 'function')
        ?.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: (tc as { type: 'function'; function: { name: string; arguments: string } }).function.name,
            arguments: (tc as { type: 'function'; function: { name: string; arguments: string } }).function.arguments,
          },
        }));

      return {
        content: choice.message.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        finishReason: choice.finish_reason || undefined,
        toolCalls,
      };
    } catch (error) {
      console.error('❌ OpenAI chat with tools error:', error);
      throw error;
    }
  }

  /**
   * Run a complete tool-calling loop until the model produces a final response
   */
  async runWithTools(
    messages: ChatCompletionMessageParam[],
    tools: Tool[],
    toolExecutor: ToolExecutor,
    options?: ChatWithToolsOptions
  ): Promise<ChatCompletionResponse> {
    const maxIterations = options?.maxToolCalls || 10;
    let currentMessages = [...messages];
    let iteration = 0;
    let hasExecutedTools = false;

    while (iteration < maxIterations) {
      iteration++;
      console.log(`🔧 Tool call iteration ${iteration}/${maxIterations}`);

      // For 'required' tool choice: use it only on first call, then switch to 'auto'
      // This ensures at least one tool call, then allows normal flow
      const effectiveToolChoice = (options?.toolChoice === 'required' && hasExecutedTools)
        ? 'auto'
        : options?.toolChoice;

      const response = await this.chatWithTools(currentMessages, tools, {
        ...options,
        toolChoice: effectiveToolChoice,
      });

      // If no tool calls, we have the final response
      if (!response.toolCalls || response.toolCalls.length === 0) {
        console.log('✅ Tool execution complete, returning final response');
        return response;
      }

      // Add assistant message with tool calls
      currentMessages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      });

      // Execute each tool call and add results
      for (const toolCall of response.toolCalls) {
        try {
          console.log(`🔧 Executing tool: ${toolCall.function.name}`);
          const args = JSON.parse(toolCall.function.arguments);
          const result = await toolExecutor(toolCall.function.name, args);

          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });

          console.log(`✅ Tool ${toolCall.function.name} executed successfully`);
          hasExecutedTools = true;
        } catch (error) {
          console.error(`❌ Tool ${toolCall.function.name} failed:`, error);
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          });
          hasExecutedTools = true;
        }
      }
    }

    // If we've exhausted iterations but have tool results, make one final call with 'none' to get text response
    if (hasExecutedTools) {
      console.log('🔧 Max iterations reached, forcing final text response');
      const finalResponse = await this.chatWithTools(currentMessages, tools, {
        ...options,
        toolChoice: 'none',
      });
      return finalResponse;
    }

    throw new Error(`Maximum tool call iterations (${maxIterations}) exceeded`);
  }

  /**
   * Stream chat with tools - streams the final response after tool execution
   */
  async streamChatWithTools(
    messages: ChatCompletionMessageParam[],
    tools: Tool[],
    toolExecutor: ToolExecutor,
    onChunk: (chunk: string) => void,
    options?: ChatWithToolsOptions
  ): Promise<ChatCompletionResponse> {
    const maxIterations = options?.maxToolCalls || 10;
    let currentMessages = [...messages];
    let iteration = 0;
    let hasExecutedTools = false;

    // First, run tool calls until we get a response without tool calls
    while (iteration < maxIterations) {
      iteration++;

      // For 'required' tool choice: use it only on first call, then switch to 'auto'
      const effectiveToolChoice = (options?.toolChoice === 'required' && hasExecutedTools)
        ? 'auto'
        : options?.toolChoice;

      const response = await this.chatWithTools(currentMessages, tools, {
        ...options,
        toolChoice: effectiveToolChoice,
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        // No more tool calls, now stream the final response
        break;
      }

      // Add assistant message with tool calls
      currentMessages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      });

      // Execute tools
      for (const toolCall of response.toolCalls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await toolExecutor(toolCall.function.name, args);
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
          hasExecutedTools = true;
        } catch (error) {
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          });
          hasExecutedTools = true;
        }
      }
    }

    // Stream the final response
    const stream = await this.client.chat.completions.create({
      model: options?.model || this.model,
      messages: currentMessages,
      tools: tools.map(t => ({
        type: 'function' as const,
        function: t.function,
      })),
      tool_choice: 'none', // Force text response for streaming
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

    return {
      content: fullContent,
      finishReason,
    };
  }

  /**
   * Helper to create a tool definition
   */
  static createTool(
    name: string,
    description: string,
    parameters: ToolFunction['parameters']
  ): Tool {
    return {
      type: 'function',
      function: {
        name,
        description,
        parameters,
      },
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.chat([
        { role: 'user', content: 'Hello' }
      ], { maxTokens: 5 });

      console.log('✅ OpenAI connection test successful');
      return !!response.content;
    } catch (error) {
      console.error('❌ OpenAI connection test failed:', error);
      return false;
    }
  }

  getConfig(): { model: string; maxTokens: number; temperature: number } {
    return {
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
    };
  }
}
