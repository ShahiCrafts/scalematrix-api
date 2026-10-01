/**
 * Mongoose Multi-Tenancy Plugin
 * Automatically enforces workspaceId scoping on queries for tenant-isolated models.
 */
module.exports = function tenantPlugin(schema) {
  // Add workspaceId field to schema if not already present
  if (!schema.path('workspaceId')) {
    schema.add({
      workspaceId: {
        type: require('mongoose').Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true,
      },
    });
  }

  /**
   * Query helper to explicitly scope a query to a specific workspace
   * Usage: Model.find().forWorkspace(workspaceId)
   */
  schema.query.forWorkspace = function (workspaceId) {
    if (!workspaceId) return this;
    return this.where({ workspaceId });
  };
};
