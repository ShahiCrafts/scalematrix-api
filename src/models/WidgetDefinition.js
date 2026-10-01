const mongoose = require('mongoose');

const widgetDefinitionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    supportedVisualization: {
      type: String,
      enum: ['number', 'line_chart', 'bar_chart', 'heatmap', 'list', 'table'],
      required: true,
    },
    requiredDataShape: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const WidgetDefinition = mongoose.model('WidgetDefinition', widgetDefinitionSchema);

module.exports = WidgetDefinition;
