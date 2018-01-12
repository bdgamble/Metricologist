'use strict';

const BPromise = require('bluebird');
const chai = require('chai');
const uuid = require('uuid');
const sinon = require('sinon');

const { expect } = chai;
chai.use(require('chai-as-promised'));
chai.use(require('chai-subset'));

const MetricCollector = require('../lib/MetricCollector');

describe('MetricCollector', function() {

  const TEST_SERVICE_NAMESPACE = 'test';

  before(function(done) {
    this.sandbox = sinon.sandbox.create();
    done();
  });

  afterEach(function(done) {
    this.sandbox.restore();
    done();
  });

  describe('#constructor', function() {
    it('should throw when serviceNamespace is not passed', function(done) {
      expect(() => new MetricCollector({ context: {} }))
        .to.throw(Error, 'missing options.serviceNamespace');
      done();
    });

    it('should properly initialize initial state', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE,
        auto: true,
        flushFrequency: 10000
      });

      expect(metricCollector)
        .to.containSubset({
          auto: true,
          flushFrequency: 10000
        });
      done();
    });

    it('should use defaults for missing config options', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE
      });

      expect(metricCollector)
        .to.containSubset({
          auto: false,
          flushFrequency: 20000,
          _metrics: new Map(),
          _stopped: true
        });

      expect(metricCollector).not.to.have.property('_flushTimer');
      done();
    });
  });

  describe('#_setupFlushTimer', function() {
    it('should create a new timer when there is no current one', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE,
        auto: false
      });

      expect(metricCollector).not.to.have.property('_flushTimer');

      metricCollector._setupFlushTimer();

      expect(metricCollector).to.have.property('_flushTimer');
      done();
    });

    it('should create a new timer and clear current one when it exists', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE,
        auto: true
      });

      expect(metricCollector).to.have.property('_flushTimer');

      const initialTimer = metricCollector._flushTimer;
      metricCollector._setupFlushTimer();

      expect(metricCollector)
        .to.have.property('_flushTimer')
        .that.is.not.equal(initialTimer);
      done();
    });
  });

  describe('#_getMetricKey', function() {
    it('should properly format metric key', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE
      });
      const metricData = {
        name: 'eventCount',
        dimensions: {
          eventName: 'AttributeEvent',
          tenantId: uuid.v4()
        }
      };

      const metricKey = metricCollector._getMetricKey(metricData);

      expect(metricKey)
        .to.equal(`${metricData.name}:${metricData.dimensions.eventName}:${metricData.dimensions.tenantId}`);
      done();
    });
  });

  describe('#addMetrics', function() {
    it('should support adding single metric', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE
      });
      const metricsData = {
        name: 'eventCount',
        dimensions: {
          eventName: 'AttributeEvent',
          tenantId: uuid.v4()
        },
        value: 1,
        units: MetricCollector.UNITS.COUNT
      };

      metricCollector.addMetrics(metricsData);

      expect(metricCollector.getMetrics())
        .to.deep.equal([{
          name: metricsData.name,
          dimensions: metricsData.dimensions,
          value: [metricsData.value],
          units: metricsData.units
        }]);
      done();
    });

    it('should support adding multiple metrics', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE
      });
      const metricsData = [
        {
          name: 'eventCount',
          dimensions: {
            eventName: 'AttributeEvent',
            tenantId: uuid.v4()
          },
          value: 1,
          units: MetricCollector.UNITS.COUNT
        },
        {
          name: 'processingTime',
          dimensions: {
            eventName: 'AttributeEvent'
          },
          value: 123,
          units: MetricCollector.UNITS.MILLIS
        }
      ];

      metricCollector.addMetrics(metricsData);

      expect(metricCollector.getMetrics())
        .to.deep.equal([
          {
            name: metricsData[0].name,
            dimensions: metricsData[0].dimensions,
            value: [metricsData[0].value],
            units: metricsData[0].units
          },
          {
            name: metricsData[1].name,
            dimensions: metricsData[1].dimensions,
            value: [metricsData[1].value],
            units: metricsData[1].units
          }
        ]);
      done();
    });

    it('should add value to the existing metric when metric already exists', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE
      });
      const metricsData = [
        {
          name: 'eventCount',
          dimensions: {
            eventName: 'AttributeEvent'
          },
          value: 1,
          units: MetricCollector.UNITS.COUNT
        },
        {
          name: 'eventCount',
          dimensions: {
            eventName: 'AttributeEvent'
          },
          value: 5,
          units: MetricCollector.UNITS.COUNT
        }
      ];

      metricCollector
        .addMetrics(metricsData[0])
        .addMetrics(metricsData[1]);

      expect(metricCollector.getMetrics())
        .to.deep.equal([{
          name: metricsData[0].name,
          dimensions: metricsData[0].dimensions,
          value: [metricsData[0].value, metricsData[1].value],
          units: metricsData[0].units
        }]);
      done();
    });

    it('should return instance as a result value', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE
      });
      const metricsData = {
        name: 'eventCount',
        dimensions: {
          eventName: 'AttributeEvent'
        },
        value: 1,
        units: MetricCollector.UNITS.COUNT
      };

      expect(metricCollector.addMetrics(metricsData))
        .to.deep.equal(metricCollector);
      done();
    });
  });

  describe('#getMetrics', function() {
    it('should return accumulated metrics as an array', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE
      });
      const metricsData = {
        name: 'eventCount',
        dimensions: {
          eventName: 'AttributeEvent'
        },
        value: 1,
        units: MetricCollector.UNITS.COUNT
      };

      metricCollector.addMetrics(metricsData);

      expect(metricCollector.getMetrics())
        .to.deep.equal([{
          name: metricsData.name,
          dimensions: metricsData.dimensions,
          value: [metricsData.value],
          units: metricsData.units
        }]);
      done();
    });

    it('should return empty array when there are no metrics accumulated', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE
      });

      expect(metricCollector.getMetrics())
        .to.deep.equal([]);
      done();
    });
  });

  describe('#clearMetrics', function() {
    it('should clear accumulated metrics', function(done) {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE
      });
      const metricsData = {
        name: 'eventCount',
        dimensions: {
          eventName: 'AttributeEvent'
        },
        value: 1,
        units: MetricCollector.UNITS.COUNT
      };

      const result = metricCollector
        .addMetrics(metricsData)
        .clearMetrics();

      expect(result).to.deep.equal(metricCollector);
      expect(metricCollector.getMetrics()).to.deep.equal([]);
      done();
    });
  });

  describe('#stop', function() {
    it('should do nothing if stopped already', function() {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE,
        auto: false
      });

      const flushSpy = this.sandbox.spy(metricCollector, 'flush');

      return expect(metricCollector.stop())
        .to.eventually.be.fulfilled
        .then(() => {
          sinon.assert.notCalled(flushSpy);
        });
    });

    it('should stop timer and flush metrics', function() {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE,
        auto: true
      });

      const flushSpy = this.sandbox.spy(metricCollector, 'flush');

      return expect(metricCollector.stop())
        .to.eventually.be.fulfilled
        .then(() => {
          expect(metricCollector._stopped).to.equal(true);
          sinon.assert.calledOnce(flushSpy);
        });
    });
  });

  describe('#flush', function() {
    it('should not setup flush timer when not in auto mode', function() {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE,
        auto: false
      });

      const setupFlushTimerSpy = this.sandbox.spy(metricCollector, '_setupFlushTimer');

      return expect(metricCollector.flush())
        .to.eventually.be.fulfilled
        .then(() => {
          sinon.assert.notCalled(setupFlushTimerSpy);
        });
    });

    it('should not setup flush timer when stopped', function() {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE,
        auto: true
      });

      return metricCollector.stop()
        .then(() => {
          const setupFlushTimerSpy = this.sandbox.spy(metricCollector, '_setupFlushTimer');
          return expect(metricCollector.flush())
            .to.eventually.be.fulfilled
            .then(() => {
              sinon.assert.notCalled(setupFlushTimerSpy);
            });
        });
    });

    it('should setup flush timer when in auto mode and not stopped', function() {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE,
        auto: true
      });

      const setupFlushTimerSpy = this.sandbox.spy(metricCollector, '_setupFlushTimer');

      return expect(metricCollector.flush())
        .to.eventually.be.fulfilled
        .then(() => {
          sinon.assert.calledOnce(setupFlushTimerSpy);
        });
    });

    it('should not try to send metrics when there are no metrics accumulated', function() {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE
      });

      const sendMetricsStub = this.sandbox.stub(metricCollector.cloudwatchDriver, 'sendMetrics');

      return expect(metricCollector.flush())
        .to.eventually.be.fulfilled
        .then(() => {
          sinon.assert.notCalled(sendMetricsStub);
        });
    });

    it('should send and clear metrics when there are metrics accumulated', function() {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE
      });

      const sendMetricsStub = this.sandbox.stub(metricCollector.cloudwatchDriver, 'sendMetrics').resolves(BPromise.resolve());

      const metricsData = {
        name: 'eventCount',
        dimensions: {
          eventName: 'AttributeEvent'
        },
        value: 1,
        units: MetricCollector.UNITS.COUNT
      };
      metricCollector.addMetrics(metricsData);
      const accumulatedMetrics = metricCollector.getMetrics();

      return expect(metricCollector.flush())
        .to.eventually.be.fulfilled
        .then(() => {
          expect(metricCollector.getMetrics()).to.deep.equal([]);
          sinon.assert.calledOnce(sendMetricsStub);
          sinon.assert.calledWithExactly(sendMetricsStub, accumulatedMetrics);
        });
    });

    it('should be called by timer in auto mode', function() {
      const metricCollector = new MetricCollector({
        serviceNamespace: TEST_SERVICE_NAMESPACE,
        auto: true,
        flushFrequency: 100
      });

      const flushSpy = this.sandbox.stub(metricCollector, 'flush');

      return BPromise
        .delay(500)
        .then(() => {
          sinon.assert.called(flushSpy);
        });
    });
  });
});
