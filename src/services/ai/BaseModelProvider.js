/**
 * BaseModelProvider
 * Abstract interface for streaming AI model providers (Local Ollama, Hosted APIs, etc.)
 */
class BaseModelProvider {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Generates a stream of normalized response events.
   * Yields objects of shape:
   *  - { type: 'reasoning_delta', content: '...' }
   *  - { type: 'text_delta', content: '...' }
   *  - { type: 'tool_call', toolCall: { id, name, args } }
   *  - { type: 'usage', usage: { inputTokens, outputTokens, totalTokens, creditsUsed } }
   *  - { type: 'finish', finishReason: 'stop' | 'tool_calls' }
   *
   * @param {Object} params
   * @param {Array} params.messages - History of messages
   * @param {Array} params.tools - System/Composio tool definitions
   * @param {Object} params.options - Model options (modelId, temperature, etc.)
   * @returns {AsyncGenerator}
   */
  async *generateStream({ messages, tools, options }) {
    throw new Error('BaseModelProvider.generateStream() must be implemented by subclass');
  }
}

module.exports = BaseModelProvider;
