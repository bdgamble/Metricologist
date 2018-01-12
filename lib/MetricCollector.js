'use strict';

const assert = require('assert');
const BPromise = require('bluebird');

const CloudWatchDriver = require('./CloudWatchDriver');

const DEFAULT_FLUSH_FREQUENCY = 20000;

module.exports = class MetricCollector {
  constructor(options = {}) {
    assert(options.serviceNamespace, 'missing options.serviceNamespace');

    const { client, logger, serviceNamespace } = options;
    this.cloudwatchDriver = new CloudWatchDriver({ client, logger, serviceNamespace });
    this.auto = options.auto || false;
    this.flushFrequency = options.flushFrequency || DEFAULT_FLUSH_FREQUENCY;
    this._metrics = new Map();
    this._stopped = !this.auto;

    if (this.auto) {
      this._setupFlushTimer();
    }
  }

  _setupFlushTimer() {
    clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(
      this.flush.bind(this),
      this.flushFrequency
    );
  }

  _getMetricKey(metricData) {
    const metricDimensionsNamespace = Object.keys(metricData.dimensions)
      .map(d => metricData.dimensions[d])
      .join(':');
    return `${metricData.name}:${metricDimensionsNamespace}`;
  }

  addMetrics(metricsData) {
    assert(metricsData, 'missing metricsData');

    metricsData = [].concat(metricsData); // eslint-disable-line no-param-reassign
    metricsData.forEach(metricData => {
      const key = this._getMetricKey(metricData);
      const metric = this._metrics.get(key);
      if (metric) {
        metric.value.push(metricData.value);
      } else {
        this._metrics.set(key, Object.assign({}, metricData, { value: [metricData.value] }));
      }
    });

    return this;
  }

  getMetrics() {
    return Array.from(this._metrics.values());
  }

  clearMetrics() {
    this._metrics.clear();
    return this;
  }

  stop() {
    if (this._stopped) {
      return BPromise.resolve();
    }

    this._stopped = true;
    clearTimeout(this._flushTimer);
    return this.flush();
  }

  flush() {
    const metricsData = this.getMetrics();

    this.clearMetrics();
    if (this.auto && !this._stopped) {
      this._setupFlushTimer();
    }

    if (metricsData.length === 0) {
      return BPromise.resolve();
    }

    return this.cloudwatchDriver.sendMetrics(metricsData);
  }
};

module.exports.UNITS = CloudWatchDriver.UNITS;
