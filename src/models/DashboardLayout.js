const mongoose = require('mongoose');

const dashboardLayoutSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    widgetBindingIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WidgetBinding',
      },
    ],
    isDefault: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

dashboardLayoutSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

const DashboardLayout = mongoose.model('DashboardLayout', dashboardLayoutSchema);

module.exports = DashboardLayout;
