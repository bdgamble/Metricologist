'use strict';

const BPromise = require('bluebird');
const chai = require('chai');
const sinon = require('sinon');

const { expect } = chai;
chai.use(require('chai-as-promised'));

const CloudWatchDriver = require('../lib/CloudWatchDriver');

describe('cloudwatch-driver', function() {

  const TEST_SERVICE_NAMESPACE = 'test';
  let cloudwatchDriver;

  before(function(done) {
    this.sandbox = sinon.sandbox.create();
    cloudwatchDriver = new CloudWatchDriver({
      serviceNamespace: TEST_SERVICE_NAMESPACE
    });
    done();
  });

  beforeEach(function() {
    this.cloudwatchPutMetricDataStub = this.sandbox.stub(cloudwatchDriver.client, 'putMetricData').returns({
      promise() {
        return BPromise.resolve();
      }
    });
  });

  afterEach(function(done) {
    this.sandbox.restore();
    done();
  });

  describe('#sendMetrics', function() {

    it('should send metrics properly', function() {
      const dimensionName = 'dimensionName';
      const rawMetrics = {
        name: 'metricName',
        dimensions: {
          [dimensionName]: 'dimensionValue'
        },
        value: 12345,
        unit: CloudWatchDriver.UNITS.COUNT,
        timestamp: new Date()
      };

      return expect(cloudwatchDriver.sendMetrics(rawMetrics))
        .to.eventually.be.fulfilled
        .then(() => {
          sinon.assert.calledOnce(this.cloudwatchPutMetricDataStub);
          sinon.assert.calledWithExactly(
            this.cloudwatchPutMetricDataStub,
            {
              Namespace: TEST_SERVICE_NAMESPACE,
              MetricData: [{
                MetricName: rawMetrics.name,
                Dimensions: [{
                  Name: dimensionName,
                  Value: rawMetrics.dimensions[dimensionName]
                }],
                Value: rawMetrics.value,
                Unit: rawMetrics.unit,
                Timestamp: rawMetrics.timestamp
              }]
            }
          );
        });
    });

    it('should use defaults when parameters are missing', function() {
      const rawMetrics = {
        name: 'metricName',
        value: 12345
      };

      return expect(cloudwatchDriver.sendMetrics(rawMetrics))
        .to.eventually.be.fulfilled
        .then(() => {
          sinon.assert.calledOnce(this.cloudwatchPutMetricDataStub);
          sinon.assert.calledWithExactly(
            this.cloudwatchPutMetricDataStub,
            {
              Namespace: TEST_SERVICE_NAMESPACE,
              MetricData: [{
                MetricName: rawMetrics.name,
                Dimensions: [],
                Value: rawMetrics.value
              }]
            }
          );
        });
    });

    it('should compute StatisticValues when value is an array', function() {
      const rawMetrics = {
        name: 'metricName',
        value: [1, 2, 3, 4, 5]
      };

      return expect(cloudwatchDriver.sendMetrics(rawMetrics))
        .to.eventually.be.fulfilled
        .then(() => {
          sinon.assert.calledOnce(this.cloudwatchPutMetricDataStub);
          sinon.assert.calledWithExactly(
            this.cloudwatchPutMetricDataStub,
            {
              Namespace: TEST_SERVICE_NAMESPACE,
              MetricData: [{
                MetricName: rawMetrics.name,
                Dimensions: [],
                StatisticValues: {
                  Minimum: 1,
                  Maximum: 5,
                  SampleCount: 5,
                  Sum: 15
                }
              }]
            }
          );
        });
    });

    it('should chunk metrics when metrics max count is exceeded', function() {
      const rawMetrics = [
        { name: 'metric01', value: 1 },
        { name: 'metric02', value: 2 },
        { name: 'metric03', value: 3 },
        { name: 'metric04', value: 4 },
        { name: 'metric05', value: 5 },
        { name: 'metric06', value: 6 },
        { name: 'metric07', value: 7 },
        { name: 'metric08', value: 8 },
        { name: 'metric09', value: 9 },
        { name: 'metric10', value: 10 },
        { name: 'metric11', value: 11 },
        { name: 'metric12', value: 12 },
        { name: 'metric13', value: 13 },
        { name: 'metric14', value: 14 },
        { name: 'metric15', value: 15 },
        { name: 'metric16', value: 16 },
        { name: 'metric17', value: 17 },
        { name: 'metric18', value: 18 },
        { name: 'metric19', value: 19 },
        { name: 'metric20', value: 20 },
        { name: 'metric21', value: 21 }
      ];

      return expect(cloudwatchDriver.sendMetrics(rawMetrics))
        .to.eventually.be.fulfilled
        .then(() => {
          sinon.assert.calledTwice(this.cloudwatchPutMetricDataStub);
          sinon.assert.calledWithExactly(
            this.cloudwatchPutMetricDataStub,
            {
              Namespace: TEST_SERVICE_NAMESPACE,
              MetricData: rawMetrics.slice(0, 20).map(metric => {
                return {
                  MetricName: metric.name,
                  Dimensions: [],
                  Value: metric.value
                };
              })
            }
          );
          sinon.assert.calledWithExactly(
            this.cloudwatchPutMetricDataStub,
            {
              Namespace: TEST_SERVICE_NAMESPACE,
              MetricData: [{
                MetricName: rawMetrics[20].name,
                Dimensions: [],
                Value: rawMetrics[20].value
              }]
            }
          );
        });
    });

    it('should rethrow error returned by CloudWatch', function() {
      const testError = new Error('SQS error');
      const rawMetrics = {
        name: 'metricName',
        value: 12345
      };

      this.cloudwatchPutMetricDataStub
        .returns({
          promise() {
            return BPromise.reject(testError);
          }
        });

      return expect(cloudwatchDriver.sendMetrics(rawMetrics))
        .to.be.rejectedWith(testError)
        .then(() => {
          sinon.assert.calledOnce(this.cloudwatchPutMetricDataStub);
        });
    });
  });
});
