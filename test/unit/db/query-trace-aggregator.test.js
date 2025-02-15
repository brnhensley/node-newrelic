/*
 * Copyright 2020 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

// TODO: convert to normal tap style.
// Below allows use of mocha DSL with tap runner.
require('tap').mochaGlobals()

const assert = require('chai').assert
const Config = require('../../../lib/config')
const expect = require('chai').expect
const QueryTraceAggregator = require('../../../lib/db/query-trace-aggregator')
const codec = require('../../../lib/util/codec')
const { FakeSegment, FakeTransaction } = require('../../lib/agent_helper')

const FAKE_STACK = 'Error\nfake stack'

describe('Query Trace Aggregator', function testQueryTracer() {
  describe('when no queries in payload', function testNoPayload() {
    it('_toPayload should exec callback with null data', () => {
      const opts = {
        config: new Config({
          slow_sql: { enabled: false },
          transaction_tracer: { record_sql: 'off', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      let cbCalledWithNull = false

      const cb = (err, data) => {
        if (data === null) {
          cbCalledWithNull = true
        }
      }

      queries._toPayload(cb)

      expect(cbCalledWithNull).to.be.true
    })
  })

  describe('when slow_sql.enabled is false', function testDisabled() {
    it('should not record anything when transaction_tracer.record_sql === "off"', testOff)
    it('should treat unknown value in transaction_tracer.record_sql as off', testUnknown)
    it('should record only in trace when record_sql === "obfuscated"', testObfuscated)
    it('should record only in trace when record_sql === "raw"', testRaw)
    it('should not record if below threshold', testThreshold)

    function testOff() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: false },
          transaction_tracer: { record_sql: 'off', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      const segment = addQuery(queries, 1000)
      expect(queries.samples).to.have.property('size', 0)
      assert.deepEqual(segment.getAttributes(), {}, 'should not record sql in trace')
    }

    function testUnknown() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: false },
          transaction_tracer: { record_sql: 'something else', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      const segment = addQuery(queries, 1000)
      expect(queries.samples).to.have.property('size', 0)
      assert.deepEqual(segment.getAttributes(), {}, 'should not record sql in trace')
    }

    function testObfuscated() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: false },
          transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      const segment = addQuery(queries, 1000)
      expect(queries.samples).to.have.property('size', 0)
      assert.deepEqual(
        segment.getAttributes(),
        {
          backtrace: 'fake stack',
          sql_obfuscated: 'select * from foo where a=?'
        },
        'should record sql in trace'
      )
    }

    function testRaw() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: false },
          transaction_tracer: { record_sql: 'raw', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      const segment = addQuery(queries, 1000)
      expect(queries.samples).to.have.property('size', 0)
      assert.deepEqual(
        segment.getAttributes(),
        {
          backtrace: 'fake stack',
          sql: 'select * from foo where a=2'
        },
        'should record sql in trace'
      )
    }

    function testThreshold() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: false },
          transaction_tracer: { record_sql: 'raw', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      const segment = addQuery(queries, 100)
      expect(queries.samples).to.have.property('size', 0)
      assert.deepEqual(
        segment.getAttributes(),
        {
          sql: 'select * from foo where a=2'
        },
        'should record sql in trace'
      )
    }
  })

  describe('when slow_sql.enabled is true', function testEnabled() {
    it('should not record anything when transaction_tracer.record_sql === "off"', testOff)
    it('should treat unknown value in transaction_tracer.record_sql as off', testUnknown)
    it('should record obfuscated trace when record_sql === "obfuscated"', testObfuscated)
    it('should record raw when record_sql === "raw"', testRaw)
    it('should not record if below threshold', testThreshold)

    function testOff() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: true },
          transaction_tracer: { record_sql: 'off', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      const segment = addQuery(queries, 1000)
      expect(queries.samples).to.have.property('size', 0)
      assert.deepEqual(segment.getAttributes(), {}, 'should not record sql in trace')
    }

    function testUnknown() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: true },
          transaction_tracer: { record_sql: 'something else', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      const segment = addQuery(queries, 1000)
      expect(queries.samples).to.have.property('size', 0)
      assert.deepEqual(segment.getAttributes(), {}, 'should not record sql in trace')
    }

    function testObfuscated() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: true },
          transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      const segment = addQuery(queries, 1000)
      assert.deepEqual(
        segment.getAttributes(),
        {
          backtrace: 'fake stack',
          sql_obfuscated: 'select * from foo where a=?'
        },
        'should not record sql in trace'
      )

      expect(queries.samples).to.have.property('size', 1)
      expect(queries.samples.has('select*fromfoowherea=?')).to.be.true

      const sample = queries.samples.get('select*fromfoowherea=?')
      verifySample(sample, 1, segment)
    }

    function testRaw() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: true },
          transaction_tracer: { record_sql: 'raw', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      const segment = addQuery(queries, 1000)
      assert.deepEqual(
        segment.getAttributes(),
        {
          backtrace: 'fake stack',
          sql: 'select * from foo where a=2'
        },
        'should not record sql in trace'
      )

      expect(queries.samples).to.have.property('size', 1)
      expect(queries.samples.has('select*fromfoowherea=?')).to.be.true

      const sample = queries.samples.get('select*fromfoowherea=?')
      verifySample(sample, 1, segment)
    }

    function testThreshold() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: true },
          transaction_tracer: { record_sql: 'raw', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      const segment = addQuery(queries, 100)
      expect(queries.samples).to.have.property('size', 0)
      assert.deepEqual(
        segment.getAttributes(),
        {
          sql: 'select * from foo where a=2'
        },
        'should record sql in trace'
      )
    }
  })

  describe('prepareJSON', function testPrepareJSON() {
    describe('webTransaction when record_sql is "raw"', function testWebTransaction() {
      let queries

      beforeEach(function () {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'raw', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        queries = new QueryTraceAggregator(opts)
      })

      describe('and `simple_compression` is `false`', function () {
        beforeEach(function () {
          queries.config.simple_compression = false
        })

        it('should compress the query parameters', function (done) {
          addQuery(queries, 600, '/abc')

          queries.prepareJSON(function preparedJSON(err, data) {
            const sample = data[0]

            codec.decode(sample[9], function decoded(error, params) {
              assert.equal(error, null, 'should not error')

              const keys = Object.keys(params)

              assert.deepEqual(keys, ['backtrace'])
              assert.deepEqual(params.backtrace, 'fake stack', 'trace should match')
              done()
            })
          })
        })
      })

      describe('and `simple_compression` is `true`', function () {
        beforeEach(function () {
          queries.config.simple_compression = true
        })

        it('should not compress the query parameters', function (done) {
          addQuery(queries, 600, '/abc')

          queries.prepareJSON(function preparedJSON(err, data) {
            const sample = data[0]
            const params = sample[9]
            const keys = Object.keys(params)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(params.backtrace, 'fake stack', 'trace should match')
            done()
          })
        })
      })

      it('should record work when empty', function testRaw(done) {
        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.deepEqual(data, [], 'should return empty array')
          done()
        })
      })

      it('should record work with a single query', function testRaw(done) {
        addQuery(queries, 600, '/abc')

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 1, 'should be 1 sample query')

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '/abc', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=2', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 1, 'should have 1 call')
          assert.equal(sample[6], 600, 'should match total')
          assert.equal(sample[7], 600, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            done()
          })
        })
      })

      it('should record work with a multiple similar queries', function testRaw(done) {
        addQuery(queries, 600, '/abc')
        addQuery(queries, 550, '/abc')

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 1, 'should be 1 sample query')

          data.sort(function (lhs, rhs) {
            return rhs[2] - lhs[2]
          })

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '/abc', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=2', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 2, 'should have 1 call')
          assert.equal(sample[6], 1150, 'should match total')
          assert.equal(sample[7], 550, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            done()
          })
        })
      })

      it('should record work with a multiple unique queries', function testRaw(done) {
        addQuery(queries, 600, '/abc')
        addQuery(queries, 550, '/abc', 'drop table users')

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 2, 'should be 2 sample queries')

          data.sort(function compareTotalTimeDesc(lhs, rhs) {
            const rhTotal = rhs[6]
            const lhTotal = lhs[6]

            return rhTotal - lhTotal
          })

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '/abc', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=2', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 1, 'should have 1 call')
          assert.equal(sample[6], 600, 'should match total')
          assert.equal(sample[7], 600, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            nextSample()
          })

          function nextSample() {
            const sample2 = data[1]

            assert.equal(sample2[0], 'FakeTransaction', 'should match transaction name')
            assert.equal(sample2[1], '/abc', 'should match transaction url')
            assert.equal(sample2[2], 487602586913804700, 'should match query id')
            assert.equal(sample2[3], 'drop table users', 'should match raw query')
            assert.equal(sample2[4], 'FakeSegment', 'should match segment name')
            assert.equal(sample2[5], 1, 'should have 1 call')
            assert.equal(sample2[6], 550, 'should match total')
            assert.equal(sample2[7], 550, 'should match min')
            assert.equal(sample2[8], 550, 'should match max')

            codec.decode(sample2[9], function decoded(error, result) {
              assert.equal(error, null, 'should not error')

              const keys = Object.keys(result)

              assert.deepEqual(keys, ['backtrace'])
              assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
              done()
            })
          }
        })
      })
    })

    describe('webTransaction when record_sql is "obfuscated"', function () {
      it('should record work when empty', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.deepEqual(data, [], 'should return empty array')
          done()
        })
      })

      it('should record work with a single query', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        addQuery(queries, 600, '/abc')

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 1, 'should be 1 sample query')

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '/abc', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=?', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 1, 'should have 1 call')
          assert.equal(sample[6], 600, 'should match total')
          assert.equal(sample[7], 600, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            done()
          })
        })
      })

      it('should record work with a multiple similar queries', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        addQuery(queries, 600, '/abc')
        addQuery(queries, 550, '/abc')

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 1, 'should be 1 sample query')

          data.sort(function (lhs, rhs) {
            return rhs[2] - lhs[2]
          })

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '/abc', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=?', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 2, 'should have 1 call')
          assert.equal(sample[6], 1150, 'should match total')
          assert.equal(sample[7], 550, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            done()
          })
        })
      })

      it('should record work with a multiple unique queries', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        addQuery(queries, 600, '/abc')
        addQuery(queries, 550, '/abc', 'drop table users')

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 2, 'should be 1 sample query')

          data.sort(function compareTotalTimeDesc(lhs, rhs) {
            const rhTotal = rhs[6]
            const lhTotal = lhs[6]

            return rhTotal - lhTotal
          })

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '/abc', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=?', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 1, 'should have 1 call')
          assert.equal(sample[6], 600, 'should match total')
          assert.equal(sample[7], 600, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            nextSample()
          })

          function nextSample() {
            const sample2 = data[1]
            assert.equal(sample2[0], 'FakeTransaction', 'should match transaction name')
            assert.equal(sample2[1], '/abc', 'should match transaction url')
            assert.equal(sample2[2], 487602586913804700, 'should match query id')
            assert.equal(sample2[3], 'drop table users', 'should match raw query')
            assert.equal(sample2[4], 'FakeSegment', 'should match segment name')
            assert.equal(sample2[5], 1, 'should have 1 call')
            assert.equal(sample2[6], 550, 'should match total')
            assert.equal(sample2[7], 550, 'should match min')
            assert.equal(sample2[8], 550, 'should match max')

            codec.decode(sample2[9], function decoded(error, result) {
              assert.equal(error, null, 'should not error')

              const keys = Object.keys(result)

              assert.deepEqual(keys, ['backtrace'])
              assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
              done()
            })
          }
        })
      })
    })

    describe('backgroundTransaction when record_sql is "raw"', function testBackground() {
      it('should record work when empty', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'raw', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.deepEqual(data, [], 'should return empty array')
          done()
        })
      })

      it('should record work with a single query', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'raw', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        addQuery(queries, 600, null)

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 1, 'should be 1 sample query')

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '<unknown>', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=2', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 1, 'should have 1 call')
          assert.equal(sample[6], 600, 'should match total')
          assert.equal(sample[7], 600, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            done()
          })
        })
      })

      it('should record work with a multiple similar queries', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'raw', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        addQuery(queries, 600, null)
        addQuery(queries, 550, null)

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 1, 'should be 1 sample query')

          data.sort(function (lhs, rhs) {
            return rhs[2] - lhs[2]
          })

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '<unknown>', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=2', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 2, 'should have 1 call')
          assert.equal(sample[6], 1150, 'should match total')
          assert.equal(sample[7], 550, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            done()
          })
        })
      })

      it('should record work with a multiple unique queries', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'raw', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        addQuery(queries, 600, null)
        addQuery(queries, 550, null, 'drop table users')

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 2, 'should be 1 sample query')

          data.sort(function compareTotalTimeDesc(lhs, rhs) {
            const rhTotal = rhs[6]
            const lhTotal = lhs[6]

            return rhTotal - lhTotal
          })

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '<unknown>', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=2', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 1, 'should have 1 call')
          assert.equal(sample[6], 600, 'should match total')
          assert.equal(sample[7], 600, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            nextSample()
          })

          function nextSample() {
            const sample2 = data[1]
            assert.equal(sample2[0], 'FakeTransaction', 'should match transaction name')
            assert.equal(sample2[1], '<unknown>', 'should match transaction url')
            assert.equal(sample2[2], 487602586913804700, 'should match query id')
            assert.equal(sample2[3], 'drop table users', 'should match raw query')
            assert.equal(sample2[4], 'FakeSegment', 'should match segment name')
            assert.equal(sample2[5], 1, 'should have 1 call')
            assert.equal(sample2[6], 550, 'should match total')
            assert.equal(sample2[7], 550, 'should match min')
            assert.equal(sample2[8], 550, 'should match max')

            codec.decode(sample2[9], function decoded(error, result) {
              assert.equal(error, null, 'should not error')

              const keys = Object.keys(result)

              assert.deepEqual(keys, ['backtrace'])
              assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
              done()
            })
          }
        })
      })
    })

    describe('background when record_sql is "obfuscated"', function testBackground() {
      it('should record work when empty', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.deepEqual(data, [], 'should return empty array')
          done()
        })
      })

      it('should record work with a single query', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        addQuery(queries, 600, null)

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 1, 'should be 1 sample query')

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '<unknown>', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=?', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 1, 'should have 1 call')
          assert.equal(sample[6], 600, 'should match total')
          assert.equal(sample[7], 600, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            done()
          })
        })
      })

      it('should record work with a multiple similar queries', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        addQuery(queries, 600, null)
        addQuery(queries, 550, null)

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 1, 'should be 1 sample query')

          data.sort(function (lhs, rhs) {
            return rhs[2] - lhs[2]
          })

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '<unknown>', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=?', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 2, 'should have 1 call')
          assert.equal(sample[6], 1150, 'should match total')
          assert.equal(sample[7], 550, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            done()
          })
        })
      })

      it('should record work with a multiple unique queries', function testRaw(done) {
        const opts = {
          config: new Config({
            slow_sql: { enabled: true },
            transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
          }),
          method: 'sql_trace_data'
        }
        const queries = new QueryTraceAggregator(opts)

        addQuery(queries, 600, null)
        addQuery(queries, 550, null, 'drop table users')

        queries.prepareJSON(function preparedJSON(err, data) {
          assert.equal(err, null, 'should not error')
          assert.equal(data.length, 2, 'should be 1 sample query')

          data.sort(function compareTotalTimeDesc(lhs, rhs) {
            const rhTotal = rhs[6]
            const lhTotal = lhs[6]

            return rhTotal - lhTotal
          })

          const sample = data[0]
          assert.equal(sample[0], 'FakeTransaction', 'should match transaction name')
          assert.equal(sample[1], '<unknown>', 'should match transaction url')
          assert.equal(sample[2], 374780417029088500, 'should match query id')
          assert.equal(sample[3], 'select * from foo where a=?', 'should match raw query')
          assert.equal(sample[4], 'FakeSegment', 'should match segment name')
          assert.equal(sample[5], 1, 'should have 1 call')
          assert.equal(sample[6], 600, 'should match total')
          assert.equal(sample[7], 600, 'should match min')
          assert.equal(sample[8], 600, 'should match max')

          codec.decode(sample[9], function decoded(error, result) {
            assert.equal(error, null, 'should not error')

            const keys = Object.keys(result)

            assert.deepEqual(keys, ['backtrace'])
            assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
            nextSample()
          })

          function nextSample() {
            const sample2 = data[1]
            assert.equal(sample2[0], 'FakeTransaction', 'should match transaction name')
            assert.equal(sample2[1], '<unknown>', 'should match transaction url')
            assert.equal(sample2[2], 487602586913804700, 'should match query id')
            assert.equal(sample2[3], 'drop table users', 'should match raw query')
            assert.equal(sample2[4], 'FakeSegment', 'should match segment name')
            assert.equal(sample2[5], 1, 'should have 1 call')
            assert.equal(sample2[6], 550, 'should match total')
            assert.equal(sample2[7], 550, 'should match min')
            assert.equal(sample2[8], 550, 'should match max')

            codec.decode(sample2[9], function decoded(error, result) {
              assert.equal(error, null, 'should not error')

              const keys = Object.keys(result)

              assert.deepEqual(keys, ['backtrace'])
              assert.deepEqual(result.backtrace, 'fake stack', 'trace should match')
              done()
            })
          }
        })
      })
    })
  })

  describe('limiting to n slowest', function testRemoveShortest() {
    it('should limit to this.config.max_samples', function testMaxSamples() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: true, max_samples: 2 },
          transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      addQuery(queries, 600, null)
      addQuery(queries, 550, null, 'create table users')

      expect(queries.samples).to.have.property('size', 2)
      expect(queries.samples.has('select*fromfoowherea=?')).to.be.true
      expect(queries.samples.has('createtableusers')).to.be.true

      addQuery(queries, 650, null, 'drop table users')

      expect(queries.samples).to.have.property('size', 2)
      expect(queries.samples.has('select*fromfoowherea=?')).to.be.true
      expect(queries.samples.has('droptableusers')).to.be.true
    })
  })

  describe('merging query tracers', function testMerging() {
    it('should merge queries correctly', function testMerge() {
      const opts = {
        config: new Config({
          slow_sql: { enabled: true },
          transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries = new QueryTraceAggregator(opts)

      const opts2 = {
        config: new Config({
          slow_sql: { enabled: true },
          transaction_tracer: { record_sql: 'obfuscated', explain_threshold: 500 }
        }),
        method: 'sql_trace_data'
      }
      const queries2 = new QueryTraceAggregator(opts2)

      addQuery(queries, 600, null)
      addQuery(queries, 650, null, 'create table users')
      addQuery(queries2, 800, null)
      addQuery(queries2, 500, null, 'create table users')

      queries._merge(queries2.samples)

      expect(queries.samples).to.have.property('size', 2)
      expect(queries.samples.has('select*fromfoowherea=?')).to.be.true
      expect(queries.samples.has('createtableusers')).to.be.true

      const select = queries.samples.get('select*fromfoowherea=?')

      assert.equal(select.callCount, 2, 'should have correct callCount')
      assert.equal(select.max, 800, 'max should be set')
      assert.equal(select.min, 600, 'min should be set')
      assert.equal(select.total, 1400, 'total should be set')
      assert.equal(select.trace.duration, 800, 'trace should be set')

      const create = queries.samples.get('createtableusers')

      assert.equal(create.callCount, 2, 'should have correct callCount')
      assert.equal(create.max, 650, 'max should be set')
      assert.equal(create.min, 500, 'min should be set')
      assert.equal(create.total, 1150, 'total should be set')
      assert.equal(create.trace.duration, 650, 'trace should be set')
    })
  })
})

function addQuery(queries, duration, url, query) {
  const transaction = new FakeTransaction(null, url)
  const segment = new FakeSegment(transaction, duration)

  queries.add(segment, 'mysql', query || 'select * from foo where a=2', FAKE_STACK)

  return segment
}

function verifySample(sample, count, segment) {
  assert.equal(sample.callCount, count, 'should have correct callCount')
  assert.ok(sample.max, 'max should be set')
  assert.ok(sample.min, 'min should be set')
  assert.ok(sample.sumOfSquares, 'sumOfSquares should be set')
  assert.ok(sample.total, 'total should be set')
  assert.ok(sample.totalExclusive, 'totalExclusive should be set')
  assert.ok(sample.trace, 'trace should be set')
  verifyTrace(sample.trace, segment)
}

function verifyTrace(trace, segment) {
  assert.equal(trace.duration, segment.getDurationInMillis(), 'should save duration')
  assert.equal(trace.segment, segment, 'should hold onto segment')
  assert.equal(trace.id, 374780417029088500, 'should have correct id')
  assert.equal(trace.metric, segment.name, 'metric and segment name should match')
  assert.equal(trace.normalized, 'select*fromfoowherea=?', 'should set normalized')
  assert.equal(trace.obfuscated, 'select * from foo where a=?', 'should set obfuscated')
  assert.equal(trace.query, 'select * from foo where a=2', 'should set query')
  assert.equal(trace.trace, 'fake stack', 'should set trace')
}
