'use strict';

const assert = require('assert');
const AWS = require('aws-sdk');
const BPromise = require('bluebird');
const chunk = require('chunk');

const METRIC_COUNT_LIMIT = 20;
const UNITS = {
  COUNT: 'Count',
  MILLIS: 'Milliseconds',
  NONE: 'None'
};

module.exports = class CloudWatchDriver {

  constructor(options = {}) {
    assert(options.serviceNamespace, 'serviceNamespace is required');

    this.serviceNamespace = options.serviceNamespace;
    this.client = options.client || new AWS.CloudWatch({ apiVersion: '2010-08-01' });
    this.logger = options.logger || console;
  }

  sendMetrics(rawMetrics) {
    rawMetrics = [].concat(rawMetrics); // eslint-disable-line no-param-reassign

    return BPromise.map(
      chunk(rawMetrics, METRIC_COUNT_LIMIT),
      metricsBatch => {
        const metricsData = metricsBatch.map(rawMetric => {
          const result = {
            MetricName: rawMetric.name,
            Dimensions: Object.keys(rawMetric.dimensions || {})
              .map(Name => ({ Name, Value: rawMetric.dimensions[Name] }))
          };

          if (rawMetric.timestamp) {
            result.Timestamp = rawMetric.timestamp;
          }

          if (Array.isArray(rawMetric.value)) {
            result.StatisticValues = {
              Maximum: rawMetric.value.reduce((a, b) => Math.max(a, b)),
              Minimum: rawMetric.value.reduce((a, b) => Math.min(a, b)),
              SampleCount: rawMetric.value.length,
              Sum: rawMetric.value.reduce((a, b) => a + b)
            };
          } else {
            result.Value = rawMetric.value;
          }

          if (rawMetric.unit) {
            result.Unit = rawMetric.unit;
          }

          return result;
        });

        const metrics = {
          Namespace: this.serviceNamespace,
          MetricData: metricsData
        };

        if (this.logger.debug) {
          this.logger.debug({ metrics }, 'sending metrics');
        }
        return this.client
          .putMetricData(metrics)
          .promise()
          .catch(err => {
            this.logger.error({ err, metrics }, 'failed to send metrics');
            err._logged = true; // eslint-disable-line no-param-reassign
            throw err;
          });
      },
      { concurrency: 1 }
    );
  }
};

module.exports.UNITS = UNITS;
