const BaseSocialProvider = require('./BaseSocialProvider');
const ApiError = require('../../utils/ApiError');
const Logger = require('../../utils/logger');

class SocialProviderFactory {
  constructor() {
    this.providers = new Map();
  }

  /**
   * Register a new social platform provider implementation
   */
  registerProvider(name, providerInstance) {
    if (!(providerInstance instanceof BaseSocialProvider)) {
      throw new Error(`Provider ${name} must inherit from BaseSocialProvider contract.`);
    }
    this.providers.set(name.toLowerCase(), providerInstance);
    Logger.info(`Registered Social Provider: [${name}]`);
  }

  /**
   * Resolve provider by platform key ('meta', 'linkedin', 'twitter', 'tiktok', etc.)
   */
  getProvider(name) {
    const key = (name || '').toLowerCase();
    const provider = this.providers.get(key);
    if (!provider) {
      throw ApiError.badRequest(`Unsupported or unregistered social platform provider: '${name}'`);
    }
    return provider;
  }
}

// Singleton Factory Instance
module.exports = new SocialProviderFactory();
