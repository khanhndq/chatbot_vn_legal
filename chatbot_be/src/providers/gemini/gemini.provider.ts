import {
  GoogleGenerativeAI,
  GenerativeModel,
  Content,
  Part,
  Tool as GeminiTool,
  FunctionDeclaration,
  SchemaType,
  FunctionDeclarationSchemaProperty,
} from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { BaseLLMProvider } from '../base-provider';
import { LLMMessage, LLMResponse, LLMTool, LLMToolCall, LLMOptions, LLMProviderConfig, LLMProviderType } from '../types';

export class GeminiProvider extends BaseLLMProvider {
  readonly providerName: LLMProviderType = 'gemini';
  private genAI: GoogleGenerativeAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(providerConfig: LLMProviderConfig) {
    super();
    if (!providerConfig.apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.genAI = new GoogleGenerativeAI(providerConfig.apiKey);
    this.model = providerConfig.model || 'gemini-1.5-flash';
    this.maxTokens = providerConfig.maxTokens || 1024;
    this.temperature = providerConfig.temperature || 0.7;
    console.log(`✅ Gemini provider initialized with model: ${this.model}`);
  }

  private extractAndConvert(messages: LLMMessage[]): {
    systemInstruction: string | undefined;
    contents: Content[];
  } {
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const systemInstruction = systemMessages.map(m => m.content).filter(Boolean).join('\n\n') || undefined;

    const contents: Content[] = [];

    for (const msg of nonSystemMessages) {
      if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content || '' }],
        });
      } else if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const parts: Part[] = [];
          if (msg.content) {
            parts.push({ text: msg.content });
          }
          for (const tc of msg.tool_calls) {
            let args: Record<string, unknown>;
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              args = {};
            }
            parts.push({
              functionCall: { name: tc.function.name, args },
            });
          }
          contents.push({ role: 'model', parts });
        } else {
          contents.push({
            role: 'model',
            parts: [{ text: msg.content || '' }],
          });
        }
      } else if (msg.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: msg.tool_call_id || 'unknown',
              response: { result: msg.content || '' },
            },
          }],
        });
      }
    }

    return { systemInstruction, contents };
  }

  private mapSchemaType(type: string): SchemaType {
    const mapping: Record<string, SchemaType> = {
      'string': SchemaType.STRING,
      'number': SchemaType.NUMBER,
      'integer': SchemaType.INTEGER,
      'boolean': SchemaType.BOOLEAN,
      'array': SchemaType.ARRAY,
      'object': SchemaType.OBJECT,
    };
    return mapping[type] || SchemaType.STRING;
  }

  private toGeminiTools(tools: LLMTool[]): GeminiTool[] {
    const functionDeclarations: FunctionDeclaration[] = tools.map(tool => {
      const properties: Record<string, FunctionDeclarationSchemaProperty> = {};
      for (const [key, prop] of Object.entries(tool.function.parameters.properties)) {
        if (prop.enum && prop.type === 'string') {
          properties[key] = {
            type: SchemaType.STRING,
            format: 'enum',
            enum: prop.enum,
            description: prop.description,
          } as FunctionDeclarationSchemaProperty;
        } else {
          properties[key] = {
            type: this.mapSchemaType(prop.type),
            description: prop.description,
          } as FunctionDeclarationSchemaProperty;
        }
      }

      return {
        name: tool.function.name,
        description: tool.function.description,
        parameters: {
          type: SchemaType.OBJECT,
          properties,
          required: tool.function.parameters.required,
        },
      };
    });

    return [{ functionDeclarations }];
  }

  private getGenerativeModel(options?: LLMOptions, tools?: LLMTool[], systemInstruction?: string): GenerativeModel {
    const modelConfig: Parameters<GoogleGenerativeAI['getGenerativeModel']>[0] = {
      model: options?.model || this.model,
      generationConfig: {
        maxOutputTokens: options?.maxTokens || this.maxTokens,
        temperature: options?.temperature || this.temperature,
      },
    };

    if (systemInstruction) {
      modelConfig.systemInstruction = systemInstruction;
    }

    if (tools && tools.length > 0) {
      modelConfig.tools = this.toGeminiTools(tools);
    }

    return this.genAI.getGenerativeModel(modelConfig);
  }

  private parseFunctionCalls(response: { functionCalls?: () => Array<{ name: string; args: Record<string, unknown> }> | undefined }): LLMToolCall[] | undefined {
    try {
      const calls = response.functionCalls?.();
      if (!calls || calls.length === 0) return undefined;

      return calls.map(call => ({
        id: uuidv4(),
        type: 'function' as const,
        function: {
          name: call.name,
          arguments: JSON.stringify(call.args),
        },
      }));
    } catch {
      return undefined;
    }
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    try {
      const { systemInstruction, contents } = this.extractAndConvert(messages);
      const genModel = this.getGenerativeModel(options, undefined, systemInstruction);
      const result = await genModel.generateContent({ contents });
      const response = result.response;

      return {
        content: response.text(),
        usage: response.usageMetadata ? {
          promptTokens: response.usageMetadata.promptTokenCount || 0,
          completionTokens: response.usageMetadata.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata.totalTokenCount || 0,
        } : undefined,
        finishReason: response.candidates?.[0]?.finishReason || undefined,
      };
    } catch (error) {
      console.error('❌ Gemini chat error:', error);
      throw error;
    }
  }

  async streamChat(
    messages: LLMMessage[],
    onChunk: (chunk: string) => void,
    options?: LLMOptions
  ): Promise<LLMResponse> {
    try {
      const { systemInstruction, contents } = this.extractAndConvert(messages);
      const genModel = this.getGenerativeModel(options, undefined, systemInstruction);
      const result = await genModel.generateContentStream({ contents });

      let fullContent = '';

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          fullContent += text;
          onChunk(text);
        }
      }

      const response = await result.response;
      return {
        content: fullContent,
        usage: response.usageMetadata ? {
          promptTokens: response.usageMetadata.promptTokenCount || 0,
          completionTokens: response.usageMetadata.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata.totalTokenCount || 0,
        } : undefined,
        finishReason: response.candidates?.[0]?.finishReason || undefined,
      };
    } catch (error) {
      console.error('❌ Gemini stream chat error:', error);
      throw error;
    }
  }

  async chatWithTools(
    messages: LLMMessage[],
    tools: LLMTool[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    try {
      if (options?.toolChoice === 'none') {
        return this.chat(messages, options);
      }

      const { systemInstruction, contents } = this.extractAndConvert(messages);
      const genModel = this.getGenerativeModel(options, tools, systemInstruction);
      const result = await genModel.generateContent({ contents });
      const response = result.response;

      // Try to get text content; may throw if response only contains function calls
      let textContent = '';
      try {
        textContent = response.text();
      } catch {
        // Response contains only function calls, no text
      }

      return {
        content: textContent,
        usage: response.usageMetadata ? {
          promptTokens: response.usageMetadata.promptTokenCount || 0,
          completionTokens: response.usageMetadata.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata.totalTokenCount || 0,
        } : undefined,
        finishReason: response.candidates?.[0]?.finishReason || undefined,
        toolCalls: this.parseFunctionCalls(response as any),
      };
    } catch (error) {
      console.error('❌ Gemini chat with tools error:', error);
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
