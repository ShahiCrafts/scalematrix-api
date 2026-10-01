const SocialProviderFactory = require('./SocialProviderFactory');
const MetaSocialProvider = require('./MetaSocialProvider');

// Instantiate Meta Social Engine Provider
const metaProvider = new MetaSocialProvider();

// Register with SocialProviderFactory
SocialProviderFactory.registerProvider('meta', metaProvider);
SocialProviderFactory.registerProvider('facebook', metaProvider);
SocialProviderFactory.registerProvider('instagram', metaProvider);

module.exports = SocialProviderFactory;
