const OllamaProvider = require('./OllamaProvider');
const HostedProvider = require('./HostedProvider');

class ModelProviderFactory {
  /**
   * Returns an instance of a BaseModelProvider based on modelId or system config.
   *
   * @param {String} modelId - Model requested by client (e.g. 'qwen2.5:7b', 'qwen2.5:14b', 'gpt-4o')
   * @param {Object} options - Additional options
   * @returns {BaseModelProvider}
   */
  static getProvider(modelId = '', options = {}) {
    const idLower = (modelId || '').toLowerCase();

    // If local Ollama model requested or default local
    if (
      !idLower ||
      idLower.startsWith('qwen') ||
      idLower.startsWith('ollama') ||
      idLower.startsWith('local') ||
      idLower.includes('llama') ||
      idLower.includes('mistral')
    ) {
      return new OllamaProvider(options);
    }

    // Otherwise use HostedProvider
    return new HostedProvider(options);
  }
}

module.exports = ModelProviderFactory;
