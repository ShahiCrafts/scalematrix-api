const ApiError = require('../utils/ApiError');

/**
 * Validate HTTP Request body, query, or params against a Zod schema
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = result.error.issues || result.error.errors || [];
      const formattedErrors = issues.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return next(ApiError.badRequest('Validation Error', formattedErrors));
    }
    // Assign parsed & sanitized data back to request object
    req[source] = result.data;
    next();
  };
};

module.exports = validate;
